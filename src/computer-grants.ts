import type { RepoGrantKind } from "./gitlab-egress.ts";

export const DEFAULT_REPO_GRANT_TTL_MS = 24 * 60 * 60 * 1000;

export type ComputerRepoGrant = {
  ownerId: string;
  computerId: string;
  kind: RepoGrantKind;
  repoKey: string;
  grantedAt: number;
  expiresAt: number;
};

export type ComputerGrantStore = {
  grant(ownerId: string, computerId: string, kind: RepoGrantKind, repoKey: string, ttlMs?: number): Promise<ComputerRepoGrant>;
  revoke(ownerId: string, computerId: string, repoKey: string): Promise<void>;
  has(ownerId: string, computerId: string, kind: RepoGrantKind, repoKey: string): Promise<boolean>;
  list(ownerId: string, computerId: string): Promise<ComputerRepoGrant[]>;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function key(ownerId: string, computerId: string, kind: RepoGrantKind, repoKey: string): string {
  return [normalize(ownerId), normalize(computerId), kind, normalize(repoKey)].join("\0");
}

/** Small initial store for tests and a narrow internal proof. Durable storage
 * is wired separately once identity/delegation and the broker service are set. */
export class MemoryComputerGrantStore implements ComputerGrantStore {
  private readonly records = new Map<string, ComputerRepoGrant>();

  async grant(ownerId: string, computerId: string, kind: RepoGrantKind, repoKey: string, ttlMs = DEFAULT_REPO_GRANT_TTL_MS): Promise<ComputerRepoGrant> {
    const now = Date.now();
    const record = { ownerId: normalize(ownerId), computerId: normalize(computerId), kind, repoKey: normalize(repoKey), grantedAt: now, expiresAt: now + ttlMs };
    this.records.set(key(ownerId, computerId, kind, repoKey), record);
    return record;
  }

  async revoke(ownerId: string, computerId: string, repoKey: string): Promise<void> {
    this.records.delete(key(ownerId, computerId, "git_repo_read", repoKey));
    this.records.delete(key(ownerId, computerId, "git_repo_write", repoKey));
  }

  async has(ownerId: string, computerId: string, kind: RepoGrantKind, repoKey: string): Promise<boolean> {
    // As in Seal: write grants imply read; read grants never imply write.
    const candidates = kind === "git_repo_read" ? ["git_repo_read", "git_repo_write"] as const : ["git_repo_write"] as const;
    const now = Date.now();
    for (const candidate of candidates) {
      const record = this.records.get(key(ownerId, computerId, candidate, repoKey));
      if (record && record.expiresAt > now) return true;
      if (record && record.expiresAt <= now) this.records.delete(key(ownerId, computerId, candidate, repoKey));
    }
    return false;
  }

  async list(ownerId: string, computerId: string): Promise<ComputerRepoGrant[]> {
    const owner = normalize(ownerId);
    const computer = normalize(computerId);
    const now = Date.now();
    return [...this.records.values()].filter((record) => record.ownerId === owner && record.computerId === computer && record.expiresAt > now);
  }
}
