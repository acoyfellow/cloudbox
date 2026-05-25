import { describe, expect, it } from "vitest";
import { deleteLiveInContainer, devInContainer, execInContainer, previewInContainer, readInContainer, restoreInContainer, runInContainer, snapshotInContainer, writeInContainer } from "../src/container-runner.ts";

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

  it("routes live exec, read, and write requests to the retained run", async () => {
    const calls: string[] = [];
    const runner = {
      async fetch(url: string | Request) {
        const href = typeof url === "string" ? url : url.url;
        calls.push(href);
        if (href.endsWith("/exec")) return Response.json({ ok: true, receipt: { type: "command", cmd: "pwd", code: 0, signal: null, stdout: "", stderr: "", startedAt: "t0", finishedAt: "t1" } });
        if (href.includes("/read?")) return Response.json({ ok: true, path: "README.md", content: "hi" });
        if (href.endsWith("/snapshot")) return Response.json({ ok: true, snapshot: { bytes: "abc", size: 3 } });
        if (href.endsWith("/restore")) return Response.json({ ok: true, runId: "run_abc" });
        if (href.endsWith("/delete")) return Response.json({ ok: true, deleted: true });
        return Response.json({ ok: true, path: "README.md", bytes: 2 });
      },
    };

    await expect(execInContainer(runner, "run_abc", { command: "pwd" })).resolves.toMatchObject({ ok: true });
    await expect(readInContainer(runner, "run_abc", "README.md")).resolves.toMatchObject({ content: "hi" });
    await expect(writeInContainer(runner, "run_abc", { path: "README.md", content: "hi" })).resolves.toMatchObject({ bytes: 2 });
    await expect(devInContainer(runner, "run_abc", { command: "bun run dev", port: 5173 })).resolves.toMatchObject({ ok: true });
    await expect(snapshotInContainer(runner, "run_abc")).resolves.toMatchObject({ ok: true, snapshot: { size: 3 } });
    await expect(restoreInContainer(runner, "run_abc", { snapshot: { bytes: "abc" } })).resolves.toMatchObject({ ok: true });
    await expect(deleteLiveInContainer(runner, "run_abc")).resolves.toMatchObject({ deleted: true });
    await previewInContainer(runner, "run_abc", new Request("https://cloudbox.test/api/runs/run_abc/preview/index.html?x=1"), "index.html");
    await previewInContainer(runner, "run_abc", new Request("https://cloudbox.test/api/runs/run_abc/preview/desktop/vnc.html"), "desktop/vnc.html");
    expect(calls).toEqual([
      "http://cloudbox-runner/live/run_abc/exec",
      "http://cloudbox-runner/live/run_abc/read?path=README.md",
      "http://cloudbox-runner/live/run_abc/write",
      "http://cloudbox-runner/live/run_abc/dev",
      "http://cloudbox-runner/live/run_abc/snapshot",
      "http://cloudbox-runner/live/run_abc/restore",
      "http://cloudbox-runner/live/run_abc/delete",
      "http://cloudbox-runner/live/run_abc/preview/index.html?x=1",
      "http://cloudbox-runner/live/run_abc/preview/desktop/vnc.html",
    ]);
  });

  it("surfaces non-JSON runner failures", async () => {
    const runner = { fetch: async () => new Response("nope", { status: 502 }) };
    await expect(runInContainer(runner, { repo: "https://github.com/acoyfellow/cloudbox", verify: ["npm test"] })).rejects.toThrow("container request failed: 502");
  });

  it("surfaces runner HTTP failures", async () => {
    const runner = { fetch: async () => new Response(JSON.stringify({ ok: false, receipts: [], error: "boom" }), { status: 500 }) };
    await expect(runInContainer(runner, { repo: "https://github.com/acoyfellow/cloudbox", verify: ["npm test"] })).rejects.toThrow("container request failed: 500");
  });

  it("fails loudly without the container binding", async () => {
    await expect(runInContainer(undefined, { repo: "https://github.com/acoyfellow/cloudbox", verify: ["npm test"] })).rejects.toThrow("container binding");
  });
});
