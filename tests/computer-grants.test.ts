import { describe, expect, it } from "vitest";
import { D1ComputerGrantStore, MemoryComputerGrantStore } from "../src/computer-grants.ts";
import { api } from "../src/http.ts";

const headers = { "content-type": "application/json", "x-cloudbox-internal-token": "i", "x-cloudbox-owner": "alice" };
const remote = "https://gitlab.cfdata.org/cloudflare/team/project.git";

class FakeD1GrantDb {
  rows: any[] = [];
  prepare(sql: string) {
    const self = this;
    let values: unknown[] = [];
    return {
      bind(...args: unknown[]) { values = args; return this; },
      async run() {
        if (sql.includes("INSERT INTO computer_repo_grants")) {
          const [ownerId, computerId, kind, repoKey, grantedAt, expiresAt] = values;
          self.rows = self.rows.filter((row) => !(row.ownerId === ownerId && row.computerId === computerId && row.kind === kind && row.repoKey === repoKey));
          self.rows.push({ ownerId, computerId, kind, repoKey, grantedAt, expiresAt });
        } else if (sql.startsWith("DELETE FROM computer_repo_grants")) {
          const [ownerId, computerId, repoKey] = values;
          self.rows = self.rows.filter((row) => !(row.ownerId === ownerId && row.computerId === computerId && row.repoKey === repoKey));
        }
        return { success: true };
      },
      async first() {
        const [ownerId, computerId, repoKey, kind1, kind2, now] = values;
        return self.rows.find((row) => row.ownerId === ownerId && row.computerId === computerId && row.repoKey === repoKey && [kind1, kind2].includes(row.kind) && row.expiresAt > Number(now)) ?? null;
      },
      async all() {
        const [ownerId, computerId, now] = values;
        return { results: self.rows.filter((row) => row.ownerId === ownerId && row.computerId === computerId && row.expiresAt > Number(now)) };
      },
    };
  }
}

describe("computer repository grants", () => {
  it("maintains split read/write semantics", async () => {
    const store = new MemoryComputerGrantStore();
    const key = "gitlab:gitlab.cfdata.org:cloudflare/team/project";
    await store.grant("alice", "personal:alice", "git_repo_read", key);
    expect(await store.has("alice", "personal:alice", "git_repo_read", key)).toBe(true);
    expect(await store.has("alice", "personal:alice", "git_repo_write", key)).toBe(false);
    await store.grant("alice", "personal:alice", "git_repo_write", key);
    expect(await store.has("alice", "personal:alice", "git_repo_read", key)).toBe(true);
    expect(await store.has("alice", "personal:alice", "git_repo_write", key)).toBe(true);
  });

  it("persists grants through the D1-backed store", async () => {
    const db = new FakeD1GrantDb() as any;
    const store = new D1ComputerGrantStore(db);
    const key = "gitlab:gitlab.cfdata.org:cloudflare/team/project";
    await store.grant("Alice", "PERSONAL:ALICE", "git_repo_write", key);
    expect(await store.has("alice", "personal:alice", "git_repo_read", key)).toBe(true);
    expect(await store.list("alice", "personal:alice")).toHaveLength(1);
    await store.revoke("alice", "personal:alice", key);
    expect(await store.has("alice", "personal:alice", "git_repo_read", key)).toBe(false);
  });

  it("uses D1 for internal grant CRUD when no injected proof store exists", async () => {
    const DB = new FakeD1GrantDb() as any;
    const env = { CLOUDBOX_INTERNAL_TOKEN: "i", DB };
    const created = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/repo-grants", {
      method: "POST", headers, body: JSON.stringify({ remote, kind: "git_repo_read" }),
    }), env);
    expect(created.status).toBe(200);
    expect((await (await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/repo-grants", { headers }), env)).json() as any).grants).toHaveLength(1);
  });

  it("exposes only internal bounded grant CRUD for exact GitLab repos", async () => {
    const computerGrants = new MemoryComputerGrantStore();
    const env = { CLOUDBOX_INTERNAL_TOKEN: "i", computerGrants };
    const created = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/repo-grants", {
      method: "POST", headers, body: JSON.stringify({ remote, kind: "git_repo_read" }),
    }), env);
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ grant: { repoKey: "gitlab:gitlab.cfdata.org:cloudflare/team/project", kind: "git_repo_read" } });
    const listed = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/repo-grants", { headers }), env);
    expect((await listed.json() as any).grants).toHaveLength(1);
    const removed = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/repo-grants", {
      method: "DELETE", headers, body: JSON.stringify({ remote }),
    }), env);
    expect(removed.status).toBe(200);
    expect((await (await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/repo-grants", { headers }), env)).json() as any).grants).toHaveLength(0);
  });

  it("rejects public callers and non-GitLab grant targets", async () => {
    const env = { CLOUDBOX_INTERNAL_TOKEN: "i", computerGrants: new MemoryComputerGrantStore() };
    const publicRequest = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/repo-grants", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ remote, kind: "git_repo_read" }),
    }), env);
    expect(publicRequest.status).toBe(403);
    const invalid = await api.fetch(new Request("https://cloudbox.test/api/personal-computers/alice/repo-grants", {
      method: "POST", headers, body: JSON.stringify({ remote: "https://github.com/acoyfellow/capa.git", kind: "git_repo_read" }),
    }), env);
    expect(invalid.status).toBe(400);
  });
});
