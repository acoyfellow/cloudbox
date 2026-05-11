export type RunnerLifecycleReceipt =
  | { type: "runner.container.missing"; ts: string }
  | { type: "runner.container.start"; ts: string; alreadyRunning: boolean }
  | { type: "runner.container.ready_attempt"; ts: string; attempt: number; elapsedMs: number; ok: boolean; error?: string }
  | { type: "runner.container.ready"; ts: string; attempt: number; elapsedMs: number }
  | { type: "runner.container.not_ready"; ts: string; attempts: number; elapsedMs: number; error: string }
  | { type: "runner.response"; ts: string; status: number; elapsedMs: number };

export function summarizeRunnerReceipt(receipt: RunnerLifecycleReceipt): string {
  switch (receipt.type) {
    case "runner.container.start":
      return receipt.alreadyRunning ? "reused running container" : "started container";
    case "runner.container.ready_attempt":
      return receipt.ok ? `ready attempt ${receipt.attempt} passed` : `ready attempt ${receipt.attempt} failed: ${receipt.error ?? "unknown"}`;
    case "runner.container.ready":
      return `runner ready in ${formatMs(receipt.elapsedMs)} · ${receipt.attempt} attempt${receipt.attempt === 1 ? "" : "s"}`;
    case "runner.response":
      return `runner response ${receipt.status} in ${formatMs(receipt.elapsedMs)}`;
    case "runner.container.not_ready":
      return `runner not ready after ${receipt.attempts} attempts: ${receipt.error}`;
    case "runner.container.missing":
      return "container API missing";
  }
}

export function runnerReadySummary(receipts: RunnerLifecycleReceipt[]): string {
  const ready = receipts.find((receipt): receipt is Extract<RunnerLifecycleReceipt, { type: "runner.container.ready" }> => receipt.type === "runner.container.ready");
  if (ready) return `ready in ${formatMs(ready.elapsedMs)} · ${ready.attempt} attempt${ready.attempt === 1 ? "" : "s"}`;
  const failed = receipts.find((receipt): receipt is Extract<RunnerLifecycleReceipt, { type: "runner.container.not_ready" }> => receipt.type === "runner.container.not_ready");
  if (failed) return `failed after ${failed.attempts} attempts`;
  return receipts.length ? "starting" : "pending";
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
