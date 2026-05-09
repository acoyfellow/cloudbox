import { unstable_dev } from "wrangler";
import { agentLaunchSpec } from "../seed/agent-launch.ts";
import { createCloudboxTools } from "../src/think.ts";
import { runCloudboxAgent } from "../src/agent.ts";

const keep = process.argv.includes("--keep");
const worker = await unstable_dev("web/dist/_worker.js/index.js", {
  config: "wrangler.jsonc",
  local: true,
  experimental: { disableExperimentalWarning: true },
});

const base = `http://${worker.address}:${worker.port}`;
const events = [];

async function req(path, init) {
  const r = await fetch(`${base}${path}`, init);
  const text = await r.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${r.status}: ${text}`);
  return body;
}

async function post(path, body) {
  return req(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function ok(label, detail = "") {
  events.push({ ok: true, label, detail });
  console.log(`✓ ${label}${detail ? ` · ${detail}` : ""}`);
}

try {
  const health = await req("/api/health");
  if (health.name !== "cloudbox") throw new Error(`bad health ${JSON.stringify(health)}`);
  ok("worker healthy", base);

  const runId = `dogfood-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const spec = { ...agentLaunchSpec, runId };
  const computer = await post("/computers", spec);
  ok("materialized dogfood workspace", computer.id);

  const listed = await req(`/c/${computer.id}/list`);
  if (!listed.files.some((f) => f.path === "README.md")) throw new Error("README.md missing from file list");
  ok("listed workspace files", `${listed.files.length} files`);

  const tools = createCloudboxTools({
    computerId: computer.id,
    origin: base,
    fetcher: fetch,
  });
  const before = await req(`/c/${computer.id}/receipts`);
  const agentResult = await runCloudboxAgent(spec, tools);
  ok("real agent runner completed", `${agentResult.steps.length} tool calls · decision=${agentResult.decision}`);

  const grade = await req(`/c/${computer.id}/grade`);
  const expected = grade.max;
  if (grade.score !== expected || expected < 8) throw new Error(`bad grade ${JSON.stringify(grade)}`);
  ok("grade passed", `${grade.score}/${grade.max}`);

  const receipts = await req(`/c/${computer.id}/receipts`);
  const currentReceipts = receipts.receipts.filter((r) => r.payload?.runId === runId);
  if (currentReceipts.length <= before.receipts.length) { /* run ids isolate this run; count is independent */ }
  const kinds = currentReceipts.map((r) => r.kind);
  for (const kind of ["init", "read", "ask", "write", "submit", "grade"]) {
    if (!kinds.includes(kind)) throw new Error(`missing receipt kind ${kind}: ${kinds.join(",")}`);
  }
  ok("current-run receipt trail complete", `${currentReceipts.length} receipts · ${runId}`);

  const artifact = await req(`/c/${computer.id}/read?path=${encodeURIComponent("artifacts/launch-note.md")}`);
  if (!String(artifact.content).includes("Decision: share")) throw new Error(`artifact content missing decision: ${artifact.content}`);
  ok("artifact readable after write", `${artifact.content.length} chars`);

  console.log("\nDOGFOOD_E2E_PASS");
} finally {
  if (!keep) await worker.stop();
}
