import { describe, expect, it, vi } from "vitest";
import { computerEgressHandler } from "../src/computer-egress.ts";
import type { RepoGrantKind } from "../src/gitlab-egress.ts";

const request = (path = "/group/project.git/info/refs?service=git-upload-pack") => new Request(`https://gitlab.cfdata.org${path}`);
const context = { params: { ownerId: "alice", computerId: "personal" } } as any;

describe("computer GitLab egress boundary", () => {
  it("fails closed without a repo grant authority", async () => {
    const response = await computerEgressHandler(request(), {}, context);
    expect(response.status).toBe(403);
    expect(await response.text()).toContain("git_repo_read:gitlab:gitlab.cfdata.org:group/project");
  });

  it("requires an OAuth broker even after authorization", async () => {
    const response = await computerEgressHandler(request(), {
      authorizeComputerRepo: async () => true,
    }, context);
    expect(response.status).toBe(503);
  });

  it("forwards only through the broker after authorization", async () => {
    const oauthFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const response = await computerEgressHandler(request(), {
      GITLAB_OAUTH_APP_ID: "gitlab-app",
      authorizeComputerRepo: async (_owner: string, _computer: string, kind: RepoGrantKind, repoKey: string) => kind === "git_repo_read" && repoKey.endsWith(":group/project"),
      OAUTH_PROXY: { oauthFetch },
    }, context);
    expect(response.status).toBe(200);
    expect(oauthFetch).toHaveBeenCalledTimes(1);
    const [, , forwarded] = oauthFetch.mock.calls[0];
    expect(new URL((forwarded as Request).url).hostname).toBe("gitlab-access.cfdata.org");
    expect((forwarded as Request).headers.has("authorization")).toBe(false);
  });

  it("does not let a read-only grant authorize push", async () => {
    const oauthFetch = vi.fn().mockResolvedValue(new Response("wrong"));
    const response = await computerEgressHandler(new Request("https://gitlab.cfdata.org/group/project.git/git-receive-pack", { method: "POST" }), {
      GITLAB_OAUTH_APP_ID: "gitlab-app",
      authorizeComputerRepo: async (_owner: string, _computer: string, kind: RepoGrantKind) => kind === "git_repo_read",
      OAUTH_PROXY: { oauthFetch },
    }, context);
    expect(response.status).toBe(403);
    expect(oauthFetch).not.toHaveBeenCalled();
  });
});
