#!/usr/bin/env node
const url = process.env.CLOUDBOX_E2E_URL ?? process.env.CLOUDBOX_URL ?? "https://cloudbox.coey.dev";
const token = process.env.CLOUDBOX_API_TOKEN;
if (!token) throw new Error("CLOUDBOX_API_TOKEN is required");
const repo = process.env.STRATUS_REPO ?? "https://gitlab.cfdata.org/cloudflare/fe/stratus.git";
const ref = process.env.STRATUS_REF;
const response = await fetch(`${url}/api/runs`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({
    repo,
    ref,
    auth: "gitlab",
    commands: [
      "pwd",
      "find . -maxdepth 2 -name package.json | head -20",
      "pnpm --version || true",
      "printf 'Stratus cloned in Cloudbox\\n' > STRATUS_HANDOFF.md",
    ],
    verify: ["test -s STRATUS_HANDOFF.md"],
    artifact: "STRATUS_HANDOFF.md",
    timeoutMs: 120000,
  }),
});
const body = await response.json().catch(async () => ({ ok: false, error: await response.text() }));
console.log(JSON.stringify(body, null, 2));
if (!response.ok || !body.ok) process.exit(1);
