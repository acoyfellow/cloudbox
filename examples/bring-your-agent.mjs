#!/usr/bin/env node
// Bring your own agent: let the agent choose repo commands, then ask Cloudbox
// to run them in a fresh computer and return proof.

const cloudbox = process.env.CLOUDBOX_URL ?? "https://cloudbox.coey.dev";
const token = process.env.CLOUDBOX_API_TOKEN;
const repo = process.argv[2] ?? "https://github.com/acoyfellow/cloudbox";
const command = process.argv[3] ?? "echo agent-used-cloudbox > HANDOFF.md";

const response = await fetch(`${cloudbox}/api/runs`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : { "x-cloudbox-demo": "1" }),
  },
  body: JSON.stringify({
    repo,
    commands: [command],
    verify: ["test -f HANDOFF.md"],
    artifact: "HANDOFF.md",
    timeoutMs: 30_000,
  }),
});

const run = await response.json();
if (!response.ok || !run.ok) {
  console.error(JSON.stringify(run, null, 2));
  process.exit(1);
}

console.log("Artifact:\n" + run.artifact.content);
console.log("Runner proof:", run.runnerReceipts?.find((receipt) => receipt.type === "runner.container.ready"));
console.log("Work receipts:", run.receipts?.map((receipt) => `${receipt.type}:${receipt.code}`).join(", "));
