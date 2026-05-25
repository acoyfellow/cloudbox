import type {
  ContainerLiveDeleteResult,
  ContainerLiveDevResult,
  ContainerLiveExecResult,
  ContainerLiveReadResult,
  ContainerLiveWriteResult,
  ContainerRunRequest,
  ContainerRunResult,
} from "./container-runner.ts";
import type { CloudboxClientOptions } from "./client.ts";

export type LiveRunCreateInput = Omit<ContainerRunRequest, "live">;

export type LiveRunCreateResult = ContainerRunResult & {
  runId: string;
  publicUrl?: string;
};

export type LiveRunTools = {
  createLiveRun: (input: LiveRunCreateInput) => Promise<LiveRunCreateResult>;
  startDev: (runId: string, input: { command: string; port: number }) => Promise<ContainerLiveDevResult>;
  read: (runId: string, path: string) => Promise<ContainerLiveReadResult>;
  write: (runId: string, input: { path: string; content: string }) => Promise<ContainerLiveWriteResult>;
  exec: (runId: string, input: { command: string; timeoutMs?: number }) => Promise<ContainerLiveExecResult>;
  stop: (runId: string) => Promise<{ ok: boolean; runId: string; status: "stopped"; snapshot?: { key: string; size: number } }>;
  resume: (runId: string) => Promise<{ ok: boolean; runId: string; status: "ready" }>;
  fork: (runId: string) => Promise<{ ok: boolean; runId: string; forkedFrom: string; status: "ready" }>;
  delete: (runId: string) => Promise<ContainerLiveDeleteResult & { status: "deleted" }>;
  previewUrl: (runId: string, suffix?: string) => string;
  shellUrl: (runId: string) => string;
  desktopUrl: (runId: string) => string;
};

export function createLiveRunTools({ baseUrl = "", token, fetcher = fetch }: CloudboxClientOptions = {}): LiveRunTools {
  const headers: Record<string, string> | undefined = token ? { authorization: `Bearer ${token}` } : undefined;
  const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetcher(`${baseUrl}${path}`, {
      ...init,
      headers: mergeHeaders(init?.body === undefined ? undefined : { "content-type": "application/json" }, headers, init?.headers),
    });
    const body = await response.json().catch(() => null) as (T & { detail?: string; error?: string }) | null;
    if (!response.ok || !body) throw new Error(body?.detail ?? body?.error ?? `Cloudbox live run request failed: ${response.status}`);
    return body;
  };
  const post = <T>(path: string, body: unknown) => json<T>(path, { method: "POST", body: JSON.stringify(body) });

  return {
    async createLiveRun(input) {
      const result = await post<ContainerRunResult & { runId?: string; publicUrl?: string }>("/api/runs", { ...input, live: true });
      if (!result.runId) throw new Error("Cloudbox live run response omitted runId");
      return { ...result, runId: result.runId };
    },
    startDev: (runId, input) => post<ContainerLiveDevResult>(`/api/runs/${encodeURIComponent(runId)}/dev`, input),
    read: (runId, path) => json<ContainerLiveReadResult>(`/api/runs/${encodeURIComponent(runId)}/read?path=${encodeURIComponent(path)}`),
    write: (runId, input) => post<ContainerLiveWriteResult>(`/api/runs/${encodeURIComponent(runId)}/write`, input),
    exec: (runId, input) => post<ContainerLiveExecResult>(`/api/runs/${encodeURIComponent(runId)}/exec`, input),
    stop: (runId) => post<{ ok: boolean; runId: string; status: "stopped"; snapshot?: { key: string; size: number } }>(`/api/runs/${encodeURIComponent(runId)}/stop`, {}),
    resume: (runId) => post<{ ok: boolean; runId: string; status: "ready" }>(`/api/runs/${encodeURIComponent(runId)}/resume`, {}),
    fork: (runId) => post<{ ok: boolean; runId: string; forkedFrom: string; status: "ready" }>(`/api/runs/${encodeURIComponent(runId)}/fork`, {}),
    delete: (runId) => json<ContainerLiveDeleteResult & { status: "deleted" }>(`/api/runs/${encodeURIComponent(runId)}`, { method: "DELETE" }),
    previewUrl: (runId, suffix = "") => `${baseUrl}/api/runs/${encodeURIComponent(runId)}/preview/${suffix.replace(/^\/+/, "")}`,
    shellUrl: (runId) => `${baseUrl}/api/runs/${encodeURIComponent(runId)}/preview/shell/`,
    desktopUrl: (runId) => `${baseUrl}/api/runs/${encodeURIComponent(runId)}/preview/desktop/vnc.html`,
  };
}

function mergeHeaders(...values: Array<HeadersInit | undefined>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const value of values) {
    if (!value) continue;
    new Headers(value).forEach((entry, key) => {
      headers[key] = entry;
    });
  }
  return headers;
}
