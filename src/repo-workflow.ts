import { buildGitLabRepoKey } from "./gitlab-egress.ts";
import { enableOwnerGitLabTransport, assertComputerPath, prepareOwnerComputer, type SandboxComputerBindings } from "./sandbox-computer.ts";
import type { ComputerGrantStore } from "./computer-grants.ts";

export type RepoWorkflowEnv = SandboxComputerBindings & {
  computerGrants: ComputerGrantStore;
  createMergeRequest?: (input: { ownerId: string; remote: string; sourceBranch: string; targetBranch: string; title: string; description?: string }) => Promise<{ url: string; iid?: number }>;
};

function remoteRepoKey(remote: string): string {
  const parsed = new URL(remote);
  if (parsed.protocol !== "https:" || parsed.hostname !== "gitlab.cfdata.org") throw new Error("only gitlab.cfdata.org HTTPS remotes are supported for private repo workflow");
  const repo = parsed.pathname.replace(/^\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  if (!repo.includes("/") || repo.split("/").some((segment) => !segment || segment === "." || segment === "..")) throw new Error("invalid GitLab repository path");
  return buildGitLabRepoKey(parsed.hostname, repo);
}

export async function mountPrivateRepo(env: RepoWorkflowEnv, input: { ownerId: string; remote: string; path: string; branch?: string }) {
  assertComputerPath(input.path);
  const ownerId = input.ownerId.trim().toLowerCase();
  const computerId = `personal:${ownerId}`;
  const repoKey = remoteRepoKey(input.remote);
  if (!(await env.computerGrants.has(ownerId, computerId, "git_repo_read", repoKey))) throw new Error(`repository authorization required: git_repo_read:${repoKey}`);
  const sandbox = await prepareOwnerComputer(env, { id: ownerId });
  await enableOwnerGitLabTransport(sandbox, { id: ownerId });
  const branch = input.branch?.trim() || "main";
  const result = await sandbox.exec("cloudbox-mount-repo", {
    cwd: "/home/user",
    timeout: 120_000,
    origin: "internal",
    env: { MOUNT_GIT_REMOTE: input.remote, MOUNT_GIT_BRANCH: branch, MOUNT_PATH: input.path },
  });
  if (!result.success) throw new Error(result.stderr || result.stdout || "repository mount failed");
  return { path: input.path, remote: input.remote, branch, repoKey, output: result.stdout ?? "" };
}

export async function publishBranch(env: RepoWorkflowEnv, input: { ownerId: string; remote: string; path: string; branch: string }) {
  assertComputerPath(input.path);
  const ownerId = input.ownerId.trim().toLowerCase();
  const computerId = `personal:${ownerId}`;
  const repoKey = remoteRepoKey(input.remote);
  if (!(await env.computerGrants.has(ownerId, computerId, "git_repo_write", repoKey))) throw new Error(`publication approval required: git_repo_write:${repoKey}`);
  const sandbox = await prepareOwnerComputer(env, { id: ownerId });
  await enableOwnerGitLabTransport(sandbox, { id: ownerId });
  const result = await sandbox.exec(`git push origin HEAD:${JSON.stringify(input.branch)}`, { cwd: input.path, timeout: 120_000, origin: "internal" });
  if (!result.success) throw new Error(result.stderr || result.stdout || "branch push failed");
  return { path: input.path, remote: input.remote, branch: input.branch, repoKey, output: result.stdout ?? "" };
}

export async function createMergeRequest(env: RepoWorkflowEnv, input: { ownerId: string; remote: string; sourceBranch: string; targetBranch?: string; title: string; description?: string }) {
  if (!env.createMergeRequest) throw new Error("merge request provider is not configured");
  return env.createMergeRequest({ ...input, targetBranch: input.targetBranch ?? "main" });
}
