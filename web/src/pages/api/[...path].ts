import type { APIRoute } from "astro";
import { api } from "../../../../src/http.ts";

export const prerender = false;

export const ALL: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as unknown as { runtime?: { env?: unknown; ctx?: ExecutionContext } }).runtime;
  return api.fetch(request, runtime?.env as any, runtime?.ctx as any);
};
