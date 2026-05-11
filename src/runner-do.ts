import { DurableObject } from "cloudflare:workers";
import type { ContainerRunResult } from "./container-runner.ts";
import { fetchWithRunnerLifecycle, RunnerLifecycleError, type ContainerHandle } from "./runner-lifecycle.ts";

type ContainerState = DurableObjectState & { container?: ContainerHandle };

export class CloudboxRunner extends DurableObject {
  state: ContainerState;

  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    this.state = ctx as ContainerState;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const { response, events } = await fetchWithRunnerLifecycle({ container: this.state.container, request });
      const body = (await response.json().catch(() => null)) as ContainerRunResult | null;
      if (!response.ok || !body) {
        return json({ ok: false, error: `container_http_${response.status}`, runnerReceipts: events }, response.status || 500);
      }
      return json({ ...body, runnerReceipts: events }, body.ok ? 200 : 422);
    } catch (error) {
      if (error instanceof RunnerLifecycleError) {
        return json({ ok: false, error: error.code, detail: error.message, runnerReceipts: error.events }, error.status);
      }
      return json({ ok: false, error: "runner_lifecycle_error", detail: errorMessage(error) }, 500);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
