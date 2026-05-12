import { Hono } from "hono";
import { fromBrief } from "./brief.ts";
import { runInContainer, type ContainerRunRequest } from "./container-runner.ts";
import { materialize } from "./materialize.ts";
import type { ComputerSpec } from "./spec.ts";
import { handleLocalAction, materializeLocal } from "./local-demo.ts";

export type CloudboxBindings = {
  CLOUDBOX_COMPUTER?: DurableObjectNamespace;
  CLOUDBOX_RUNNER?: unknown;
  ARTIFACTS?: R2Bucket;
  DB?: D1Database;
  CLOUDBOX_API_TOKEN?: string;
  AI?: unknown;
};

export const api = new Hono<{ Bindings: CloudboxBindings }>();

api.get("/api/health", (c) => c.json({ ok: true, name: "cloudbox" }));

api.post("/api/brief", async (c) => {
  const body = await c.req.json().catch(() => null) as { brief?: string } | null;
  if (!body?.brief || typeof body.brief !== "string") return jsonError(c, 400, "bad_request", "brief required");
  return c.json(fromBrief(body.brief, c.env as any));
});

api.post("/api/computers", async (c) => {
  const spec = await c.req.json().catch(() => null) as ComputerSpec | null;
  const auth = authorize(c.req.raw, spec, c.env);
  if (auth) return auth;
  const validation = validateSpec(spec);
  if (validation) return validation;
  if (!c.env.CLOUDBOX_COMPUTER) return c.json(materializeLocal(spec as ComputerSpec), 201);
  const result = await materialize(spec as ComputerSpec, c.env as any);
  return c.json(result, 201);
});

api.all("/api/c/:id/:action", async (c) => {
  const id = c.req.param("id");
  const action = c.req.param("action");
  if (!c.env.CLOUDBOX_COMPUTER) {
    const result = await handleLocalAction(id, action, c.req.raw, new URL(c.req.url));
    return c.json(result.body as any, result.status as any);
  }
  const auth = authorizeAction(c.req.raw, action, c.env);
  if (auth) return auth;
  const stub = c.env.CLOUDBOX_COMPUTER.get(c.env.CLOUDBOX_COMPUTER.idFromName(id));
  const upstream = new URL(c.req.url);
  upstream.pathname = `/${action}`;
  return stub.fetch(new Request(upstream, c.req.raw));
});

api.get("/api/runs/recent", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const rows = await listRuns(c.env.DB);
  return c.json({ runs: rows });
});

api.get("/api/runs/:id", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const row = await getRun(c.env.DB, c.req.param("id"));
  return row ? c.json(row) : jsonError(c, 404, "run_not_found", "run not found");
});

api.post("/api/runs", async (c) => {
  const demo = c.req.raw.headers.get("x-cloudbox-demo") === "1";
  const auth = demo ? null : authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const input = await c.req.json().catch(() => null) as ContainerRunRequest | null;
  const validation = validateRun(input);
  if (validation) return validation;
  if (demo && !isAllowedDemoRun(input)) return jsonError(c, 403, "demo_not_allowed", "demo runs only allow public GitHub repos with short echo/test commands");
  if (!c.env.CLOUDBOX_RUNNER) return jsonError(c, 503, "runner_unavailable", "Cloudflare Container runner is only available in the deployed Worker");
  const runId = `run_${crypto.randomUUID()}`;
  try {
    const result = await runInContainer(c.env.CLOUDBOX_RUNNER, input as ContainerRunRequest);
    await recordRun(c.env.DB, { id: runId, input, result, status: result.ok ? "passed" : "failed" });
    return c.json({ runId, ...result }, result.ok ? 200 : 422);
  } catch (error) {
    const result = { ok: false, error: "runner_error", detail: String(error instanceof Error ? error.stack ?? error.message : error) };
    await recordRun(c.env.DB, { id: runId, input, result, status: "error" });
    return c.json({ runId, ...result }, 500);
  }
});

api.all("*", (c) => jsonError(c, 404, "not_found", "unknown API route"));

function authorize(request: Request, spec: ComputerSpec | null, env: CloudboxBindings): Response | null {
  if (isPublicDemoSpec(spec)) return null;
  const token = env.CLOUDBOX_API_TOKEN;
  if (!token) return null;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cloudbox-token");
  return got === token ? null : jsonErrorResponse(401, "unauthorized", "valid Cloudbox token required");
}

function authorizeAction(request: Request, action: string, env: CloudboxBindings): Response | null {
  if (request.headers.get("x-cloudbox-demo") === "1") return null;
  const token = env.CLOUDBOX_API_TOKEN;
  if (!token) return null;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cloudbox-token");
  return got === token ? null : jsonErrorResponse(401, "unauthorized", "valid Cloudbox token required");
}

function isPublicDemoSpec(spec: ComputerSpec | null): boolean {
  return !!spec?.name && spec.name === "agent-launch-readiness" && typeof spec.runId === "string" && spec.runId.startsWith("browser-");
}

function validateSpec(spec: ComputerSpec | null): Response | null {
  if (!spec || typeof spec !== "object") return jsonErrorResponse(400, "bad_spec", "expected a ComputerSpec body");
  if (!spec.profile || typeof spec.profile.role !== "string") return jsonErrorResponse(400, "bad_spec", "profile.role required");
  if (!Array.isArray(spec.filesystem)) return jsonErrorResponse(400, "bad_spec", "filesystem array required");
  if (!Array.isArray(spec.collaborators)) return jsonErrorResponse(400, "bad_spec", "collaborators array required");
  if (!Array.isArray(spec.objectives)) return jsonErrorResponse(400, "bad_spec", "objectives array required");
  if (!Array.isArray(spec.rubric)) return jsonErrorResponse(400, "bad_spec", "rubric array required");
  return null;
}

function isAllowedDemoRun(input: ContainerRunRequest | null): boolean {
  if (!input) return false;
  const commands = [...(input.commands ?? []), ...(input.verify ?? [])];
  if (commands.length > 4) return false;
  if (commands.some((cmd) => !/^(echo |test |pwd$|ls( |$)|node --version$|npm --version$|pnpm --version$|bun --version$)/.test(cmd))) return false;
  // Reject shell metacharacters that could chain into other commands. Demo runs
  // are sandboxed to a curated allow-list; block obvious injection attempts so
  // a permissive prefix like `echo ` cannot smuggle additional commands.
  // A single `echo ... > HANDOFF.md` is allowed so the hosted demo can create
  // the artifact it returns, but arbitrary redirection remains blocked.
  if (commands.some((cmd) => /[;&|`$\n\r\\]/.test(cmd))) return false;
  if (commands.some((cmd) => /[<>]/.test(cmd) && !/^echo [A-Za-z0-9 _.,:-]+ > HANDOFF\.md$/.test(cmd))) return false;
  return !!input.repo && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(input.repo);
}

function validateRun(input: ContainerRunRequest | null): Response | null {
  if (!input || typeof input !== "object") return jsonErrorResponse(400, "bad_run", "expected JSON body");
  if (!input.repo || typeof input.repo !== "string") return jsonErrorResponse(400, "bad_run", "repo is required");
  const isGithub = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(input.repo);
  const isGitlab = /^https:\/\/gitlab\.cfdata\.org\/[A-Za-z0-9_./-]+(?:\.git)?$/.test(input.repo);
  if (!isGithub && !(input.auth === "gitlab" && isGitlab)) return jsonErrorResponse(400, "bad_run", "repo must be a public GitHub URL or a gitlab.cfdata.org URL with auth=gitlab");
  if (input.auth !== undefined && input.auth !== "none" && input.auth !== "gitlab") return jsonErrorResponse(400, "bad_run", "auth must be none or gitlab");
  if (input.ref !== undefined && (typeof input.ref !== "string" || input.ref.length > 120 || /[^A-Za-z0-9_./-]/.test(input.ref))) return jsonErrorResponse(400, "bad_run", "ref must be a short git ref");
  for (const key of ["commands", "verify"] as const) {
    const list = input[key];
    if (list !== undefined && !Array.isArray(list)) return jsonErrorResponse(400, "bad_run", `${key} must be an array`);
    if (list && list.length > 12) return jsonErrorResponse(400, "bad_run", `${key} has too many commands`);
    if (list?.some((cmd) => typeof cmd !== "string" || cmd.length > 1_000)) return jsonErrorResponse(400, "bad_run", `${key} contains an invalid command`);
  }
  if (!input.commands?.length && !input.verify?.length) return jsonErrorResponse(400, "bad_run", "at least one command or verify command is required");
  if (input.artifact !== undefined && (typeof input.artifact !== "string" || input.artifact.length > 240)) return jsonErrorResponse(400, "bad_run", "artifact must be a short relative path");
  return null;
}

type RunRecord = { id: string; createdAt: string; repo: string; status: string; artifact: string | null; result: unknown };

async function ensureRunsTable(db?: D1Database): Promise<void> {
  if (!db) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    repo TEXT NOT NULL,
    status TEXT NOT NULL,
    artifact TEXT,
    result TEXT NOT NULL
  )`).run();
}

async function recordRun(db: D1Database | undefined, row: { id: string; input: ContainerRunRequest | null; result: unknown; status: string }): Promise<void> {
  if (!db || !row.input) return;
  await ensureRunsTable(db);
  const artifact = typeof row.input.artifact === "string" ? row.input.artifact : null;
  await db.prepare("INSERT OR REPLACE INTO runs (id, created_at, repo, status, artifact, result) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(row.id, new Date().toISOString(), row.input.repo, row.status, artifact, JSON.stringify(row.result).slice(0, 200_000))
    .run();
}

async function listRuns(db?: D1Database): Promise<Omit<RunRecord, "result">[]> {
  if (!db) return [];
  await ensureRunsTable(db);
  const result = await db.prepare("SELECT id, created_at as createdAt, repo, status, artifact FROM runs ORDER BY created_at DESC LIMIT 20").all<Omit<RunRecord, "result">>();
  return result.results ?? [];
}

async function getRun(db: D1Database | undefined, id: string): Promise<RunRecord | null> {
  if (!db) return null;
  await ensureRunsTable(db);
  const row = await db.prepare("SELECT id, created_at as createdAt, repo, status, artifact, result FROM runs WHERE id = ?").bind(id).first<any>();
  return row ? { ...row, result: JSON.parse(row.result) } : null;
}

function jsonError(c: any, status: number, code: string, detail: string): Response {
  return c.json({ error: code, detail }, status);
}

function jsonErrorResponse(status: number, code: string, detail: string): Response {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
