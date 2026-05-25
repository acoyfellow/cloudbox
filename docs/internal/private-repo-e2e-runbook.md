# Private GitLab repository E2E runbook

Date: 2026-05-25
Target repository approved for initial test: `https://gitlab.cfdata.org/cloudflare/ai-agents/cloudflare-agent.git`

## Goal

Prove the complete Cloudbox Computer workflow with a real internal repository:

```txt
GitLab OAuth connect → ArtifactFS exact-path mount → edit/commit locally
→ explicit publication approval → brokered push → brokered MR creation
```

## Deployment resources

Alchemy provisions:

```txt
Cloudbox main Worker
cloudbox-oauth-proxy Worker (RPC only; no public URL)
CloudboxSandbox Computer container (ArtifactFS + FUSE)
OAUTH_CLIENT Durable Object
cloudbox-oauth-token-cache KV
cloudbox-oauth-flow-state KV
D1 computer_repo_grants storage
```

## Required configuration

Set deployment values/secrets without committing them:

```txt
OAUTH_PROXY_MASTER_KEY
GITLAB_CFDATA_CLIENT_ID
GITLAB_CFDATA_CLIENT_SECRET
GITLAB_CFDATA_CF_ACCESS_CLIENT_ID
GITLAB_CFDATA_CF_ACCESS_CLIENT_SECRET
GITLAB_OAUTH_APP_ID
CLOUDBOX_INTERNAL_TOKEN
CLOUDBOX_PUBLISH_APPROVAL_TOKEN
```

Register this callback on the Cloudbox-owned GitLab OAuth application:

```txt
https://cloudbox.coey.dev/api/personal-computers/oauth/gitlab/callback
```

## Run

```bash
CLOUDBOX_E2E_URL=https://cloudbox.coey.dev \
CLOUDBOX_E2E_OWNER='<verified owner id>' \
CLOUDBOX_INTERNAL_TOKEN='<internal delegation token>' \
CLOUDBOX_PUBLISH_APPROVAL_TOKEN='<explicit operator approval token>' \
CLOUDBOX_E2E_GITLAB_REPO='https://gitlab.cfdata.org/cloudflare/ai-agents/cloudflare-agent.git' \
bun run e2e:private-repo
```

If the script prints a GitLab authorization URL, open it, complete OAuth, and rerun the command.

## Publication safety

The ordinary repository grant endpoint can create only read authority. Publishing a branch requires the separate approval route and explicit approval token. The E2E script uses that operator-only approval ceremony because its purpose is to prove publication end-to-end.

The generated branch name defaults to:

```txt
cloudbox/e2e-<timestamp>
```

and the MR makes one harmless marker edit in `README.md`.

## Post-run audit

Confirm:

```txt
- mounted repository path is exactly /home/user/src/e2e-project (or requested path)
- git remote -v contains no credential material
- env output contains no GitLab/Access secrets
- /home/user contains no credential file introduced by the workflow
- pushed branch exists in cloudflare-agent
- MR URL/IID are returned
- MR can be closed and branch removed after review
```
