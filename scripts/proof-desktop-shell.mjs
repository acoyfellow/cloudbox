#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const url = (process.env.CLOUDBOX_E2E_URL ?? "https://cloudbox.coey.dev").replace(/\/+$/, "");
const token = process.env.CLOUDBOX_API_TOKEN;
const repo = process.env.CLOUDBOX_DESKTOP_REPO ?? "https://github.com/acoyfellow/cloudbox";
const out = process.env.CLOUDBOX_DESKTOP_PROOF_OUT ?? "artifacts/DESKTOP_SHELL.md";

if (!token) throw new Error("CLOUDBOX_API_TOKEN is required for desktop/shell proof");
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

async function request(path, init = {}) {
  const response = await fetch(`${url}${path}`, { ...init, headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(`${init.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(body)}`), { status: response.status, body });
  return body;
}
async function createDesktopRun() {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await request("/api/runs", {
        method: "POST",
        body: JSON.stringify({ repo, verify: ["test -f package.json"], live: true, desktop: true, ttlSeconds: 3600 }),
      });
    } catch (error) {
      last = error;
      const failedId = error?.body?.runId;
      if (failedId) await fetch(`${url}/api/runs/${encodeURIComponent(failedId)}`, { method: "DELETE", headers }).catch(() => undefined);
      const transient = error?.status === 503 || (error?.status === 500 && error?.body?.error === "runner_error" && /container request failed: 503/i.test(error?.body?.detail ?? ""));
      if (!transient || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 5_000));
    }
  }
  throw last;
}

const created = await createDesktopRun();
const runId = created.runId;
if (!runId) throw new Error("desktop live run returned no runId");
const shellUrl = `${url}/api/runs/${runId}/preview/shell/`;
const desktopUrl = `${url}/api/runs/${runId}/preview/desktop/vnc.html`;
const shellResponse = await fetch(shellUrl, { headers: { authorization: `Bearer ${token}` } });
const shellText = await shellResponse.text();
const desktopResponse = await fetch(desktopUrl, { headers: { authorization: `Bearer ${token}` } });
const desktopText = await desktopResponse.text();
const shellOk = shellResponse.ok && /ttyd|terminal/i.test(shellText);
const desktopOk = desktopResponse.ok && /noVNC|vnc/i.test(desktopText);
const status = shellOk && desktopOk ? "pass" : "fail";

await mkdir(dirname(out), { recursive: true });
await writeFile(out, `# Desktop and Shell Proof\n\nStatus: ${status}\n\n- Run: ${runId}\n- Shell URL: ${shellUrl}\n- Desktop URL: ${desktopUrl}\n- Shell HTML returned: ${shellResponse.status} (${shellOk ? "recognized" : "unrecognized"})\n- Desktop HTML returned: ${desktopResponse.status} (${desktopOk ? "recognized" : "unrecognized"})\n\nThis is an HTTP presence check. A follow-up browser smoke should prove WebSocket terminal input and the rendered noVNC desktop.\n`, "utf8");
console.log(JSON.stringify({ status, runId, shellUrl, desktopUrl, out }, null, 2));
if (status !== "pass") process.exit(1);
