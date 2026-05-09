// Cloudbox — replay receipts against a rubric.
//
// Pure function. Given a spec + the receipt log from a run, evaluate each
// rubric criterion and return a structured score.
//
// v0 supports the `mustEvent` DSL declared in spec.ts. Criteria without a
// `mustEvent` are reported as "ungraded" — present in the rubric, not
// auto-checked. (Hook for an LLM-judge fallback in a later phase.)

import type { ComputerSpec, RubricCriterion, RubricEvent } from "./spec.ts";

export type Receipt = {
  ts: number;
  kind: string;
  payload: Record<string, unknown>;
};

export type GradeResult = {
  /** Sum of weights of passed criteria. */
  score: number;
  /** Sum of weights across all criteria with a `mustEvent`. */
  max: number;
  /** Total weight including ungraded criteria. */
  totalWeight: number;
  /** Criterion ids that passed. */
  passed: string[];
  /** Criterion ids that failed. */
  failed: string[];
  /** Criterion ids that were not auto-graded (no `mustEvent`). */
  ungraded: string[];
  /** Per-criterion detail. */
  detail: Array<{
    id: string;
    weight: number;
    must: string;
    status: "passed" | "failed" | "ungraded";
  }>;
};

export function gradeReceipts(
  spec: ComputerSpec,
  receipts: Receipt[],
): GradeResult {
  let score = 0;
  let max = 0;
  let totalWeight = 0;
  const passed: string[] = [];
  const failed: string[] = [];
  const ungraded: string[] = [];
  const detail: GradeResult["detail"] = [];

  for (const criterion of spec.rubric) {
    totalWeight += criterion.weight;

    if (!criterion.mustEvent) {
      ungraded.push(criterion.id);
      detail.push({
        id: criterion.id,
        weight: criterion.weight,
        must: criterion.must,
        status: "ungraded",
      });
      continue;
    }

    max += criterion.weight;
    const pass = evaluate(criterion.mustEvent, receipts);
    if (pass) {
      score += criterion.weight;
      passed.push(criterion.id);
    } else {
      failed.push(criterion.id);
    }
    detail.push({
      id: criterion.id,
      weight: criterion.weight,
      must: criterion.must,
      status: pass ? "passed" : "failed",
    });
  }

  return { score, max, totalWeight, passed, failed, ungraded, detail };
}

// -------------------- matchers --------------------

function evaluate(event: RubricEvent, receipts: Receipt[]): boolean {
  switch (event.type) {
    case "read":
      return receipts.some(
        (r) => r.kind === "read" && r.payload.path === event.path,
      );

    case "wrote":
      return receipts.some(
        (r) => r.kind === "write" && r.payload.path === event.path,
      );

    case "readBefore": {
      const beforeAt = firstReadIndex(receipts, event.before);
      const afterAt = firstReadIndex(receipts, event.after);
      if (beforeAt === -1) return false;
      // After-file may not have been read at all — that still satisfies the
      // ordering constraint as long as `before` was read.
      if (afterAt === -1) return true;
      return beforeAt < afterAt;
    }

    case "submitted":
      return receipts.some((r) => {
        if (r.kind !== "submit") return false;
        if (r.payload.objective !== event.objective) return false;
        if (event.decision && r.payload.decision !== event.decision) return false;
        return true;
      });

    case "asked":
      return receipts.some(
        (r) => r.kind === "ask" && r.payload.who === event.who,
      );

    case "askedOnly": {
      const askedRight = receipts.some(
        (r) => r.kind === "ask" && r.payload.who === event.who,
      );
      const askedWrong = receipts.some(
        (r) => r.kind === "ask" && r.payload.who === event.notWho,
      );
      return askedRight && !askedWrong;
    }
  }
}

function firstReadIndex(receipts: Receipt[], path: string): number {
  return receipts.findIndex(
    (r) => r.kind === "read" && r.payload.path === path,
  );
}
