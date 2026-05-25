import { describe, expect, it, vi } from "vitest";
import { MemoryComputerGrantStore } from "../src/computer-grants.ts";
import { createMergeRequest, mountPrivateRepo, publishBranch } from "../src/repo-workflow.ts";

const ownerId = "alice";
const remote = "https://gitlab.cfdata.org/cloudflare/team/project.git";
const repoKey = "gitlab:gitlab.cfdata.org:cloudflare/team/project";
const path = "/home/user/src/project";
function harness() {
  const commands: Array<{ command: string; options?: any }> = [];
  const configured: unknown[] = [];
  const sandbox = {
    exec: vi.fn(async (command: string, options?: any) => { commands.push({ command, options }); return { success: true, stdout: "ok", stderr: "", exitCode: 0 }; }),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    configureGitLabTransport: vi.fn(async (params: unknown) => { configured.push(params); }),
  };
  const computerGrants = new MemoryComputerGrantStore();
  return { sandbox, commands, configured, computerGrants, getComputerSandbox: () => sandbox };
}

describe("complete private repo workflow contract", () => {
  it("mounts at the selected path only after repository authorization", async () => {
    const env = harness();
    await expect(mountPrivateRepo(env, { ownerId, remote, path })).rejects.toThrow(/git_repo_read/);
    await env.computerGrants.grant(ownerId, `personal:${ownerId}`, "git_repo_read", repoKey);
    const result = await mountPrivateRepo(env, { ownerId, remote, path, branch: "main" });
    expect(result.path).toBe(path);
    expect(env.sandbox.configureGitLabTransport).toHaveBeenCalledWith({ ownerId, computerId: `personal:${ownerId}` });
    expect(env.commands.at(-1)).toMatchObject({ command: "cloudbox-mount-repo", options: { env: { MOUNT_GIT_REMOTE: remote, MOUNT_PATH: path } } });
  });

  it("requires explicit write grant before pushing a branch", async () => {
    const env = harness();
    await env.computerGrants.grant(ownerId, `personal:${ownerId}`, "git_repo_read", repoKey);
    await expect(publishBranch(env, { ownerId, remote, path, branch: "agent/change" })).rejects.toThrow(/git_repo_write/);
    await env.computerGrants.grant(ownerId, `personal:${ownerId}`, "git_repo_write", repoKey);
    await publishBranch(env, { ownerId, remote, path, branch: "agent/change" });
    expect(env.commands.at(-1)?.command).toContain("git push origin HEAD:");
  });

  it("creates an MR through a configured provider after publication", async () => {
    const create = vi.fn().mockResolvedValue({ url: "https://gitlab.cfdata.org/group/project/-/merge_requests/1", iid: 1 });
    const env = { ...harness(), createMergeRequest: create };
    const result = await createMergeRequest(env, { ownerId, remote, sourceBranch: "agent/change", title: "Agent change" });
    expect(result.iid).toBe(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ sourceBranch: "agent/change", targetBranch: "main" }));
  });

  it("creates an MR through the brokered GitLab API when no external provider is injected", async () => {
    const oauthFetch = vi.fn().mockResolvedValue(Response.json({ web_url: "https://gitlab.cfdata.org/cloudflare/team/project/-/merge_requests/2", iid: 2 }));
    const env = { ...harness(), GITLAB_OAUTH_APP_ID: "gitlab-app", OAUTH_PROXY: { oauthFetch } } as any;
    const result = await createMergeRequest(env, { ownerId, remote, sourceBranch: "agent/change", title: "Agent change" });
    expect(result.iid).toBe(2);
    const request = oauthFetch.mock.calls[0][2] as Request;
    expect(request.url).toContain("/api/v4/projects/cloudflare%2Fteam%2Fproject/merge_requests");
    expect(request.method).toBe("POST");
  });
});
