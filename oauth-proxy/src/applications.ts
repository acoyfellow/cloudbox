/**
 * OAuth application definitions and registry.
 * Applications are configured at instantiation time via createOAuthProxy().
 */
import type { Env } from "./env";

// ─── Env Getter ──────────────────────────────────────────────

/**
 * Create a typed env getter factory for a specific Env type.
 * Call once with your Env type, then use the returned function
 * to create getters that are compile-time checked against it.
 */
export function createEnvGetter<E>() {
	return <K extends keyof E & string>(key: K): ((env: E) => string) => {
		return (env: E) => {
			const value = env[key];
			if (typeof value !== "string" || !value) {
				throw new Error(`Missing or invalid Env binding: ${key}`);
			}
			return value as string;
		};
	};
}

/** Shorthand envGetter for the global Env type */
export const envGetter = createEnvGetter<Env>();

// ─── Application Definition ──────────────────────────────────

/** A header value — either a static string or an env getter */
export type HeaderValue<E> = string | ((env: E) => string);

export interface OAuthApplicationDef<E = Env> {
	/** Stable UUID identifier — referenced by registrations in DO storage */
	readonly id: string;
	/** Unique human-readable name (e.g., "GitLab", "GitHub") */
	readonly name: string;
	/** Provider hostname used for token endpoint and proxy requests (e.g., "gitlab-access.cfdata.org") */
	readonly hostname: string;
	/** Optional separate hostname for the browser-facing authorization endpoint. Falls back to hostname. */
	readonly authorizeHostname?: string;
	/** Additional hostnames that should be treated as aliases for this provider (e.g., canonical domain that differs from the CF Access domain). */
	readonly hostAliases?: readonly string[];
	/** Path for authorization endpoint */
	readonly authorizePath: string;
	/** Path for token endpoint */
	readonly tokenPath: string;
	/** Redirect URI for OAuth callback */
	readonly redirectUri: string | ((env: E) => string);
	/** Scopes to request during authorization */
	readonly scopes: readonly string[];
	/** Getter for the OAuth client ID (resolved from Env at runtime) */
	readonly clientId: (env: E) => string;
	/** Getter for the OAuth client secret (resolved from Env at runtime) */
	readonly clientSecret: (env: E) => string;
	/**
	 * Extra headers included on ALL requests to this provider.
	 * Static strings for non-secrets, env getters for secrets.
	 */
	readonly headers?: Readonly<Record<string, HeaderValue<E>>>;
}

/** Resolve all header values for an application. */
export function resolveHeaders<E>(app: OAuthApplicationDef<E>, env: E): Record<string, string> {
	const resolved: Record<string, string> = {};
	if (!app.headers) return resolved;
	for (const [name, value] of Object.entries(app.headers)) {
		resolved[name] = typeof value === "function" ? value(env) : value;
	}
	return resolved;
}

export function resolveRedirectUri<E = Env>(app: OAuthApplicationDef<E>, env: E): string {
	return typeof app.redirectUri === "function" ? app.redirectUri(env) : app.redirectUri;
}

/** Get the full token endpoint URL for an application. */
export function tokenEndpoint(app: OAuthApplicationDef): string {
	return `https://${app.hostname}${app.tokenPath}`;
}

/** Get the full authorization endpoint URL for an application. */
export function authorizationEndpoint(app: OAuthApplicationDef): string {
	return `https://${app.authorizeHostname ?? app.hostname}${app.authorizePath}`;
}

/** Public application info — safe to expose to frontends */
export interface PublicApplicationInfo {
	readonly id: string;
	readonly name: string;
	readonly hostname: string;
	readonly hostAliases?: readonly string[];
}

// ─── Application Registry ────────────────────────────────────

/**
 * Build typed lookup maps from an application definitions tuple.
 *
 * Given: `[{ id: "abc", name: "GitLab", ... }, { id: "def", name: "GitHub", ... }]`
 * Returns: `{ byId: { abc: appDef, def: appDef }, byName: { GitLab: appDef, GitHub: appDef } }`
 *
 * Both maps are typed — keys are the literal string union from the input.
 */
export type AppById<T extends readonly OAuthApplicationDef[]> = {
	[A in T[number] as A["id"]]: A;
};

export type AppByName<T extends readonly OAuthApplicationDef[]> = {
	[A in T[number] as A["name"]]: A;
};

export type AppIds<T extends readonly OAuthApplicationDef[]> = {
	[A in T[number] as A["name"]]: A["id"];
};

export function buildRegistry<const T extends readonly OAuthApplicationDef[]>(applications: T) {
	// Validate uniqueness
	const ids = new Set<string>();
	const names = new Set<string>();
	for (const app of applications) {
		if (ids.has(app.id)) throw new Error(`Duplicate application id: ${app.id}`);
		if (names.has(app.name)) throw new Error(`Duplicate application name: ${app.name}`);
		ids.add(app.id);
		names.add(app.name);
	}

	const byId = Object.fromEntries(applications.map((app) => [app.id, app])) as AppById<T>;

	const byName = Object.fromEntries(applications.map((app) => [app.name, app])) as AppByName<T>;

	const appIds = Object.fromEntries(applications.map((app) => [app.name, app.id])) as AppIds<T>;

	const allIds = applications.map((app) => app.id);

	const listPublic = (): PublicApplicationInfo[] =>
		applications.map((app) => ({
			id: app.id,
			name: app.name,
			hostname: app.hostname,
			...(app.hostAliases?.length ? { hostAliases: app.hostAliases } : {}),
		}));

	/** Look up an app by ID (for dynamic/runtime lookups from SQLite etc.) */
	const get = (appId: string): OAuthApplicationDef | undefined =>
		(byId as Record<string, OAuthApplicationDef>)[appId];

	return { byId, byName, appIds, allIds, get, listPublic };
}

export type Registry = ReturnType<typeof buildRegistry>;

// ─── Global Registry (set once by createOAuthProxy) ──────────

let _registry: Registry | null = null;

export function _setRegistry(registry: Registry): void {
	if (_registry)
		throw new Error("OAuth proxy already configured. createOAuthProxy() can only be called once.");
	_registry = registry;
}

export function getRegistry(): Registry {
	if (!_registry) throw new Error("OAuth proxy not configured. Call createOAuthProxy() first.");
	return _registry;
}
