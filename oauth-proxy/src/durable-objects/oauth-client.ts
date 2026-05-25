import type { Env } from "../env";
import { DurableObject } from "cloudflare:workers";
import * as oauth from "oauth4webapi";
import { encrypt, decrypt } from "../crypto/encryption";
import {
	getRegistry,
	resolveHeaders,
	resolveRedirectUri,
	tokenEndpoint,
	authorizationEndpoint,
	type OAuthApplicationDef,
} from "../applications";
import { makeAuthenticatedRequest, hasBearerError, tokenCacheKey } from "../fetch";
import type { z } from "zod";
import { withRetry } from "../retry";
import {
	TokenResultSchema,
	StartAuthResultSchema,
	CompleteAuthResultSchema,
	type RegistrationRow,
	type PendingAuthRow,
	type PendingKvOpRow,
	type StoredRegistration,
	type RegistrationMetadata,
	type RefreshStatus,
} from "../types";

// ─── DO Result types (plain, survive structured clone) ───────

export type TokenResult =
	| { ok: true; token: string }
	| {
			ok: false;
			error: {
				tag: "NoMatchingSecret" | "RefreshFailed" | "NeedsReauth" | "AppRemoved";
				message: string;
			};
	  };

export type StartAuthResult =
	| { ok: true; authorizationUrl: string; state: string }
	| { ok: false; error: { tag: "UnknownApp"; message: string } };

export type CompleteAuthResult =
	| { ok: true; registration: RegistrationMetadata }
	| {
			ok: false;
			error: {
				tag: "InvalidState" | "AuthFailed" | "UnknownApp";
				message: string;
			};
	  };

// ─── Refresh internals ──────────────────────────────────────

type RefreshOutcome =
	| { status: "success"; token: string }
	| { status: "retryable"; message: string }
	| { status: "terminal"; message: string };

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const BACKOFF_CAP_MS = 5 * 60 * 1000;
const BACKOFF_BASE_MS = 1000;
const MAX_KV_RETRY_ATTEMPTS = 10;
/** Hard-delete retention: 30.5 days ± 0.5 days (always ≥ 30 days) */
function softDeleteRetentionMs(): number {
	const baseDays = 30.5;
	const jitterDays = Math.random() - 0.5; // ±0.5 days
	return (baseDays + jitterDays) * 24 * 60 * 60 * 1000;
}
const TERMINAL_HTTP_CODES = new Set([401, 403]);
const TERMINAL_OAUTH_ERRORS = new Set(["invalid_grant", "invalid_client", "unauthorized_client"]);

function addJitter(ms: number): number {
	const jitter = ms * 0.25 * (Math.random() * 2 - 1);
	return Math.round((ms + jitter) / 1000) * 1000;
}

function backoffMs(failures: number): number {
	const base = Math.min(BACKOFF_BASE_MS * Math.pow(2, failures - 1), BACKOFF_CAP_MS);
	return Math.max(1000, addJitter(base));
}

function initialRefreshAt(expiresAt: Date | null | undefined): Date | null {
	if (!expiresAt) return new Date();
	const jitteredBuffer = addJitter(REFRESH_BUFFER_MS);
	return new Date(expiresAt.getTime() - jitteredBuffer);
}

/**
 * Validate a value against a Zod schema but preserve the original narrow type.
 * Zod's parse() widens literal types (e.g., "UnknownApp" → string).
 * This validates at runtime while keeping TypeScript's narrow inference.
 */
function validated<T>(schema: z.ZodTypeAny, value: T): T {
	schema.parse(value);
	return value;
}

function isExpired(expiresAt: Date | null): boolean {
	if (!expiresAt) return true;
	return expiresAt <= new Date();
}

function isTerminalOAuthError(err: unknown): boolean {
	if (err instanceof oauth.ResponseBodyError) {
		if (TERMINAL_HTTP_CODES.has(err.status)) return true;
		if (TERMINAL_OAUTH_ERRORS.has(err.error)) return true;
	}
	return false;
}

/** Calculate KV TTL in seconds: time until refresh_at, floored at 1s */
function kvTtlSeconds(refreshAt: Date | null): number | undefined {
	if (!refreshAt) return undefined;
	const ttl = Math.floor((refreshAt.getTime() - Date.now()) / 1000);
	return ttl > 0 ? ttl : 1;
}

// ─── DO Class ────────────────────────────────────────────────

/**
 * Per-user OAuth client backed by SQLite.
 * Manages OAuth registrations, token refresh, KV cache, and authenticated fetch.
 * Keyed by user email via idFromName(email).
 */
export class OAuthClient extends DurableObject<Env> {
	private sql: SqlStorage;
	private refreshInFlight = new Map<string, Promise<TokenResult>>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;

		this.sql.exec(`
      CREATE TABLE IF NOT EXISTS oauth_registrations (
        app_id TEXT PRIMARY KEY,
        encrypted_refresh_token TEXT NOT NULL,
        encrypted_access_token TEXT,
        access_token_expires_at TEXT,
        refresh_at TEXT,
        refresh_status TEXT NOT NULL DEFAULT 'active',
        refresh_failures INTEGER NOT NULL DEFAULT 0,
        hard_delete_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

		this.sql.exec(`
      CREATE TABLE IF NOT EXISTS pending_auths (
        state TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        encrypted_code_verifier TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

		this.sql.exec(`
      CREATE TABLE IF NOT EXISTS pending_kv_ops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        value TEXT,
        expiration_ttl INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_retry_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

		// Tombstone table for soft-deleted registrations (30-day retention)
		this.sql.exec(`
      CREATE TABLE IF NOT EXISTS soft_deleted_registrations (
        app_id TEXT PRIMARY KEY,
        encrypted_refresh_token TEXT NOT NULL,
        encrypted_access_token TEXT,
        access_token_expires_at TEXT,
        original_created_at TEXT NOT NULL,
        deleted_at TEXT NOT NULL,
        hard_delete_at TEXT NOT NULL
      )
    `);
	}

	// ─── Crypto helpers ────────────────────────────────────────

	private encrypt(plaintext: string): Promise<string> {
		return encrypt(this.env.MASTER_KEY, this.ctx.id.toString(), plaintext);
	}

	private decrypt(blob: string): Promise<string> {
		return decrypt(this.env.MASTER_KEY, this.ctx.id.toString(), blob);
	}

	// ─── Alarm: Proactive Token Refresh + KV Drain ─────────────

	override async alarm(): Promise<void> {
		const now = new Date();

		// 1. Process due token refreshes
		const registrations = this.listDueRegistrations(now);
		for (const reg of registrations) {
			const app = getRegistry().get(reg.appId);
			if (!app) continue;

			const outcome = await this.attemptRefresh(reg, app);

			switch (outcome.status) {
				case "success":
					break;
				case "retryable": {
					const newFailures = reg.refreshFailures + 1;
					const retryAt = new Date(now.getTime() + backoffMs(newFailures));
					this.sql.exec(
						`UPDATE oauth_registrations SET
               refresh_status = 'failing', refresh_failures = ?, refresh_at = ?, updated_at = ?
             WHERE app_id = ?`,
						newFailures,
						retryAt.toISOString(),
						now.toISOString(),
						reg.appId,
					);
					break;
				}
				case "terminal":
					this.sql.exec(
						`UPDATE oauth_registrations SET
               refresh_status = 'needs_reauth', refresh_at = NULL,
               refresh_failures = refresh_failures + 1, updated_at = ?
             WHERE app_id = ?`,
						now.toISOString(),
						reg.appId,
					);
					break;
			}
		}

		// 2. Reconcile registrations against the application registry
		const registry = getRegistry();

		// 2a. Recover: app_removed registrations whose app is back in the registry
		const removedRegs = this.sql
			.exec<{ app_id: string }>(
				"SELECT app_id FROM oauth_registrations WHERE refresh_status = 'app_removed'",
			)
			.toArray();
		for (const reg of removedRegs) {
			if (registry.get(reg.app_id)) {
				// App is back — restore to needs_reauth (tokens are likely expired)
				this.sql.exec(
					`UPDATE oauth_registrations SET
             refresh_status = 'needs_reauth', hard_delete_at = NULL, updated_at = ?
           WHERE app_id = ?`,
					now.toISOString(),
					reg.app_id,
				);
			}
		}

		// 2b. Orphan: active registrations whose app is no longer in the registry
		const activeRegs = this.sql
			.exec<{ app_id: string }>(
				"SELECT app_id FROM oauth_registrations WHERE refresh_status != 'app_removed'",
			)
			.toArray();
		const hardDeleteAt = new Date(now.getTime() + softDeleteRetentionMs());
		for (const reg of activeRegs) {
			if (!registry.get(reg.app_id)) {
				this.sql.exec(
					`UPDATE oauth_registrations SET
             refresh_status = 'app_removed', refresh_at = NULL,
             hard_delete_at = ?, updated_at = ?
           WHERE app_id = ?`,
					hardDeleteAt.toISOString(),
					now.toISOString(),
					reg.app_id,
				);
				await this.kvDelete(reg.app_id);
			}
		}

		// 3. Purge expired app_removed registrations (30-day retention)
		this.sql.exec(
			"DELETE FROM oauth_registrations WHERE refresh_status = 'app_removed' AND hard_delete_at <= ?",
			now.toISOString(),
		);

		// 4. Purge expired soft-deleted user registrations (30-day retention)
		this.sql.exec(
			"DELETE FROM soft_deleted_registrations WHERE hard_delete_at <= ?",
			now.toISOString(),
		);

		// 5. Drain pending KV ops
		await this.drainPendingKvOps(now);

		// 6. Reschedule
		await this.scheduleNextAlarm();
	}

	async getScheduledAlarm(): Promise<number | null> {
		return this.ctx.storage.getAlarm();
	}

	// ─── Auth Flow ─────────────────────────────────────────────

	async startAuth(appId: string): Promise<StartAuthResult> {
		const app = getRegistry().get(appId);
		if (!app) {
			return validated(StartAuthResultSchema, {
				ok: false,
				error: { tag: "UnknownApp", message: `Unknown application: ${appId}` },
			});
		}

		const codeVerifier = oauth.generateRandomCodeVerifier();
		const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
		const state = oauth.generateRandomState();

		const encCodeVerifier = await this.encrypt(codeVerifier);

		this.sql.exec(
			`INSERT OR REPLACE INTO pending_auths (state, app_id, encrypted_code_verifier, created_at)
       VALUES (?, ?, ?, ?)`,
			state,
			appId,
			encCodeVerifier,
			new Date().toISOString(),
		);

		const authUrl = new URL(authorizationEndpoint(app));
		authUrl.searchParams.set("client_id", app.clientId(this.env));
		authUrl.searchParams.set("redirect_uri", resolveRedirectUri(app, this.env));
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", app.scopes.join(" "));
		authUrl.searchParams.set("code_challenge", codeChallenge);
		authUrl.searchParams.set("code_challenge_method", "S256");
		authUrl.searchParams.set("state", state);

		return validated(StartAuthResultSchema, {
			ok: true,
			authorizationUrl: authUrl.toString(),
			state,
		});
	}

	async completeAuth(code: string, state: string): Promise<CompleteAuthResult> {
		const pendingRows = this.sql
			.exec<PendingAuthRow>("SELECT * FROM pending_auths WHERE state = ?", state)
			.toArray();

		const pending = pendingRows[0];
		if (!pending) {
			return validated(CompleteAuthResultSchema, {
				ok: false,
				error: {
					tag: "InvalidState",
					message: "Unknown or expired state parameter",
				},
			});
		}

		const app = getRegistry().get(pending.app_id);
		if (!app) {
			return validated(CompleteAuthResultSchema, {
				ok: false,
				error: {
					tag: "UnknownApp",
					message: `Unknown application: ${pending.app_id}`,
				},
			});
		}

		const codeVerifier = await this.decrypt(pending.encrypted_code_verifier);

		const as: oauth.AuthorizationServer = {
			issuer: `https://${app.hostname}`,
			token_endpoint: tokenEndpoint(app),
		};
		const client: oauth.Client = { client_id: app.clientId(this.env) };
		const clientAuth = oauth.ClientSecretPost(app.clientSecret(this.env));
		const extraHeaders = resolveHeaders(app, this.env);

		// Exchange code for tokens (with retry + timeout)
		const exchangeResult = await withRetry(
			async (signal) => {
				const redirectUri = resolveRedirectUri(app, this.env);
				const callbackUrl = new URL(redirectUri);
				callbackUrl.searchParams.set("code", code);
				callbackUrl.searchParams.set("state", state);
				const validatedParams = oauth.validateAuthResponse(as, client, callbackUrl, state);

				const response = await oauth.authorizationCodeGrantRequest(
					as,
					client,
					clientAuth,
					validatedParams,
					redirectUri,
					codeVerifier,
					{ headers: extraHeaders, signal: () => signal },
				);
				return oauth.processAuthorizationCodeResponse(as, client, response);
			},
			{ attempts: 3, timeoutMs: 15_000 },
		);

		if (exchangeResult.isErr()) {
			return validated(CompleteAuthResultSchema, {
				ok: false,
				error: {
					tag: "AuthFailed",
					message: exchangeResult.error.message,
				},
			});
		}

		const tokens = exchangeResult.value;

		const encRefreshToken = tokens.refresh_token ? await this.encrypt(tokens.refresh_token) : null;
		if (!encRefreshToken) {
			return validated(CompleteAuthResultSchema, {
				ok: false,
				error: {
					tag: "AuthFailed",
					message:
						"Provider did not return a refresh token. Ensure offline_access scope is requested.",
				},
			});
		}

		const encAccessToken = await this.encrypt(tokens.access_token);
		const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
		const refreshAt = initialRefreshAt(expiresAt);
		const now = new Date();

		this.sql.exec(
			`INSERT OR REPLACE INTO oauth_registrations
        (app_id, encrypted_refresh_token, encrypted_access_token, access_token_expires_at,
         refresh_at, refresh_status, refresh_failures, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
			app.id,
			encRefreshToken,
			encAccessToken,
			expiresAt?.toISOString() ?? null,
			refreshAt?.toISOString() ?? null,
			now.toISOString(),
			now.toISOString(),
		);

		this.sql.exec("DELETE FROM pending_auths WHERE state = ?", state);

		await this.scheduleNextAlarm();

		// KV write-through (best-effort)
		await this.kvPut(app.id, encAccessToken, kvTtlSeconds(refreshAt));

		const reg = this.getRegistration(app.id);
		if (!reg) {
			throw new Error(`Missing registration after completing auth for app ${app.id}`);
		}
		return validated(CompleteAuthResultSchema, {
			ok: true,
			registration: toMetadata(app, reg),
		});
	}

	// ─── Authenticated Fetch ───────────────────────────────────

	/**
	 * Make an authenticated request. Per RFC 6750, retries once on
	 * `invalid_token` after force-refreshing.
	 */
	async authenticatedFetch(appDef: OAuthApplicationDef, request: Request): Promise<Response> {
		const tokenResult = await this.getValidAccessToken(appDef);
		if (!tokenResult.ok) return this.tokenErrorResponse(tokenResult);

		const response = await makeAuthenticatedRequest(tokenResult.token, appDef, request, null);

		if (response.status === 401 && hasBearerError(response, "invalid_token")) {
			const refreshResult = await this.getValidAccessToken(appDef, true);
			if (!refreshResult.ok) return this.tokenErrorResponse(refreshResult);

			if (refreshResult.token !== tokenResult.token) {
				return makeAuthenticatedRequest(refreshResult.token, appDef, request, null);
			}
		}

		return response;
	}

	private tokenErrorResponse(result: TokenResult & { ok: false }): Response {
		const statusMap: Record<string, number> = {
			NoMatchingSecret: 403,
			NeedsReauth: 401,
			AppRemoved: 410, // Gone
			RefreshFailed: 502,
		};
		return jsonError(result.error.tag, result.error.message, statusMap[result.error.tag] ?? 500);
	}

	// ─── CRUD ──────────────────────────────────────────────────

	listRegistrations(): RegistrationMetadata[] {
		return this.sql
			.exec<RegistrationRow>("SELECT * FROM oauth_registrations ORDER BY created_at ASC")
			.toArray()
			.map((row) => {
				const app = getRegistry().get(row.app_id);
				return toMetadata(app, rowToRegistration(row));
			});
	}

	async removeRegistration(appId: string): Promise<boolean> {
		const existing = this.getRegistration(appId);
		if (!existing) return false;
		this.sql.exec("DELETE FROM oauth_registrations WHERE app_id = ?", appId);
		await this.scheduleNextAlarm();
		await this.kvDelete(appId);
		return true;
	}

	/**
	 * Soft-delete all registrations for this user.
	 *
	 * 1. Delete KV cache entries (with retry — must succeed)
	 * 2. Move registrations to soft_deleted_registrations (30-day retention)
	 * 3. Hard-delete pending auths and pending KV ops
	 * 4. Schedule alarm for hard-delete purge
	 *
	 * Registrations can be restored via undeleteAll() within 30 days.
	 */
	async destroyAll(): Promise<{ deletedRegistrations: number }> {
		const registrations = this.sql
			.exec<RegistrationRow>("SELECT * FROM oauth_registrations")
			.toArray();

		// 1. Delete KV entries with retry — must succeed before moving state
		for (const reg of registrations) {
			const cacheKey = tokenCacheKey(this.ctx.id.toString(), reg.app_id);
			const result = await withRetry(
				async () => {
					await this.env.TOKEN_CACHE.delete(cacheKey);
				},
				{ attempts: 3, timeoutMs: 5_000 },
			);
			if (result.isErr()) {
				throw new Error(
					`Failed to delete KV cache for app ${reg.app_id} after retries: ${result.error.message}`,
				);
			}
		}

		// 2. Drain pending KV ops (best-effort — TTL handles stragglers)
		const pendingOps = this.sql.exec<PendingKvOpRow>("SELECT * FROM pending_kv_ops").toArray();
		for (const op of pendingOps) {
			try {
				if (op.op === "put" && op.value) {
					await this.env.TOKEN_CACHE.put(op.cache_key, op.value, {
						expirationTtl: op.expiration_ttl ?? undefined,
					});
				} else if (op.op === "delete") {
					await this.env.TOKEN_CACHE.delete(op.cache_key);
				}
			} catch (err) {
				console.warn("[oauth-client] destroyAll pending KV op failed", {
					op: op.op,
					cacheKey: op.cache_key,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}

		// 3. Move registrations to soft-delete table
		const now = new Date();
		const hardDeleteAt = new Date(now.getTime() + softDeleteRetentionMs());
		for (const reg of registrations) {
			this.sql.exec(
				`INSERT OR REPLACE INTO soft_deleted_registrations
          (app_id, encrypted_refresh_token, encrypted_access_token,
           access_token_expires_at, original_created_at, deleted_at, hard_delete_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
				reg.app_id,
				reg.encrypted_refresh_token,
				reg.encrypted_access_token,
				reg.access_token_expires_at,
				reg.created_at,
				now.toISOString(),
				hardDeleteAt.toISOString(),
			);
		}

		const count = registrations.length;

		// 4. Clean active state
		this.sql.exec("DELETE FROM oauth_registrations");
		this.sql.exec("DELETE FROM pending_auths");
		this.sql.exec("DELETE FROM pending_kv_ops");

		// 5. Reschedule alarm (for hard-delete purge)
		await this.scheduleNextAlarm();

		return { deletedRegistrations: count };
	}

	/**
	 * Restore soft-deleted registrations. Tokens are almost certainly
	 * expired after deletion, so all restored registrations are marked
	 * needs_reauth — the user must re-authorize each app.
	 */
	async undeleteAll(): Promise<{ restoredRegistrations: number }> {
		const tombstones = this.sql
			.exec<{
				[key: string]: string | null;
				app_id: string;
				encrypted_refresh_token: string;
				encrypted_access_token: string | null;
				access_token_expires_at: string | null;
				original_created_at: string;
			}>("SELECT * FROM soft_deleted_registrations")
			.toArray();

		const now = new Date();
		for (const row of tombstones) {
			this.sql.exec(
				`INSERT OR IGNORE INTO oauth_registrations
          (app_id, encrypted_refresh_token, encrypted_access_token,
           access_token_expires_at, refresh_at, refresh_status, refresh_failures,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, 'needs_reauth', 0, ?, ?)`,
				row.app_id,
				row.encrypted_refresh_token,
				row.encrypted_access_token,
				row.access_token_expires_at,
				row.original_created_at,
				now.toISOString(),
			);
		}

		this.sql.exec("DELETE FROM soft_deleted_registrations");
		await this.scheduleNextAlarm();

		return { restoredRegistrations: tombstones.length };
	}

	/** Check if this user has been soft-deleted (has tombstoned registrations). */
	isDeleted(): boolean {
		const rows = this.sql
			.exec<{ count: number }>("SELECT COUNT(*) as count FROM soft_deleted_registrations")
			.toArray();
		return (rows[0]?.count ?? 0) > 0;
	}

	// ─── Token Access (with refresh + dedup) ───────────────────

	async getValidAccessToken(app: OAuthApplicationDef, forceRefresh = false): Promise<TokenResult> {
		const reg = this.getRegistration(app.id);
		if (!reg) {
			return validated(TokenResultSchema, {
				ok: false,
				error: {
					tag: "NoMatchingSecret",
					message: `No registration for application "${app.name}"`,
				},
			});
		}

		if (reg.refreshStatus === "needs_reauth") {
			return validated(TokenResultSchema, {
				ok: false,
				error: {
					tag: "NeedsReauth",
					message: `Application "${app.name}" requires re-authentication`,
				},
			});
		}

		if (reg.refreshStatus === "app_removed") {
			return validated(TokenResultSchema, {
				ok: false,
				error: {
					tag: "AppRemoved",
					message: `Application "${app.id}" has been removed and is pending deletion`,
				},
			});
		}

		if (!forceRefresh && reg.encryptedAccessToken && !isExpired(reg.accessTokenExpiresAt)) {
			const token = await this.decrypt(reg.encryptedAccessToken);
			return validated(TokenResultSchema, { ok: true, token });
		}

		const existing = this.refreshInFlight.get(app.id);
		if (existing) return existing;

		const promise = this.doRefreshForFetch(reg, app);
		this.refreshInFlight.set(app.id, promise);
		try {
			return await promise;
		} finally {
			this.refreshInFlight.delete(app.id);
		}
	}

	// ─── Private: Registration Access ──────────────────────────

	private getRegistration(appId: string): StoredRegistration | null {
		const rows = this.sql
			.exec<RegistrationRow>("SELECT * FROM oauth_registrations WHERE app_id = ?", appId)
			.toArray();
		const row = rows[0];
		return row ? rowToRegistration(row) : null;
	}

	// ─── Private: Token Refresh ────────────────────────────────

	private async attemptRefresh(
		reg: StoredRegistration,
		app: OAuthApplicationDef,
	): Promise<RefreshOutcome> {
		const refreshToken = await this.decrypt(reg.encryptedRefreshToken);

		const as: oauth.AuthorizationServer = {
			issuer: `https://${app.hostname}`,
			token_endpoint: tokenEndpoint(app),
		};
		const client: oauth.Client = { client_id: app.clientId(this.env) };
		const clientAuth = oauth.ClientSecretPost(app.clientSecret(this.env));
		const extraHeaders = resolveHeaders(app, this.env);

		// Refresh with retry + timeout
		const refreshResult = await withRetry(
			async (signal) => {
				const response = await oauth.refreshTokenGrantRequest(
					as,
					client,
					clientAuth,
					refreshToken,
					{
						additionalParameters: { redirect_uri: resolveRedirectUri(app, this.env) },
						headers: extraHeaders,
						signal: () => signal,
					},
				);
				return { response };
			},
			{ attempts: 3, timeoutMs: 15_000 },
		);

		if (refreshResult.isErr()) {
			return { status: "retryable", message: refreshResult.error.message };
		}

		const { response } = refreshResult.value;

		let tokens: oauth.TokenEndpointResponse;
		try {
			tokens = await oauth.processRefreshTokenResponse(as, client, response);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Token refresh failed";
			if (isTerminalOAuthError(err)) {
				return { status: "terminal", message };
			}
			return { status: "retryable", message };
		}

		await this.storeRefreshedTokens(reg, app, tokens);
		return { status: "success", token: tokens.access_token };
	}

	private async doRefreshForFetch(
		reg: StoredRegistration,
		app: OAuthApplicationDef,
	): Promise<TokenResult> {
		const outcome = await this.attemptRefresh(reg, app);
		const now = new Date();

		switch (outcome.status) {
			case "success":
				return validated(TokenResultSchema, { ok: true, token: outcome.token });
			case "terminal":
				this.sql.exec(
					`UPDATE oauth_registrations SET
             refresh_status = 'needs_reauth', refresh_at = NULL,
             refresh_failures = refresh_failures + 1, updated_at = ?
           WHERE app_id = ?`,
					now.toISOString(),
					reg.appId,
				);
				return validated(TokenResultSchema, {
					ok: false,
					error: { tag: "NeedsReauth", message: outcome.message },
				});
			case "retryable": {
				const newFailures = reg.refreshFailures + 1;
				const retryAt = new Date(now.getTime() + backoffMs(newFailures));
				this.sql.exec(
					`UPDATE oauth_registrations SET
             refresh_status = 'failing', refresh_failures = ?,
             refresh_at = ?, updated_at = ?
           WHERE app_id = ?`,
					newFailures,
					retryAt.toISOString(),
					now.toISOString(),
					reg.appId,
				);
				await this.scheduleNextAlarm();
				return validated(TokenResultSchema, {
					ok: false,
					error: { tag: "RefreshFailed", message: outcome.message },
				});
			}
		}
	}

	private async storeRefreshedTokens(
		reg: StoredRegistration,
		app: OAuthApplicationDef,
		tokens: oauth.TokenEndpointResponse,
	): Promise<void> {
		const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
		const refreshAt = initialRefreshAt(expiresAt);
		const encAccessToken = await this.encrypt(tokens.access_token);
		const now = new Date();

		const encRefreshToken = tokens.refresh_token
			? await this.encrypt(tokens.refresh_token)
			: reg.encryptedRefreshToken;

		this.sql.exec(
			`UPDATE oauth_registrations SET
         encrypted_access_token = ?, access_token_expires_at = ?,
         encrypted_refresh_token = ?, refresh_at = ?,
         refresh_status = 'active', refresh_failures = 0, updated_at = ?
       WHERE app_id = ?`,
			encAccessToken,
			expiresAt?.toISOString() ?? null,
			encRefreshToken,
			refreshAt?.toISOString() ?? null,
			now.toISOString(),
			reg.appId,
		);

		await this.scheduleNextAlarm();

		// KV write-through (best-effort)
		await this.kvPut(app.id, encAccessToken, kvTtlSeconds(refreshAt));
	}

	// ─── Private: KV Cache (best-effort, failures recorded) ────

	/**
	 * Write to KV cache. On failure, records in pending_kv_ops for retry.
	 * Never throws — KV failures must not block DO operations.
	 */
	private async kvPut(appId: string, encryptedBlob: string, ttlSeconds?: number): Promise<void> {
		const cacheKey = tokenCacheKey(this.ctx.id.toString(), appId);
		try {
			await this.env.TOKEN_CACHE.put(cacheKey, encryptedBlob, {
				expirationTtl: ttlSeconds,
			});
		} catch (err) {
			console.warn("[oauth-client] kvPut failed, queueing retry", {
				cacheKey,
				error: err instanceof Error ? err.message : String(err),
			});
			this.recordPendingKvOp("put", cacheKey, encryptedBlob, ttlSeconds);
		}
	}

	/**
	 * Delete from KV cache. On failure, records in pending_kv_ops for retry.
	 * Never throws.
	 */
	private async kvDelete(appId: string): Promise<void> {
		const cacheKey = tokenCacheKey(this.ctx.id.toString(), appId);
		try {
			await this.env.TOKEN_CACHE.delete(cacheKey);
		} catch (err) {
			console.warn("[oauth-client] kvDelete failed, queueing retry", {
				cacheKey,
				error: err instanceof Error ? err.message : String(err),
			});
			this.recordPendingKvOp("delete", cacheKey, null, null);
		}
	}

	private recordPendingKvOp(
		op: string,
		cacheKey: string,
		value: string | null,
		ttl: number | null | undefined,
	): void {
		const now = new Date();
		this.sql.exec(
			`INSERT INTO pending_kv_ops (op, cache_key, value, expiration_ttl, attempts, next_retry_at, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
			op,
			cacheKey,
			value,
			ttl ?? null,
			now.toISOString(),
			now.toISOString(),
		);
	}

	private async drainPendingKvOps(now: Date): Promise<void> {
		const ops = this.sql
			.exec<PendingKvOpRow>(
				`SELECT * FROM pending_kv_ops
         WHERE next_retry_at <= ?
         ORDER BY next_retry_at ASC`,
				now.toISOString(),
			)
			.toArray();

		for (const op of ops) {
			try {
				if (op.op === "put" && op.value) {
					await this.env.TOKEN_CACHE.put(op.cache_key, op.value, {
						expirationTtl: op.expiration_ttl ?? undefined,
					});
				} else if (op.op === "delete") {
					await this.env.TOKEN_CACHE.delete(op.cache_key);
				}
				// Success — remove the op
				this.sql.exec("DELETE FROM pending_kv_ops WHERE id = ?", op.id);
			} catch {
				const newAttempts = op.attempts + 1;
				if (newAttempts >= MAX_KV_RETRY_ATTEMPTS) {
					// Drop after max attempts — KV TTL will clean up naturally
					this.sql.exec("DELETE FROM pending_kv_ops WHERE id = ?", op.id);
				} else {
					const retryAt = new Date(now.getTime() + backoffMs(newAttempts));
					this.sql.exec(
						`UPDATE pending_kv_ops SET attempts = ?, next_retry_at = ? WHERE id = ?`,
						newAttempts,
						retryAt.toISOString(),
						op.id,
					);
				}
			}
		}
	}

	// ─── Private: Alarm Scheduling ─────────────────────────────

	private async scheduleNextAlarm(): Promise<void> {
		// Find the earliest of: next token refresh, next KV retry, or next hard-delete
		const refreshRow = this.sql
			.exec<{ earliest: string | null }>(
				`SELECT MIN(refresh_at) as earliest FROM oauth_registrations
         WHERE refresh_at IS NOT NULL AND refresh_status NOT IN ('needs_reauth', 'app_removed')`,
			)
			.toArray()[0];

		const kvRetryRow = this.sql
			.exec<{ earliest: string | null }>(
				`SELECT MIN(next_retry_at) as earliest FROM pending_kv_ops`,
			)
			.toArray()[0];

		// Hard-delete times: ensure the DO wakes up to purge tombstones
		// even if there's no other work (e.g., user fully soft-deleted).
		const softDeleteRow = this.sql
			.exec<{ earliest: string | null }>(
				`SELECT MIN(hard_delete_at) as earliest FROM soft_deleted_registrations`,
			)
			.toArray()[0];

		const appRemovedRow = this.sql
			.exec<{ earliest: string | null }>(
				`SELECT MIN(hard_delete_at) as earliest FROM oauth_registrations
         WHERE refresh_status = 'app_removed' AND hard_delete_at IS NOT NULL`,
			)
			.toArray()[0];

		const candidates: number[] = [];
		if (refreshRow?.earliest) candidates.push(new Date(refreshRow.earliest).getTime());
		if (kvRetryRow?.earliest) candidates.push(new Date(kvRetryRow.earliest).getTime());
		if (softDeleteRow?.earliest) candidates.push(new Date(softDeleteRow.earliest).getTime());
		if (appRemovedRow?.earliest) candidates.push(new Date(appRemovedRow.earliest).getTime());

		if (candidates.length === 0) {
			await this.ctx.storage.deleteAlarm();
			return;
		}

		const alarmTime = Math.max(Math.min(...candidates), Date.now() + 1000);
		await this.ctx.storage.setAlarm(alarmTime);
	}

	private listDueRegistrations(now: Date): StoredRegistration[] {
		return this.sql
			.exec<RegistrationRow>(
				`SELECT * FROM oauth_registrations
         WHERE refresh_at IS NOT NULL
           AND refresh_at <= ?
           AND refresh_status NOT IN ('needs_reauth', 'app_removed')
         ORDER BY refresh_at ASC`,
				now.toISOString(),
			)
			.toArray()
			.map(rowToRegistration);
	}
}

// ─── Helpers ─────────────────────────────────────────────────

function rowToRegistration(row: RegistrationRow): StoredRegistration {
	return {
		appId: row.app_id,
		encryptedRefreshToken: row.encrypted_refresh_token,
		encryptedAccessToken: row.encrypted_access_token,
		accessTokenExpiresAt: row.access_token_expires_at
			? new Date(row.access_token_expires_at)
			: null,
		refreshAt: row.refresh_at ? new Date(row.refresh_at) : null,
		refreshStatus: row.refresh_status as RefreshStatus,
		refreshFailures: row.refresh_failures,
		hardDeleteAt: row.hard_delete_at ? new Date(row.hard_delete_at) : null,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}

function toMetadata(
	app: OAuthApplicationDef | undefined,
	reg: StoredRegistration,
): RegistrationMetadata {
	return {
		appId: reg.appId,
		appName: app?.name ?? "unknown",
		hostname: app?.hostname ?? "unknown",
		hasAccessToken: reg.encryptedAccessToken !== null,
		accessTokenExpiresAt: reg.accessTokenExpiresAt,
		refreshAt: reg.refreshAt,
		refreshStatus: reg.refreshStatus,
		refreshFailures: reg.refreshFailures,
		hardDeleteAt: reg.hardDeleteAt,
		createdAt: reg.createdAt,
		updatedAt: reg.updatedAt,
	};
}

function jsonError(tag: string, message: string, status: number): Response {
	return new Response(JSON.stringify({ error: tag, message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}
