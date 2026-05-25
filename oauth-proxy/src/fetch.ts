import type { Env } from "./env";
import { resolveHeaders, type OAuthApplicationDef } from "./applications";

const GIT_PROTO_PATH = /(\/info\/refs|\/git-(upload|receive)-pack|\/HEAD|\/objects\/)/;
const GIT_PATH_SUFFIX = /\/(info\/refs|HEAD|git-upload-pack|git-receive-pack|objects\/.*)$/;

export async function makeAuthenticatedRequest(
	token: string,
	appDef: OAuthApplicationDef,
	request: Request,
	env: Env | null,
): Promise<Response> {
	const headers = new Headers(request.headers);
	const url = new URL(request.url);

	const isGitProto =
		GIT_PROTO_PATH.test(url.pathname) ||
		url.searchParams.get("service")?.startsWith("git-") === true;

	if (isGitProto) {
		headers.set("Authorization", `Basic ${btoa(`oauth2:${token}`)}`);
	} else {
		headers.set("Authorization", `Bearer ${token}`);
	}

	if (env) {
		const extra = resolveHeaders(appDef, env);
		for (const [k, v] of Object.entries(extra)) headers.set(k, v);
	}

	if (url.hostname !== appDef.hostname) {
		url.hostname = appDef.hostname;
	}

	if (isGitProto) {
		const m = url.pathname.match(GIT_PATH_SUFFIX);
		if (m && !url.pathname.includes(".git/")) {
			const idx = url.pathname.indexOf(m[0]);
			url.pathname = url.pathname.slice(0, idx) + ".git" + m[0];
		}
	}

	return fetch(
		new Request(url.toString(), {
			method: request.method,
			headers,
			body: request.body,
			redirect: "manual",
		}),
	);
}

export function hasBearerError(response: Response, errorCode: string): boolean {
	const wwwAuth = response.headers.get("WWW-Authenticate");
	if (!wwwAuth) return false;
	if (!/^Bearer\b/i.test(wwwAuth)) return false;
	const m = /\berror="([^"]*)"/.exec(wwwAuth);
	return m?.[1] === errorCode;
}

export function tokenCacheKey(userKey: string, appId: string): string {
	return `oauth:${userKey}:${appId}`;
}
