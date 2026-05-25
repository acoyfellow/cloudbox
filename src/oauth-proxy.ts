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

export type OAuthFlowStore = {
  put(state: string, ownerId: string, ttlSeconds?: number): Promise<void>;
  consume(state: string): Promise<string | null>;
};

export class KvOAuthFlowStore implements OAuthFlowStore {
  constructor(private readonly kv: KVNamespace) {}
  async put(state: string, ownerId: string, ttlSeconds = 600): Promise<void> {
    await this.kv.put(`oauth-flow:${state}`, ownerId.toLowerCase(), { expirationTtl: ttlSeconds });
  }
  async consume(state: string): Promise<string | null> {
    const key = `oauth-flow:${state}`;
    const ownerId = await this.kv.get(key);
    if (ownerId) await this.kv.delete(key);
    return ownerId;
  }
}

export class MemoryOAuthFlowStore implements OAuthFlowStore {
  private readonly states = new Map<string, string>();
  async put(state: string, ownerId: string): Promise<void> { this.states.set(state, ownerId.toLowerCase()); }
  async consume(state: string): Promise<string | null> {
    const ownerId = this.states.get(state) ?? null;
    this.states.delete(state);
    return ownerId;
  }
}

export function findGitLabApplication(apps: OAuthApplication[]): OAuthApplication | null {
  return apps.find((app) => app.hostname === "gitlab-access.cfdata.org" || app.hostAliases?.includes("gitlab.cfdata.org")) ?? null;
}
