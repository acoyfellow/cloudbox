// Extends auto-generated Cloudflare.Env (from worker-configuration.d.ts)
// with secrets and vars not defined in wrangler.jsonc.
import type { OAuthClient } from "./durable-objects/oauth-client";

export interface Env extends Record<string, unknown> {
	// Secrets
	OAUTH_CLIENT: DurableObjectNamespace<OAuthClient>;
	TOKEN_CACHE: KVNamespace;
	REDIRECT_BASE_URL: string;
	GITLAB_CFDATA_CLIENT_ID: string;
	MASTER_KEY: string;

	// OAuth application vars/secrets (per-provider, accessed via envGetter)
	GITLAB_CFDATA_CLIENT_SECRET: string;
	GITLAB_CFDATA_CF_ACCESS_CLIENT_ID: string;
	GITLAB_CFDATA_CF_ACCESS_CLIENT_SECRET: string;
}
