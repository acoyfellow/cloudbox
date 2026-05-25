import { buildGitLabRepoKey } from "./gitlab-egress.ts";
import { enableOwnerGitLabTransport, assertComputerPath, prepareOwnerComputer, type SandboxComputerBindings } from "./sandbox-computer.ts";
import type { ComputerGrantStore } from "./computer-grants.ts";
import type { OAuthProxyBinding } from "./oauth-proxy.ts";

export type RepoWorkflowEnv = SandboxComputerBindings & {
  computerGrants: ComputerGrantStore;
  OAUTH_PROXY?: OAuthProxyBinding;
  GITLAB_OAUTH_APP_ID?: string;
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
  await enableOwnerGitLabTransport(env, sandbox, { id: ownerId });
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
  await enableOwnerGitLabTransport(env, sandbox, { id: ownerId });
  const result = await sandbox.exec(`git push origin HEAD:${JSON.stringify(input.branch)}`, { cwd: input.path, timeout: 120_000, origin: "internal" });
  if (!result.success) throw new Error(result.stderr || result.stdout || "branch push failed");
  return { path: input.path, remote: input.remote, branch: input.branch, repoKey, output: result.stdout ?? "" };
}

export async function createMergeRequest(env: RepoWorkflowEnv, input: { ownerId: string; remote: string; sourceBranch: string; targetBranch?: string; title: string; description?: string }) {
  const targetBranch = input.targetBranch ?? "main";
  if (env.createMergeRequest) return env.createMergeRequest({ ...input, targetBranch });
  if (!env.OAUTH_PROXY || !env.GITLAB_OAUTH_APP_ID) throw new Error("merge request provider is not configured");
  const parsed = new URL(input.remote);
  if (parsed.hostname !== "gitlab.cfdata.org") throw new Error("merge requests require a gitlab.cfdata.org remote");
  const project = parsed.pathname.replace(/^\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  const response = await env.OAUTH_PROXY.oauthFetch(input.ownerId, env.GITLAB_OAUTH_APP_ID, new Request(`https://gitlab.cfdata.org/api/v4/projects/${encodeURIComponent(project)}/merge_requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source_branch: input.sourceBranch, target_branch: targetBranch, title: input.title, description: input.description ?? "" }),
  }));
  if (!response.ok) throw new Error(`merge request creation failed: HTTP ${response.status}`);
  const body = await response.json() as { web_url?: string; iid?: number };
  if (!body.web_url) throw new Error("merge request creation response omitted web_url");
  return { url: body.web_url, iid: body.iid };
}
