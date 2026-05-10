// Custom Worker entrypoint.
//
// Pattern matches Astro's default `@astrojs/cloudflare/entrypoints/server.js`:
// we export `createExports(manifest)` which Astro's build pipeline calls
// with the generated manifest. The generated `_worker.js/index.js` then
// reads named exports off the result (`_exports['ComputerDO']`), so the
// DO class must be returned from `createExports`, not just re-exported
// at module level.

import { App } from "astro/app";
import { handle } from "@astrojs/cloudflare/handler";
import { ComputerDO } from "../../src/computer-do.ts";

export class CloudboxRunner extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    return fetch(request);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ ok: true, name: "cloudbox" }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    if (url.pathname === "/computers") {
      return new Response(JSON.stringify({ error: "bad_spec", detail: "expected a ComputerSpec body" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    if (url.pathname === "/brief") {
      return new Response(JSON.stringify({ error: "bad_request", detail: "brief required" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    return new Response("not found", { status: 404 });
  },
};

export function createExports(manifest: ConstructorParameters<typeof App>[0]) {
  const app = new App(manifest);
  return {
    default: {
      async fetch(request: Request, env: unknown, ctx: ExecutionContext) {
        return handle(manifest as any, app, request as any, env as any, ctx);
      },
    },
    ComputerDO,
    CloudboxRunner,
  };
}
