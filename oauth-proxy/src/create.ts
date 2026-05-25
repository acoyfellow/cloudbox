/**
 * Factory: createOAuthProxy(applications) → { OAuthClientManager, appIds, byId, byName }
 *
 * Usage:
 * ```typescript
 * import { createOAuthProxy, envGetter } from "@cloudflare/oauth-proxy";
 * export { OAuthClient } from "@cloudflare/oauth-proxy";
 *
 * const proxy = createOAuthProxy([
 *   { id: "83c74e08-...", name: "GitLab", ... } as const,
 * ] as const);
 *
 * export const { appIds } = proxy;
 * // appIds.GitLab → "83c74e08-..."  (typed — TS knows the literal keys)
 *
 * export default proxy.OAuthClientManager;
 * ```
 */

import { buildRegistry, _setRegistry, type OAuthApplicationDef } from "./applications";
import { OAuthClientManager } from "./worker-entrypoint";

// Re-export utilities for consumers
export { envGetter, createEnvGetter } from "./applications";
export { OAuthClient } from "./durable-objects/oauth-client";
export type { OAuthApplicationDef, PublicApplicationInfo, HeaderValue } from "./applications";
export type { OAuthClientManager } from "./worker-entrypoint";
export type { RpcResult, SerializedRegistration } from "./types";

/**
 * Configure the OAuth proxy.
 * Must be called exactly once at module scope.
 *
 * Pass `as const` on the applications array for fully typed maps:
 * ```typescript
 * const proxy = createOAuthProxy([...] as const);
 * proxy.appIds.GitLab  // ← typed, autocompletes
 * ```
 */
export function createOAuthProxy<const T extends readonly OAuthApplicationDef[]>(applications: T) {
	const registry = buildRegistry(applications);
	_setRegistry(registry);

	return {
		/** WorkerEntrypoint class — use as `export default` */
		OAuthClientManager,
		/** Map of app name → app UUID (typed with literal keys) */
		appIds: registry.appIds,
		/** Map of app ID → app definition */
		byId: registry.byId,
		/** Map of app name → app definition */
		byName: registry.byName,
	};
}
