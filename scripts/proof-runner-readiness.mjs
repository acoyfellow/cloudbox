#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.CLOUDBOX_E2E_URL ?? "https://cloudbox.coey.dev";
const token = process.env.CLOUDBOX_API_TOKEN;
const out = process.env.CLOUDBOX_PROOF_OUT ?? "artifacts/RUNNER_READINESS.md";
const nonce = `runner-readiness-${Date.now()}`;

const headers = { "content-type": "application/json" };
if (token) headers.authorization = `Bearer ${token}`;
else headers["x-cloudbox-demo"] = "1";

const response = await fetch(`${url}/api/runs`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    repo: "https://github.com/acoyfellow/cloudbox",
    commands: [`echo ${nonce} > RUNNER_READINESS.md`],
    verify: ["test -f RUNNER_READINESS.md"],
    artifact: "RUNNER_READINESS.md",
    timeoutMs: 30_000,
  }),
});
const body = await response.json().catch(() => null);
const ready = body?.runnerReceipts?.find?.((receipt) => receipt.type === "runner.container.ready");
const ok = response.ok && body?.ok === true && body?.artifact?.content === `${nonce}\n` && ready;

mkdirSync(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(out, `# Runner Readiness\n\nStatus: ${ok ? "pass" : "fail"}\n\n- URL: ${url}\n- Nonce: ${nonce}\n- Artifact matched: ${body?.artifact?.content === `${nonce}\n`}\n- Runner ready: ${ready ? `${ready.elapsedMs}ms, attempt ${ready.attempt}` : "no"}\n- HTTP: ${response.status}\n\n## Runner receipts\n\n\`\`\`json\n${JSON.stringify(body?.runnerReceipts ?? [], null, 2)}\n\`\`\`\n`);

if (!ok) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}
console.log(`RUNNER_READINESS_PASS ${out}`);
