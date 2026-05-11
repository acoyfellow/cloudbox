#!/usr/bin/env node
// Local Docker smoke test for the Cloudbox runner container.
//
// Builds the image in `runner/`, starts it, hits /health, posts a tiny
// /run that clones a small public repo and executes a single safe command,
// and tears the container down. Optional: skipped automatically when Docker
// is not available so it never blocks normal `bun run test`.
//
// Usage:
//   node scripts/runner-smoke.mjs
//   CLOUDBOX_RUNNER_SMOKE_REPO=https://github.com/octocat/Hello-World node scripts/runner-smoke.mjs

import { spawn, spawnSync } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

const IMAGE = process.env.CLOUDBOX_RUNNER_IMAGE ?? "cloudbox-runner:smoke";
const CONTAINER = process.env.CLOUDBOX_RUNNER_CONTAINER ?? "cloudbox-runner-smoke";
const PORT = Number(process.env.CLOUDBOX_RUNNER_PORT ?? 18080);
const REPO = process.env.CLOUDBOX_RUNNER_SMOKE_REPO ?? "https://github.com/octocat/Hello-World";
const READY_TIMEOUT_MS = Number(process.env.CLOUDBOX_RUNNER_READY_TIMEOUT_MS ?? 30_000);
const RUN_TIMEOUT_MS = Number(process.env.CLOUDBOX_RUNNER_RUN_TIMEOUT_MS ?? 60_000);

function hasDocker() {
  const result = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { stdio: "ignore" });
  return result.status === 0;
}

function dockerSync(args, { allowFail = false } = {}) {
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (!allowFail && result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed with exit ${result.status}`);
  }
  return result.status ?? -1;
}

async function waitForHealth() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await wait(500);
  }
  throw new Error(`runner did not become healthy within ${READY_TIMEOUT_MS}ms`);
}

async function postRun() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RUN_TIMEOUT_MS);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: REPO, verify: ["ls"], timeoutMs: 30_000 }),
      signal: ctrl.signal,
    });
    const body = await res.json();
    if (!res.ok || !body || body.ok !== true) {
      throw new Error(`runner /run returned ${res.status}: ${JSON.stringify(body)}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!hasDocker()) {
    console.log("docker not available — skipping runner smoke");
    process.exit(0);
  }

  // Build the runner image from runner/.
  dockerSync(["build", "-t", IMAGE, "runner"]);

  // Clean any leftover container from a previous run.
  dockerSync(["rm", "-f", CONTAINER], { allowFail: true });

  // Start the container.
  dockerSync(["run", "-d", "--name", CONTAINER, "-p", `${PORT}:8080`, IMAGE]);

  try {
    await waitForHealth();
    const result = await postRun();
    const verify = result.receipts?.find((r) => r.type === "verify");
    if (!verify || verify.code !== 0) {
      throw new Error(`expected verify receipt with exit 0, got ${JSON.stringify(verify)}`);
    }
    console.log(`RUNNER_SMOKE_PASS image=${IMAGE} repo=${REPO}`);
  } finally {
    dockerSync(["rm", "-f", CONTAINER], { allowFail: true });
  }
}

main().catch((error) => {
  console.error("RUNNER_SMOKE_FAIL", error?.message ?? error);
  process.exit(1);
});
