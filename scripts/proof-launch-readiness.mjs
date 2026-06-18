#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const out = process.env.CLOUDBOX_PROOF_OUT ?? "artifacts/LAUNCH_READINESS.md";
const checks = [
  check("build", ["bun", "run", "build"]),
  check("typecheck", ["bun", "run", "typecheck"]),
  check("test", ["bun", "run", "test"]),
  grepCheck("homepage headline", "web/src/pages/index.astro", "Fresh computers on Cloudflare."),
  grepCheck("homepage demo CTA", "web/src/pages/index.astro", "Try demo"),
  grepCheck("homepage docs CTA", "web/src/pages/index.astro", "Browse docs"),
  grepCheck("API docs mention runner receipts", "web/src/pages/docs/api.mdx", "runnerReceipts"),
];
const ok = checks.every((item) => item.ok);
mkdirSync(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(out, `# Launch Readiness\n\nStatus: ${ok ? "pass" : "fail"}\n\n${checks.map((item) => `- ${item.ok ? "✅" : "❌"} ${item.name}${item.detail ? ` — ${item.detail}` : ""}`).join("\n")}\n`);
if (!ok) process.exit(1);
console.log(`LAUNCH_READINESS_PASS ${out}`);

function check(name, cmd) {
  const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8" });
  return { name, ok: result.status === 0, detail: result.status === 0 ? "pass" : tail(result.stderr || result.stdout) };
}
function grepCheck(name, path, needle) {
  const text = readFileSync(path, "utf8");
  return { name, ok: text.includes(needle), detail: needle };
}
function tail(text) {
  return text.trim().split("\n").slice(-3).join(" / ");
}
