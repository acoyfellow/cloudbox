import type { Hono } from "hono";
import { assertComputerPath, prepareOwnerComputer } from "./sandbox-computer.ts";
import { buildGitLabRepoKey, type RepoGrantKind } from "./gitlab-egress.ts";
import { D1ComputerGrantStore, type ComputerGrantStore } from "./computer-grants.ts";
import { findGitLabApplication, KvOAuthFlowStore, type OAuthFlowStore } from "./oauth-proxy.ts";
import { createMergeRequest, mountPrivateRepo, publishBranch } from "./repo-workflow.ts";
import { COMPUTER_CODE_CATALOG } from "./computer-code-mode.ts";
import { jsonError, jsonErrorResponse } from "./http-errors.ts";
import type { CloudboxBindings } from "./http.ts";

export function registerPersonalComputerRoutes(api: Hono<{ Bindings: CloudboxBindings }>): void {
  api.get("/api/personal-computers/:owner/integrations/gitlab", async (c) => {
    const owner = c.req.param("owner");
    const trusted = internalComputerOwner(c.req.raw, owner, c.env);
    if (trusted) return trusted;
    if (!c.env.OAUTH_PROXY) return jsonError(c, 503, "oauth_proxy_unavailable", "GitLab OAuth broker is unavailable");
    const applications = await c.env.OAUTH_PROXY.listAvailableApplications();
    const gitlab = findGitLabApplication(applications);
    if (!gitlab) return jsonError(c, 503, "gitlab_oauth_unavailable", "GitLab OAuth application is not configured");
    const result = await c.env.OAUTH_PROXY.listApplications(owner);
    if (!result.ok) return jsonError(c, 502, "oauth_proxy_failed", result.error?.message ?? "Unable to list OAuth connections");
    return c.json({ ok: true, application: gitlab, connections: result.data });
  });

  api.post("/api/personal-computers/:owner/integrations/gitlab/connect", async (c) => {
    const owner = c.req.param("owner");
    const trusted = internalComputerOwner(c.req.raw, owner, c.env);
    if (trusted) return trusted;
    if (!c.env.OAUTH_PROXY) return jsonError(c, 503, "oauth_proxy_unavailable", "GitLab OAuth broker is unavailable");
    const gitlab = findGitLabApplication(await c.env.OAUTH_PROXY.listAvailableApplications());
    if (!gitlab) return jsonError(c, 503, "gitlab_oauth_unavailable", "GitLab OAuth application is not configured");
    const result = await c.env.OAUTH_PROXY.startAuth(owner, { appId: gitlab.id });
    if (!result.ok) return jsonError(c, result.error?.tag === "UnknownApp" ? 404 : 400, "oauth_connect_failed", result.error?.message ?? "Unable to start GitLab authorization");
    const flows = oauthFlowStore(c.env);
    if (!flows) return jsonError(c, 503, "oauth_flow_unavailable", "OAuth callback state storage is unavailable");
    await flows.put(result.data.state, owner, 600);
    return c.json({ ok: true, applicationId: gitlab.id, ...result.data });
  });

  // Public OAuth callback target reached by the user's GitLab browser ceremony.
  // It resolves owner identity exclusively from one-time state created during an
  // internally authenticated connect call; owner is never accepted from query input.
  api.get("/api/personal-computers/oauth/gitlab/callback", async (c) => {
    const flows = oauthFlowStore(c.env);
    if (!c.env.OAUTH_PROXY || !flows) return c.text("OAuth callback is not configured.", 503);
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) return c.text("Missing OAuth callback parameters.", 400);
    const owner = await flows.consume(state);
    if (!owner) return c.text("OAuth callback state expired or invalid.", 400);
    const result = await c.env.OAUTH_PROXY.completeAuth(owner, { code, state });
    if (!result.ok) return c.text("GitLab authorization failed. Close this window and retry.", 502);
    return c.html("<!doctype html><title>GitLab connected</title><p>GitLab connected to Cloudbox. You can close this window.</p>");
  });

  api.post("/api/personal-computers/:owner/integrations/gitlab/complete", async (c) => {
    const owner = c.req.param("owner");
    const trusted = internalComputerOwner(c.req.raw, owner, c.env);
    if (trusted) return trusted;
    if (!c.env.OAUTH_PROXY) return jsonError(c, 503, "oauth_proxy_unavailable", "GitLab OAuth broker is unavailable");
    const body = await c.req.json().catch(() => null) as { code?: string; state?: string } | null;
    if (!body?.code || !body.state) return jsonError(c, 400, "bad_oauth_callback", "OAuth code and state are required");
    const result = await c.env.OAUTH_PROXY.completeAuth(owner, { code: body.code, state: body.state });
    if (!result.ok) return jsonError(c, 502, "oauth_complete_failed", result.error?.message ?? "Unable to complete GitLab authorization");
    return c.json({ ok: true, connected: true });
  });

  api.delete("/api/personal-computers/:owner/integrations/gitlab", async (c) => {
    const owner = c.req.param("owner");
    const trusted = internalComputerOwner(c.req.raw, owner, c.env);
    if (trusted) return trusted;
    if (!c.env.OAUTH_PROXY) return jsonError(c, 503, "oauth_proxy_unavailable", "GitLab OAuth broker is unavailable");
    const gitlab = findGitLabApplication(await c.env.OAUTH_PROXY.listAvailableApplications());
    if (!gitlab) return jsonError(c, 503, "gitlab_oauth_unavailable", "GitLab OAuth application is not configured");
    const result = await c.env.OAUTH_PROXY.deleteApplication(owner, gitlab.id);
    if (!result.ok) return jsonError(c, result.error?.tag === "NotFound" ? 404 : 502, "oauth_disconnect_failed", result.error?.message ?? "Unable to disconnect GitLab authorization");
    return c.json({ ok: true, disconnected: true });
  });

  api.post("/api/personal-computers/:owner/repo-grants", async (c) => {
    const owner = c.req.param("owner");
    const trusted = internalComputerOwner(c.req.raw, owner, c.env);
    if (trusted) return trusted;
    const store = computerGrantStore(c.env);
    if (!store) return jsonError(c, 503, "grant_store_unavailable", "computer repo grant authority is unavailable");
    const body = await c.req.json().catch(() => null) as { remote?: string; kind?: RepoGrantKind; ttlMs?: number } | null;
    const repoKey = gitLabRepoKeyFromRemote(body?.remote ?? "");
    if (!repoKey || (body?.kind !== "git_repo_read" && body?.kind !== "git_repo_write")) return jsonError(c, 400, "bad_grant", "valid GitLab remote and git_repo_read/git_repo_write kind are required");
    if (body.kind === "git_repo_write") return jsonError(c, 403, "publication_approval_required", "write grants require the publication approval endpoint");
    const grant = await store.grant(owner, personalComputerId(owner), body.kind, repoKey, body.ttlMs);
    return c.json({ ok: true, grant });
  });

  api.post("/api/personal-computers/:owner/publication-approvals", async (c) => {
    const owner = c.req.param("owner");
    const trusted = internalComputerOwner(c.req.raw, owner, c.env);
    if (trusted) return trusted;
    const approvalToken = c.req.header("x-cloudbox-publish-approval-token");
    if (!c.env.CLOUDBOX_PUBLISH_APPROVAL_TOKEN || approvalToken !== c.env.CLOUDBOX_PUBLISH_APPROVAL_TOKEN) {
      return jsonError(c, 403, "publication_approval_required", "explicit publication approval is required");
    }
    const store = computerGrantStore(c.env);
    if (!store) return jsonError(c, 503, "grant_store_unavailable", "computer repo grant authority is unavailable");
    const body = await c.req.json().catch(() => null) as { remote?: string; ttlMs?: number; approved?: boolean } | null;
    const repoKey = gitLabRepoKeyFromRemote(body?.remote ?? "");
    if (!repoKey || body?.approved !== true) return jsonError(c, 400, "bad_approval", "valid GitLab remote and approved=true are required");
    const grant = await store.grant(owner, personalComputerId(owner), "git_repo_write", repoKey, body.ttlMs ?? 15 * 60 * 1000);
    return c.json({ ok: true, approval: grant });
  });

  api.get("/api/personal-computers/:owner/repo-grants", async (c) => {
    const owner = c.req.param("owner");
    const trusted = internalComputerOwner(c.req.raw, owner, c.env);
    if (trusted) return trusted;
    const store = computerGrantStore(c.env);
    if (!store) return jsonError(c, 503, "grant_store_unavailable", "computer repo grant authority is unavailable");
    return c.json({ ok: true, grants: await store.list(owner, personalComputerId(owner)) });
  });

  api.delete("/api/personal-computers/:owner/repo-grants", async (c) => {
    const owner = c.req.param("owner");
    const trusted = internalComputerOwner(c.req.raw, owner, c.env);
    if (trusted) return trusted;
    const store = computerGrantStore(c.env);
    if (!store) return jsonError(c, 503, "grant_store_unavailable", "computer repo grant authority is unavailable");
    const body = await c.req.json().catch(() => null) as { remote?: string } | null;
    const repoKey = gitLabRepoKeyFromRemote(body?.remote ?? "");
    if (!repoKey) return jsonError(c, 400, "bad_grant", "valid GitLab remote is required");
    await store.revoke(owner, personalComputerId(owner), repoKey);
    return c.json({ ok: true, revoked: repoKey });
  });

  api.post("/api/personal-computers/:owner/repos/mount", async (c) => {
    const owner = c.req.param("owner");
    const trusted = internalComputerOwner(c.req.raw, owner, c.env);
    if (trusted) return trusted;
    const grants = computerGrantStore(c.env);
    if (!grants || !c.env.CLOUDBOX_SANDBOX) return jsonError(c, 503, "computer_unavailable", "computer runtime and grant authority are required");
    const body = await c.req.json().catch(() => null) as { remote?: string; path?: string; branch?: string } | null;
    try {
      const result = await mountPrivateRepo({ ...c.env, computerGrants: grants }, { ownerId: owner, remote: body?.remote ?? "", path: body?.path ?? "", branch: body?.branch });
      return c.json({ ok: true, result });
    } catch (error) {
      return jsonError(c, 409, "repo_mount_failed", error instanceof Error ? error.message : String(error));
    }
  });

  api.post("/api/personal-computers/:owner/repos/publish", async (c) => {
    const owner = c.req.param("owner");
    const trusted = internalComputerOwner(c.req.raw, owner, c.env);
    if (trusted) return trusted;
    const grants = computerGrantStore(c.env);
    if (!grants || !c.env.CLOUDBOX_SANDBOX) return jsonError(c, 503, "computer_unavailable", "computer runtime and grant authority are required");
    const body = await c.req.json().catch(() => null) as { remote?: string; path?: string; branch?: string } | null;
    if (!body?.branch) return jsonError(c, 400, "bad_publication", "branch is required");
    try {
      const result = await publishBranch({ ...c.env, computerGrants: grants }, { ownerId: owner, remote: body.remote ?? "", path: body.path ?? "", branch: body.branch });
      return c.json({ ok: true, result });
    } catch (error) {
      return jsonError(c, 409, "repo_publish_failed", error instanceof Error ? error.message : String(error));
    }
  });

  api.post("/api/personal-computers/:owner/repos/merge-requests", async (c) => {
    const owner = c.req.param("owner");
    const trusted = internalComputerOwner(c.req.raw, owner, c.env);
    if (trusted) return trusted;
    const body = await c.req.json().catch(() => null) as { remote?: string; sourceBranch?: string; targetBranch?: string; title?: string; description?: string } | null;
    if (!body?.remote || !body.sourceBranch || !body.title) return jsonError(c, 400, "bad_merge_request", "remote, sourceBranch and title are required");
    try {
      const grants = computerGrantStore(c.env);
      if (!grants) return jsonError(c, 503, "grant_store_unavailable", "computer repo grant authority is unavailable");
      const result = await createMergeRequest({ ...c.env, computerGrants: grants }, { ownerId: owner, remote: body.remote, sourceBranch: body.sourceBranch, targetBranch: body.targetBranch, title: body.title, description: body.description });
      return c.json({ ok: true, result });
    } catch (error) {
      return jsonError(c, 503, "merge_request_failed", error instanceof Error ? error.message : String(error));
    }
  });

  api.get("/api/personal-computers/:owner/code/catalog", (c) => {
    const trusted = internalComputerOwner(c.req.raw, c.req.param("owner"), c.env);
    if (trusted) return trusted;
    return c.json({ ok: true, namespace: "computer", methods: COMPUTER_CODE_CATALOG });
  });

  api.post("/api/personal-computers/:owner/exec", async (c) => {
    const trusted = internalComputerOwner(c.req.raw, c.req.param("owner"), c.env);
    if (trusted) return trusted;
    if (!c.env.CLOUDBOX_SANDBOX) return jsonError(c, 503, "sandbox_unavailable", "CLOUDBOX_SANDBOX binding is required for durable computers");
    const body = await c.req.json().catch(() => null) as { command?: string; cwd?: string; timeoutMs?: number } | null;
    if (!body?.command || typeof body.command !== "string" || body.command.length > 2_000) return jsonError(c, 400, "bad_exec", "command is required and must be <= 2000 chars");
    const cwd = body.cwd ?? "/home/user";
    try {
      if (cwd !== "/home/user") assertComputerPath(cwd);
      const sandbox = await prepareOwnerComputer(c.env, { id: c.req.param("owner") });
      const result = await sandbox.exec(body.command, { cwd, timeout: body.timeoutMs ?? 30_000 });
      return c.json({ ok: result.success, cwd, stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: result.exitCode ?? (result.success ? 0 : 1) });
    } catch (error) {
      return jsonError(c, 400, "computer_exec_failed", error instanceof Error ? error.message : String(error));
    }
  });

  api.get("/api/personal-computers/:owner/read", async (c) => {
    const trusted = internalComputerOwner(c.req.raw, c.req.param("owner"), c.env);
    if (trusted) return trusted;
    if (!c.env.CLOUDBOX_SANDBOX) return jsonError(c, 503, "sandbox_unavailable", "CLOUDBOX_SANDBOX binding is required for durable computers");
    const path = c.req.query("path") ?? "";
    try {
      assertComputerPath(path);
      const sandbox = await prepareOwnerComputer(c.env, { id: c.req.param("owner") });
      const file = await sandbox.readFile(path) as unknown as { content?: string | Uint8Array };
      const content = typeof file.content === "string" ? file.content : file.content instanceof Uint8Array ? new TextDecoder().decode(file.content) : "";
      return c.json({ ok: true, path, content });
    } catch (error) {
      return jsonError(c, 400, "computer_read_failed", error instanceof Error ? error.message : String(error));
    }
  });

  api.post("/api/personal-computers/:owner/write", async (c) => {
    const trusted = internalComputerOwner(c.req.raw, c.req.param("owner"), c.env);
    if (trusted) return trusted;
    if (!c.env.CLOUDBOX_SANDBOX) return jsonError(c, 503, "sandbox_unavailable", "CLOUDBOX_SANDBOX binding is required for durable computers");
    const body = await c.req.json().catch(() => null) as { path?: string; content?: string } | null;
    if (typeof body?.content !== "string" || body.content.length > 200_000) return jsonError(c, 400, "bad_write", "content must be a string <= 200000 chars");
    try {
      assertComputerPath(body.path ?? "");
      const sandbox = await prepareOwnerComputer(c.env, { id: c.req.param("owner") });
      await sandbox.writeFile(body.path!, body.content);
      return c.json({ ok: true, path: body.path, bytes: body.content.length });
    } catch (error) {
      return jsonError(c, 400, "computer_write_failed", error instanceof Error ? error.message : String(error));
    }
  });
}

// Sandbox-backed durable Computer vertical slice. Owner identity is supplied
// only by trusted internal callers until verified end-user delegation exists;
// these routes intentionally reject ordinary public API traffic.
function internalComputerOwner(request: Request, expectedOwner: string, env: CloudboxBindings): Response | null {
  const internalToken = env.CLOUDBOX_INTERNAL_TOKEN;
  const gotToken = request.headers.get("x-cloudbox-internal-token");
  const owner = request.headers.get("x-cloudbox-owner");
  if (!internalToken || gotToken !== internalToken || !owner || owner.toLowerCase() !== expectedOwner.toLowerCase()) {
    return jsonErrorResponse(403, "computer_internal_only", "durable computer slice requires trusted owner delegation");
  }
  return null;
}

function personalComputerId(owner: string): string {
  return `personal:${owner.trim().toLowerCase()}`;
}

function computerGrantStore(env: CloudboxBindings): ComputerGrantStore | null {
  if (env.computerGrants) return env.computerGrants;
  return env.DB ? new D1ComputerGrantStore(env.DB) : null;
}

function oauthFlowStore(env: CloudboxBindings): OAuthFlowStore | null {
  if (env.OAUTH_FLOW_STORE) return env.OAUTH_FLOW_STORE;
  return env.OAUTH_FLOW_KV ? new KvOAuthFlowStore(env.OAUTH_FLOW_KV) : null;
}

function gitLabRepoKeyFromRemote(remote: string): string | null {
  try {
    const url = new URL(remote);
    if (url.protocol !== "https:" || url.hostname !== "gitlab.cfdata.org") return null;
    const repo = url.pathname.replace(/^\//, "").replace(/\.git$/, "").replace(/\/$/, "");
    if (!repo.includes("/") || repo.split("/").some((segment) => !segment || segment === "." || segment === "..")) return null;
    return buildGitLabRepoKey(url.hostname, repo);
  } catch {
    return null;
  }
}
