import { describe, expect, it } from "vitest";
import { buildCloneCommand, normalizeCloneOptions } from "../runner/server.mjs";

describe("runner clone strategy", () => {
  it("defaults to blobless shallow clone without fetching full history", () => {
    const opts = normalizeCloneOptions({ repo: "https://github.com/acoyfellow/cloudbox" });
    const cmd = buildCloneCommand({ repo: "https://github.com/acoyfellow/cloudbox", auth: "none" }, opts);
    expect(cmd).toContain("git clone");
    expect(cmd).toContain("--depth=1");
    expect(cmd).toContain("--filter=blob:none");
  });

  it("supports sparse checkout without immediate full-tree checkout", () => {
    const opts = normalizeCloneOptions({
      repo: "https://github.com/acoyfellow/cloudbox",
      sparse: ["src", "package.json"],
    });
    const cmd = buildCloneCommand({ repo: "https://github.com/acoyfellow/cloudbox", auth: "none" }, opts);
    expect(cmd).toContain("--no-checkout");
    expect(cmd).toContain("--sparse");
    expect(opts.sparse).toEqual(["src", "package.json"]);
  });

  it("rejects unsafe sparse paths", () => {
    expect(() => normalizeCloneOptions({ repo: "https://github.com/acoyfellow/cloudbox", sparse: ["../secrets"] })).toThrow(/invalid sparse path/);
    expect(() => normalizeCloneOptions({ repo: "https://github.com/acoyfellow/cloudbox", sparse: ["/tmp"] })).toThrow(/invalid sparse path/);
  });
});
