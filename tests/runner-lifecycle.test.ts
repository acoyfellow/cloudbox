import { describe, expect, it } from "vitest";
import { fetchWithRunnerLifecycle, RunnerLifecycleError, type ContainerHandle } from "../src/runner-lifecycle.ts";

const request = () => new Request("http://runner/run", { method: "POST", body: "{}" });
const isoNow = () => "2026-01-01T00:00:00.000Z";

function container(fetches: Array<() => Response | Promise<Response>>, running = false): ContainerHandle & { starts: number } {
  return {
    running,
    starts: 0,
    start() {
      this.starts++;
      this.running = true;
    },
    getTcpPort() {
      return {
        fetch: async () => {
          const next = fetches.shift();
          if (!next) throw new Error("not listening");
          return next();
        },
      };
    },
  };
}

describe("fetchWithRunnerLifecycle", () => {
  it("fails clearly when the container API is missing", async () => {
    await expect(fetchWithRunnerLifecycle({ request: request(), isoNow })).rejects.toMatchObject({
      code: "container_api_missing",
      status: 500,
    });
  });

  it("starts a stopped container and records readiness", async () => {
    const c = container([() => new Response(JSON.stringify({ ok: true }), { status: 200 })]);
    const result = await fetchWithRunnerLifecycle({ container: c, request: request(), delaysMs: [], now: () => 0, isoNow });

    expect(c.starts).toBe(1);
    expect(result.response.status).toBe(200);
    expect(result.events.map((event) => event.type)).toEqual([
      "runner.container.start",
      "runner.container.ready_attempt",
      "runner.container.ready",
      "runner.response",
    ]);
  });

  it("does not restart an already-running container", async () => {
    const c = container([() => new Response("{}")], true);
    await fetchWithRunnerLifecycle({ container: c, request: request(), delaysMs: [], isoNow });
    expect(c.starts).toBe(0);
  });

  it("retries until the port is ready", async () => {
    let calls = 0;
    const c = container([
      () => {
        calls++;
        throw new Error("not listening");
      },
      () => {
        calls++;
        return new Response("{}", { status: 200 });
      },
    ]);

    const result = await fetchWithRunnerLifecycle({ container: c, request: request(), delaysMs: [0], isoNow });
    expect(calls).toBe(2);
    expect(result.events.filter((event) => event.type === "runner.container.ready_attempt")).toHaveLength(2);
    expect(result.events.some((event) => event.type === "runner.container.ready")).toBe(true);
  });

  it("returns typed lifecycle failure after bounded retries", async () => {
    const c = container([]);
    let error: RunnerLifecycleError | undefined;
    try {
      await fetchWithRunnerLifecycle({ container: c, request: request(), delaysMs: [0, 0], isoNow });
    } catch (caught) {
      error = caught as RunnerLifecycleError;
    }

    expect(error).toBeInstanceOf(RunnerLifecycleError);
    expect(error?.code).toBe("container_not_ready");
    expect(error?.events.filter((event) => event.type === "runner.container.ready_attempt")).toHaveLength(3);
    expect(error?.events.at(-1)).toMatchObject({ type: "runner.container.not_ready", attempts: 3 });
  });
});
