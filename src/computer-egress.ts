import { classifyGitLabSmartHttp, normalizeGitLabSmartHttpRequest, type RepoGrantKind } from "./gitlab-egress.ts";

type OutboundHandlerContext<Params> = { params?: Params };
type OutboundHandler<Env, Params> = (request: Request, env: Env, ctx: OutboundHandlerContext<Params>) => Promise<Response> | Response;

export type ComputerEgressParams = {
  ownerId: string;
  computerId: string;
};

export type ComputerEgressEnv = {
  // Future binding to a Cloudbox-owned/extracted OAuth broker. Never expose
  // the token itself; only authenticated forwarding is permitted.
  OAUTH_PROXY?: {
    oauthFetch(userId: string, appId: string, request: Request): Promise<Response>;
  };
  GITLAB_OAUTH_APP_ID?: string;
  // Future grant authority backed by owner/computer/repo state.
  authorizeComputerRepo?: (ownerId: string, computerId: string, kind: RepoGrantKind, repoKey: string) => Promise<boolean>;
};

/**
 * Fail-closed first egress handler shape. It proves classifier/broker boundaries
 * but intentionally cannot permit GitLab traffic until grant authority and the
 * OAuth forwarding binding are explicitly supplied.
 */
export const computerEgressHandler: OutboundHandler<ComputerEgressEnv, ComputerEgressParams> = async (
  request: Request,
  env: ComputerEgressEnv,
  ctx: OutboundHandlerContext<ComputerEgressParams>,
): Promise<Response> => {
  const url = new URL(request.url);
  if (url.hostname !== "gitlab.cfdata.org" && url.hostname !== "gitlab-access.cfdata.org") return fetch(request);
  const decision = classifyGitLabSmartHttp({ method: request.method, host: url.hostname, path: url.pathname, query: url.search.slice(1) });
  if (!decision.repoKey || !decision.grantKind || decision.decision === "deny") {
    return new Response(`GitLab transport denied: ${decision.reason ?? "unsupported_request"}`, { status: 403 });
  }
  const params = ctx.params;
  if (!params?.ownerId || !params.computerId) return new Response("GitLab transport denied: missing computer identity", { status: 403 });
  const allowed = env.authorizeComputerRepo
    ? await env.authorizeComputerRepo(params.ownerId, params.computerId, decision.grantKind, decision.repoKey)
    : false;
  if (!allowed) return new Response(`GitLab transport grant required: ${decision.grantKind}:${decision.repoKey}`, { status: 403 });
  if (!env.OAUTH_PROXY || !env.GITLAB_OAUTH_APP_ID) return new Response("GitLab OAuth broker unavailable", { status: 503 });
  return env.OAUTH_PROXY.oauthFetch(params.ownerId, env.GITLAB_OAUTH_APP_ID, normalizeGitLabSmartHttpRequest(request));
};
