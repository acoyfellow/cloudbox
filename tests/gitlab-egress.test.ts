import { describe, expect, it } from "vitest";
import { classifyGitLabSmartHttp, extractGitLabRepoFromGitPath, normalizeGitLabSmartHttpRequest } from "../src/gitlab-egress.ts";

const req = (overrides: Partial<{ method: string; host: string; path: string; query: string }> = {}) => ({
  method: "GET",
  host: "gitlab.cfdata.org",
  path: "/group/project.git/info/refs",
  query: "service=git-upload-pack",
  ...overrides,
});

describe("GitLab smart HTTP classification", () => {
  it("extracts canonical repository names and rejects traversal", () => {
    expect(extractGitLabRepoFromGitPath("/cloudflare/cto/seals.git/info/refs")).toBe("cloudflare/cto/seals");
    expect(extractGitLabRepoFromGitPath("/group/../project.git/info/refs")).toBeNull();
  });

  it("classifies clone and fetch as read-scoped", () => {
    expect(classifyGitLabSmartHttp(req())).toMatchObject({
      classification: "RepoRead",
      grantKind: "git_repo_read",
      repoKey: "gitlab:gitlab.cfdata.org:group/project",
    });
    expect(classifyGitLabSmartHttp(req({ method: "POST", path: "/group/project.git/git-upload-pack", query: "" }))).toMatchObject({
      classification: "RepoRead",
      grantKind: "git_repo_read",
    });
  });

  it("classifies push as separately consent-gated write", () => {
    expect(classifyGitLabSmartHttp(req({ method: "POST", path: "/group/project.git/git-receive-pack", query: "" }))).toMatchObject({
      classification: "RepoWrite",
      decision: "require_consent",
      grantKind: "git_repo_write",
    });
  });

  it("denies LFS and unrecognized hosts", () => {
    expect(classifyGitLabSmartHttp(req({ path: "/group/project.git/info/lfs/objects/batch", method: "POST" }))).toMatchObject({ decision: "deny", reason: "git_lfs_not_supported" });
    expect(classifyGitLabSmartHttp(req({ host: "evil.example" }))).toMatchObject({ decision: "deny", reason: "unknown_gitlab_host" });
  });
});

describe("GitLab broker forwarding normalization", () => {
  it("normalizes redirect-prone smart HTTP paths without injecting credentials", () => {
    const forwarded = normalizeGitLabSmartHttpRequest(new Request("https://gitlab.cfdata.org/group/project/info/refs?service=git-upload-pack"));
    const url = new URL(forwarded.url);
    expect(url.hostname).toBe("gitlab-access.cfdata.org");
    expect(url.pathname).toBe("/group/project.git/info/refs");
    expect(forwarded.headers.has("authorization")).toBe(false);
  });
});
