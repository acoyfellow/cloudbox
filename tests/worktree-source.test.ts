import { describe, expect, it } from "vitest";
import { api } from "../src/http.ts";

const validRun = {
  repo: "https://github.com/acoyfellow/cloudbox",
  commands: ["echo ok"],
  verify: ["test -f package.json"],
  artifact: "HANDOFF.md",
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://cloudbox.test/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const bodyOf = (r: Response) => r.json() as Promise<any>;

const smallPatch = [
  "diff --git a/src/add.js b/src/add.js",
  "index 0000001..0000002 100644",
  "--- a/src/add.js",
  "+++ b/src/add.js",
  "@@ -1 +1 @@",
  "-export function add(a, b) { return a - b; }",
  "+export function add(a, b) { return a + b; }",
  "",
].join("\n");

function patchSource(over: Record<string, unknown> = {}) {
  const bytes = Buffer.byteLength(smallPatch, "utf8");
  return { kind: "patch", patch: smallPatch, base: "abcdef1", includeUntracked: false, includeIgnored: false, files: 1, bytes, sha256: "0".repeat(64), ...over };
}

describe("worktreeSource contract validation", () => {
  it("accepts a valid patch payload (passes validation, reaches runner stage)", async () => {
    const res = await api.fetch(request({ ...validRun, worktreeSource: patchSource() }), {});
    const body = await bodyOf(res);
    expect(res.status).toBe(503);
    expect(body.error).toBe("runner_unavailable");
  });

  it("rejects an unknown kind (contract-first guard)", async () => {
    const res = await api.fetch(request({ ...validRun, worktreeSource: { kind: "wormhole" } }), {});
    const body = await bodyOf(res);
    expect(res.status).toBe(400);
    expect(body.error).toBe("bad_worktree");
  });

  it("rejects kind archive with a clear not-yet-supported error", async () => {
    const res = await api.fetch(request({ ...validRun, worktreeSource: { kind: "archive", objectId: "x" } }), {});
    const body = await bodyOf(res);
    expect(res.status).toBe(501);
    expect(body.error).toBe("worktree_archive_unsupported");
  });

  it("rejects an oversize patch", async () => {
    const big = "x".repeat(6 * 1024 * 1024);
    const res = await api.fetch(request({ ...validRun, worktreeSource: patchSource({ patch: big, bytes: Buffer.byteLength(big) }) }), {});
    const body = await bodyOf(res);
    expect(res.status).toBe(413);
    expect(body.error).toBe("worktree_too_large");
  });

  it("rejects a patch touching too many files", async () => {
    const res = await api.fetch(request({ ...validRun, worktreeSource: patchSource({ files: 999 }) }), {});
    const body = await bodyOf(res);
    expect(res.status).toBe(413);
    expect(body.error).toBe("worktree_too_many_files");
  });

  it("rejects a binary patch", async () => {
    const bin = smallPatch + "\nGIT binary patch\n";
    const res = await api.fetch(request({ ...validRun, worktreeSource: patchSource({ patch: bin, bytes: Buffer.byteLength(bin) }) }), {});
    const body = await bodyOf(res);
    expect(res.status).toBe(415);
    expect(body.error).toBe("worktree_binary_unsupported");
  });

  it("rejects a bad base sha", async () => {
    const res = await api.fetch(request({ ...validRun, worktreeSource: patchSource({ base: "not-a-sha!" }) }), {});
    const body = await bodyOf(res);
    expect(res.status).toBe(400);
    expect(body.error).toBe("bad_worktree");
  });
});
