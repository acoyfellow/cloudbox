import { describe, expect, it } from "vitest";
import { createCloudbox } from "../src/client.ts";

const input = {
  repo: "https://github.com/acoyfellow/cloudbox",
  verify: ["test -f HANDOFF.md"],
  artifact: "HANDOFF.md",
};

describe("createCloudbox", () => {
  it("runs a CloudboxRun through /api/runs", async () => {
    const calls: { url: string; body: unknown; auth?: string }[] = [];
    const cloudbox = createCloudbox({
      baseUrl: "https://cloudbox.test",
      token: "secret",
      fetcher: async (url, init) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
          auth: new Headers(init?.headers).get("authorization") ?? undefined,
        });
        return new Response(JSON.stringify({ ok: true, receipts: [], artifact: { path: "HANDOFF.md", content: "ok" } }), {
          headers: { "content-type": "application/json" },
        });
      },
    });

    const proof = await cloudbox.run(input);
    expect(calls).toEqual([{ url: "https://cloudbox.test/api/runs", body: input, auth: "Bearer secret" }]);
    expect(proof.artifact?.content).toBe("ok");
  });

  it("throws useful Cloudbox errors", async () => {
    const cloudbox = createCloudbox({
      fetcher: async () => new Response(JSON.stringify({ error: "runner_error", detail: "not ready" }), { status: 503 }),
    });
    await expect(cloudbox.run(input)).rejects.toThrow("not ready");
  });
});
