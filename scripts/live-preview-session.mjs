#!/usr/bin/env node

const url = process.env.CLOUDBOX_E2E_URL ?? "https://cloudbox.coey.dev";
const token = process.env.CLOUDBOX_API_TOKEN;
const repo = process.argv[2] ?? "https://github.com/acoyfellow/cloudbox";
const command = process.argv[3] ?? "bun run dev --host 0.0.0.0";
const port = Number(process.argv[4] ?? 5173);

if (!token) throw new Error("CLOUDBOX_API_TOKEN is required");
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("port must be an integer between 1 and 65535");

const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};

const create = await fetch(`${url}/api/runs`, {
  method: "POST",
  headers,
  body: JSON.stringify({ repo, verify: ["test -f package.json"], live: true }),
});
const created = await create.json().catch(() => null);
if (!create.ok || !created?.runId) throw new Error(`live run create failed: ${create.status} ${JSON.stringify(created)}`);

const dev = await fetch(`${url}/api/runs/${created.runId}/dev`, {
  method: "POST",
  headers,
  body: JSON.stringify({ command, port }),
});
const processBody = await dev.json().catch(() => null);
if (!dev.ok || processBody?.ok !== true) throw new Error(`dev start failed: ${dev.status} ${JSON.stringify(processBody)}`);

console.log(JSON.stringify({
  runId: created.runId,
  previewUrl: `${url}/api/runs/${created.runId}/preview/`,
  command,
  port,
}, null, 2));
