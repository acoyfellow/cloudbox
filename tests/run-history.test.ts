import { describe, expect, it } from "vitest";
import { api } from "../src/http.ts";

class FakeStmt {
  constructor(private db: FakeD1, private sql: string) {}
  values: unknown[] = [];
  bind(...values: unknown[]) { this.values = values; return this; }
  async run() {
    if (this.sql.startsWith("INSERT") && this.sql.includes("INTO runs")) {
      const values = this.values as string[];
      const [id] = values;
      const createdAt = values[3] ?? values[1];
      const repo = values[5] ?? values[2];
      const status = values[6] ?? values[3];
      const artifact = values[7] ?? values[4];
      const result = values[8] ?? values[5];
      this.db.rows.set(id, { id, createdAt, repo, status, artifact, result });
    }
    return { success: true };
  }
  async all<T>() {
    return { results: [...this.db.rows.values()].map(({ result, ...row }) => row).slice(0, 20) as T[] };
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
});
