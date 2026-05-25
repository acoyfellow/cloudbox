import { describe, expect, it } from "vitest";
import { api } from "../src/http.ts";

class FakeStmt {
  constructor(private db: FakeD1, private sql: string) {}
  values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  async run() {
    if (this.sql.startsWith("INSERT") && this.sql.includes("INTO runs")) {
      const values = this.values as unknown[];
      // Order: id, computer_id, mode, created_at, updated_at, repo, status, artifact, result, input, is_public, snapshot_key, forked_from, expires_at
      const id = String(values[0]);
      const createdAt = String(values[3]);
      const repo = String(values[5]);
      const status = String(values[6]);
      const artifact = (values[7] as string | null) ?? null;
      const result = String(values[8]);
      const input = (values[9] as string | undefined) ?? null;
      const isPublic = values[10] === 1 ? 1 : 0;
      const snapshotKey = (values[11] as string | null) ?? null;
      const forkedFrom = (values[12] as string | null) ?? null;
      const expiresAt = (values[13] as string | null) ?? null;
      this.db.rows.set(id, { id, createdAt, repo, status, artifact, result, input, isPublic, snapshotKey, forkedFrom, expiresAt });
    }
    if (this.sql.startsWith("UPDATE runs SET status")) {
      const [status, , result, snapshotKey, forkedFrom, id] = this.values as [string, string, string, string | null, string | null, string];
      const row = this.db.rows.get(id);
      if (row) this.db.rows.set(id, { ...row, status, result, snapshotKey: snapshotKey ?? row.snapshotKey, forkedFrom: forkedFrom ?? row.forkedFrom });
    }
    return { success: true };
  }
  async all<T>() {
    return { results: [...this.db.rows.values()].map(({ result, input, isPublic, snapshotKey, forkedFrom, expiresAt, ...row }) => row).slice(0, 20) as T[] };
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

class FakeR2 {
  objects = new Map<string, Uint8Array>();
  async put(key: string, value: Uint8Array) { this.objects.set(key, value); }
  async get(key: string) {
    const value = this.objects.get(key);
    return value ? { arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) } : null;
  }
  async delete(key: string) { this.objects.delete(key); }
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

  it("stops and resumes a live run through an R2-backed snapshot", async () => {
    const DB = new FakeD1() as any;
    const ARTIFACTS = new FakeR2() as any;
    const calls: string[] = [];
    const lifecycleRunner = {
      fetch: async (url: string | Request) => {
        const href = typeof url === "string" ? url : url.url;
        calls.push(href);
        if (href.endsWith("/run")) return Response.json({ ok: true, receipts: [], diff: "", live: { runId: "ignored" } });
        if (href.endsWith("/snapshot")) return Response.json({ ok: true, runId: "ignored", snapshot: { bytes: btoa("workspace"), size: 9 } });
        if (href.endsWith("/restore")) return Response.json({ ok: true, runId: "ignored" });
        return Response.json({ ok: true });
      },
    };
    const env = { DB, ARTIFACTS, CLOUDBOX_RUNNER: lifecycleRunner, CLOUDBOX_API_TOKEN: "t" };
    const create = await api.fetch(new Request("https://cloudbox.test/api/runs", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"], live: true, ttlSeconds: 3600 }),
    }), env);
    const { runId } = await create.json() as any;

    const stop = await api.fetch(new Request(`https://cloudbox.test/api/runs/${runId}/stop`, { method: "POST", headers: { authorization: "Bearer t" } }), env);
    const stopped = await stop.json() as any;
    expect(stopped.status).toBe("stopped");
    expect(stopped.snapshot.key).toMatch(new RegExp(`^snapshots/${runId}/`));
    expect(ARTIFACTS.objects.size).toBe(1);

    const blocked = await api.fetch(new Request(`https://cloudbox.test/api/runs/${runId}/exec`, {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer t" }, body: JSON.stringify({ command: "pwd" }),
    }), env);
    expect(blocked.status).toBe(409);

    const resume = await api.fetch(new Request(`https://cloudbox.test/api/runs/${runId}/resume`, { method: "POST", headers: { authorization: "Bearer t" } }), env);
    expect((await resume.json() as any).status).toBe("ready");
    expect(calls.some((url) => url.endsWith("/snapshot"))).toBe(true);
    expect(calls.some((url) => url.endsWith("/restore"))).toBe(true);
  });

  it("forks a live run from a snapshot and preserves source provenance", async () => {
    const DB = new FakeD1() as any;
    const ARTIFACTS = new FakeR2() as any;
    const lifecycleRunner = {
      fetch: async (url: string | Request) => {
        const href = typeof url === "string" ? url : url.url;
        if (href.endsWith("/run")) return Response.json({ ok: true, receipts: [], diff: "", live: { runId: "ignored" } });
        if (href.endsWith("/snapshot")) return Response.json({ ok: true, snapshot: { bytes: btoa("workspace"), size: 9 } });
        if (href.endsWith("/restore")) return Response.json({ ok: true });
        return Response.json({ ok: true });
      },
    };
    const env = { DB, ARTIFACTS, CLOUDBOX_RUNNER: lifecycleRunner, CLOUDBOX_API_TOKEN: "t" };
    const create = await api.fetch(new Request("https://cloudbox.test/api/runs", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"], live: true }),
    }), env);
    const { runId: sourceId } = await create.json() as any;
    const fork = await api.fetch(new Request(`https://cloudbox.test/api/runs/${sourceId}/fork`, { method: "POST", headers: { authorization: "Bearer t" } }), env);
    const forked = await fork.json() as any;
    expect(fork.status).toBe(201);
    expect(forked.forkedFrom).toBe(sourceId);
    expect(forked.runId).not.toBe(sourceId);
    const child = await api.fetch(new Request(`https://cloudbox.test/api/runs/${forked.runId}`, { headers: { authorization: "Bearer t" } }), env);
    expect((await child.json() as any).forkedFrom).toBe(sourceId);
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

  it("routes desktop live runs to the desktop container binding", async () => {
    const DB = new FakeD1() as any;
    let normalCalls = 0;
    let desktopCalls = 0;
    const normalRunner = { fetch: async () => { normalCalls++; return Response.json({ ok: true, receipts: [], diff: "" }); } };
    const desktopRunner = { fetch: async () => { desktopCalls++; return Response.json({ ok: true, receipts: [], diff: "", live: { runId: "desktop" } }); } };
    const env = { DB, CLOUDBOX_RUNNER: normalRunner, CLOUDBOX_DESKTOP_RUNNER: desktopRunner, CLOUDBOX_API_TOKEN: "t" };
    const create = await api.fetch(new Request("https://cloudbox.test/api/runs", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"], live: true, desktop: true }),
    }), env);
    expect(create.status).toBe(200);
    expect(desktopCalls).toBe(1);
    expect(normalCalls).toBe(0);
  });

  it("rejects desktop sessions unless explicitly live", async () => {
    const env = { CLOUDBOX_RUNNER: runner, CLOUDBOX_API_TOKEN: "t" };
    for (const body of [
      { repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"], desktop: true },
      { repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"], live: true, desktop: "yes" },
    ]) {
      const response = await api.fetch(new Request("https://cloudbox.test/api/runs", {
        method: "POST", headers: { "content-type": "application/json", authorization: "Bearer t" }, body: JSON.stringify(body),
      }), env);
      expect(response.status).toBe(400);
    }
  });

  it("rejects TTL without a live run or outside supported bounds", async () => {
    const env = { CLOUDBOX_RUNNER: runner, CLOUDBOX_API_TOKEN: "t" };
    for (const body of [
      { repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"], ttlSeconds: 3600 },
      { repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"], live: true, ttlSeconds: 59 },
      { repo: "https://github.com/acoyfellow/cloudbox", verify: ["echo ok"], live: true, ttlSeconds: 2_592_001 },
    ]) {
      const response = await api.fetch(new Request("https://cloudbox.test/api/runs", {
        method: "POST", headers: { "content-type": "application/json", authorization: "Bearer t" }, body: JSON.stringify(body),
      }), env);
      expect(response.status).toBe(400);
    }
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
