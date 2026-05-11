import { describe, expect, it } from "vitest";
import { createCloudbox } from "../src/client.ts";

describe("agent computer client", () => {
  it("boots a repo box, exposes tools, and submits an artifact", async () => {
    const calls: unknown[] = [];
    const cloudbox = createCloudbox({
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        calls.push(body);
        return new Response(JSON.stringify({ ok: true, receipts: [], artifact: { path: body.artifact ?? "HANDOFF.md", content: "ok" } }), {
          headers: { "content-type": "application/json" },
        });
      },
    });

    const box = await cloudbox.boot({ repo: "https://github.com/acoyfellow/cloudbox" });
    const tools = box.tools(["shell", "read", "write"]);
    await tools.shell.execute({ cmd: "grep -R demo web/src" });
    await tools.write.execute({ path: "HANDOFF.md", content: "changed demo copy" });
    const proof = await box.submit("HANDOFF.md");

    expect(Object.keys(tools)).toEqual(["shell", "read", "write"]);
    expect(proof.artifact?.path).toBe("HANDOFF.md");
    expect(calls).toEqual([
      expect.objectContaining({ repo: "https://github.com/acoyfellow/cloudbox", commands: ["grep -R demo web/src"] }),
      expect.objectContaining({ artifact: "HANDOFF.md" }),
      expect.objectContaining({ verify: ["test -f 'HANDOFF.md'"], artifact: "HANDOFF.md" }),
    ]);
  });
});
