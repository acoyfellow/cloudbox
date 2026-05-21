#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.env.CLOUDBOX_E2E_URL ?? "https://cloudbox.coey.dev";
const token = process.env.CLOUDBOX_API_TOKEN;
const out = process.env.CLOUDBOX_LIVE_PREVIEW_OUT ?? "artifacts/LIVE_PREVIEW.md";
const nonce = `live-preview-${Date.now()}`;
if (!token) throw new Error("CLOUDBOX_API_TOKEN is required for the live preview proof; demo mode intentionally disallows dev-server setup commands");
const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };

const create = await fetch(`${url}/api/runs`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    repo: "https://github.com/acoyfellow/cloudbox",
    commands: [
      `mkdir -p live-preview && printf '<!doctype html><html><body><h1>${nonce}</h1></body></html>' > live-preview/index.html`,
    ],
    verify: ["test -f live-preview/index.html"],
    live: true,
    timeoutMs: 30_000,
  }),
});
const created = await create.json().catch(() => null);
if (!create.ok || !created?.runId) throw new Error(`live run create failed: ${create.status} ${JSON.stringify(created)}`);
const runId = created.runId;

const dev = await fetch(`${url}/api/runs/${runId}/dev`, {
  method: "POST",
  headers,
  body: JSON.stringify({ command: "cd live-preview && python3 -m http.server 4173 --bind 0.0.0.0", port: 4173 }),
});
const devBody = await dev.json().catch(() => null);
if (!dev.ok || devBody?.ok !== true) throw new Error(`dev start failed: ${dev.status} ${JSON.stringify(devBody)}`);

const previewUrl = `${url}/api/runs/${runId}/preview/`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  extraHTTPHeaders: { authorization: `Bearer ${token}` },
});
let previewSeen = false;
let updatedSeen = false;
let writeBody = null;
try {
  await page.goto(previewUrl, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByText(nonce).waitFor({ timeout: 60_000 });
  previewSeen = true;

  const updated = `${nonce}-updated`;
  const write = await fetch(`${url}/api/runs/${runId}/write`, {
    method: "POST",
    headers,
    body: JSON.stringify({ path: "live-preview/index.html", content: `<!doctype html><html><body><h1>${updated}</h1></body></html>` }),
  });
  writeBody = await write.json().catch(() => null);
  if (!write.ok || writeBody?.ok !== true) throw new Error(`live write failed: ${write.status} ${JSON.stringify(writeBody)}`);

  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await page.getByText(updated).waitFor({ timeout: 60_000 });
  updatedSeen = true;
} finally {
  await browser.close();
}

mkdirSync(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(out, `# Live Preview Proof\n\nStatus: ${previewSeen && updatedSeen ? "pass" : "fail"}\n\n- URL: ${url}\n- Run: ${runId}\n- Preview: ${previewUrl}\n- First preview seen: ${previewSeen}\n- Updated file seen after reload: ${updatedSeen}\n\n## Dev response\n\n\`\`\`json\n${JSON.stringify(devBody, null, 2)}\n\`\`\`\n\n## Write response\n\n\`\`\`json\n${JSON.stringify(writeBody, null, 2)}\n\`\`\`\n`);

if (!previewSeen || !updatedSeen) process.exit(1);
console.log(`LIVE_PREVIEW_PASS ${out}`);
