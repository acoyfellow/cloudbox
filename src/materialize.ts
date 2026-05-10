// Cloudbox — turn a spec into a running agent computer.
//
// One Durable Object per materialized computer:
//   - Owns the receipt log (every protocol call is recorded)
//   - Holds the materialized file metadata (the spec's filesystem + DAG)
//   - R2 holds the actual bytes for content-rich artifacts
//
// `materialize()` is idempotent for the same spec: the id is a content hash,
// so calling it twice with the same spec returns the same { id, baseUrl }.

import type { ComputerSpec } from "./spec.ts";

export type MaterializeEnv = {
  /** The Durable Object namespace for ComputerDO. */
  CLOUDBOX_COMPUTER: DurableObjectNamespace;
  /** R2 bucket for artifact bytes. Optional — DO falls back to placeholder text. */
  ARTIFACTS?: R2Bucket;
};

export type MaterializedComputer = {
  /** Stable hash of the spec. Same spec → same id, every time. */
  id: string;
  /** Base URL prefix for the protocol. e.g. "/c/abc123" */
  baseUrl: string;
};

export async function materialize(
  spec: ComputerSpec,
  env: MaterializeEnv,
): Promise<MaterializedComputer> {
  const id = await specHash(spec);
  const stub = env.CLOUDBOX_COMPUTER.get(env.CLOUDBOX_COMPUTER.idFromName(id));

  // Send the spec to the DO. The DO is responsible for materializing files
  // (in dependency-graph order) into R2 and recording the seed state in its
  // own SQLite. Idempotent: re-init with the same spec is a no-op.
  const response = await stub.fetch("https://do/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, spec }),
  });

  if (!response.ok) {
    throw new Error(`materialize failed: ${response.status} ${await response.text()}`);
  }

  return { id, baseUrl: `/c/${id}` };
}

/**
 * Stable, deterministic hash of a spec. Uses SHA-256 over the canonicalized
 * JSON. Output is the first 12 hex chars — enough to avoid collision in
 * practice, short enough to fit in URLs.
 */
async function specHash(spec: ComputerSpec): Promise<string> {
  const canonical = JSON.stringify(spec, Object.keys(spec).sort());
  const data = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `cb_${hex.slice(0, 12)}`;
}
