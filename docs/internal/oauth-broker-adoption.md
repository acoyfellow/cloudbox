# OAuth broker adoption for private GitLab computers

Date: 2026-05-25
Status: implementation planning boundary

## Existing internal service inspected

Seal binds an OAuth broker service from its Worker configuration:

```jsonc
{ "binding": "OAUTH_PROXY", "service": "oauth-proxy" }
```

Production variants bind service-specific deployments such as `seal-agent-oauth-proxy`.

Relevant implementation:

```txt
../cto-agent-research/apps/oauth-proxy/src/index.ts
../cto-agent-research/apps/oauth-proxy/src/worker-entrypoint.ts
../cto-agent-research/apps/oauth-proxy/src/fetch.ts
../cto-agent-research/apps/oauth-proxy/wrangler.jsonc
```

RPC surface required by Cloudbox:

```ts
listAvailableApplications(): PublicApplicationInfo[]
startAuth(userId, { appId }): RpcResult<{ authorizationUrl; state }>
completeAuth(userId, { appId, code, state }): RpcResult<Registration>
listApplications(userId): RpcResult<Registration[]>
oauthFetch(userId, appId, request): Response
```

For Git smart HTTP, `oauthFetch` is the important operation: it injects OAuth2 Git authentication and Cloudflare Access headers without returning reusable credentials to the Sandbox.

## Do not bind Seal production identity implicitly

Even if account/service-binding topology allows Cloudbox to call an existing deployed `oauth-proxy`, Cloudbox should not silently depend on Seal's production broker or OAuth application:

- OAuth redirect base URLs are configured for Seal surfaces.
- Token ownership/lifecycle/data deletion responsibilities would become unclear.
- Cloudbox is a separately deployable product and needs a clear user/security boundary.

## Recommended path

Extract or reuse the oauth-proxy implementation as a Cloudbox-owned broker deployment/configuration, preserving the implementation contract rather than sharing Seal's product instance.

Cloudbox should bind:

```txt
OAUTH_PROXY        service binding to Cloudbox-owned oauth-proxy
GITLAB_OAUTH_APP_ID public configured application id
```

The broker owns:

- GitLab OAuth application/client configuration;
- encrypted per-user access and refresh tokens;
- CF Access service-token headers;
- token refresh and reauthorization state;
- authenticated request forwarding.

Cloudbox owns:

- verified user identity and delegation;
- Computer identity;
- repository grant records (`git_repo_read`, `git_repo_write`);
- Sandbox egress handler and audit records;
- ArtifactFS/Git operation initiation.

## Host-only HTTPS interception dependency

Direct inspection found that Seal's `interceptHttpsByHost = true` behavior is not presently a stock Cloudbox dependency capability: Seal carries `cto-agent-research/patches/@cloudflare__containers@0.3.3.patch`, which adds host-only HTTPS interception and forwards `waitUntil` in outbound handler context. Stock `@cloudflare/containers@0.3.4`, pulled through `@cloudflare/sandbox@0.10.1`, exposes `interceptHttps` and host mappings but not that host-only HTTPS switch in its public type/runtime surface.

Cloudbox deliberately carries the minimal Seal-derived patch as `patches/@cloudflare__containers@0.3.4-host-https.patch`, configured via `pnpm.patchedDependencies`. This provides host-only HTTPS interception for the configured GitLab host mappings without enabling global HTTPS MITM on the personal computer. The patch should be removed when an upstream release ships equivalent behavior.

## Internal connection-route scaffold

Cloudbox now has a bounded route shape for a future Cloudbox-owned broker binding:

```txt
GET    /api/personal-computers/:owner/integrations/gitlab
POST   /api/personal-computers/:owner/integrations/gitlab/connect
POST   /api/personal-computers/:owner/integrations/gitlab/complete
DELETE /api/personal-computers/:owner/integrations/gitlab
```

These routes remain internal-delegation-only and operate exclusively through an injected `OAUTH_PROXY` RPC contract. They return connection state/authorization URL only, never access or refresh tokens. No live transport is enabled by these endpoints.

## Safe incremental implementation

The initial egress code in Cloudbox must remain fail-closed until all of these exist:

1. trusted Computer owner identity;
2. repo grant authority;
3. OAuth broker service binding;
4. configured GitLab OAuth application id;
5. Sandbox outbound handler registration.

Do not reintroduce container environment tokens as a temporary shortcut.
