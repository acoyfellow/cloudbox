import { describe, expect, it } from "vitest";
import { generateProof } from "../src/generate-proof.ts";

const plan = {
  repo: "https://github.com/acoyfellow/cloudbox",
  commands: ["echo ok > HANDOFF.md"],
  verify: ["test -f HANDOFF.md"],
  artifact: "HANDOFF.md",
};

describe("generateProof", () => {
  it("turns an agent structured plan into a Cloudbox proof run", async () => {
    const calls: { url: string; body: unknown; auth?: string }[] = [];
    const proof = await generateProof({
      agent: { generateObject: async () => plan },
      schema: { name: "CloudboxRun" },
      prompt: "improve the demo empty state",
      cloudboxUrl: "https://cloudbox.test",
      token: "secret",
      fetcher: async (input, init) => {
        calls.push({
          url: String(input),
          body: JSON.parse(String(init?.body)),
          auth: new Headers(init?.headers).get("authorization") ?? undefined,
        });
        return new Response(JSON.stringify({
          runId: "run_123",
          ok: true,
          receipts: [],
          runnerReceipts: [{ type: "runner.container.ready", ts: "t", attempt: 1, elapsedMs: 10 }],
          artifact: { path: "HANDOFF.md", content: "ok\n" },
          diff: "",
        }), { headers: { "content-type": "application/json" } });
      },
    });

    expect(calls).toEqual([{ url: "https://cloudbox.test/api/runs", body: plan, auth: "Bearer secret" }]);
    expect(proof.ok).toBe(true);
    expect(proof.artifact?.content).toBe("ok\n");
  });

  it("throws with the Cloudbox failure detail", async () => {
    await expect(generateProof({
      agent: { generateObject: () => plan },
      schema: {},
      prompt: "fail",
      fetcher: async () => new Response(JSON.stringify({ error: "runner_error", detail: "container not ready" }), { status: 503 }),
    })).rejects.toThrow("container not ready");
  });
});
