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

api.post("/api/runs", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const input = await c.req.json().catch(() => null) as ContainerRunRequest | null;
  const validation = validateRun(input);
  if (validation) return validation;
  if (!c.env.CLOUDBOX_RUNNER) return jsonError(c, 503, "runner_unavailable", "Cloudflare Container runner is only available in the deployed Worker");
  try {
    const result = await runInContainer(c.env.CLOUDBOX_RUNNER, input as ContainerRunRequest);
    return c.json(result, result.ok ? 200 : 422);
  } catch (error) {
    return jsonError(c, 500, "runner_error", String(error instanceof Error ? error.message : error));
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
  if (request.headers.get("x-cloudbox-demo") === "1" && ["ask", "write", "submit"].includes(action)) return null;
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

function validateRun(input: ContainerRunRequest | null): Response | null {
  if (!input || typeof input !== "object") return jsonErrorResponse(400, "bad_run", "expected JSON body");
  if (!input.repo || typeof input.repo !== "string") return jsonErrorResponse(400, "bad_run", "repo is required");
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(input.repo)) return jsonErrorResponse(400, "bad_run", "repo must be a public GitHub HTTPS repo URL");
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

function jsonError(c: any, status: number, code: string, detail: string): Response {
  return c.json({ error: code, detail }, status);
}

function jsonErrorResponse(status: number, code: string, detail: string): Response {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
