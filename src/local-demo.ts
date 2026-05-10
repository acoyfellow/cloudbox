import { gradeReceipts, type Receipt } from "./grade.ts";
import type { ComputerSpec } from "./spec.ts";

type LocalState = {
  spec: ComputerSpec;
  files: Map<string, { path: string; kind: string; state?: string; description?: string; content: string }>;
  receipts: Receipt[];
};

const states = new Map<string, LocalState>();

export function materializeLocal(spec: ComputerSpec) {
  const id = `local-${spec?.runId ?? Date.now().toString(36)}`;
  const files = new Map<string, LocalState["files"] extends Map<string, infer T> ? T : never>();
  for (const file of spec.filesystem ?? []) {
    files.set(file.path, {
      ...file,
      content: seedContent(file.path),
    });
  }
  const state: LocalState = { spec, files, receipts: [] };
  states.set(id, state);
  append(state, "init", { id });
  return { id, baseUrl: `/local-demo/c/${id}` };
}

export async function handleLocalAction(id: string, action: string, request: Request, url: URL): Promise<{ status: number; body: unknown }> {
  const state = states.get(id);
  if (!state) return { status: 404, body: { error: "not_found" } };
  const spec = state.spec;

  if (request.method === "GET" && action === "list") {
    const files = [...state.files.values()].map(({ content: _content, ...file }) => file);
    append(state, "list", { count: files.length });
    return { status: 200, body: { files } };
  }
  if (request.method === "GET" && action === "read") {
    const path = url.searchParams.get("path") ?? "";
    const file = state.files.get(path);
    if (!file) return { status: 404, body: { error: "missing_file" } };
    append(state, "read", { path });
    return { status: 200, body: { path, kind: file.kind, content: file.content } };
  }
  if (request.method === "POST" && action === "ask") {
    const body = await request.json().catch(() => ({})) as any;
    const who = String(body.who ?? "");
    const collaborator = spec.collaborators.find((c) => c.id === who);
    append(state, "ask", { who, message: body.message });
    return { status: 200, body: { from: who, role: collaborator?.role ?? "collaborator", reply: collaborator?.focus ?? "Check the proof trail and keep the claim narrow." } };
  }
  if (request.method === "POST" && action === "write") {
    const body = await request.json().catch(() => ({})) as any;
    const path = String(body.path ?? "");
    const content = String(body.content ?? "");
    state.files.set(path, { path, kind: "artifact", content });
    append(state, "write", { path, bytes: content.length });
    return { status: 200, body: { path, written: content.length } };
  }
  if (request.method === "POST" && action === "submit") {
    const body = await request.json().catch(() => ({})) as any;
    append(state, "submit", { objective: String(body.objective ?? ""), decision: body.decision, notes: body.notes });
    return { status: 200, body: { objective: body.objective, accepted: true } };
  }
  if (request.method === "GET" && action === "receipts") {
    return { status: 200, body: { receipts: state.receipts } };
  }
  if (request.method === "GET" && action === "grade") {
    const result = gradeReceipts(spec, state.receipts);
    append(state, "grade", { score: result.score, max: result.max });
    return { status: 200, body: result };
  }
  return { status: 404, body: { error: "unknown_action" } };
}

function append(state: LocalState, kind: string, payload: Record<string, unknown>) {
  state.receipts.push({
    ts: Date.now(),
    kind,
    payload: { runId: state.spec.runId, ...payload },
  });
}

function seedContent(path: string): string {
  if (path.endsWith("README.md")) return "# Cloudbox\n\nReal Cloudflare computers for agent repo work with receipts and artifacts.\n";
  if (path.includes("quickstart")) return "# Quickstart\n\nDeploy to Cloudflare, copy the prompt, then run the demo.\n";
  if (path.includes("architecture")) return "# Architecture\n\nWorker routes to a Container runner and durable workspace state.\n";
  return `Seed file for ${path}\n`;
}
