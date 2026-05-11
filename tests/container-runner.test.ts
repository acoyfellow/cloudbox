import { describe, expect, it } from "vitest";
import { runInContainer } from "../src/container-runner.ts";

describe("container runner client", () => {
  it("posts real repo run requests to the container binding", async () => {
    const calls: { url: string; body: any }[] = [];
    const runner = {
      async fetch(url: string, init: RequestInit) {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({
          ok: true,
          receipts: [{ type: "verify", cmd: "npm test", code: 0, signal: null, stdout: "pass", stderr: "", startedAt: "t0", finishedAt: "t1" }],
          artifact: { path: "HANDOFF.md", content: "done" },
          diff: "",
        }), { headers: { "content-type": "application/json" } });
      },
    };

    const result = await runInContainer(runner, {
      repo: "https://github.com/acoyfellow/cloudbox",
      verify: ["npm test"],
      artifact: "HANDOFF.md",
    });

    expect(calls[0].url).toBe("http://cloudbox-runner/run");
    expect(calls[0].body.repo).toBe("https://github.com/acoyfellow/cloudbox");
    expect(result.ok).toBe(true);
    expect(result.artifact?.path).toBe("HANDOFF.md");
  });

  it("surfaces non-JSON runner failures", async () => {
    const runner = { fetch: async () => new Response("nope", { status: 502 }) };
    await expect(runInContainer(runner, { repo: "https://github.com/acoyfellow/cloudbox", verify: ["npm test"] })).rejects.toThrow("container run failed: 502");
  });

  it("surfaces runner HTTP failures", async () => {
    const runner = { fetch: async () => new Response(JSON.stringify({ ok: false, receipts: [], error: "boom" }), { status: 500 }) };
    await expect(runInContainer(runner, { repo: "https://github.com/acoyfellow/cloudbox", verify: ["npm test"] })).rejects.toThrow("container run failed: 500");
  });

  it("fails loudly without the container binding", async () => {
    await expect(runInContainer(undefined, { repo: "https://github.com/acoyfellow/cloudbox", verify: ["npm test"] })).rejects.toThrow("container binding");
  });
});
