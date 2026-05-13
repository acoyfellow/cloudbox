import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 8080);
const MAX_OUTPUT = 64_000;
const MAX_TIMEOUT_MS = 120_000;

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

  const root = await mkdtemp(join(tmpdir(), "cloudbox-"));
  const workspace = join(root, "repo");
  const receipts = [];
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
    return { ok: receipts.every((r) => r.code === 0), receipts, artifact, diff: diff.stdout };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const server = Bun?.serve ? null : null;

if (typeof Bun !== "undefined") {
  Bun.serve({
    port: PORT,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/health") return json({ ok: true });
      if (url.pathname === "/run" && request.method === "POST") {
        try { return json(await handleRun(await request.json())); }
        catch (error) { return json({ ok: false, error: String(error?.message || error) }, 400); }
      }
      return json({ error: "not_found" }, 404);
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
        res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "not_found" }));
      } catch (error) {
        res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }));
      }
    });
  }).listen(PORT);
}
