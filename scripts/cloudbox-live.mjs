#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const url = (process.env.CLOUDBOX_E2E_URL ?? "https://cloudbox.coey.dev").replace(/\/+$/, "");
const token = process.env.CLOUDBOX_API_TOKEN;
const statePath = new URL(`file://${process.cwd()}/.cloudbox-live.json`);
const [subcommand, ...args] = process.argv.slice(2);

if (!token) throw new Error("CLOUDBOX_API_TOKEN is required");
if (!subcommand) throw new Error("subcommand is required: start, open, shell, desktop, exec, write, read, info, stop, resume, fork, or delete");

const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};

async function requestJson(path, init) {
  const response = await fetch(`${url}${path}`, { ...init, headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function readState() {
  const raw = await readFile(statePath, "utf8").catch(() => null);
  if (!raw) throw new Error(".cloudbox-live.json was not found in cwd; run start first");
  const state = JSON.parse(raw);
  if (!state?.runId || !state?.previewUrl) throw new Error(".cloudbox-live.json is missing runId or previewUrl");
  return state;
}

if (subcommand === "start") {
  const repo = args[0] ?? "https://github.com/acoyfellow/cloudbox";
  const command = args[1] ?? "bun run dev --host 0.0.0.0";
  const port = Number(args[2] ?? 5173);
  const desktop = args.includes("--desktop");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("port must be an integer between 1 and 65535");
  const created = await requestJson("/api/runs", {
    method: "POST",
    body: JSON.stringify({ repo, verify: ["test -f package.json"], live: true, ...(desktop ? { desktop: true } : {}) }),
  });
  if (!created?.runId) throw new Error(`live run create returned no runId: ${JSON.stringify(created)}`);
  const dev = await requestJson(`/api/runs/${encodeURIComponent(created.runId)}/dev`, {
    method: "POST",
    body: JSON.stringify({ command, port }),
  });
  if (dev?.ok !== true) throw new Error(`dev start failed: ${JSON.stringify(dev)}`);
  const state = {
    runId: created.runId,
    previewUrl: `${url}/api/runs/${created.runId}/preview/`,
    repo,
    command,
    port,
    desktop,
    shellUrl: `${url}/api/runs/${created.runId}/preview/shell/`,
    desktopUrl: `${url}/api/runs/${created.runId}/preview/desktop/vnc.html`,
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(state, null, 2));
} else if (subcommand === "open") {
  const state = await readState();
  console.log(state.previewUrl);
} else if (subcommand === "shell" || subcommand === "desktop") {
  const state = await readState();
  console.log(subcommand === "shell" ? `${url}/api/runs/${state.runId}/preview/shell/` : `${url}/api/runs/${state.runId}/preview/desktop/vnc.html`);
} else if (subcommand === "exec") {
  const command = args.join(" ");
  if (!command) throw new Error("exec command is required");
  const state = await readState();
  const body = await requestJson(`/api/runs/${encodeURIComponent(state.runId)}/exec`, {
    method: "POST",
    body: JSON.stringify({ command }),
  });
  console.log(JSON.stringify(body, null, 2));
} else if (subcommand === "write") {
  const [path, ...contentParts] = args;
  const content = contentParts.join(" ");
  if (!path || contentParts.length === 0) throw new Error("write path and content are required");
  const state = await readState();
  const body = await requestJson(`/api/runs/${encodeURIComponent(state.runId)}/write`, {
    method: "POST",
    body: JSON.stringify({ path, content }),
  });
  console.log(JSON.stringify(body, null, 2));
} else if (subcommand === "read") {
  const [path] = args;
  if (!path) throw new Error("read path is required");
  const state = await readState();
  const body = await requestJson(`/api/runs/${encodeURIComponent(state.runId)}/read?path=${encodeURIComponent(path)}`);
  if (typeof body?.content !== "string") throw new Error(`read returned no content: ${JSON.stringify(body)}`);
  process.stdout.write(body.content);
} else if (subcommand === "info") {
  const state = await readState();
  const body = await requestJson(`/api/runs/${encodeURIComponent(state.runId)}`);
  console.log(JSON.stringify(body, null, 2));
} else if (subcommand === "stop" || subcommand === "resume" || subcommand === "fork") {
  const state = await readState();
  const body = await requestJson(`/api/runs/${encodeURIComponent(state.runId)}/${subcommand}`, { method: "POST", body: "{}" });
  if (subcommand === "fork" && body?.runId) {
    const next = { ...state, runId: body.runId, forkedFrom: state.runId, previewUrl: `${url}/api/runs/${body.runId}/preview/` };
    await writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(body, null, 2));
} else if (subcommand === "delete") {
  const state = await readState();
  const body = await requestJson(`/api/runs/${encodeURIComponent(state.runId)}`, { method: "DELETE" });
  console.log(JSON.stringify(body, null, 2));
} else {
  throw new Error(`unknown subcommand: ${subcommand}`);
}
