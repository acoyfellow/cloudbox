// POST /brief — draft a spec from a one-line text.

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { fromBrief } from "../../../src/brief.ts";

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  if (!body.text) {
    return new Response(
      JSON.stringify({ error: "bad_request", detail: "missing text" }),
      { status: 400, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
  const draft = await fromBrief(body.text, env as { AI?: Ai });
  return new Response(JSON.stringify({ spec: draft }, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
