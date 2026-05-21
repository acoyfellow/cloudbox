import { describe, expect, it } from "vitest";
import { api } from "../src/http.ts";

class FakeStmt {
  constructor(private db: FakeD1, private sql: string) {}
  values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  async run() {
    if (this.sql.startsWith("INSERT") && this.sql.includes("INTO runs")) {
      const values = this.values as unknown[];
      // Order: id, computer_id, mode, created_at, updated_at, repo, status, artifact, result, input, is_public
      const id = String(values[0]);
      const createdAt = String(values[3]);
      const repo = String(values[5]);
      const status = String(values[6]);
      const artifact = (values[7] as string | null) ?? null;
      const result = String(values[8]);
      const input = (values[9] as string | undefined) ?? null;
      const isPublic = values[10] === 1 ? 1 : 0;
      this.db.rows.set(id, { id, createdAt, repo, status, artifact, result, input, isPublic });
    }
    return { success: true };
  }
  async all<T>() {
    return { results: [...this.db.rows.values()].map(({ result, input, isPublic, ...row }) => row).slice(0, 20) as T[] };
  }
  async first<T>() {
    const row = this.db.rows.get(String(this.values[0]));
    return (row ?? null) as T | null;
  }
}

class FakeD1 {
  rows = new Map<string, any>();
  prepare(sql: string) { return new FakeStmt(this, sql); }
}

const runner = {
  fetch: async () => new Response(JSON.stringify({
    ok: true,
    receipts: [{ type: "verify", cmd: "test -f HANDOFF.md", code: 0, signal: null, stdout: "", stderr: "", startedAt: "t0", finishedAt: "t1" }],
    artifact: { path: "HANDOFF.md", content: "ok\n" },
    diff: "",
    runnerReceipts: [{ type: "runner.container.ready", ts: "t0", attempt: 1, elapsedMs: 10 }],
  }), { headers: { "content-type": "application/json" } }),
};

describe("run history", () => {
  it("records and returns recent runs when D1 is bound", async () => {
    const DB = new FakeD1() as any;
    const env = { DB, CLOUDBOX_RUNNER: runner, CLOUDBOX_API_TOKEN: "t" };
    const create = await api.fetch(new Request("https://cloudbox.test/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ repo: "https://github.com/acoyfellow/cloudbox", verify: ["test -f HANDOFF.md"], artifact: "HANDOFF.md" }),
    }), env);
    const created = await create.json() as any;
    expect(create.status).toBe(200);
    expect(created.runId).toMatch(/^run_/);

    const recent = await api.fetch(new Request("https://cloudbox.test/api/runs/recent", { headers: { authorization: "Bearer t" } }), env);
    const recentBody = await recent.json() as any;
    expect(recentBody.runs).toHaveLength(1);
    expect(recentBody.runs[0].id).toBe(created.runId);

    const detail = await api.fetch(new Request(`https://cloudbox.test/api/runs/${created.runId}`, { headers: { authorization: "Bearer t" } }), env);
    const detailBody = await detail.json() as any;
    expect(detailBody.result.ok).toBe(true);
  });

  it("does NOT expose private runs at /api/runs/:id/public", async () => {
    const DB = new FakeD1() as any;
    const env = { DB, CLOUDBOX_RUNNER: runner, CLOUDBOX_API_TOKEN: "t" };
    const create = await api.fetch(new Request("https://cloudbox.test/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ repo: "https://github.com/acoyfellow/cloudbox", verify: ["test -f HANDOFF.md"], artifact: "HANDOFF.md" }),
    }), env);
    const { runId } = await create.json() as any;

    const pub = await api.fetch(new Request(`https://cloudbox.test/api/runs/${runId}/public`), env);
    expect(pub.status).toBe(404);
  });

  it("exposes opt-in public runs unauthenticated and includes the input recipe", async () => {
    const DB = new FakeD1() as any;
    const env = { DB, CLOUDBOX_RUNNER: runner, CLOUDBOX_API_TOKEN: "t" };
    const create = await api.fetch(new Request("https://cloudbox.test/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({
        repo: "https://github.com/acoyfellow/cloudbox",
        verify: ["test -f HANDOFF.md"],
        artifact: "HANDOFF.md",
        public: true,
      }),
    }), env);
    const { runId } = await create.json() as any;

    const pub = await api.fetch(new Request(`https://cloudbox.test/api/runs/${runId}/public`), env);
    expect(pub.status).toBe(200);
    const body = await pub.json() as any;
    expect(body.id).toBe(runId);
    expect(body.repo).toBe("https://github.com/acoyfellow/cloudbox");
    expect(body.input?.public).toBe(true);
    expect(body.input?.artifact).toBe("HANDOFF.md");
    expect(body.result.ok).toBe(true);
  });

  it("routes live follow-up exec/read/write calls only for live runs", async () => {
    const DB = new FakeD1() as any;
    const calls: string[] = [];
    const liveRunner = {
      fetch: async (url: string | Request) => {
        const href = typeof url === "string" ? url : url.url;
        calls.push(href);
        if (href.endsWith("/run")) return Response.json({ ok: true, receipts: [], diff: "", live: { runId: "ignored" } });
        if (href.endsWith("/exec")) return Response.json({ ok: true, receipt: { type: "command", cmd: "pwd", code: 0, signal: null, stdout: "", stderr: "", startedAt: "t0", finishedAt: "t1" } });
        if (href.includes("/read?")) return Response.json({ ok: true, path: "README.md", content: "hello" });
        if (href.endsWith("/dev")) return Response.json({ ok: true, runId: "run_live", command: "bun run dev", port: 5173, startedAt: "t0" });
        if (href.includes("/preview/")) return new Response("preview ok", { headers: { "content-type": "text/plain" } });
        return Response.json({ ok: true, path: "README.md", bytes: 5 });
      },
    };
    const env = { DB, CLOUDBOX_RUNNER: liveRunner, CLOUDBOX_API_TOKEN: "t" };
    const create = await api.fetch(new Request("https://cloudbox.test/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"], live: true }),
    }), env);
    const { runId } = await create.json() as any;

    const exec = await api.fetch(new Request(`https://cloudbox.test/api/runs/${runId}/exec`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ command: "pwd" }),
    }), env);
    expect(exec.status).toBe(200);

    const read = await api.fetch(new Request(`https://cloudbox.test/api/runs/${runId}/read?path=README.md`, { headers: { authorization: "Bearer t" } }), env);
    expect((await read.json() as any).content).toBe("hello");

    const write = await api.fetch(new Request(`https://cloudbox.test/api/runs/${runId}/write`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ path: "README.md", content: "hello" }),
    }), env);
    expect((await write.json() as any).bytes).toBe(5);

    const dev = await api.fetch(new Request(`https://cloudbox.test/api/runs/${runId}/dev`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ command: "bun run dev", port: 5173 }),
    }), env);
    expect((await dev.json() as any).port).toBe(5173);

    const preview = await api.fetch(new Request(`https://cloudbox.test/api/runs/${runId}/preview/index.html`, { headers: { authorization: "Bearer t" } }), env);
    expect(await preview.text()).toBe("preview ok");
    expect(calls.some((url) => url.includes(`/live/${runId}/exec`))).toBe(true);
  });

  it("rejects malformed dev launch requests", async () => {
    const DB = new FakeD1() as any;
    const env = { DB, CLOUDBOX_RUNNER: runner, CLOUDBOX_API_TOKEN: "t" };
    const create = await api.fetch(new Request("https://cloudbox.test/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"], live: true }),
    }), env);
    const { runId } = await create.json() as any;
    const dev = await api.fetch(new Request(`https://cloudbox.test/api/runs/${runId}/dev`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ command: "", port: 0 }),
    }), env);
    expect(dev.status).toBe(400);
  });

  it("rejects non-live runs at live follow-up endpoints", async () => {
    const DB = new FakeD1() as any;
    const env = { DB, CLOUDBOX_RUNNER: runner, CLOUDBOX_API_TOKEN: "t" };
    const create = await api.fetch(new Request("https://cloudbox.test/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"] }),
    }), env);
    const { runId } = await create.json() as any;
    const exec = await api.fetch(new Request(`https://cloudbox.test/api/runs/${runId}/exec`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ command: "pwd" }),
    }), env);
    expect(exec.status).toBe(409);
  });

  it("rejects non-boolean public or live flags with bad_run", async () => {
    const env = { CLOUDBOX_RUNNER: runner, CLOUDBOX_API_TOKEN: "t" };
    for (const body of [
      { repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"], public: "yes" },
      { repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"], live: "yes" },
    ]) {
      const response = await api.fetch(new Request("https://cloudbox.test/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer t" },
        body: JSON.stringify(body),
      }), env);
      expect(response.status).toBe(400);
      expect((await response.json() as any).error).toBe("bad_run");
    }
  });
});
