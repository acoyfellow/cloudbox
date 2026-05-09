// /c/:id/:action — proxy every protocol call to the ComputerDO instance.

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

const handler: APIRoute = async ({ request, params, url }) => {
  const auth = authorize(request, params.action as string);
  if (auth) return auth;
  const e = env as { CLOUDBOX_COMPUTER?: DurableObjectNamespace };
  if (!e.CLOUDBOX_COMPUTER) {
    return jsonError(500, "binding_missing", "CLOUDBOX_COMPUTER not bound");
  }
  const id = params.id as string;
  const action = params.action as string;
  const stub = e.CLOUDBOX_COMPUTER.get(e.CLOUDBOX_COMPUTER.idFromName(id));
  const proxied = new Request(`https://do/${action}${url.search}`, request);
  return stub.fetch(proxied);
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;

function authorize(request: Request, action: string): Response | null {
  if (request.method === "GET" && ["list", "read", "grade", "receipts", "spec"].includes(action)) return null;
  if (request.headers.get("x-cloudbox-demo") === "1" && ["ask", "write", "submit"].includes(action)) return null;
  const token = (env as { CLOUDBOX_API_TOKEN?: string }).CLOUDBOX_API_TOKEN;
  if (!token) return null;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cloudbox-token");
  return got === token ? null : jsonError(401, "unauthorized", "valid Cloudbox token required");
}

function jsonError(status: number, code: string, detail: string): Response {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
