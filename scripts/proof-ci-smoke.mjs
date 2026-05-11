#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.CLOUDBOX_E2E_URL ?? process.env.CLOUDBOX_URL ?? "https://cloudbox.coey.dev";
const token = process.env.CLOUDBOX_API_TOKEN;
const out = process.env.CLOUDBOX_PROOF_OUT ?? "artifacts/CI_SMOKE.md";
const repo = process.env.CLOUDBOX_CI_REPO ?? "https://github.com/acoyfellow/cloudbox";
const nonce = `ci-smoke-${Date.now()}`;

const headers = { "content-type": "application/json" };
if (token) headers.authorization = `Bearer ${token}`;
else headers["x-cloudbox-demo"] = "1";

const response = await fetch(`${url}/api/runs`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    repo,
    commands: [`echo ${nonce} > CI_SMOKE.md`],
    verify: ["test -f CI_SMOKE.md"],
    artifact: "CI_SMOKE.md",
    timeoutMs: 30_000,
  }),
});
const body = await response.json().catch(() => null);
const ready = body?.runnerReceipts?.find?.((receipt) => receipt.type === "runner.container.ready");
const verified = body?.receipts?.some?.((receipt) => receipt.type === "verify" && receipt.code === 0);
const artifactMatched = body?.artifact?.content === `${nonce}\n`;
const ok = response.ok && body?.ok === true && ready && verified && artifactMatched;

mkdirSync(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(out, `# Cloudbox CI Smoke\n\nStatus: ${ok ? "pass" : "fail"}\n\n- URL: ${url}\n- Repo: ${repo}\n- Nonce: ${nonce}\n- Artifact matched: ${artifactMatched}\n- Verify receipt: ${verified ? "pass" : "missing"}\n- Runner ready: ${ready ? `${ready.elapsedMs}ms, attempt ${ready.attempt}` : "missing"}\n- HTTP: ${response.status}\n\n## Artifact\n\n\`\`\`\n${body?.artifact?.content ?? ""}\n\`\`\`\n\n## Runner receipts\n\n\`\`\`json\n${JSON.stringify(body?.runnerReceipts ?? [], null, 2)}\n\`\`\`\n`);

if (!ok) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}
console.log(`CI_SMOKE_PASS ${out}`);
