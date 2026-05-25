export type RepoGrantKind = "git_repo_read" | "git_repo_write";

export type EgressRequestShape = {
  method: string;
  host: string;
  path: string;
  query: string;
};

export type GitLabDecision = {
  classification: "RepoRead" | "RepoWrite" | "Unknown";
  decision: "allow" | "deny" | "require_consent";
  provider: "gitlab";
  repoKey?: string;
  grantKind?: RepoGrantKind;
  reason?: string;
};

const GIT_SUFFIXES = /\/(info\/refs|HEAD|git-upload-pack|git-receive-pack|objects\/.*)$/;

function unsafeRepo(repo: string): boolean {
  return repo.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

export function buildGitLabRepoKey(host: string, repo: string): string {
  return `gitlab:${host.toLowerCase()}:${repo.toLowerCase()}`;
}

export function extractGitLabRepoFromGitPath(path: string): string | null {
  const repo = path.replace(GIT_SUFFIXES, "").replace(/\.git$/, "").replace(/^\//, "").replace(/\/$/, "");
  if (!repo || !repo.includes("/") || unsafeRepo(repo)) return null;
  return repo;
}

export function classifyGitLabSmartHttp(
  request: EgressRequestShape,
  canonicalHost = "gitlab.cfdata.org",
  aliases = ["gitlab-access.cfdata.org"],
): GitLabDecision {
  if (request.host !== canonicalHost && !aliases.includes(request.host)) {
    return { classification: "Unknown", decision: "deny", provider: "gitlab", reason: "unknown_gitlab_host" };
  }
  if (request.path.includes("/info/lfs/objects/batch")) {
    return { classification: "Unknown", decision: "deny", provider: "gitlab", reason: "git_lfs_not_supported" };
  }
  const repo = extractGitLabRepoFromGitPath(request.path);
  if (!repo) {
    return { classification: "Unknown", decision: "deny", provider: "gitlab", reason: "unsupported_git_protocol_request" };
  }
  const repoKey = buildGitLabRepoKey(canonicalHost, repo);
  if (request.path.endsWith("/git-upload-pack") && request.method === "POST") {
    return { classification: "RepoRead", decision: "allow", provider: "gitlab", repoKey, grantKind: "git_repo_read" };
  }
  if (request.path.endsWith("/git-receive-pack") && request.method === "POST") {
    return { classification: "RepoWrite", decision: "require_consent", provider: "gitlab", repoKey, grantKind: "git_repo_write" };
  }
  if (request.path.endsWith("/info/refs") && ["GET", "HEAD"].includes(request.method)) {
    const service = new URLSearchParams(request.query).get("service");
    if (!service || service === "git-upload-pack") {
      return { classification: "RepoRead", decision: "allow", provider: "gitlab", repoKey, grantKind: "git_repo_read" };
    }
    if (service === "git-receive-pack") {
      return { classification: "RepoWrite", decision: "require_consent", provider: "gitlab", repoKey, grantKind: "git_repo_write" };
    }
    return { classification: "Unknown", decision: "deny", provider: "gitlab", repoKey, reason: "unsupported_git_service" };
  }
  if ((request.path.endsWith("/HEAD") || request.path.includes("/objects/")) && ["GET", "HEAD"].includes(request.method)) {
    return { classification: "RepoRead", decision: "allow", provider: "gitlab", repoKey, grantKind: "git_repo_read" };
  }
  return { classification: "Unknown", decision: "deny", provider: "gitlab", repoKey, reason: "unsupported_git_protocol_request" };
}

/**
 * Normalize a Git smart HTTP request for forwarding through the GitLab OAuth
 * broker. This attaches no credentials; only a trusted outbound handler may do
 * that after checking a repo grant.
 */
export function normalizeGitLabSmartHttpRequest(request: Request, targetHost = "gitlab-access.cfdata.org"): Request {
  const url = new URL(request.url);
  const isSmartHttp = /\/(info\/refs|git-upload-pack|git-receive-pack|HEAD|objects\/)/.test(url.pathname)
    || url.searchParams.get("service")?.startsWith("git-") === true;
  if (!isSmartHttp) throw new Error("request is not Git smart HTTP transport");
  if (!url.pathname.includes(".git/")) {
    const match = url.pathname.match(GIT_SUFFIXES);
    if (match?.index !== undefined) url.pathname = `${url.pathname.slice(0, match.index)}.git${match[0]}`;
  }
  url.hostname = targetHost;
  return new Request(url.toString(), request);
}
