// Bring-your-agent example.
//
// Shows an external client (your agent, your LLM, your loop — anything that
// can speak HTTP) using Cloudbox as its computer + proof layer.
//
// The pattern is:
//   1. Materialize a Cloudbox computer from a spec.
//   2. Drive the five env_* tools via plain HTTP.
//   3. Submit an objective. Pull receipts. Get a grade.
//
// You bring the brain — model choice, planning, prompting, retries. Cloudbox
// is the workspace and the receipt tape. Every action is graded from the same
// trail the homepage demo uses.
//
// Run against a deployed Worker:
//   CLOUDBOX_BASE=https://cloudbox.coey.dev \
//   CLOUDBOX_TOKEN=$YOUR_TOKEN \
//   bun run examples/bring-your-agent.ts
//
// Run against a local dev wrapper (bun run dev):
//   CLOUDBOX_BASE=http://127.0.0.1:8788 \
//   bun run examples/bring-your-agent.ts
//
// Or import { runBringYourAgent } from another script and pass your own
// `decide` function — that's where your LLM lives.

import type { ComputerSpec } from "../src/spec.ts";

export type BringYourAgentConfig = {
  /** Cloudbox HTTP base, e.g. https://cloudbox.coey.dev. No trailing slash. */
  base: string;
  /** Optional bearer token. Required against production unless the spec is a public demo. */
  token?: string;
  /** Override fetch (handy for tests / service bindings). */
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  /**
   * Your decision function. Given the current spec + an inventory of files,
   * pick the next file to read or return a final submit. Plug your LLM here.
   * Default returns a deterministic walk so the example runs without a model.
   */
  decide?: AgentDecide;
};

export type AgentDecide = (ctx: AgentContext) => Promise<AgentDecision> | AgentDecision;

export type AgentContext = {
  spec: ComputerSpec;
  inventory: Array<{ path: string; kind: string }>;
  read: Record<string, string>;
};

export type AgentDecision =
  | { type: "read"; path: string }
  | { type: "ask"; who: string; message: string }
  | { type: "write"; path: string; content: string }
  | { type: "submit"; objective: string; decision: string; notes?: string };

export type BringYourAgentResult = {
  computerId: string;
  steps: Array<{ decision: AgentDecision; result: unknown }>;
  receipts: unknown;
  grade: unknown;
};

/**
 * Run an agent against a fresh Cloudbox computer.
 *
 * The default `decide` is intentionally tiny — it walks the inventory in
 * order, reads each file, asks the first collaborator, writes a handoff,
 * and submits. Replace it with your own LLM-driven planner.
 */
export async function runBringYourAgent(
  spec: ComputerSpec,
  config: BringYourAgentConfig,
): Promise<BringYourAgentResult> {
  const fetcher = config.fetcher ?? globalThis.fetch.bind(globalThis);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.token) headers.authorization = `Bearer ${config.token}`;

  // 1. Materialize the computer.
  const createRes = await fetcher(`${config.base}/api/computers`, {
    method: "POST",
    headers,
    body: JSON.stringify(spec),
  });
  if (!createRes.ok) throw new Error(`materialize failed: ${createRes.status} ${await createRes.text()}`);
  const created = (await createRes.json()) as { id: string };
  const computerId = created.id;
  const base = `${config.base}/api/c/${computerId}`;

  const callGet = async (path: string) => {
    const r = await fetcher(`${base}${path}`, { headers });
    if (!r.ok) throw new Error(`${path} -> ${r.status}: ${await r.text()}`);
    return r.json();
  };
  const callPost = async (path: string, body: unknown) => {
    const r = await fetcher(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${path} -> ${r.status}: ${await r.text()}`);
    return r.json();
  };

  // 2. Drive the agent loop.
  const decide = config.decide ?? defaultDecide;
  const steps: BringYourAgentResult["steps"] = [];
  const read: Record<string, string> = {};
  let submitted = false;
  const MAX_STEPS = 12;

  for (let i = 0; i < MAX_STEPS && !submitted; i++) {
    const listing = (await callGet("/list")) as { files: Array<{ path: string; kind: string }> };
    const decision = await decide({ spec, inventory: listing.files, read });
    let result: unknown;
    if (decision.type === "read") {
      const r = (await callGet(`/read?path=${encodeURIComponent(decision.path)}`)) as { content: string };
      read[decision.path] = r.content;
      result = r;
    } else if (decision.type === "ask") {
      result = await callPost("/ask", { who: decision.who, message: decision.message });
    } else if (decision.type === "write") {
      result = await callPost("/write", { path: decision.path, content: decision.content });
    } else if (decision.type === "submit") {
      result = await callPost("/submit", {
        objective: decision.objective,
        decision: decision.decision,
        notes: decision.notes,
      });
      submitted = true;
    } else {
      throw new Error(`unknown decision type: ${(decision as { type: string }).type}`);
    }
    steps.push({ decision, result });
  }

  // 3. Pull receipts + grade so the caller has a single, gradeable proof bundle.
  const receipts = await callGet("/receipts");
  const grade = await callGet("/grade");
  return { computerId, steps, receipts, grade };
}

/**
 * Default deterministic policy. Walk the inventory, ask the first
 * collaborator, write a handoff, submit. No model needed.
 */
const defaultDecide: AgentDecide = ({ spec, inventory, read }) => {
  const unread = inventory.find((f) => !(f.path in read));
  if (unread) return { type: "read", path: unread.path };

  const askedKey = "__asked__";
  if (!(askedKey in read) && spec.collaborators[0]) {
    // Mark as asked so we don't loop. The flag never gets written to the real
    // computer; it just lives in our local `read` map.
    read[askedKey] = "1";
    return {
      type: "ask",
      who: spec.collaborators[0].id,
      message: "What is the biggest risk in shipping this as-is?",
    };
  }

  const objective = spec.objectives[0];
  const artifact = objective?.expectedArtifact ?? "artifacts/agent-handoff.md";
  const writeKey = `__wrote__${artifact}`;
  if (!(writeKey in read)) {
    read[writeKey] = "1";
    return {
      type: "write",
      path: artifact,
      content: renderHandoff(spec, Object.keys(read).filter((k) => !k.startsWith("__"))),
    };
  }

  return {
    type: "submit",
    objective: objective?.id ?? "ship",
    decision: "share",
    notes: "Read the inventory, asked a collaborator, wrote the expected artifact.",
  };
};

function renderHandoff(spec: ComputerSpec, paths: string[]): string {
  const o = spec.objectives[0];
  return [
    "# Bring-your-agent handoff",
    "",
    `Objective: ${o?.id ?? "ship"} — ${o?.title ?? "complete the assigned work"}`,
    "",
    "Files read:",
    ...paths.map((p) => `- ${p}`),
    "",
    "Produced by an external agent driving Cloudbox over HTTP.",
    "",
  ].join("\n");
}

// ---- CLI entry ----
//
// `bun run examples/bring-your-agent.ts` runs against CLOUDBOX_BASE
// using the bundled agent-launch spec. Useful for smoke-testing a deploy.
if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.env.CLOUDBOX_BASE;
  if (!base) {
    console.error("Set CLOUDBOX_BASE=https://cloudbox.coey.dev (or your local dev URL).");
    process.exit(1);
  }
  const { agentLaunchSpec } = await import("../seed/agent-launch.ts");
  const result = await runBringYourAgent(
    { ...agentLaunchSpec, runId: `bya-${Date.now().toString(36)}` },
    { base, token: process.env.CLOUDBOX_TOKEN },
  );
  console.log(JSON.stringify({
    computerId: result.computerId,
    stepCount: result.steps.length,
    grade: result.grade,
  }, null, 2));
}
