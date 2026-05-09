import type { ComputerSpec } from "./spec.ts";

export type AgentTool = {
  execute(args: Record<string, unknown>): Promise<unknown>;
};

export type AgentTools = Record<string, AgentTool> & {
  env_list: AgentTool;
  env_read: AgentTool;
  env_write: AgentTool;
  env_ask: AgentTool;
  env_submit: AgentTool;
};

export type AgentStep = {
  thought: string;
  tool: keyof AgentTools;
  args: Record<string, unknown>;
  observation?: unknown;
};

export type AgentRunResult = {
  decision: string;
  steps: AgentStep[];
};

export async function runCloudboxAgent(
  spec: ComputerSpec,
  tools: AgentTools,
): Promise<AgentRunResult> {
  const steps: AgentStep[] = [];

  const call = async (
    thought: string,
    tool: keyof AgentTools,
    args: Record<string, unknown> = {},
  ) => {
    const step: AgentStep = { thought, tool, args };
    step.observation = await tools[tool].execute(args);
    steps.push(step);
    return step.observation as any;
  };

  const listed = await call(
    "Inventory the workspace before choosing what to inspect.",
    "env_list",
  );
  const files = Array.isArray(listed?.files) ? listed.files : spec.filesystem;
  const paths = files.map((f: any) => String(f.path));

  const readme = choose(paths, [/^README\.md$/i, /readme/i]) ?? paths[0];
  if (readme) {
    await call("Read product positioning first; do not start from implementation detail.", "env_read", { path: readme });
  }

  const quickstart = choose(paths, [/quickstart/i, /runbook/i]);
  if (quickstart && quickstart !== readme) {
    await call("Read the runnable path so the launch decision is grounded in what a user or agent can actually do.", "env_read", { path: quickstart });
  }

  const architecture = choose(paths, [/architecture/i, /design/i]);
  if (architecture && architecture !== readme && architecture !== quickstart) {
    await call("Read architecture after positioning and quickstart to check the implementation shape.", "env_read", { path: architecture });
  }

  const skeptical =
    spec.collaborators.find((c) => /skeptic|review|release|quality/i.test(`${c.id} ${c.role} ${c.focus ?? ""}`)) ??
    spec.collaborators[0];
  if (skeptical) {
    await call("Ask the collaborator most likely to catch overclaims and missing checks.", "env_ask", {
      who: skeptical.id,
      message: "What claims, missing checks, or gaps would make this unsafe or waste agent time?",
    });
  }

  const objective = spec.objectives[0];
  const artifact = objective?.expectedArtifact ?? "artifacts/agent-handoff.md";
  const decision = decide(spec);
  const content = renderArtifact(spec, decision, paths, skeptical?.id);

  await call("Write a durable artifact before submitting; final answers without artifacts are too easy to lose.", "env_write", {
    path: artifact,
    content,
  });

  if (objective) {
    await call("Submit the objective with a concrete decision and rationale.", "env_submit", {
      objective: objective.id,
      decision,
      notes: "I inspected the highest-signal files, asked for skeptical review, wrote the expected artifact, and left receipts for grading.",
    });
  }

  return { decision, steps };
}

function choose(paths: string[], patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const found = paths.find((path) => pattern.test(path));
    if (found) return found;
  }
}

function decide(spec: ComputerSpec): string {
  const text = `${spec.name ?? ""} ${spec.objectives.map((o) => `${o.id} ${o.title}`).join(" ")}`.toLowerCase();
  if (text.includes("launch") || text.includes("share")) return "share";
  if (text.includes("triage")) return "needs-discussion";
  return "complete";
}

function renderArtifact(
  spec: ComputerSpec,
  decision: string,
  paths: string[],
  collaborator?: string,
): string {
  const objective = spec.objectives[0];
  return `# Agent handoff\n\nDecision: ${decision}\n\nObjective: ${objective?.id ?? "unknown"} — ${objective?.title ?? "complete the assigned work"}\n\nEvidence inspected:\n${paths.slice(0, 6).map((p) => `- ${p}`).join("\n")}\n\nCollaborator check: ${collaborator ?? "none available"}\n\nThis artifact was produced by the Cloudbox agent runner using Cloudbox tools. The run is gradeable from receipts.\n`;
}
