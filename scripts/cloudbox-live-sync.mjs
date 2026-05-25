#!/usr/bin/env node
import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const url = (process.env.CLOUDBOX_E2E_URL ?? "https://cloudbox.coey.dev").replace(/\/+$/, "");
const token = process.env.CLOUDBOX_API_TOKEN;
const args = process.argv.slice(2);
const root = resolve(readArg("--root") ?? process.cwd());
const runId = readArg("--run") ?? await readStateRunId();
const debounceMs = Number(process.env.CLOUDBOX_SYNC_DEBOUNCE_MS ?? 120);
const pending = new Map();

if (!token) throw new Error("CLOUDBOX_API_TOKEN is required");
if (!runId) throw new Error("run id is required via --run <id> or .cloudbox-live.json");
if (!Number.isFinite(debounceMs) || debounceMs < 0) throw new Error("CLOUDBOX_SYNC_DEBOUNCE_MS must be >= 0");

const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};

console.log(`sync watch ${root} -> ${runId}`);

let watcher;
try {
  watcher = watch(root, { recursive: process.platform === "darwin" || process.platform === "win32" }, queue);
} catch (error) {
  watcher = watch(root, queue);
  console.error(`sync watch fallback ${message(error)}`);
}
watcher.on("error", (error) => console.error(`sync watch error ${message(error)}`));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

function readArg(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
  return value;
}

async function readStateRunId() {
  const statePath = new URL(`file://${process.cwd()}/.cloudbox-live.json`);
  const raw = await readFile(statePath, "utf8").catch(() => null);
  if (!raw) return null;
  const state = JSON.parse(raw);
  return typeof state?.runId === "string" && state.runId ? state.runId : null;
}

function queue(_event, filename) {
  if (!filename) return;
  const fullPath = resolve(root, String(filename));
  const remotePath = toRemotePath(fullPath);
  if (!remotePath || isIgnored(remotePath)) return;
  clearTimeout(pending.get(remotePath));
  pending.set(remotePath, setTimeout(() => {
    pending.delete(remotePath);
    sync(fullPath, remotePath).catch((error) => console.error(`sync error ${remotePath} ${message(error)}`));
  }, debounceMs));
}

function toRemotePath(fullPath) {
  const localPath = relative(root, fullPath);
  if (!localPath || localPath === "." || localPath.startsWith(`..${sep}`) || localPath === "..") return null;
  return localPath.split(sep).join("/");
}

function isIgnored(remotePath) {
  if (remotePath === ".cloudbox-live.json") return true;
  if (remotePath === "web/dist" || remotePath.startsWith("web/dist/")) return true;
  return remotePath.split("/").some((part) => [".git", "node_modules", "dist", "build", "coverage", ".wrangler"].includes(part));
}

async function sync(fullPath, remotePath) {
  const info = await stat(fullPath).catch(() => null);
  if (!info?.isFile()) return;
  if (info.size > 200_000) {
    console.error(`sync skip ${remotePath} too-large`);
    return;
  }
  const bytes = await readFile(fullPath);
  if (bytes.includes(0)) {
    console.error(`sync skip ${remotePath} binary`);
    return;
  }
  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    console.error(`sync skip ${remotePath} non-utf8`);
    return;
  }
  const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}/write`, {
    method: "POST",
    headers,
    body: JSON.stringify({ path: remotePath, content }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  console.log(`sync ok ${remotePath}`);
}

function stop() {
  watcher.close();
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
  process.exit(0);
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}
