// POST /runs — run a real repository in the Cloudflare Container runner.

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { runInContainer, type ContainerRunRequest } from "../../../src/container-runner.ts";

const MAX_COMMANDS = 12;
const MAX_COMMAND_LENGTH = 1_000;

export const POST: APIRoute = async ({ request }) => {
  const auth = authorize(request);
  if (auth) return auth;
  const input = (await request.json().catch(() => null)) as ContainerRunRequest | null;
  const validation = validateRun(input);
  if (validation) return validation;
  try {
    const result = await runInContainer((env as { CLOUDBOX_RUNNER?: unknown }).CLOUDBOX_RUNNER, input as ContainerRunRequest);
    return new Response(JSON.stringify(result, null, 2), {
      status: result.ok ? 200 : 422,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    return jsonError(500, "runner_error", String(error instanceof Error ? error.message : error));
  }
};

function authorize(request: Request): Response | null {
  const token = (env as { CLOUDBOX_API_TOKEN?: string }).CLOUDBOX_API_TOKEN;
  if (!token) return null;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cloudbox-token");
  return got === token ? null : jsonError(401, "unauthorized", "valid Cloudbox token required");
}

function validateRun(input: ContainerRunRequest | null): Response | null {
  if (!input || typeof input !== "object") return jsonError(400, "bad_run", "expected JSON body");
  if (!input.repo || typeof input.repo !== "string") return jsonError(400, "bad_run", "repo is required");
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(input.repo)) {
    return jsonError(400, "bad_run", "repo must be a public GitHub HTTPS repo URL");
  }
  for (const key of ["commands", "verify"] as const) {
    const list = input[key];
    if (list !== undefined && !Array.isArray(list)) return jsonError(400, "bad_run", `${key} must be an array`);
    if (list && list.length > MAX_COMMANDS) return jsonError(400, "bad_run", `${key} has too many commands`);
    if (list?.some((cmd) => typeof cmd !== "string" || cmd.length > MAX_COMMAND_LENGTH)) {
      return jsonError(400, "bad_run", `${key} contains an invalid command`);
    }
  }
  if (!input.commands?.length && !input.verify?.length) return jsonError(400, "bad_run", "at least one command or verify command is required");
  if (input.artifact !== undefined && (typeof input.artifact !== "string" || input.artifact.length > 240)) {
    return jsonError(400, "bad_run", "artifact must be a short relative path");
  }
  return null;
}

function jsonError(status: number, code: string, detail: string): Response {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
