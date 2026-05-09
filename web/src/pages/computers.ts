// POST /computers — materialize a posted spec.

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { materialize } from "../../../src/materialize.ts";
import type { ComputerSpec } from "../../../src/spec.ts";

export const POST: APIRoute = async ({ request }) => {
  const spec = (await request.json().catch(() => null)) as ComputerSpec | null;
  const auth = authorize(request, spec);
  if (auth) return auth;
  const validation = validateSpec(spec);
  if (validation) return validation;
  const e = env as { CLOUDBOX_COMPUTER?: DurableObjectNamespace; ARTIFACTS?: R2Bucket };
  if (!e.CLOUDBOX_COMPUTER) {
    return jsonError(500, "binding_missing", "CLOUDBOX_COMPUTER not bound");
  }
  const result = await materialize(spec as ComputerSpec, e as any);
  return new Response(JSON.stringify(result, null, 2), {
    status: 201,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

function authorize(request: Request, spec: ComputerSpec | null): Response | null {
  if (isPublicDemoSpec(spec)) return null;
  const token = (env as { CLOUDBOX_API_TOKEN?: string }).CLOUDBOX_API_TOKEN;
  if (!token) return null;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cloudbox-token");
  return got === token ? null : jsonError(401, "unauthorized", "valid Cloudbox token required");
}

function isPublicDemoSpec(spec: ComputerSpec | null): boolean {
  return !!spec?.name && spec.name === "agent-launch-readiness" && typeof spec.runId === "string" && spec.runId.startsWith("browser-");
}

function jsonError(status: number, code: string, detail: string): Response {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}


function validateSpec(spec: ComputerSpec | null): Response | null {
  if (!spec || typeof spec !== "object") return jsonError(400, "bad_spec", "expected a ComputerSpec body");
  if (!spec.profile || typeof spec.profile.role !== "string") return jsonError(400, "bad_spec", "profile.role required");
  if (!Array.isArray(spec.filesystem)) return jsonError(400, "bad_spec", "filesystem array required");
  if (!Array.isArray(spec.collaborators)) return jsonError(400, "bad_spec", "collaborators array required");
  if (!Array.isArray(spec.objectives)) return jsonError(400, "bad_spec", "objectives array required");
  if (!Array.isArray(spec.rubric)) return jsonError(400, "bad_spec", "rubric array required");
  return null;
}
