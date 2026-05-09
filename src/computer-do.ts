// Cloudbox — one Durable Object per materialized computer.
//
// The DO owns:
//   - The spec (immutable after init)
//   - The file index (path → metadata, R2 key for bytes)
//   - The receipt log (every protocol call, append-only)
//
// HTTP endpoints (all relative to the DO; routed by the Worker):
//   POST /init                  — receive spec, materialize files, idempotent
//   GET  /list                  — file index
//   GET  /read?path=…           — file bytes (or text)
//   POST /write                 — write/append a file; records receipt
//   POST /ask                   — message a collaborator; records receipt
//   POST /submit                — submit an objective decision; records receipt
//   GET  /grade                 — replay receipts against rubric
//   GET  /receipts              — receipt log (for inspector / debugging)
//   GET  /spec                  — the original spec (for the inspector)

import { DurableObject } from "cloudflare:workers";
import type { ComputerSpec, SpecFile } from "./spec.ts";

type InitBody = { id: string; spec: ComputerSpec };

type ReceiptKind =
  | "init"
  | "read"
  | "write"
  | "ask"
  | "submit"
  | "grade"
  | "reset";

type Receipt = {
  ts: number;
  kind: ReceiptKind;
  payload: Record<string, unknown>;
};

const MAX_SPEC_BYTES = 128_000;
const MAX_WRITE_BYTES = 64_000;
const MAX_FILES = 100;
const MAX_RECEIPTS_FOR_GRADE = 2_000;

export type ComputerDOEnv = {
  ARTIFACTS?: R2Bucket;
};

export class ComputerDO extends DurableObject<ComputerDOEnv> {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: ComputerDOEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    // Schema. CREATE IF NOT EXISTS — safe across restarts.
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS files (
        path        TEXT PRIMARY KEY,
        kind        TEXT NOT NULL,
        state       TEXT,
        description TEXT,
        timestamp   TEXT,
        depends_on  TEXT,        -- JSON array
        r2_key      TEXT,
        size_bytes  INTEGER
      );
      CREATE TABLE IF NOT EXISTS receipts (
        seq     INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      INTEGER NOT NULL,
        kind    TEXT NOT NULL,
        payload TEXT NOT NULL    -- JSON
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      switch (`${request.method} ${url.pathname}`) {
        case "POST /init":
          return await this.init(await request.json());
        case "GET /list":
          return this.list();
        case "GET /read":
          return await this.read(url.searchParams.get("path") ?? "");
        case "POST /write":
          return await this.write(await request.json());
        case "POST /ask":
          return await this.ask(await request.json());
        case "POST /submit":
          return await this.submit(await request.json());
        case "GET /grade":
          return await this.grade();
        case "GET /receipts":
          return this.listReceipts();
        case "GET /spec":
          return this.getSpec();
        case "POST /cleanup":
          return await this.cleanup((await request.json().catch(() => ({}))) as { maxAgeMs?: number });
        case "POST /reset":
          return this.reset();
        default:
          return jsonError(404, "not_found", `${request.method} ${url.pathname}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonError(500, "internal_error", message);
    }
  }

  // -------------------- /init --------------------

  private async init(body: InitBody): Promise<Response> {
    const validation = validateSpec(body.spec);
    if (validation) return validation;
    if (JSON.stringify(body.spec).length > MAX_SPEC_BYTES) return jsonError(413, "spec_too_large", "spec too large");
    const existing = this.getState("spec");
    if (existing) {
      // Already initialized. Idempotent: same spec is a no-op; different spec
      // is an error (the DO id is the spec hash, so this shouldn't happen).
      const stored = JSON.parse(existing) as ComputerSpec;
      if (specJson(stored) !== specJson(body.spec)) {
        return jsonError(409, "spec_mismatch", "DO already holds a different spec");
      }
      return jsonOk({ id: body.id, alreadyMaterialized: true });
    }

    this.setState("id", body.id);
    this.setState("spec", JSON.stringify(body.spec));
    this.setState("materialized_at", String(Date.now()));

    // Materialize files in dependency order. Files with no `dependsOn` first.
    const ordered = topoSort(body.spec.filesystem);
    for (const file of ordered) {
      const r2Key = await this.materializeBytes(body.id, file);
      this.sql.exec(
        `INSERT INTO files (path, kind, state, description, timestamp, depends_on, r2_key, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        file.path,
        file.kind,
        file.state ?? null,
        file.description ?? null,
        file.timestamp ?? null,
        file.dependsOn ? JSON.stringify(file.dependsOn) : null,
        r2Key,
        0, // bytes count is best-effort in v0
      );
    }

    this.appendReceipt("init", { id: body.id, fileCount: ordered.length });
    return jsonOk({ id: body.id, materialized: true, fileCount: ordered.length });
  }

  /**
   * Generate the bytes for a single file and store them in R2 (or skip if
   * the bucket isn't bound). v0 uses a placeholder body; the artifacts/
   * generators (DOCX/XLSX/PPTX/PDF) plug in here in a later phase.
   */
  private async materializeBytes(id: string, file: SpecFile): Promise<string | null> {
    if (!this.env.ARTIFACTS) return null;
    const r2Key = `${id}/${file.path}`;
    const placeholder =
      `# ${file.path}\n` +
      `Kind: ${file.kind}\n` +
      (file.state ? `State: ${file.state}\n` : "") +
      (file.description ? `\n${file.description}\n` : "");
    await this.env.ARTIFACTS.put(r2Key, placeholder, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
    return r2Key;
  }

  // -------------------- /list --------------------

  private list(): Response {
    const rows = [...this.sql.exec(`SELECT path, kind, state, description, timestamp, depends_on FROM files ORDER BY path`)];
    const files = rows.map((row) => ({
      path: row.path as string,
      kind: row.kind as string,
      state: (row.state as string | null) ?? undefined,
      description: (row.description as string | null) ?? undefined,
      timestamp: (row.timestamp as string | null) ?? undefined,
      dependsOn: row.depends_on ? JSON.parse(row.depends_on as string) : undefined,
    }));
    return jsonOk({ files });
  }

  // -------------------- /read --------------------

  private async read(path: string): Promise<Response> {
    if (!path) return jsonError(400, "missing_path", "path query param required");
    if (!validPath(path)) return jsonError(400, "bad_path", path);
    const rows = [...this.sql.exec(`SELECT r2_key, kind FROM files WHERE path = ?`, path)];
    if (rows.length === 0) return jsonError(404, "file_not_found", path);
    const row = rows[0];
    const r2Key = row.r2_key as string | null;
    this.appendReceipt("read", { path });

    if (!r2Key || !this.env.ARTIFACTS) {
      return jsonOk({ path, kind: row.kind, content: "<no R2 bound; placeholder content>" });
    }

    const obj = await this.env.ARTIFACTS.get(r2Key);
    if (!obj) return jsonError(404, "bytes_missing", r2Key);
    const content = await obj.text();
    return jsonOk({ path, kind: row.kind, content });
  }

  // -------------------- /write --------------------

  private async write(body: { path: string; content: string }): Promise<Response> {
    if (!body.path) return jsonError(400, "missing_path", "");
    if (!validPath(body.path)) return jsonError(400, "bad_path", body.path);
    if (typeof body.content !== "string") return jsonError(400, "bad_request", "content must be string");
    if (body.content.length > MAX_WRITE_BYTES) return jsonError(413, "content_too_large", "content too large");
    const exists = [...this.sql.exec(`SELECT path, r2_key FROM files WHERE path = ?`, body.path)];
    let r2Key = exists.length > 0 ? (exists[0].r2_key as string | null) : null;

    const id = this.getState("id") ?? "unknown";
    if (!r2Key) r2Key = `${id}/${body.path}`;

    if (this.env.ARTIFACTS) {
      await this.env.ARTIFACTS.put(r2Key, body.content, {
        httpMetadata: { contentType: "text/plain; charset=utf-8" },
      });
    }

    if (exists.length === 0) {
      this.sql.exec(
        `INSERT INTO files (path, kind, state, r2_key, size_bytes) VALUES (?, ?, ?, ?, ?)`,
        body.path,
        "agent-write",
        "written",
        r2Key,
        body.content.length,
      );
    } else {
      this.sql.exec(
        `UPDATE files SET state = ?, size_bytes = ? WHERE path = ?`,
        "written",
        body.content.length,
        body.path,
      );
    }

    this.appendReceipt("write", { path: body.path, bytes: body.content.length });
    return jsonOk({ path: body.path, written: body.content.length });
  }

  // -------------------- /ask --------------------

  private async ask(body: { who: string; message: string }): Promise<Response> {
    if (!body.who || !body.message) return jsonError(400, "bad_request", "who + message required");

    const spec = this.requireSpec();
    const collab = spec.collaborators.find((c) => c.id === body.who);
    if (!collab) return jsonError(404, "collaborator_not_found", body.who);

    // v0: deterministic templated response. A later phase swaps this for a
    // model-driven reply conditioned on the collaborator's profile + history.
    const reply = templatedReply(collab, body.message);

    this.appendReceipt("ask", { who: body.who, message: body.message, reply });
    return jsonOk({ from: collab.id, role: collab.role, style: collab.style, reply });
  }

  // -------------------- /submit --------------------

  private async submit(body: {
    objective: string;
    decision?: string;
    paths?: string[];
    notes?: string;
  }): Promise<Response> {
    if (!body.objective) return jsonError(400, "bad_request", "objective required");
    const spec = this.requireSpec();
    const obj = spec.objectives.find((o) => o.id === body.objective);
    if (!obj) return jsonError(404, "objective_not_found", body.objective);

    this.appendReceipt("submit", {
      objective: body.objective,
      decision: body.decision,
      paths: body.paths,
      notes: body.notes,
    });
    return jsonOk({ objective: body.objective, accepted: true });
  }

  // -------------------- /grade --------------------

  private async grade(): Promise<Response> {
    const { gradeReceipts } = await import("./grade.ts");
    const spec = this.requireSpec();
    const runId = typeof spec.runId === "string" ? spec.runId : undefined;
    const receipts = this.allReceipts(runId).slice(-MAX_RECEIPTS_FOR_GRADE);
    const result = gradeReceipts(spec, receipts);
    this.appendReceipt("grade", { score: result.score, max: result.max });
    return jsonOk(result);
  }

  // -------------------- /cleanup --------------------

  private async cleanup(body: { maxAgeMs?: number } = {}): Promise<Response> {
    const maxAgeMs = typeof body.maxAgeMs === "number" ? body.maxAgeMs : 60 * 60 * 1000;
    const cutoff = Date.now() - maxAgeMs;
    const oldWrites = this.allReceipts().filter((r) => r.ts < cutoff && r.kind === "write" && typeof r.payload.path === "string");
    let deletedFiles = 0;
    for (const receipt of oldWrites) {
      const path = receipt.payload.path as string;
      const rows = [...this.sql.exec(`SELECT r2_key, kind FROM files WHERE path = ?`, path)];
      if (rows.length > 0 && rows[0].kind === "agent-write") {
        const r2Key = rows[0].r2_key as string | null;
        if (r2Key && this.env.ARTIFACTS) await this.env.ARTIFACTS.delete(r2Key);
        this.sql.exec(`DELETE FROM files WHERE path = ? AND kind = ?`, path, "agent-write");
        deletedFiles++;
      }
    }
    this.sql.exec(`DELETE FROM receipts WHERE ts < ?`, cutoff);
    return jsonOk({ cleaned: true, cutoff, deletedFiles });
  }

  // -------------------- /reset --------------------

  private reset(): Response {
    const spec = this.requireSpec();
    const runId = typeof spec.runId === "string" ? spec.runId : undefined;
    if (!runId) return jsonError(400, "missing_run_id", "reset requires a runId-scoped spec");
    const receipts = this.allReceipts(runId);
    for (const r of receipts) {
      if (r.kind === "write" && typeof r.payload.path === "string") {
        this.sql.exec(`DELETE FROM files WHERE path = ? AND kind = ?`, r.payload.path, "agent-write");
      }
    }
    this.sql.exec(`DELETE FROM receipts WHERE json_extract(payload, '$.runId') = ?`, runId);
    this.appendReceipt("reset", { runId });
    return jsonOk({ reset: true, runId });
  }

  // -------------------- /receipts --------------------

  private listReceipts(): Response {
    return jsonOk({ receipts: this.allReceipts() });
  }

  // -------------------- /spec --------------------

  private getSpec(): Response {
    const spec = this.getState("spec");
    if (!spec) return jsonError(404, "not_initialized", "");
    return new Response(spec, {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // -------------------- helpers --------------------

  private getState(key: string): string | null {
    const rows = [...this.sql.exec(`SELECT value FROM state WHERE key = ?`, key)];
    return rows.length > 0 ? (rows[0].value as string) : null;
  }

  private setState(key: string, value: string): void {
    this.sql.exec(
      `INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      value,
    );
  }

  private requireSpec(): ComputerSpec {
    const raw = this.getState("spec");
    if (!raw) throw new Error("computer not initialized");
    return JSON.parse(raw) as ComputerSpec;
  }

  private appendReceipt(kind: ReceiptKind, payload: Record<string, unknown>): void {
    const spec = this.getState("spec");
    const runId = spec ? (JSON.parse(spec) as ComputerSpec).runId : undefined;
    const fullPayload = runId ? { ...payload, runId } : payload;
    this.sql.exec(
      `INSERT INTO receipts (ts, kind, payload) VALUES (?, ?, ?)`,
      Date.now(),
      kind,
      JSON.stringify(fullPayload),
    );
  }

  private allReceipts(runId?: string): Receipt[] {
    const receipts = [...this.sql.exec(`SELECT ts, kind, payload FROM receipts ORDER BY seq`)].map((r) => ({
      ts: r.ts as number,
      kind: r.kind as ReceiptKind,
      payload: JSON.parse(r.payload as string),
    }));
    return runId ? receipts.filter((r) => r.payload.runId === runId) : receipts;
  }
}

// -------------------- pure helpers --------------------

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function jsonError(status: number, code: string, detail: string): Response {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function specJson(spec: ComputerSpec): string {
  return JSON.stringify(spec, Object.keys(spec).sort());
}

/**
 * Topologically sort files by their `dependsOn` edges. Files with no
 * predecessors come first; files derived from earlier ones come after.
 * Cycles are broken arbitrarily (we don't expect them in a real spec).
 */
function topoSort(files: SpecFile[]): SpecFile[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const visited = new Set<string>();
  const out: SpecFile[] = [];

  const visit = (file: SpecFile, stack = new Set<string>()): void => {
    if (visited.has(file.path) || stack.has(file.path)) return;
    stack.add(file.path);
    for (const dep of file.dependsOn ?? []) {
      const depFile = byPath.get(dep);
      if (depFile) visit(depFile, stack);
    }
    stack.delete(file.path);
    visited.add(file.path);
    out.push(file);
  };

  for (const file of files) visit(file);
  return out;
}

/**
 * Templated collaborator reply. Cheap, deterministic, useful enough for v0.
 * Real model-driven replies come in a later phase.
 */
function templatedReply(
  collab: { id: string; role: string; style?: string; focus?: string },
  message: string,
): string {
  const styleLine = collab.style ? `[${collab.style}] ` : "";
  const focusHint = collab.focus
    ? ` From my angle (${collab.focus}): worth checking that against the spec.`
    : "";
  const echo = message.length > 80 ? `${message.slice(0, 80).trim()}…` : message;
  return `${styleLine}${collab.role} replying re: "${echo}".${focusHint}`;
}


function validateSpec(spec: ComputerSpec): Response | null {
  if (!spec || typeof spec !== "object") return jsonError(400, "bad_spec", "spec object required");
  if (!spec.profile || typeof spec.profile.role !== "string") return jsonError(400, "bad_spec", "profile.role required");
  if (!Array.isArray(spec.filesystem) || spec.filesystem.length > MAX_FILES) return jsonError(400, "bad_spec", "filesystem must be an array of <= 100 files");
  if (!Array.isArray(spec.collaborators)) return jsonError(400, "bad_spec", "collaborators must be an array");
  if (!Array.isArray(spec.objectives)) return jsonError(400, "bad_spec", "objectives must be an array");
  if (!Array.isArray(spec.rubric)) return jsonError(400, "bad_spec", "rubric must be an array");
  for (const file of spec.filesystem) {
    if (!validPath(file.path)) return jsonError(400, "bad_path", file.path);
    if (typeof file.kind !== "string") return jsonError(400, "bad_spec", `kind required for ${file.path}`);
  }
  return null;
}

function validPath(path: string): boolean {
  if (typeof path !== "string") return false;
  if (path.length < 1 || path.length > 240) return false;
  if (path.startsWith("/") || path.includes("\0")) return false;
  return !path.split("/").some((part) => part === "" || part === "." || part === "..");
}
