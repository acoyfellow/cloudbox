export type OAuthError = { tag?: string; message?: string };
export type OAuthResult<T> = { ok: true; data: T } | { ok: false; error?: OAuthError };

export type OAuthApplication = {
  id: string;
  name?: string;
  label?: string;
  hostname?: string;
  hostAliases?: string[];
};

export type OAuthConnection = Record<string, unknown>;

export interface OAuthProxyBinding {
  listAvailableApplications(): Promise<OAuthApplication[]> | OAuthApplication[];
  startAuth(userId: string, raw: { appId: string }): Promise<OAuthResult<{ authorizationUrl: string; state: string }>>;
  completeAuth(userId: string, raw: { code: string; state: string }): Promise<OAuthResult<OAuthConnection>>;
  deleteApplication(userId: string, appId: string): Promise<OAuthResult<void>>;
  listApplications(userId: string): Promise<OAuthResult<OAuthConnection[]>>;
  oauthFetch(userId: string, appId: string, request: Request): Promise<Response>;
}

export function findGitLabApplication(apps: OAuthApplication[]): OAuthApplication | null {
  return apps.find((app) => app.hostname === "gitlab-access.cfdata.org" || app.hostAliases?.includes("gitlab.cfdata.org")) ?? null;
}
