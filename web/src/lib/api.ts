// Tiny client for the Cloudbox Worker protocol.
// Mirrors the README's curl examples in TypeScript.

import type { ComputerSpec } from "../../../src/spec.ts";
import type { GradeResult, Receipt } from "../../../src/grade.ts";

export type Materialized = { id: string; baseUrl: string };

export type ListedFile = {
  path: string;
  kind: string;
  state?: string;
  description?: string;
};

export async function materialize(spec: ComputerSpec): Promise<Materialized> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (spec.name === "agent-launch-readiness" && spec.runId?.startsWith("browser-")) {
    headers["x-cloudbox-demo"] = "1";
  }
  const r = await fetch("/computers", {
    method: "POST",
    headers,
    body: JSON.stringify(spec),
  });
  if (!r.ok) throw new Error(`materialize failed: ${r.status}`);
  return r.json();
}

export const list = (id: string) =>
  fetchJson<{ files: ListedFile[] }>(`/c/${id}/list`);

export const read = (id: string, path: string) =>
  fetchJson<{ path: string; kind: string; content: string }>(
    `/c/${id}/read?path=${encodeURIComponent(path)}`,
  );

export const ask = (id: string, who: string, message: string) =>
  postJson<{ from: string; role: string; reply: string }>(`/c/${id}/ask`, { who, message });

export const write = (id: string, path: string, content: string) =>
  postJson<{ path: string; written: number }>(`/c/${id}/write`, { path, content });

export const submit = (id: string, objective: string, decision?: string, notes?: string) =>
  postJson<{ objective: string; accepted: boolean }>(`/c/${id}/submit`, { objective, decision, notes });

export const grade = (id: string) => fetchJson<GradeResult>(`/c/${id}/grade`);

export const receipts = (id: string) =>
  fetchJson<{ receipts: Receipt[] }>(`/c/${id}/receipts`);

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
