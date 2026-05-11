export type RunnerEvent =
  | { type: "runner.container.missing"; ts: string }
  | { type: "runner.container.start"; ts: string; alreadyRunning: boolean }
  | { type: "runner.container.ready_attempt"; ts: string; attempt: number; elapsedMs: number; ok: boolean; error?: string }
  | { type: "runner.container.ready"; ts: string; attempt: number; elapsedMs: number }
  | { type: "runner.container.not_ready"; ts: string; attempts: number; elapsedMs: number; error: string }
  | { type: "runner.response"; ts: string; status: number; elapsedMs: number };

export type ContainerHandle = {
  running: boolean;
  start(options?: { enableInternet: boolean; env?: Record<string, string>; hardTimeout?: number | bigint }): void;
  getTcpPort(port: number): { fetch: typeof fetch };
  setInactivityTimeout?(durationMs: number | bigint): Promise<void>;
};

export class RunnerLifecycleError extends Error {
  constructor(
    public code: "container_api_missing" | "container_not_ready" | "container_http_error" | "container_invalid_response",
    message: string,
    public events: RunnerEvent[],
    public status = 503,
  ) {
    super(message);
    this.name = "RunnerLifecycleError";
  }
}

const DEFAULT_DELAYS_MS = [100, 250, 500, 1_000, 2_000, 3_000, 5_000];

export async function fetchWithRunnerLifecycle(args: {
  container?: ContainerHandle;
  request: Request;
  port?: number;
  url?: string;
  delaysMs?: number[];
  now?: () => number;
  isoNow?: () => string;
}): Promise<{ response: Response; events: RunnerEvent[] }> {
  const events: RunnerEvent[] = [];
  const port = args.port ?? 8080;
  const url = args.url ?? "http://container/run";
  const delays = args.delaysMs ?? DEFAULT_DELAYS_MS;
  const now = args.now ?? Date.now;
  const isoNow = args.isoNow ?? (() => new Date().toISOString());
  const startedAt = now();
  const emit = (event: RunnerEvent) => events.push(event);

  if (!args.container) {
    emit({ type: "runner.container.missing", ts: isoNow() });
    throw new RunnerLifecycleError("container_api_missing", "Cloudflare container API is not available", events, 500);
  }

  const alreadyRunning = args.container.running;
  emit({ type: "runner.container.start", ts: isoNow(), alreadyRunning });
  if (!alreadyRunning) {
    args.container.start({ enableInternet: true, hardTimeout: 120_000 });
    await args.container.setInactivityTimeout?.(60_000).catch(() => undefined);
  }

  const fetcher = args.container.getTcpPort(port);
  let lastError = "unknown";
  for (let attempt = 1; attempt <= delays.length + 1; attempt++) {
    const elapsedMs = now() - startedAt;
    try {
      const response = await fetcher.fetch(new Request(url, args.request));
      emit({ type: "runner.container.ready_attempt", ts: isoNow(), attempt, elapsedMs, ok: true });
      emit({ type: "runner.container.ready", ts: isoNow(), attempt, elapsedMs });
      emit({ type: "runner.response", ts: isoNow(), status: response.status, elapsedMs: now() - startedAt });
      return { response, events };
    } catch (error) {
      lastError = errorMessage(error);
      emit({ type: "runner.container.ready_attempt", ts: isoNow(), attempt, elapsedMs, ok: false, error: lastError });
      const delay = delays[attempt - 1];
      if (delay === undefined) break;
      await sleep(delay);
    }
  }

  const elapsedMs = now() - startedAt;
  emit({ type: "runner.container.not_ready", ts: isoNow(), attempts: delays.length + 1, elapsedMs, error: lastError });
  throw new RunnerLifecycleError("container_not_ready", lastError, events, 503);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
