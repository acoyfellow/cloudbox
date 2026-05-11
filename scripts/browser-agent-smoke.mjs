#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const url = process.env.CLOUDBOX_BROWSER_URL ?? process.env.CLOUDBOX_E2E_URL ?? "https://cloudbox.coey.dev";
const profile = process.env.AGENT_BROWSER_PROFILE;
const out = process.env.CLOUDBOX_BROWSER_PROOF_OUT ?? "artifacts/BROWSER_AGENT.md";
const shotDir = "artifacts/browser-agent";
mkdirSync(shotDir, { recursive: true });

function agentBrowser(args) {
  const fullArgs = profile ? ["--profile", profile, ...args] : args;
  return execFileSync("agent-browser", fullArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

let snapshot = "";
let screenshot = "";
let ok = false;
let error = "";
try {
  agentBrowser(["open", `${url}/demo"]);
  snapshot = agentBrowser(["snapshot", "-i"]);
  screenshot = agentBrowser(["screenshot", "--screenshot-dir", shotDir]).trim();
  ok = /Run a repo in Cloudbox|Define the run|Inspect the proof/.test(snapshot);
} catch (err) {
  error = err instanceof Error ? err.message : String(err);
}

writeFileSync(out, `# Browser Agent Smoke\n\nStatus: ${ok ? "pass" : "fail"}\n\n- URL: ${url}/demo\n- Chrome profile: ${profile ?? "default agent-browser profile"}\n- Screenshot: ${screenshot || "not captured"}\n\n## Snapshot excerpt\n\n\`\`\`\n${snapshot.slice(0, 4000)}\n\`\`\`\n\n${error ? `## Error\n\n\`\`\`\n${error}\n\`\`\`\n` : ""}`);

if (!ok) process.exit(1);
console.log(`BROWSER_AGENT_SMOKE_PASS ${out}`);
