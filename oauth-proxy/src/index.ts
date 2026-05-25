/**
 * Consumer entry point.
 */

import { createOAuthProxy, envGetter } from "./create";
import type { Env } from "./env";

// OAuthClientDO: renamed export for SQLite migration (wrangler can't convert existing class)
export { OAuthClient as OAuthClientDO } from "./durable-objects/oauth-client";
export { OAuthClient } from "./durable-objects/oauth-client";

const proxy = createOAuthProxy([
	{
		id: "83c74e08-aaa7-45ec-a68e-36ba3d707057",
		name: "GitLab (cfdata)",
		hostname: "gitlab-access.cfdata.org",
		authorizeHostname: "gitlab.cfdata.org",
		hostAliases: ["gitlab.cfdata.org"],
		authorizePath: "/oauth/authorize",
		tokenPath: "/oauth/token",
		redirectUri: (env: Env) => `${env.REDIRECT_BASE_URL}/api/personal-computers/oauth/gitlab/callback`,
		scopes: ["read_api", "read_user", "read_repository", "write_repository", "profile", "email"],
		clientId: envGetter("GITLAB_CFDATA_CLIENT_ID"),
		clientSecret: envGetter("GITLAB_CFDATA_CLIENT_SECRET"),
		headers: {
			"CF-Access-Client-Id": envGetter("GITLAB_CFDATA_CF_ACCESS_CLIENT_ID"),
			"CF-Access-Client-Secret": envGetter("GITLAB_CFDATA_CF_ACCESS_CLIENT_SECRET"),
		},
	},
] as const);

// Typed app ID map — consumers import this
// proxy.appIds["GitLab (cfdata)"] → "83c74e08-..."
export const appIds = proxy.appIds;

export default proxy.OAuthClientManager;
