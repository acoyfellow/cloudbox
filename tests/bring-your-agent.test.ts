import { describe, expect, it } from "vitest";
import { api } from "../src/http.ts";
import { agentLaunchSpec } from "../seed/agent-launch.ts";
import { runBringYourAgent } from "../examples/bring-your-agent.ts";

// Drive runBringYourAgent against the in-memory Hono `api`. No DOs, no
// runner — just the local-demo path. This is the same surface an external
// agent talks to over HTTPS, so passing here means the example contract
// matches what we ship.
function fetcherFor(env: Record<string, unknown> = {}) {
  return async (input: string, init?: RequestInit) => {
    const req = new Request(input, init);
    return api.fetch(req, env as any);
  };
}

describe("examples/bring-your-agent", () => {
  it("walks the agent-launch spec end-to-end against the local-demo API", async () => {
    const result = await runBringYourAgent(
      { ...agentLaunchSpec, runId: `test-${Date.now().toString(36)}` },
      {
        base: "https://cloudbox.test",
        fetcher: fetcherFor(),
      },
    );

    expect(result.computerId).toMatch(/^local-/);
    expect(result.steps.length).toBeGreaterThan(2);

    const kinds = result.steps.map((s) => s.decision.type);
    expect(kinds).toContain("read");
    expect(kinds).toContain("ask");
    expect(kinds).toContain("write");
    expect(kinds[kinds.length - 1]).toBe("submit");

    const receipts = (result.receipts as { receipts: Array<{ kind: string }> }).receipts;
    const receiptKinds = receipts.map((r) => r.kind);
    expect(receiptKinds).toContain("read");
    expect(receiptKinds).toContain("ask");
    expect(receiptKinds).toContain("write");
    expect(receiptKinds).toContain("submit");

    const grade = result.grade as { score: number; max: number };
    expect(typeof grade.score).toBe("number");
    expect(grade.max).toBeGreaterThan(0);
  });
});
