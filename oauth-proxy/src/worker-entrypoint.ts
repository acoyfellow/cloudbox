/**
 * OAuthClientManager WorkerEntrypoint.
 * Thin RPC wrapper that routes to per-user OAuthClient DOs.
 * Includes KV edge-caching for fast token reads.
 */

import type { Env } from "./env";
import { WorkerEntrypoint } from "cloudflare:workers";
import { Hono } from "hono";
import { decrypt } from "./crypto/encryption";
import { makeAuthenticatedRequest, hasBearerError, tokenCacheKey } from "./fetch";
import { withRetry } from "./retry";
import { getRegistry, resolveHeaders, type PublicApplicationInfo } from "./applications";
import {
	StartAuthInputSchema,
	CompleteAuthInputSchema,
	serializeRegistration,
	rpcCatchAll,
	type RpcResult,
	type SerializedRegistration,
} from "./types";

export class OAuthClientManager extends WorkerEntrypoint<Env> {
	// ─── Authenticated Fetch (KV fast-path) ────────────────────

	/**
	 * Consumer-facing authenticated fetch. Checks KV cache at the edge
	 * first, falls through to the DO on miss or stale token.
	 *
	 * @param userId - User identifier
	 * @param appId - Application ID (UUID from createOAuthProxy config)
	 * @param request - The request to proxy with auth injected
	 */
	async oauthFetch(userId: string, appId: string, request: Request): Promise<Response> {
		const appDef = getRegistry().get(appId);
		if (!appDef) {
			return new Response(
				JSON.stringify({ error: "UnknownApp", message: `Unknown application: ${appId}` }),
				{ status: 404, headers: { "Content-Type": "application/json" } },
			);
		}

		const doId = this.env.OAUTH_CLIENT.idFromName(userId);
		const cacheKey = tokenCacheKey(doId.toString(), appId);

		const cachedBlob = await kvGetSafe(this.env.TOKEN_CACHE, cacheKey);

		if (cachedBlob) {
			const decryptResult = await withRetry(
				async () => decrypt(this.env.MASTER_KEY, doId.toString(), cachedBlob),
				{ attempts: 1, timeoutMs: 5_000 },
			);

			if (decryptResult.isOk()) {
				const response = await makeAuthenticatedRequest(
					decryptResult.value,
					appDef,
					request,
					this.env,
				);

				if (response.status === 401 && hasBearerError(response, "invalid_token")) {
					await kvDeleteSafe(this.env.TOKEN_CACHE, cacheKey);
				} else {
					return response;
				}
			}
		}

		// Resolve extra headers (e.g. CF-Access) here in the WorkerEntrypoint where
		// env bindings are synchronous. The DO receives a plain Request with headers
		// already injected — it must not call resolveHeaders(appDef, env) itself.
		const extraHeaders = resolveHeaders(appDef, this.env);
		const reqWithHeaders = new Request(request, {
			headers: (() => {
				const h = new Headers(request.headers);
				for (const [k, v] of Object.entries(extraHeaders)) h.set(k, v);
				return h;
			})(),
		});

		const stub = this.getClientStub(userId);
		return stub.authenticatedFetch(appDef, reqWithHeaders);
	}

	// ─── Auth Flow ─────────────────────────────────────────────

	async startAuth(
		userId: string,
		raw: unknown,
	): Promise<RpcResult<{ authorizationUrl: string; state: string }, "Validation" | "UnknownApp">> {
		return rpcCatchAll(async () => {
			const parsed = StartAuthInputSchema.safeParse(raw);
			if (!parsed.success) {
				return {
					ok: false as const,
					error: {
						tag: "Validation" as const,
						message: parsed.error.issues.map((i) => i.message).join("; "),
					},
				};
			}

			const stub = this.getClientStub(userId);
			const result = await stub.startAuth(parsed.data.appId);
			if (!result.ok) {
				return { ok: false as const, error: result.error };
			}
			return {
				ok: true as const,
				data: {
					authorizationUrl: result.authorizationUrl,
					state: result.state,
				},
			};
		});
	}

	async completeAuth(
		userId: string,
		raw: unknown,
	): Promise<
		RpcResult<SerializedRegistration, "Validation" | "InvalidState" | "AuthFailed" | "UnknownApp">
	> {
		return rpcCatchAll(async () => {
			const parsed = CompleteAuthInputSchema.safeParse(raw);
			if (!parsed.success) {
				return {
					ok: false as const,
					error: {
						tag: "Validation" as const,
						message: parsed.error.issues.map((i) => i.message).join("; "),
					},
				};
			}

			const stub = this.getClientStub(userId);
			const result = await stub.completeAuth(parsed.data.code, parsed.data.state);
			if (!result.ok) {
				return { ok: false as const, error: result.error };
			}
			return {
				ok: true as const,
				data: serializeRegistration(result.registration),
			};
		});
	}

	// ─── Discovery ──────────────────────────────────────────────

	listAvailableApplications(): PublicApplicationInfo[] {
		return getRegistry().listPublic();
	}

	// ─── Management ────────────────────────────────────────────

	async listApplications(userId: string): Promise<RpcResult<SerializedRegistration[]>> {
		return rpcCatchAll(async () => {
			const stub = this.getClientStub(userId);
			const registrations = await stub.listRegistrations();
			return {
				ok: true as const,
				data: registrations.map(serializeRegistration),
			};
		});
	}

	async deleteApplication(userId: string, appId: string): Promise<RpcResult<void, "NotFound">> {
		return rpcCatchAll(async () => {
			const stub = this.getClientStub(userId);
			const existed = await stub.removeRegistration(appId);
			if (!existed) {
				return {
					ok: false as const,
					error: {
						tag: "NotFound" as const,
						message: `Registration for ${appId} not found`,
					},
				};
			}
			return { ok: true as const, data: undefined };
		});
	}

	async deleteUser(userId: string): Promise<RpcResult<{ deletedRegistrations: number }>> {
		return rpcCatchAll(async () => {
			const stub = this.getClientStub(userId);
			const result = await stub.destroyAll();
			return { ok: true as const, data: result };
		});
	}

	async undeleteUser(userId: string): Promise<RpcResult<{ restoredRegistrations: number }>> {
		return rpcCatchAll(async () => {
			const stub = this.getClientStub(userId);
			const result = await stub.undeleteAll();
			return { ok: true as const, data: result };
		});
	}

	async isUserDeleted(userId: string): Promise<RpcResult<{ deleted: boolean }>> {
		return rpcCatchAll(async () => {
			const stub = this.getClientStub(userId);
			const deleted = await stub.isDeleted();
			return { ok: true as const, data: { deleted } };
		});
	}

	// ─── HTTP Interface (Testing/Debug) ────────────────────────

	override async fetch(request: Request): Promise<Response> {
		return createHttpApp(this).fetch(request);
	}

	// ─── Private ───────────────────────────────────────────────

	private getClientStub(userId: string) {
		const id = this.env.OAUTH_CLIENT.idFromName(userId);
		return this.env.OAUTH_CLIENT.get(id);
	}
}

// ─── KV helpers (never throw) ────────────────────────────────

async function kvGetSafe(kv: KVNamespace, key: string): Promise<string | null> {
	try {
		return await kv.get(key);
	} catch (err) {
		console.warn("[oauth-client-manager] kvGet failed", {
			key,
			error: err instanceof Error ? err.message : String(err),
		});
		return null;
	}
}

async function kvDeleteSafe(kv: KVNamespace, key: string): Promise<void> {
	try {
		await kv.delete(key);
	} catch (err) {
		console.warn("[oauth-client-manager] kvDelete failed", {
			key,
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

// ─── Hono HTTP Layer ─────────────────────────────────────────

function createHttpApp(worker: OAuthClientManager): Hono {
	const app = new Hono();

	app.get("/health", (c) => c.json({ status: "ok" }));

	app.get("/applications", (c) => {
		return c.json(worker.listAvailableApplications());
	});

	app.post("/users/:userId/auth/start", async (c) => {
		const userId = c.req.param("userId");
		const body = await c.req.json();
		const result = await worker.startAuth(userId, body);
		if (!result.ok) {
			const status = result.error.tag === "Validation" ? 400 : 404;
			return c.json(result.error, status);
		}
		return c.json(result.data);
	});

	app.post("/users/:userId/auth/complete", async (c) => {
		const userId = c.req.param("userId");
		const body = await c.req.json();
		const result = await worker.completeAuth(userId, body);
		if (!result.ok) {
			if (result.error.tag === "Validation" || result.error.tag === "InvalidState")
				return c.json(result.error, 400);
			if (result.error.tag === "UnknownApp") return c.json(result.error, 404);
			if (result.error.tag === "AuthFailed") return c.json(result.error, 502);
			return c.json(result.error, 500);
		}
		return c.json(result.data, 201);
	});

	app.get("/users/:userId/applications", async (c) => {
		const userId = c.req.param("userId");
		const result = await worker.listApplications(userId);
		if (!result.ok) return c.json(result.error, 500);
		return c.json(result.data);
	});

	app.delete("/users/:userId/applications/:appId", async (c) => {
		const userId = c.req.param("userId");
		const appId = c.req.param("appId");
		const result = await worker.deleteApplication(userId, appId);
		if (!result.ok) {
			const status = result.error.tag === "NotFound" ? 404 : 500;
			return c.json(result.error, status);
		}
		return c.body(null, 204);
	});

	app.delete("/users/:userId", async (c) => {
		const userId = c.req.param("userId");
		const result = await worker.deleteUser(userId);
		if (!result.ok) return c.json(result.error, 500);
		return c.json(result.data);
	});

	app.post("/users/:userId/undelete", async (c) => {
		const userId = c.req.param("userId");
		const result = await worker.undeleteUser(userId);
		if (!result.ok) return c.json(result.error, 500);
		return c.json(result.data);
	});

	app.get("/users/:userId/deleted", async (c) => {
		const userId = c.req.param("userId");
		const result = await worker.isUserDeleted(userId);
		if (!result.ok) return c.json(result.error, 500);
		return c.json(result.data);
	});

	return app;
}
