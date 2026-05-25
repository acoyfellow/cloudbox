import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, relative } from "node:path";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 8080);
const MAX_OUTPUT = 64_000;
const MAX_TIMEOUT_MS = 120_000;
const liveRuns = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function assertSafePath(root, path) {
  if (!path || path.includes("\0")) throw new Error("invalid artifact path");
  const full = resolve(root, path);
  const rel = relative(root, full);
  if (rel.startsWith("..") || resolve(root, rel) !== full) throw new Error("artifact path escapes workspace");
  return full;
}

const SECRET_KEYS = ["CLOUDBOX_GITLAB_TOKEN", "GITLAB_TOKEN", "NPM_TOKEN"];

function redact(value) {
  let out = String(value ?? "");
  for (const key of SECRET_KEYS) {
    const secret = process.env[key];
    if (secret) out = out.split(secret).join(`[redacted:${key}]`);
  }
  return out;
}

function cloneUrl(repo, auth) {
  if (auth === "gitlab") {
    const token = process.env.CLOUDBOX_GITLAB_TOKEN || process.env.GITLAB_TOKEN;
    if (!token) throw new Error("gitlab auth requested but CLOUDBOX_GITLAB_TOKEN is not configured");
    const url = new URL(repo);
    if (url.hostname !== "gitlab.cfdata.org") throw new Error("gitlab auth only supports gitlab.cfdata.org");
    url.username = "oauth2";
    url.password = token;
    return url.toString();
  }
  return repo;
}

function shell(value) {
  return JSON.stringify(String(value));
}

export function normalizeCloneOptions(input) {
  const strategy = input.clone === "shallow" ? "shallow" : "blobless";
  const sparse = Array.isArray(input.sparse) ? input.sparse.map(String) : [];
  if (sparse.length > 64) throw new Error("too many sparse paths");
  for (const path of sparse) {
    if (!path || path.length > 240 || path.includes("\0") || path.startsWith("/") || path.split("/").includes("..") || /[\n\r`$\\]/.test(path)) {
      throw new Error(`invalid sparse path: ${path}`);
    }
  }
  return { strategy, sparse };
}

export function buildCloneCommand(input, options = normalizeCloneOptions(input)) {
  const ref = typeof input.ref === "string" && input.ref ? ` --branch ${shell(input.ref)}` : "";
  const filter = options.strategy === "blobless" ? " --filter=blob:none" : "";
  const sparse = options.sparse.length ? " --sparse --no-checkout" : "";
  return `git clone --depth=1${filter}${sparse}${ref} ${shell(cloneUrl(input.repo, input.auth))} repo`;
}

function run(cmd, cwd, timeoutMs = MAX_TIMEOUT_MS) {
  return new Promise((resolveRun) => {
    const startedAt = new Date().toISOString();
    const child = spawn("bash", ["-lc", cmd], { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, Math.min(timeoutMs, MAX_TIMEOUT_MS));
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-MAX_OUTPUT);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-MAX_OUTPUT);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolveRun({ cmd: redact(cmd), code, signal, stdout: redact(stdout), stderr: redact(stderr), startedAt, finishedAt: new Date().toISOString() });
    });
  });
}

async function handleRun(input) {
  if (!input || typeof input !== "object") throw new Error("expected JSON body");
  if (!input.repo || typeof input.repo !== "string") throw new Error("repo is required");
  const commands = Array.isArray(input.commands) ? input.commands : [];
  const verify = Array.isArray(input.verify) ? input.verify : [];
  if (commands.length + verify.length === 0) throw new Error("at least one command or verify command is required");

  const liveRunId = input.live === true && typeof input.liveRunId === "string" && /^run_[A-Za-z0-9-]+$/.test(input.liveRunId)
    ? input.liveRunId
    : null;
  if (input.live === true && !liveRunId) throw new Error("live run id is required");
  const root = await mkdtemp(join(tmpdir(), "cloudbox-"));
  const workspace = join(root, "repo");
  const receipts = [];
  let keepRoot = false;
  try {
    const cloneOptions = normalizeCloneOptions(input);
    const clone = await run(buildCloneCommand(input, cloneOptions), root, input.timeoutMs);
    receipts.push({ type: "clone", strategy: cloneOptions.strategy, sparse: cloneOptions.sparse, ...clone });
    if (clone.code !== 0) return { ok: false, workspace: root, receipts };
    if (cloneOptions.sparse.length) {
      const sparse = await run(`git sparse-checkout set -- ${cloneOptions.sparse.map(shell).join(" ")} && git checkout`, workspace, input.timeoutMs);
      receipts.push({ type: "sparse-checkout", ...sparse });
      if (sparse.code !== 0) return { ok: false, workspace: root, receipts };
    }

    for (const cmd of commands) receipts.push({ type: "command", ...(await run(String(cmd), workspace, input.timeoutMs)) });
    for (const cmd of verify) receipts.push({ type: "verify", ...(await run(String(cmd), workspace, input.timeoutMs)) });

    let artifact = null;
    if (input.artifact) {
      const artifactPath = assertSafePath(workspace, String(input.artifact));
      try {
        artifact = { path: String(input.artifact), content: await readFile(artifactPath, "utf8") };
      } catch {
        const content = `# Cloudbox run\n\nRepo: ${input.repo}\n\nCommands:\n${[...commands, ...verify].map((c) => `- ${c}`).join("\n")}\n`;
        await writeFile(artifactPath, content);
        artifact = { path: String(input.artifact), content };
      }
    }

    const diff = await run("git diff -- .", workspace, input.timeoutMs);
    receipts.push({ type: "diff", ...diff });
    if (liveRunId) {
      liveRuns.set(liveRunId, { root, workspace, createdAt: new Date().toISOString() });
      keepRoot = true;
    }
    return {
      ok: receipts.every((r) => r.code === 0),
      receipts,
      artifact,
      diff: diff.stdout,
      live: liveRunId ? { runId: liveRunId } : undefined,
    };
  } finally {
    if (!keepRoot) await rm(root, { recursive: true, force: true });
  }
}

function requireLiveWorkspace(runId) {
  const found = liveRuns.get(runId);
  if (!found) throw new Error("live run not found");
  return found;
}

async function handleLiveExec(runId, input) {
  if (!input || typeof input.command !== "string" || !input.command || input.command.length > 1_000) throw new Error("command is required");
  const live = requireLiveWorkspace(runId);
  const receipt = { type: "command", ...(await run(input.command, live.workspace, input.timeoutMs)) };
  return { ok: receipt.code === 0, receipt };
}

async function handleLiveRead(runId, path) {
  const live = requireLiveWorkspace(runId);
  const fullPath = assertSafePath(live.workspace, path);
  return { ok: true, path, content: await readFile(fullPath, "utf8") };
}

async function handleLiveWrite(runId, input) {
  if (!input || typeof input.path !== "string" || typeof input.content !== "string") throw new Error("path and content are required");
  const live = requireLiveWorkspace(runId);
  const fullPath = assertSafePath(live.workspace, input.path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, input.content, "utf8");
  return { ok: true, path: input.path, bytes: Buffer.byteLength(input.content) };
}

function snapshotDevProcess(runId, live) {
  const dev = live.dev;
  if (!dev) return null;
  return {
    ok: dev.child.exitCode === null,
    runId,
    command: dev.command,
    port: dev.port,
    startedAt: dev.startedAt,
    stdout: redact(dev.stdout),
    stderr: redact(dev.stderr),
  };
}

async function handleLiveDev(runId, input) {
  if (!input || typeof input.command !== "string" || !input.command || input.command.length > 1_000) throw new Error("command is required");
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65_535) throw new Error("port must be an integer between 1 and 65535");
  const live = requireLiveWorkspace(runId);
  const existing = snapshotDevProcess(runId, live);
  if (existing?.ok) return existing;
  const child = spawn("bash", ["-lc", input.command], { cwd: live.workspace, env: process.env });
  const dev = {
    child,
    command: redact(input.command),
    port: input.port,
    startedAt: new Date().toISOString(),
    stdout: "",
    stderr: "",
  };
  child.stdout.on("data", (chunk) => {
    dev.stdout = (dev.stdout + chunk.toString()).slice(-MAX_OUTPUT);
  });
  child.stderr.on("data", (chunk) => {
    dev.stderr = (dev.stderr + chunk.toString()).slice(-MAX_OUTPUT);
  });
  live.dev = dev;
  await new Promise((resolve) => setTimeout(resolve, 150));
  return snapshotDevProcess(runId, live);
}

function safeRunId(runId) {
  if (!/^run_[A-Za-z0-9-]+$/.test(runId)) throw new Error("invalid live run id");
  return runId;
}

async function handleLiveSnapshot(runId) {
  const live = requireLiveWorkspace(runId);
  safeRunId(runId);
  if (live.dev?.child?.exitCode === null) live.dev.child.kill("SIGTERM");
  const archive = join(tmpdir(), `${runId}-${Date.now()}.tar.gz`);
  const receipt = await run(`tar -czf ${shell(archive)} -C ${shell(live.root)} repo`, live.root);
  if (receipt.code !== 0) return { ok: false, runId, error: receipt.stderr || receipt.stdout, receipt };
  const data = await readFile(archive);
  await rm(archive, { force: true });
  await rm(live.root, { recursive: true, force: true });
  liveRuns.delete(runId);
  return { ok: true, runId, snapshot: { bytes: data.toString("base64"), size: data.byteLength } };
}

async function handleLiveRestore(runId, input) {
  safeRunId(runId);
  const bytes = input?.snapshot?.bytes;
  if (typeof bytes !== "string" || !bytes) throw new Error("snapshot bytes are required");
  const data = Buffer.from(bytes, "base64");
  if (!data.length || data.byteLength > 100 * 1024 * 1024) throw new Error("snapshot is empty or too large");
  const root = await mkdtemp(join(tmpdir(), "cloudbox-"));
  const archive = join(root, "snapshot.tar.gz");
  await writeFile(archive, data);
  const receipt = await run(`tar -xzf ${shell(archive)} -C ${shell(root)}`, root);
  await rm(archive, { force: true });
  if (receipt.code !== 0) {
    await rm(root, { recursive: true, force: true });
    return { ok: false, runId, error: receipt.stderr || receipt.stdout, receipt };
  }
  liveRuns.set(runId, { root, workspace: join(root, "repo"), createdAt: new Date().toISOString() });
  return { ok: true, runId };
}

async function handleLiveDelete(runId) {
  safeRunId(runId);
  const live = liveRuns.get(runId);
  if (live?.dev?.child?.exitCode === null) live.dev.child.kill("SIGTERM");
  if (live) await rm(live.root, { recursive: true, force: true });
  liveRuns.delete(runId);
  return { ok: true, runId, deleted: true };
}

function livePreviewTarget(runId, request, suffix, protocol) {
  const live = requireLiveWorkspace(runId);
  const incoming = new URL(request.url);
  const named = suffix.match(/^(shell|desktop)(?:\/(.*))?$/);
  if (named) {
    const [, service, rest = ""] = named;
    const port = service === "shell" ? 7681 : 6080;
    return new URL(`${protocol}://127.0.0.1:${port}/${rest}${incoming.search}`);
  }
  const dev = snapshotDevProcess(runId, live);
  if (!dev?.ok || !dev.port) throw new Error("dev process is not running");
  return new URL(`${protocol}://127.0.0.1:${dev.port}/${suffix.replace(/^\/+/, "")}${incoming.search}`);
}

async function handleLivePreview(runId, request, suffix) {
  const target = livePreviewTarget(runId, request, suffix, "http");
  const headers = new Headers(request.headers);
  headers.set("host", target.host);
  return fetch(target, new Request(target, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
    duplex: request.body ? "half" : undefined,
  }));
}

function upgradeLivePreview(server, request, runId, suffix) {
  const target = livePreviewTarget(runId, request, suffix, "ws");
  return server.upgrade(request, { data: { target: target.toString(), upstream: null } });
}

let bunServer = null;

if (typeof Bun !== "undefined") {
  bunServer = Bun.serve({
    port: PORT,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/health") return json({ ok: true });
      if (url.pathname === "/run" && request.method === "POST") {
        try { return json(await handleRun(await request.json())); }
        catch (error) { return json({ ok: false, error: String(error?.message || error) }, 400); }
      }
        const previewMatch = url.pathname.match(/^\/live\/(run_[A-Za-z0-9-]+)\/preview\/?(.*)$/);
      if (previewMatch) {
        const [, runId, suffix] = previewMatch;
        try {
          if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
            if (upgradeLivePreview(bunServer, request, runId, suffix)) return;
            return json({ ok: false, error: "preview_websocket_upgrade_failed" }, 502);
          }
          return await handleLivePreview(runId, request, suffix);
        }
        catch (error) { return json({ ok: false, error: String(error?.message || error) }, String(error?.message || error) === "live run not found" ? 404 : 409); }
      }
      const liveMatch = url.pathname.match(/^\/live\/(run_[A-Za-z0-9-]+)\/(exec|read|write|dev|snapshot|restore|delete)$/);
      if (liveMatch) {
        const [, runId, action] = liveMatch;
        try {
          if (action === "exec" && request.method === "POST") return json(await handleLiveExec(runId, await request.json()));
          if (action === "read" && request.method === "GET") return json(await handleLiveRead(runId, url.searchParams.get("path") || ""));
          if (action === "write" && request.method === "POST") return json(await handleLiveWrite(runId, await request.json()));
          if (action === "dev" && request.method === "POST") return json(await handleLiveDev(runId, await request.json()));
          if (action === "snapshot" && request.method === "POST") return json(await handleLiveSnapshot(runId));
          if (action === "restore" && request.method === "POST") return json(await handleLiveRestore(runId, await request.json()));
          if (action === "delete" && request.method === "POST") return json(await handleLiveDelete(runId));
          return json({ error: "method_not_allowed" }, 405);
        } catch (error) {
          return json({ ok: false, error: String(error?.message || error) }, String(error?.message || error) === "live run not found" ? 404 : 400);
        }
      }
      return json({ error: "not_found" }, 404);
    },
    websocket: {
      open(ws) {
        const upstream = new WebSocket(ws.data.target);
        ws.data.upstream = upstream;
        ws.data.pending = [];
        upstream.addEventListener("open", () => {
          for (const message of ws.data.pending) upstream.send(message);
          ws.data.pending = [];
        });
        upstream.addEventListener("message", (event) => ws.send(event.data));
        upstream.addEventListener("error", () => ws.close(1011, "preview upstream websocket error"));
        upstream.addEventListener("close", (event) => ws.close(event.code || 1000, event.reason || "preview upstream websocket closed"));
      },
      message(ws, message) {
        const upstream = ws.data.upstream;
        if (!upstream) return;
        if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
        else ws.data.pending.push(message);
      },
      close(ws) {
        const upstream = ws.data.upstream;
        if (upstream && upstream.readyState < WebSocket.CLOSING) upstream.close();
      },
    },
  });
} else {
  const http = await import("node:http");
  http.createServer(async (req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      try {
        if (req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true })); return; }
        if (req.url === "/run" && req.method === "POST") {
          const out = await handleRun(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
          res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)); return;
        }
        const url = new URL(req.url || "/", `http://localhost:${PORT}`);
        const previewMatch = url.pathname.match(/^\/live\/(run_[A-Za-z0-9-]+)\/preview\/?(.*)$/);
        if (previewMatch) {
          res.writeHead(501, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "preview_proxy_requires_bun_runtime" }));
          return;
        }
      const liveMatch = url.pathname.match(/^\/live\/(run_[A-Za-z0-9-]+)\/(exec|read|write|dev|snapshot|restore|delete)$/);
        if (liveMatch) {
          const [, runId, action] = liveMatch;
          if (action === "exec" && req.method === "POST") {
            const out = await handleLiveExec(runId, JSON.parse(Buffer.concat(chunks).toString() || "{}"));
            res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)); return;
          }
          if (action === "read" && req.method === "GET") {
            const out = await handleLiveRead(runId, url.searchParams.get("path") || "");
            res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)); return;
          }
          if (action === "write" && req.method === "POST") {
            const out = await handleLiveWrite(runId, JSON.parse(Buffer.concat(chunks).toString() || "{}"));
            res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)); return;
          }
          if (action === "dev" && req.method === "POST") {
            const out = await handleLiveDev(runId, JSON.parse(Buffer.concat(chunks).toString() || "{}"));
            res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)); return;
          }
          if (action === "snapshot" && req.method === "POST") {
            const out = await handleLiveSnapshot(runId);
            res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)); return;
          }
          if (action === "restore" && req.method === "POST") {
            const out = await handleLiveRestore(runId, JSON.parse(Buffer.concat(chunks).toString() || "{}"));
            res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)); return;
          }
          if (action === "delete" && req.method === "POST") {
            const out = await handleLiveDelete(runId);
            res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)); return;
          }
          res.writeHead(405, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "method_not_allowed" })); return;
        }
        res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "not_found" }));
      } catch (error) {
        res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }));
      }
    });
  }).listen(PORT);
}
