import { Hono } from "hono";
import { fromBrief } from "./brief.ts";
import { deleteLiveInContainer, devInContainer, execInContainer, previewInContainer, readInContainer, restoreInContainer, runInContainer, snapshotInContainer, writeInContainer, type ContainerRunRequest } from "./container-runner.ts";
import { materialize } from "./materialize.ts";
import type { ComputerSpec } from "./spec.ts";
import { handleLocalAction, materializeLocal } from "./local-demo.ts";
import { assertComputerPath, prepareOwnerComputer, type SandboxComputerBindings } from "./sandbox-computer.ts";
import { buildGitLabRepoKey, type RepoGrantKind } from "./gitlab-egress.ts";
import { D1ComputerGrantStore, type ComputerGrantStore } from "./computer-grants.ts";
import { findGitLabApplication, type OAuthProxyBinding } from "./oauth-proxy.ts";

export type CloudboxBindings = {
  CLOUDBOX_COMPUTER?: DurableObjectNamespace;
  CLOUDBOX_RUNNER?: unknown;
  CLOUDBOX_DESKTOP_RUNNER?: unknown;
  CLOUDBOX_SANDBOX?: SandboxComputerBindings["CLOUDBOX_SANDBOX"];
  ARTIFACTS?: R2Bucket;
  DB?: D1Database;
  CLOUDBOX_API_TOKEN?: string;
  CLOUDBOX_INTERNAL_TOKEN?: string;
  computerGrants?: ComputerGrantStore;
  OAUTH_PROXY?: OAuthProxyBinding;
  AI?: unknown;
};

export const api = new Hono<{ Bindings: CloudboxBindings }>();

api.get("/api/health", (c) => c.json({ ok: true, name: "cloudbox" }));

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
  return c.json({ ok: true, applicationId: gitlab.id, ...result.data });
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
  const grant = await store.grant(owner, personalComputerId(owner), body.kind, repoKey, body.ttlMs);
  return c.json({ ok: true, grant });
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

api.post("/api/brief", async (c) => {
  const body = await c.req.json().catch(() => null) as { brief?: string } | null;
  if (!body?.brief || typeof body.brief !== "string") return jsonError(c, 400, "bad_request", "brief required");
  return c.json(fromBrief(body.brief, c.env as any));
});

api.post("/api/computers", async (c) => {
  const spec = await c.req.json().catch(() => null) as ComputerSpec | null;
  const auth = authorize(c.req.raw, spec, c.env);
  if (auth) return auth;
  const validation = validateSpec(spec);
  if (validation) return validation;
  if (!c.env.CLOUDBOX_COMPUTER) return c.json(materializeLocal(spec as ComputerSpec), 201);
  const result = await materialize(spec as ComputerSpec, c.env as any);
  return c.json(result, 201);
});

api.all("/api/c/:id/:action", async (c) => {
  const id = c.req.param("id");
  const action = c.req.param("action");
  if (!c.env.CLOUDBOX_COMPUTER) {
    const result = await handleLocalAction(id, action, c.req.raw, new URL(c.req.url));
    return c.json(result.body as any, result.status as any);
  }
  const auth = authorizeAction(c.req.raw, action, c.env);
  if (auth) return auth;
  const stub = c.env.CLOUDBOX_COMPUTER.get(c.env.CLOUDBOX_COMPUTER.idFromName(id));
  const upstream = new URL(c.req.url);
  upstream.pathname = `/${action}`;
  return stub.fetch(new Request(upstream, c.req.raw));
});

api.get("/api/runs/recent", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const rows = await listRuns(c.env.DB);
  return c.json({ runs: rows });
});

api.get("/api/runs/:id", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const row = await getRun(c.env.DB, c.req.param("id"));
  return row ? c.json(row) : jsonError(c, 404, "run_not_found", "run not found");
});

// Public, unauthenticated view of a run. Only returns the row when the run was
// posted with `public: true`. IDs are random UUIDs so they're unguessable in
// practice; opt-in keeps private runs from leaking by id.
api.get("/api/runs/:id/public", async (c) => {
  const row = await getRun(c.env.DB, c.req.param("id"));
  if (!row || !row.isPublic) return jsonError(c, 404, "run_not_found", "run not found");
  return c.json({
    id: row.id,
    createdAt: row.createdAt,
    repo: row.repo,
    status: row.status,
    artifact: row.artifact,
    input: row.input,
    result: row.result,
  });
});

api.post("/api/runs", async (c) => {
  const demo = c.req.raw.headers.get("x-cloudbox-demo") === "1";
  const auth = demo ? null : authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const input = await c.req.json().catch(() => null) as ContainerRunRequest | null;
  const validation = validateRun(input);
  if (validation) return validation;
  if (demo && !isAllowedDemoRun(input)) return jsonError(c, 403, "demo_not_allowed", "demo runs only allow public GitHub repos with short echo/test commands");
  const runner = selectRunner(c.env, input as ContainerRunRequest);
  if (!runner) return jsonError(c, 503, "runner_unavailable", "Requested Cloudflare Container runner is only available in the deployed Worker");
  const runId = `run_${crypto.randomUUID()}`;
  // Demo runs go through the curated allow-list (isAllowedDemoRun) so they
  // are safe to share. Auto-mark them public so the hosted demo produces
  // shareable proof URLs without the caller having to opt in.
  const sharedInput: ContainerRunRequest = demo && input ? { ...input, public: true } : (input as ContainerRunRequest);
  const publicUrl = (sharedInput?.public === true)
    ? `${new URL(c.req.url).origin}/runs/${runId}`
    : undefined;
  try {
    const result = await runInContainer(runner, sharedInput, runId);
    await recordRun(c.env.DB, { id: runId, input: sharedInput, result, status: result.ok ? "passed" : "failed" });
    return c.json({ runId, publicUrl, ...result }, result.ok ? 200 : 422);
  } catch (error) {
    const result = { ok: false, error: "runner_error", detail: String(error instanceof Error ? error.stack ?? error.message : error) };
    await recordRun(c.env.DB, { id: runId, input: sharedInput, result, status: "error" });
    return c.json({ runId, publicUrl, ...result }, 500);
  }
});

api.post("/api/runs/:id/exec", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const row = await requireRunnableLiveRun(c.env.DB, c.req.param("id"));
  if (row instanceof Response) return row;
  const runner = runnerForRun(c.env, row);
  if (!runner) return jsonError(c, 503, "runner_unavailable", "Requested Cloudflare Container runner is only available in the deployed Worker");
  const body = await c.req.json().catch(() => null) as { command?: string; timeoutMs?: number } | null;
  if (!body?.command || typeof body.command !== "string" || body.command.length > 1_000) return jsonError(c, 400, "bad_exec", "command is required and must be <= 1000 chars");
  if (body.timeoutMs !== undefined && (!Number.isFinite(body.timeoutMs) || body.timeoutMs <= 0)) return jsonError(c, 400, "bad_exec", "timeoutMs must be positive");
  return c.json(await execInContainer(runner, row.id, { command: body.command, timeoutMs: body.timeoutMs }));
});

api.get("/api/runs/:id/read", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const row = await requireRunnableLiveRun(c.env.DB, c.req.param("id"));
  if (row instanceof Response) return row;
  const runner = runnerForRun(c.env, row);
  if (!runner) return jsonError(c, 503, "runner_unavailable", "Requested Cloudflare Container runner is only available in the deployed Worker");
  const path = c.req.query("path");
  if (!isSafeRelativePath(path)) return jsonError(c, 400, "bad_path", "path must be a safe relative path");
  return c.json(await readInContainer(runner, row.id, path));
});

api.post("/api/runs/:id/write", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const row = await requireRunnableLiveRun(c.env.DB, c.req.param("id"));
  if (row instanceof Response) return row;
  const runner = runnerForRun(c.env, row);
  if (!runner) return jsonError(c, 503, "runner_unavailable", "Requested Cloudflare Container runner is only available in the deployed Worker");
  const body = await c.req.json().catch(() => null) as { path?: string; content?: string } | null;
  if (!isSafeRelativePath(body?.path)) return jsonError(c, 400, "bad_path", "path must be a safe relative path");
  if (typeof body?.content !== "string" || body.content.length > 200_000) return jsonError(c, 400, "bad_write", "content must be a string <= 200000 chars");
  return c.json(await writeInContainer(runner, row.id, { path: body.path, content: body.content }));
});

api.post("/api/runs/:id/dev", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const row = await requireRunnableLiveRun(c.env.DB, c.req.param("id"));
  if (row instanceof Response) return row;
  const runner = runnerForRun(c.env, row);
  if (!runner) return jsonError(c, 503, "runner_unavailable", "Requested Cloudflare Container runner is only available in the deployed Worker");
  const body = await c.req.json().catch(() => null) as { command?: string; port?: number } | null;
  if (!body?.command || typeof body.command !== "string" || body.command.length > 1_000) return jsonError(c, 400, "bad_dev", "command is required and must be <= 1000 chars");
  if (!Number.isInteger(body.port) || (body.port as number) < 1 || (body.port as number) > 65_535) return jsonError(c, 400, "bad_dev", "port must be an integer between 1 and 65535");
  try {
    return c.json(await devInContainer(runner, row.id, { command: body.command, port: body.port as number }));
  } catch (error) {
    return jsonError(c, 502, "runner_request_failed", error instanceof Error ? error.message : String(error));
  }
});

api.post("/api/runs/:id/stop", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const row = await requireRunnableLiveRun(c.env.DB, c.req.param("id"));
  if (row instanceof Response) return row;
  const runner = runnerForRun(c.env, row);
  if (!runner) return jsonError(c, 503, "runner_unavailable", "Requested Cloudflare Container runner is only available in the deployed Worker");
  if (!c.env.ARTIFACTS) return jsonError(c, 503, "snapshot_storage_unavailable", "ARTIFACTS binding is required for live run snapshots");
  const result = await snapshotInContainer(runner, row.id);
  if (!result.ok || !result.snapshot?.bytes) return c.json(result, 422);
  try {
    const snapshotKey = await storeSnapshot(c.env.ARTIFACTS, row.id, result.snapshot.bytes);
    await updateLiveState(c.env.DB, row.id, "stopped", { snapshotKey, stoppedAt: new Date().toISOString() });
    return c.json({ ok: true, runId: row.id, status: "stopped", snapshot: { key: snapshotKey, size: result.snapshot.size } });
  } catch (error) {
    return jsonError(c, 503, "snapshot_storage_unavailable", error instanceof Error ? error.message : String(error));
  }
});

api.post("/api/runs/:id/resume", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const row = await requireLiveRun(c.env.DB, c.req.param("id"));
  if (row instanceof Response) return row;
  if (row.status !== "stopped" || !row.snapshotKey) return jsonError(c, 409, "run_not_stopped", "live run is not stopped with an available snapshot");
  const runner = runnerForRun(c.env, row);
  if (!runner) return jsonError(c, 503, "runner_unavailable", "Requested Cloudflare Container runner is only available in the deployed Worker");
  const snapshotBytes = await loadSnapshot(c.env.ARTIFACTS, row.snapshotKey);
  if (!snapshotBytes) return jsonError(c, 410, "snapshot_missing", "live run snapshot is unavailable");
  const result = await restoreInContainer(runner, row.id, { snapshot: { bytes: snapshotBytes } });
  if (!result.ok) return c.json(result, 422);
  await updateLiveState(c.env.DB, row.id, "ready", { resumedAt: new Date().toISOString() });
  return c.json({ ...result, status: "ready" });
});

api.delete("/api/runs/:id", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const row = await requireLiveRun(c.env.DB, c.req.param("id"));
  if (row instanceof Response) return row;
  const runner = runnerForRun(c.env, row);
  if (!runner) return jsonError(c, 503, "runner_unavailable", "Requested Cloudflare Container runner is only available in the deployed Worker");
  const result = await deleteLiveInContainer(runner, row.id);
  if (row.snapshotKey && c.env.ARTIFACTS) await c.env.ARTIFACTS.delete(row.snapshotKey);
  await updateLiveState(c.env.DB, row.id, "deleted", { deletedAt: new Date().toISOString() });
  return c.json({ ...result, status: "deleted" });
});

api.post("/api/runs/:id/fork", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const source = await requireRunnableLiveRun(c.env.DB, c.req.param("id"));
  if (source instanceof Response) return source;
  const runner = runnerForRun(c.env, source);
  if (!runner || !source.input) return jsonError(c, 503, "runner_unavailable", "Requested Cloudflare Container runner is only available in the deployed Worker");
  if (!c.env.ARTIFACTS) return jsonError(c, 503, "snapshot_storage_unavailable", "ARTIFACTS binding is required for live run snapshots");
  const snapshot = await snapshotInContainer(runner, source.id);
  if (!snapshot.ok || !snapshot.snapshot?.bytes) return c.json(snapshot, 422);
  try {
    const sourceSnapshotKey = await storeSnapshot(c.env.ARTIFACTS, source.id, snapshot.snapshot.bytes);
    await updateLiveState(c.env.DB, source.id, "stopped", { snapshotKey: sourceSnapshotKey, stoppedAt: new Date().toISOString() });
    const childId = `run_${crypto.randomUUID()}`;
    const childSnapshotKey = await storeSnapshot(c.env.ARTIFACTS, childId, snapshot.snapshot.bytes);
    const childInput = { ...source.input, live: true, public: false };
    const initial = { ok: true, receipts: [], diff: "", live: { runId: childId }, forkedFrom: source.id };
    await recordRun(c.env.DB, { id: childId, input: childInput, result: initial, status: "restoring", forkedFrom: source.id, snapshotKey: childSnapshotKey });
    const restored = await restoreInContainer(runner, childId, { snapshot: { bytes: snapshot.snapshot.bytes } });
    if (!restored.ok) return c.json({ runId: childId, ...restored }, 422);
    await updateLiveState(c.env.DB, childId, "ready", { forkedFrom: source.id });
    return c.json({ ok: true, runId: childId, forkedFrom: source.id, status: "ready" }, 201);
  } catch (error) {
    return jsonError(c, 503, "snapshot_storage_unavailable", error instanceof Error ? error.message : String(error));
  }
});

api.all("/api/runs/:id/preview/*", async (c) => {
  const auth = authorize(c.req.raw, null, c.env);
  if (auth) return auth;
  const row = await requireRunnableLiveRun(c.env.DB, c.req.param("id"));
  if (row instanceof Response) return row;
  const runner = runnerForRun(c.env, row);
  if (!runner) return jsonError(c, 503, "runner_unavailable", "Requested Cloudflare Container runner is only available in the deployed Worker");
  const suffix = c.req.path.split(`/api/runs/${row.id}/preview/`)[1] ?? "";
  return previewInContainer(runner, row.id, c.req.raw, suffix);
});

api.all("*", (c) => jsonError(c, 404, "not_found", "unknown API route"));

function selectRunner(env: CloudboxBindings, input: Pick<ContainerRunRequest, "desktop"> | null | undefined): unknown {
  return input?.desktop === true ? env.CLOUDBOX_DESKTOP_RUNNER : env.CLOUDBOX_RUNNER;
}

function runnerForRun(env: CloudboxBindings, row: RunRecord): unknown {
  return selectRunner(env, row.input);
}

function authorize(request: Request, spec: ComputerSpec | null, env: CloudboxBindings): Response | null {
  if (isPublicDemoSpec(spec)) return null;
  const token = env.CLOUDBOX_API_TOKEN;
  if (!token) return null;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cloudbox-token");
  return got === token ? null : jsonErrorResponse(401, "unauthorized", "valid Cloudbox token required");
}

function authorizeAction(request: Request, action: string, env: CloudboxBindings): Response | null {
  if (request.headers.get("x-cloudbox-demo") === "1") return null;
  const token = env.CLOUDBOX_API_TOKEN;
  if (!token) return null;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cloudbox-token");
  return got === token ? null : jsonErrorResponse(401, "unauthorized", "valid Cloudbox token required");
}

function isPublicDemoSpec(spec: ComputerSpec | null): boolean {
  return !!spec?.name && spec.name === "agent-launch-readiness" && typeof spec.runId === "string" && spec.runId.startsWith("browser-");
}

function validateSpec(spec: ComputerSpec | null): Response | null {
  if (!spec || typeof spec !== "object") return jsonErrorResponse(400, "bad_spec", "expected a ComputerSpec body");
  if (!spec.profile || typeof spec.profile.role !== "string") return jsonErrorResponse(400, "bad_spec", "profile.role required");
  if (!Array.isArray(spec.filesystem)) return jsonErrorResponse(400, "bad_spec", "filesystem array required");
  if (!Array.isArray(spec.collaborators)) return jsonErrorResponse(400, "bad_spec", "collaborators array required");
  if (!Array.isArray(spec.objectives)) return jsonErrorResponse(400, "bad_spec", "objectives array required");
  if (!Array.isArray(spec.rubric)) return jsonErrorResponse(400, "bad_spec", "rubric array required");
  return null;
}

function isAllowedDemoRun(input: ContainerRunRequest | null): boolean {
  if (!input) return false;
  const commands = [...(input.commands ?? []), ...(input.verify ?? [])];
  if (commands.length > 4) return false;
  if (commands.some((cmd) => !/^(echo |test |pwd$|ls( |$)|node --version$|npm --version$|pnpm --version$|bun --version$)/.test(cmd))) return false;
  // Reject shell metacharacters that could chain into other commands. Demo runs
  // are sandboxed to a curated allow-list; block obvious injection attempts so
  // a permissive prefix like `echo ` cannot smuggle additional commands.
  // A single `echo ... > HANDOFF.md` is allowed so the hosted demo can create
  // the artifact it returns, but arbitrary redirection remains blocked.
  if (commands.some((cmd) => /[;&|`$\n\r\\]/.test(cmd))) return false;
  if (commands.some((cmd) => /[<>]/.test(cmd) && !/^echo [A-Za-z0-9 _.,:-]+ > HANDOFF\.md$/.test(cmd))) return false;
  return !!input.repo && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(input.repo);
}

function validateRun(input: ContainerRunRequest | null): Response | null {
  if (!input || typeof input !== "object") return jsonErrorResponse(400, "bad_run", "expected JSON body");
  if (!input.repo || typeof input.repo !== "string") return jsonErrorResponse(400, "bad_run", "repo is required");
  const isGithub = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(input.repo);
  const isGitlab = /^https:\/\/gitlab\.cfdata\.org\/[A-Za-z0-9_./-]+(?:\.git)?$/.test(input.repo);
  if (!isGithub && !(input.auth === "gitlab" && isGitlab)) return jsonErrorResponse(400, "bad_run", "repo must be a public GitHub URL or a gitlab.cfdata.org URL with auth=gitlab");
  if (input.auth !== undefined && input.auth !== "none" && input.auth !== "gitlab") return jsonErrorResponse(400, "bad_run", "auth must be none or gitlab");
  if (input.clone !== undefined && input.clone !== "shallow" && input.clone !== "blobless") return jsonErrorResponse(400, "bad_run", "clone must be shallow or blobless");
  if (input.sparse !== undefined && (!Array.isArray(input.sparse) || input.sparse.length > 64 || input.sparse.some((path) => typeof path !== "string" || !path || path.length > 240 || path.startsWith("/") || path.split("/").includes("..") || /[\n\r`$\\]/.test(path)))) return jsonErrorResponse(400, "bad_run", "sparse must be safe relative paths");
  if (input.ref !== undefined && (typeof input.ref !== "string" || input.ref.length > 120 || /[^A-Za-z0-9_./-]/.test(input.ref))) return jsonErrorResponse(400, "bad_run", "ref must be a short git ref");
  for (const key of ["commands", "verify"] as const) {
    const list = input[key];
    if (list !== undefined && !Array.isArray(list)) return jsonErrorResponse(400, "bad_run", `${key} must be an array`);
    if (list && list.length > 12) return jsonErrorResponse(400, "bad_run", `${key} has too many commands`);
    if (list?.some((cmd) => typeof cmd !== "string" || cmd.length > 1_000)) return jsonErrorResponse(400, "bad_run", `${key} contains an invalid command`);
  }
  if (!input.commands?.length && !input.verify?.length) return jsonErrorResponse(400, "bad_run", "at least one command or verify command is required");
  if (input.artifact !== undefined && (typeof input.artifact !== "string" || input.artifact.length > 240)) return jsonErrorResponse(400, "bad_run", "artifact must be a short relative path");
  if (input.public !== undefined && typeof input.public !== "boolean") return jsonErrorResponse(400, "bad_run", "public must be a boolean");
  if (input.live !== undefined && typeof input.live !== "boolean") return jsonErrorResponse(400, "bad_run", "live must be a boolean");
  if (input.desktop !== undefined && typeof input.desktop !== "boolean") return jsonErrorResponse(400, "bad_run", "desktop must be a boolean");
  if (input.desktop === true && input.live !== true) return jsonErrorResponse(400, "bad_run", "desktop requires live=true");
  if (input.ttlSeconds !== undefined && (!Number.isInteger(input.ttlSeconds) || (input.ttlSeconds as number) < 60 || (input.ttlSeconds as number) > 2_592_000)) return jsonErrorResponse(400, "bad_run", "ttlSeconds must be an integer between 60 and 2592000");
  if (input.ttlSeconds !== undefined && input.live !== true) return jsonErrorResponse(400, "bad_run", "ttlSeconds requires live=true");
  return null;
}

type RunRecord = {
  id: string;
  createdAt: string;
  repo: string;
  status: string;
  artifact: string | null;
  isPublic: boolean;
  input: ContainerRunRequest | null;
  result: unknown;
  snapshotKey?: string | null;
  forkedFrom?: string | null;
  expiresAt?: string | null;
};

async function ensureRunsTable(db?: D1Database): Promise<void> {
  if (!db) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    repo TEXT NOT NULL,
    status TEXT NOT NULL,
    artifact TEXT,
    result TEXT NOT NULL
  )`).run();
  const columns = await db.prepare("PRAGMA table_info(runs)").all<{ name: string }>();
  const names = new Set((columns.results ?? []).map((column) => column.name));
  if (!names.has("repo")) await db.prepare("ALTER TABLE runs ADD COLUMN repo TEXT NOT NULL DEFAULT ''").run();
  if (!names.has("status")) await db.prepare("ALTER TABLE runs ADD COLUMN status TEXT NOT NULL DEFAULT 'unknown'").run();
  if (!names.has("artifact")) await db.prepare("ALTER TABLE runs ADD COLUMN artifact TEXT").run();
  if (!names.has("result")) await db.prepare("ALTER TABLE runs ADD COLUMN result TEXT NOT NULL DEFAULT '{}'").run();
  if (!names.has("input")) await db.prepare("ALTER TABLE runs ADD COLUMN input TEXT").run();
  if (!names.has("is_public")) await db.prepare("ALTER TABLE runs ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0").run();
  if (!names.has("snapshot_key")) await db.prepare("ALTER TABLE runs ADD COLUMN snapshot_key TEXT").run();
  if (!names.has("forked_from")) await db.prepare("ALTER TABLE runs ADD COLUMN forked_from TEXT").run();
  if (!names.has("expires_at")) await db.prepare("ALTER TABLE runs ADD COLUMN expires_at TEXT").run();
}

async function recordRun(db: D1Database | undefined, row: { id: string; input: ContainerRunRequest | null; result: unknown; status: string; snapshotKey?: string | null; forkedFrom?: string | null }): Promise<void> {
  if (!db || !row.input) return;
  await ensureRunsTable(db);
  const artifact = typeof row.input.artifact === "string" ? row.input.artifact : null;
  const isPublic = row.input.public === true ? 1 : 0;
  const now = new Date().toISOString();
  const expiresAt = row.input.live === true
    ? new Date(Date.now() + (row.input.ttlSeconds ?? 3_600) * 1000).toISOString()
    : null;
  if (typeof (db as any).batch === "function") {
    await db.prepare("INSERT OR IGNORE INTO computers (id, name, persona, mode, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("api", "API runs", "cloudbox", "container", "{}", now)
      .run();
  }
  await db.prepare("INSERT OR REPLACE INTO runs (id, computer_id, mode, created_at, updated_at, repo, status, artifact, result, input, is_public, snapshot_key, forked_from, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(
      row.id,
      "api",
      "container",
      now,
      now,
      row.input.repo,
      row.status,
      artifact,
      JSON.stringify(row.result).slice(0, 200_000),
      JSON.stringify(row.input).slice(0, 20_000),
      isPublic,
      row.snapshotKey ?? null,
      row.forkedFrom ?? null,
      expiresAt,
    )
    .run();
}

async function listRuns(db?: D1Database): Promise<Pick<RunRecord, "id" | "createdAt" | "repo" | "status" | "artifact">[]> {
  if (!db) return [];
  await ensureRunsTable(db);
  const result = await db.prepare("SELECT id, created_at as createdAt, repo, status, artifact FROM runs WHERE id != 'api' ORDER BY created_at DESC LIMIT 20").all<any>();
  return (result.results ?? []) as any;
}

async function getRun(db: D1Database | undefined, id: string): Promise<RunRecord | null> {
  if (!db) return null;
  await ensureRunsTable(db);
  const row = await db.prepare("SELECT id, created_at as createdAt, repo, status, artifact, result, input, is_public as isPublic, snapshot_key as snapshotKey, forked_from as forkedFrom, expires_at as expiresAt FROM runs WHERE id = ?").bind(id).first<any>();
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.createdAt,
    repo: row.repo,
    status: row.status,
    artifact: row.artifact,
    isPublic: row.isPublic === 1 || row.isPublic === true,
    input: row.input ? (safeParse(row.input) as ContainerRunRequest | null) : null,
    result: safeParse(row.result),
    snapshotKey: row.snapshotKey ?? null,
    forkedFrom: row.forkedFrom ?? null,
    expiresAt: row.expiresAt ?? null,
  };
}

async function updateLiveState(db: D1Database | undefined, id: string, status: string, changes: { snapshotKey?: string; forkedFrom?: string; stoppedAt?: string; resumedAt?: string; deletedAt?: string } = {}): Promise<void> {
  if (!db) return;
  await ensureRunsTable(db);
  const row = await getRun(db, id);
  if (!row) return;
  const result = { ...(typeof row.result === "object" && row.result ? row.result as Record<string, unknown> : {}), lifecycle: { status, ...changes } };
  await db.prepare("UPDATE runs SET status = ?, updated_at = ?, result = ?, snapshot_key = COALESCE(?, snapshot_key), forked_from = COALESCE(?, forked_from) WHERE id = ?")
    .bind(status, new Date().toISOString(), JSON.stringify(result).slice(0, 200_000), changes.snapshotKey ?? null, changes.forkedFrom ?? null, id)
    .run();
}

async function storeSnapshot(bucket: R2Bucket | undefined, runId: string, bytes: string): Promise<string> {
  if (!bucket) throw new Error("ARTIFACTS binding is required for live run snapshots");
  const key = `snapshots/${runId}/${crypto.randomUUID()}.tar.gz`;
  await bucket.put(key, Uint8Array.from(atob(bytes), (character) => character.charCodeAt(0)), {
    httpMetadata: { contentType: "application/gzip" },
    customMetadata: { runId, createdAt: new Date().toISOString() },
  });
  return key;
}

async function loadSnapshot(bucket: R2Bucket | undefined, key: string): Promise<string | null> {
  if (!bucket) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function requireLiveRun(db: D1Database | undefined, id: string): Promise<RunRecord | Response> {
  const row = await getRun(db, id);
  if (!row) return jsonErrorResponse(404, "run_not_found", "run not found");
  if (row.input?.live !== true) return jsonErrorResponse(409, "run_not_live", "run was not created with live: true");
  if (row.expiresAt && Date.parse(row.expiresAt) <= Date.now() && row.status !== "deleted") return jsonErrorResponse(410, "run_expired", "live run TTL has expired");
  return row;
}

async function requireRunnableLiveRun(db: D1Database | undefined, id: string): Promise<RunRecord | Response> {
  const row = await requireLiveRun(db, id);
  if (row instanceof Response) return row;
  if (["stopped", "deleted"].includes(row.status)) return jsonErrorResponse(409, "run_not_running", `live run is ${row.status}`);
  return row;
}

function isSafeRelativePath(path: unknown): path is string {
  return typeof path === "string"
    && path.length > 0
    && path.length <= 240
    && !path.startsWith("/")
    && !path.includes("\0")
    && !path.split("/").includes("..")
    && !/[\n\r`$\\]/.test(path);
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function jsonError(c: any, status: number, code: string, detail: string): Response {
  return c.json({ error: code, detail }, status);
}

function jsonErrorResponse(status: number, code: string, detail: string): Response {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
