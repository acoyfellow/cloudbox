import { describe, expect, it } from "vitest";
import {
  runnerReadySummary,
  summarizeRunnerReceipt,
  type RunnerLifecycleReceipt,
} from "../web/src/components/runner-receipts.ts";

const ts = "2026-01-01T00:00:00.000Z";

describe("summarizeRunnerReceipt", () => {
  it("describes container start in both cold and warm states", () => {
    expect(summarizeRunnerReceipt({ type: "runner.container.start", ts, alreadyRunning: false })).toContain(
      "started",
    );
    expect(summarizeRunnerReceipt({ type: "runner.container.start", ts, alreadyRunning: true })).toContain(
      "reused",
    );
  });

  it("includes the attempt number and error text for failed ready attempts", () => {
    const event: RunnerLifecycleReceipt = {
      type: "runner.container.ready_attempt",
      ts,
      attempt: 2,
      elapsedMs: 150,
      ok: false,
      error: "not listening",
    };
    const summary = summarizeRunnerReceipt(event);
    expect(summary).toContain("2");
    expect(summary).toContain("not listening");
  });

  it("formats ready and response steps with timing", () => {
    expect(summarizeRunnerReceipt({ type: "runner.container.ready", ts, attempt: 1, elapsedMs: 800 })).toContain(
      "800ms",
    );
    expect(summarizeRunnerReceipt({ type: "runner.response", ts, status: 200, elapsedMs: 1500 })).toContain(
      "200",
    );
  });

  it("flags missing-container and not-ready terminal states", () => {
    expect(summarizeRunnerReceipt({ type: "runner.container.missing", ts })).toContain("missing");
    expect(
      summarizeRunnerReceipt({
        type: "runner.container.not_ready",
        ts,
        attempts: 8,
        elapsedMs: 10_000,
        error: "ECONNREFUSED",
      }),
    ).toContain("ECONNREFUSED");
  });
});

describe("runnerReadySummary", () => {
  it("returns 'pending' for no receipts", () => {
    expect(runnerReadySummary([])).toBe("pending");
  });

  it("summarizes a successful ready event with timing", () => {
    const summary = runnerReadySummary([
      { type: "runner.container.start", ts, alreadyRunning: false },
      { type: "runner.container.ready_attempt", ts, attempt: 1, elapsedMs: 80, ok: true },
      { type: "runner.container.ready", ts, attempt: 1, elapsedMs: 80 },
    ]);
    expect(summary).toContain("80ms");
    expect(summary).toContain("1 attempt");
  });

  it("summarizes a not-ready terminal state", () => {
    const summary = runnerReadySummary([
      { type: "runner.container.start", ts, alreadyRunning: false },
      { type: "runner.container.not_ready", ts, attempts: 8, elapsedMs: 10_000, error: "ECONNREFUSED" },
    ]);
    expect(summary).toContain("8");
    expect(summary).toContain("failed");
  });
});
