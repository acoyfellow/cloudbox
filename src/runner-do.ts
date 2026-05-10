import { DurableObject } from "cloudflare:workers";
import type { ContainerRunResult } from "./container-runner.ts";

type ContainerState = DurableObjectState & {
  container?: {
    running: boolean;
    start(options?: { enableInternet: boolean; env?: Record<string, string>; hardTimeout?: number | bigint }): void;
    monitor(): Promise<void>;
    getTcpPort(port: number): { fetch: typeof fetch };
    setInactivityTimeout(durationMs: number | bigint): Promise<void>;
  };
};

const PORT = 8080;
const START_RETRY_DELAYS_MS = [100, 250, 500, 1_000, 2_000, 3_000, 5_000];

export class CloudboxRunner extends DurableObject {
  state: ContainerState;

  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    this.state = ctx as ContainerState;
  }

  async fetch(request: Request): Promise<Response> {
    const startedAt = Date.now();
    const diagnostics: Record<string, unknown> = {
      port: PORT,
      path: new URL(request.url).pathname,
      hasContainerApi: Boolean(this.state.container),
    };

    if (!this.state.container) return json({ ok: false, error: "container_api_missing", diagnostics }, 500);

    diagnostics.runningBeforeStart = this.state.container.running;
    if (!this.state.container.running) {
      this.state.container.start({ enableInternet: true, hardTimeout: 120_000 });
      diagnostics.startCalled = true;
      await this.state.container.setInactivityTimeout(60_000).catch((error) => {
        diagnostics.inactivityTimeoutError = String(error?.message ?? error);
      });
    } else {
      diagnostics.startCalled = false;
    }

    diagnostics.runningAfterStart = this.state.container.running;

    const portFetcher = this.state.container.getTcpPort(PORT);
    let lastError = "unknown";
    for (let attempt = 0; attempt <= START_RETRY_DELAYS_MS.length; attempt++) {
      diagnostics.attempt = attempt + 1;
      diagnostics.elapsedMs = Date.now() - startedAt;
      try {
        const response = await portFetcher.fetch(new Request("http://container/run", request));
        const body = (await response.json().catch(() => null)) as ContainerRunResult | null;
        diagnostics.finalStatus = response.status;
        diagnostics.totalElapsedMs = Date.now() - startedAt;
        if (!response.ok || !body) {
          return json({ ok: false, error: `container_http_${response.status}`, diagnostics }, response.status || 500);
        }
        return json(body, body.ok ? 200 : 422);
      } catch (error) {
        lastError = errorMessage(error);
        diagnostics.lastError = lastError;
        diagnostics.runningAfterError = this.state.container.running;
        const delay = START_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) break;
        await sleep(delay);
      }
    }

    diagnostics.totalElapsedMs = Date.now() - startedAt;

    const monitor = await Promise.race([
      this.state.container.monitor().then(
        () => ({ ok: true }),
        (error) => ({ ok: false, error: errorMessage(error) }),
      ),
      sleep(1_000).then(() => ({ ok: null, error: "monitor_timeout" })),
    ]);
    diagnostics.monitor = monitor;

    return json({ ok: false, error: "container_port_unavailable", detail: lastError, diagnostics }, 503);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
