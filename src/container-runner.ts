export type ContainerRunRequest = {
  repo: string;
  ref?: string;
  auth?: "none" | "gitlab";
  clone?: "shallow" | "blobless";
  sparse?: string[];
  commands?: string[];
  verify?: string[];
  artifact?: string;
  timeoutMs?: number;
  live?: boolean;
  /** Boot browser shell/desktop services for this interactive run when the deployed runner image supports them. */
  desktop?: boolean;
  /** Optional lifetime for an interactive run before it expires. Default 1 hour; max 30 days. */
  ttlSeconds?: number;
  /** When true, the run is readable unauthenticated at GET /api/runs/:id/public and at /runs/:id. */
  public?: boolean;
};

export type ContainerRunReceipt = {
  type: "clone" | "command" | "verify" | "diff";
  cmd: string;
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
};

export type RunnerLifecycleReceipt =
  | { type: "runner.container.missing"; ts: string }
  | { type: "runner.container.start"; ts: string; alreadyRunning: boolean }
  | { type: "runner.container.ready_attempt"; ts: string; attempt: number; elapsedMs: number; ok: boolean; error?: string }
  | { type: "runner.container.ready"; ts: string; attempt: number; elapsedMs: number }
  | { type: "runner.container.not_ready"; ts: string; attempts: number; elapsedMs: number; error: string }
  | { type: "runner.response"; ts: string; status: number; elapsedMs: number };

export type ContainerRunResult = {
  ok: boolean;
  receipts: ContainerRunReceipt[];
  artifact?: { path: string; content: string } | null;
  diff?: string;
  error?: string;
  live?: { runId: string };
  runnerReceipts?: RunnerLifecycleReceipt[];
};

export type ContainerLiveExecResult = {
  ok: boolean;
  receipt?: ContainerRunReceipt;
  error?: string;
  runnerReceipts?: RunnerLifecycleReceipt[];
};

export type ContainerLiveReadResult = {
  ok: boolean;
  path?: string;
  content?: string;
  error?: string;
  runnerReceipts?: RunnerLifecycleReceipt[];
};

export type ContainerLiveWriteResult = {
  ok: boolean;
  path?: string;
  bytes?: number;
  error?: string;
  runnerReceipts?: RunnerLifecycleReceipt[];
};

export type ContainerLiveDevResult = {
  ok: boolean;
  runId?: string;
  command?: string;
  port?: number;
  startedAt?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  runnerReceipts?: RunnerLifecycleReceipt[];
};

export type ContainerLiveSnapshotResult = {
  ok: boolean;
  runId?: string;
  snapshot?: { bytes: string; size: number };
  error?: string;
  runnerReceipts?: RunnerLifecycleReceipt[];
};

export type ContainerLiveRestoreResult = {
  ok: boolean;
  runId?: string;
  error?: string;
  runnerReceipts?: RunnerLifecycleReceipt[];
};

export type ContainerLiveDeleteResult = {
  ok: boolean;
  runId?: string;
  deleted?: boolean;
  error?: string;
  runnerReceipts?: RunnerLifecycleReceipt[];
};

export type ContainerPreviewResponse = Response;

export async function runInContainer(runner: unknown, input: ContainerRunRequest, runId?: string): Promise<ContainerRunResult> {
  return runnerJson<ContainerRunResult>(runner, "/run", {
    ...input,
    liveRunId: input.live === true ? runId : undefined,
  });
}

export async function execInContainer(runner: unknown, runId: string, input: { command: string; timeoutMs?: number }): Promise<ContainerLiveExecResult> {
  return runnerJson<ContainerLiveExecResult>(runner, `/live/${encodeURIComponent(runId)}/exec`, input);
}

export async function readInContainer(runner: unknown, runId: string, path: string): Promise<ContainerLiveReadResult> {
  return runnerJson<ContainerLiveReadResult>(runner, `/live/${encodeURIComponent(runId)}/read?path=${encodeURIComponent(path)}`);
}

export async function writeInContainer(runner: unknown, runId: string, input: { path: string; content: string }): Promise<ContainerLiveWriteResult> {
  return runnerJson<ContainerLiveWriteResult>(runner, `/live/${encodeURIComponent(runId)}/write`, input);
}

export async function devInContainer(runner: unknown, runId: string, input: { command: string; port: number }): Promise<ContainerLiveDevResult> {
  return runnerJson<ContainerLiveDevResult>(runner, `/live/${encodeURIComponent(runId)}/dev`, input);
}

export async function snapshotInContainer(runner: unknown, runId: string): Promise<ContainerLiveSnapshotResult> {
  return runnerJson<ContainerLiveSnapshotResult>(runner, `/live/${encodeURIComponent(runId)}/snapshot`, {});
}

export async function restoreInContainer(runner: unknown, runId: string, input: { snapshot: { bytes: string } }): Promise<ContainerLiveRestoreResult> {
  return runnerJson<ContainerLiveRestoreResult>(runner, `/live/${encodeURIComponent(runId)}/restore`, input);
}

export async function deleteLiveInContainer(runner: unknown, runId: string): Promise<ContainerLiveDeleteResult> {
  return runnerJson<ContainerLiveDeleteResult>(runner, `/live/${encodeURIComponent(runId)}/delete`, {});
}

export async function previewInContainer(runner: unknown, runId: string, request: Request, suffix: string): Promise<ContainerPreviewResponse> {
  const target = resolveRunner(runner);
  const incoming = new URL(request.url);
  const path = `/live/${encodeURIComponent(runId)}/preview/${suffix.replace(/^\/+/, "")}${incoming.search}`;
  return target.fetch(new Request(`http://cloudbox-runner${path}`, request));
}

async function runnerJson<T>(runner: unknown, path: string, body?: unknown): Promise<T> {
  const target = resolveRunner(runner);
  const response = await target.fetch(`http://cloudbox-runner${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as T | null;
  if (!response.ok || !payload) throw new Error(`container request failed: ${response.status}`);
  return payload;
}

function resolveRunner(runner: unknown): { fetch: typeof fetch } {
  const binding = runner as { fetch?: typeof fetch; get?: (id: unknown) => { fetch: typeof fetch }; idFromName?: (name: string) => unknown } | undefined;
  let target: { fetch: typeof fetch } | undefined;
  if (binding?.fetch) target = binding as { fetch: typeof fetch };
  if (!target && binding?.get && binding.idFromName) target = binding.get(binding.idFromName("default"));
  if (!target?.fetch) throw new Error("CLOUDBOX_RUNNER container binding is not available");
  return target;
}
