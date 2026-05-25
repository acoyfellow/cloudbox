import { z } from "zod";
import { TaggedError } from "better-result";
import { getRegistry } from "./applications";

// ─── Tagged Errors ───────────────────────────────────────────

export class NotFoundError extends TaggedError("NotFound")<{
	message: string;
}>() {}

export class ValidationError extends TaggedError("Validation")<{
	message: string;
	issues: z.ZodIssue[];
}>() {}

export class UnknownAppError extends TaggedError("UnknownApp")<{
	message: string;
	appId: string;
}>() {}

export class InvalidStateError extends TaggedError("InvalidState")<{
	message: string;
}>() {}

export class AuthFailedError extends TaggedError("AuthFailed")<{
	message: string;
}>() {}

// ─── Zod Schemas ─────────────────────────────────────────────

/** Schema for starting an auth flow.
 *  Validates appId as a UUID that exists in the configured registry. */
export const StartAuthInputSchema = z.object({
	appId: z
		.string()
		.uuid("appId must be a valid UUID")
		.refine((id) => getRegistry().allIds.includes(id), {
			message: "Unknown application ID",
		}),
});

/** Schema for completing an auth flow (callback) */
export const CompleteAuthInputSchema = z.object({
	code: z.string().min(1, "Authorization code must not be empty"),
	state: z.string().min(1, "State must not be empty"),
});

// ─── Types derived from schemas ──────────────────────────────

export type StartAuthInput = z.infer<typeof StartAuthInputSchema>;
export type CompleteAuthInput = z.infer<typeof CompleteAuthInputSchema>;

// ─── Refresh Status ──────────────────────────────────────────

export const REFRESH_STATUSES = ["active", "failing", "needs_reauth", "app_removed"] as const;
export type RefreshStatus = (typeof REFRESH_STATUSES)[number];

// ─── Domain Types ────────────────────────────────────────────

/** Registration metadata returned to callers — enriched with app def info */
export interface RegistrationMetadata {
	appId: string;
	appName: string;
	hostname: string;
	hasAccessToken: boolean;
	accessTokenExpiresAt: Date | null;
	refreshAt: Date | null;
	refreshStatus: RefreshStatus;
	refreshFailures: number;
	hardDeleteAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Stored registration in SQLite — just tokens + refresh state */
export interface StoredRegistration {
	appId: string;
	encryptedRefreshToken: string;
	encryptedAccessToken: string | null;
	accessTokenExpiresAt: Date | null;
	refreshAt: Date | null;
	refreshStatus: RefreshStatus;
	refreshFailures: number;
	hardDeleteAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Shape of a row in the SQLite oauth_registrations table */
export type RegistrationRow = {
	[key: string]: string | number | null;
	app_id: string;
	encrypted_refresh_token: string;
	encrypted_access_token: string | null;
	access_token_expires_at: string | null;
	refresh_at: string | null;
	refresh_status: string;
	refresh_failures: number;
	hard_delete_at: string | null;
	created_at: string;
	updated_at: string;
};

/** Shape of a row in the pending_auths table */
export type PendingAuthRow = {
	[key: string]: string | null;
	state: string;
	app_id: string;
	encrypted_code_verifier: string;
	created_at: string;
};

// ─── DO Response Schemas (Zod — validated before returning) ──

const DOErrorSchema = z.object({
	tag: z.string(),
	message: z.string(),
});

/** Schema for TokenResult — returned by getValidAccessToken */
export const TokenResultSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), token: z.string() }),
	z.object({ ok: z.literal(false), error: DOErrorSchema }),
]);

/** Schema for StartAuthResult — returned by startAuth */
export const StartAuthResultSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		authorizationUrl: z.string().url(),
		state: z.string(),
	}),
	z.object({ ok: z.literal(false), error: DOErrorSchema }),
]);

const RegistrationMetadataSchema = z.object({
	appId: z.string(),
	appName: z.string(),
	hostname: z.string(),
	hasAccessToken: z.boolean(),
	accessTokenExpiresAt: z.date().nullable(),
	refreshAt: z.date().nullable(),
	refreshStatus: z.enum(REFRESH_STATUSES),
	refreshFailures: z.number().int().nonnegative(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

/** Schema for CompleteAuthResult — returned by completeAuth */
export const CompleteAuthResultSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), registration: RegistrationMetadataSchema }),
	z.object({ ok: z.literal(false), error: DOErrorSchema }),
]);

// ─── KV Pending Ops ──────────────────────────────────────────

/** Shape of a row in the pending_kv_ops table */
export type PendingKvOpRow = {
	[key: string]: string | number | null;
	id: number;
	op: string;
	cache_key: string;
	value: string | null;
	expiration_ttl: number | null;
	attempts: number;
	next_retry_at: string;
	created_at: string;
};

// ─── RPC Response Types ──────────────────────────────────────

export type RpcResult<T, E extends string = never> =
	| { ok: true; data: T }
	| { ok: false; error: { tag: E | "Unknown"; message: string } };

export async function rpcCatchAll<T, E extends string>(
	fn: () => Promise<RpcResult<T, E>>,
): Promise<RpcResult<T, E>> {
	try {
		return await fn();
	} catch (err) {
		const message = err instanceof Error ? err.message : "An unexpected error occurred";
		return { ok: false, error: { tag: "Unknown" as E | "Unknown", message } };
	}
}

// ─── RPC Serialization ──────────────────────────────────────

export function serializeRegistration(meta: RegistrationMetadata) {
	return {
		appId: meta.appId,
		appName: meta.appName,
		hostname: meta.hostname,
		hasAccessToken: meta.hasAccessToken,
		accessTokenExpiresAt: meta.accessTokenExpiresAt?.toISOString() ?? null,
		refreshAt: meta.refreshAt?.toISOString() ?? null,
		refreshStatus: meta.refreshStatus,
		refreshFailures: meta.refreshFailures,
		hardDeleteAt: meta.hardDeleteAt?.toISOString() ?? null,
		createdAt: meta.createdAt.toISOString(),
		updatedAt: meta.updatedAt.toISOString(),
	};
}

export type SerializedRegistration = ReturnType<typeof serializeRegistration>;
