import { DurableObject } from "cloudflare:workers";
import type { ContainerRunRequest, ContainerRunResult } from "./container-runner.ts";

type ContainerState = DurableObjectState & {
  container?: {
    running: boolean;
    start(options?: { enableInternet: boolean; env?: Record<string, string>; hardTimeout?: number | bigint }): void;
    getTcpPort(port: number): { fetch: typeof fetch };
  };
};

export class CloudboxRunner extends DurableObject {
  state: ContainerState;

  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    this.state = ctx as ContainerState;
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.state.container) return json({ ok: false, error: "container_api_missing" }, 500);
    if (!this.state.container.running) this.state.container.start({ enableInternet: true, hardTimeout: 120_000 });
    const response = await this.state.container.getTcpPort(8080).fetch(new Request("http://container/run", request));
    const body = await response.json().catch(() => null) as ContainerRunResult | null;
    if (!response.ok || !body) return json({ ok: false, error: `container_http_${response.status}` }, response.status || 500);
    return json(body, body.ok ? 200 : 422);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
