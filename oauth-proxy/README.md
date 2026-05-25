# Cloudbox OAuth Proxy

Cloudbox-owned extraction of Seal's proven per-user OAuth broker for authenticated GitLab Git transport.

This Worker is RPC/service-binding only:

```text
workers_dev = false
preview_urls = false
```

It stores encrypted per-user GitLab OAuth registrations outside the Sandbox Computer and provides authenticated forwarding through `oauthFetch(...)`. For Git smart HTTP requests, the shared implementation applies OAuth2 Git authentication without returning the token to the computer.

## Required setup before deployment

Create and set:

```text
TOKEN_CACHE KV namespace id in wrangler.jsonc
MASTER_KEY                         secret, random encryption master key
GITLAB_CFDATA_CLIENT_ID            GitLab OAuth application id
GITLAB_CFDATA_CLIENT_SECRET        GitLab OAuth application secret
GITLAB_CFDATA_CF_ACCESS_CLIENT_ID  CF Access service-token client id
GITLAB_CFDATA_CF_ACCESS_CLIENT_SECRET CF Access service-token secret
```

Configure the GitLab OAuth application redirect URI as:

```text
https://cloudbox.coey.dev/api/personal-computers/oauth/gitlab/callback
```

## Caller binding

After deploying as `cloudbox-oauth-proxy`, bind it to Cloudbox as:

```jsonc
{ "binding": "OAUTH_PROXY", "service": "cloudbox-oauth-proxy" }
```

or through Alchemy by setting:

```text
CLOUDBOX_OAUTH_PROXY_SERVICE=cloudbox-oauth-proxy
GITLAB_OAUTH_APP_ID=83c74e08-aaa7-45ec-a68e-36ba3d707057
```

## Boundary

Do not expose this worker publicly and do not return token values through Cloudbox APIs. The Sandbox receives only normal Git responses produced after the trusted Cloudbox grant/egress path authorizes the operation.
