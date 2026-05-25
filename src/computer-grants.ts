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

export class D1ComputerGrantStore implements ComputerGrantStore {
  constructor(private readonly db: D1Database) {}

  private async ensureSchema(): Promise<void> {
    await this.db.prepare(`CREATE TABLE IF NOT EXISTS computer_repo_grants (
      owner_id TEXT NOT NULL,
      computer_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      repo_key TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (owner_id, computer_id, kind, repo_key)
    )`).run();
  }

  async grant(ownerId: string, computerId: string, kind: RepoGrantKind, repoKey: string, ttlMs = DEFAULT_REPO_GRANT_TTL_MS): Promise<ComputerRepoGrant> {
    await this.ensureSchema();
    const now = Date.now();
    const record = { ownerId: normalize(ownerId), computerId: normalize(computerId), kind, repoKey: normalize(repoKey), grantedAt: now, expiresAt: now + ttlMs };
    await this.db.prepare(`INSERT INTO computer_repo_grants (owner_id, computer_id, kind, repo_key, granted_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, computer_id, kind, repo_key) DO UPDATE SET granted_at = excluded.granted_at, expires_at = excluded.expires_at`)
      .bind(record.ownerId, record.computerId, record.kind, record.repoKey, record.grantedAt, record.expiresAt).run();
    return record;
  }

  async revoke(ownerId: string, computerId: string, repoKey: string): Promise<void> {
    await this.ensureSchema();
    await this.db.prepare("DELETE FROM computer_repo_grants WHERE owner_id = ? AND computer_id = ? AND repo_key = ?")
      .bind(normalize(ownerId), normalize(computerId), normalize(repoKey)).run();
  }

  async has(ownerId: string, computerId: string, kind: RepoGrantKind, repoKey: string): Promise<boolean> {
    await this.ensureSchema();
    const allowedKinds = kind === "git_repo_read" ? ["git_repo_read", "git_repo_write"] : ["git_repo_write"];
    const row = await this.db.prepare(`SELECT kind FROM computer_repo_grants
      WHERE owner_id = ? AND computer_id = ? AND repo_key = ? AND kind IN (?, ?) AND expires_at > ? LIMIT 1`)
      .bind(normalize(ownerId), normalize(computerId), normalize(repoKey), allowedKinds[0], allowedKinds[1] ?? allowedKinds[0], Date.now()).first();
    return !!row;
  }

  async list(ownerId: string, computerId: string): Promise<ComputerRepoGrant[]> {
    await this.ensureSchema();
    const result = await this.db.prepare(`SELECT owner_id as ownerId, computer_id as computerId, kind, repo_key as repoKey, granted_at as grantedAt, expires_at as expiresAt
      FROM computer_repo_grants WHERE owner_id = ? AND computer_id = ? AND expires_at > ? ORDER BY granted_at DESC`)
      .bind(normalize(ownerId), normalize(computerId), Date.now()).all<ComputerRepoGrant>();
    return result.results ?? [];
  }
}

/** Small deterministic store retained for unit tests and dependency injection. */
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
