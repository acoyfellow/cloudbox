// Cloudbox — typed spec for a synthetic computer.
//
// A spec is structured data. Author it by hand, generate it from a brief,
// or load it from JSON. Pass it to materialize() to turn it into a real
// environment an agent can operate against.
//
// The shape mirrors the Microsoft "Synthetic Computers at Scale" paper:
//   profile         §2.1  identity & habits
//   filesystem      §2.2  the populated work environment
//   collaborators   §3.1  people the agent must coordinate with
//   objectives      §3.1  productivity outcomes the agent must produce
//   rubric          §4.2  pass/fail criteria, scored from the agent's trail

export type ComputerSpec = {
  /** Optional human-friendly name. Defaults to a hash of the spec. */
  name?: string;
  /** Optional caller-provided run/session id. When set, grading only considers receipts for this run. */
  runId?: string;

  /** The persona. Required: a role. Everything else is hinting. */
  profile: Profile;

  /** Files the agent inherits when it starts work. */
  filesystem: SpecFile[];

  /** Coworkers the agent can ask for context, feedback, or sign-off. */
  collaborators: Collaborator[];

  /** Productivity outcomes the agent must produce. */
  objectives: Objective[];

  /** How to grade the agent's trajectory. Pass/fail criteria. */
  rubric: RubricCriterion[];
};

// ---------- Profile ----------

export type Profile = {
  /** Job title or specialty. Drives tone, file kinds, collaborator types. */
  role: string;
  /** "primary" | "secondary" | unset. Hint for runbook-style work. */
  onCall?: string;
  /** Seniority hint: "junior" | "senior" | "staff" | "principal" | etc. */
  seniority?: string;
  /** Free-form additions. Available to fromBrief output and to power users. */
  [extra: string]: unknown;
};

// ---------- Filesystem ----------

/**
 * A file on the synthetic computer.
 *
 * `kind` is an open vocabulary — common values listed below — so the agent
 * (and the artifact generator) can branch on type. New kinds are fine; they
 * just won't get specialized rendering.
 */
export type SpecFile = {
  path: string;
  kind: FileKind;
  /** Open vocabulary, e.g. "open-pr", "failing", "draft", "merged". */
  state?: string;
  /** Optional one-liner — lets the brief generator and humans annotate intent. */
  description?: string;
  /** Optional ISO date the file was last touched, for ordering. */
  timestamp?: string;
  /** Optional list of paths this file derives from (the dependency DAG). */
  dependsOn?: string[];
};

export type FileKind =
  | "diff"
  | "log"
  | "design-doc"
  | "runbook"
  | "memo"
  | "spreadsheet"
  | "deck"
  | "pdf"
  | "image"
  | "config"
  | "data"
  | (string & {});

// ---------- Collaborators ----------

export type Collaborator = {
  /** Stable id. Rubric criteria reference collaborators by id. */
  id: string;
  /** "manager" | "pr-author" | "reviewer" | "client" | "compliance" | … */
  role: string;
  /** "anxious" | "terse" | "architectural" | "nitpicky" | … */
  style?: string;
  /** What this person cares about. Used by the agent's `ask` tool. */
  focus?: string;
  /** Files the agent can't see by default. Reveal on `ask`. */
  privateFiles?: SpecFile[];
};

// ---------- Objectives ----------

export type Objective = {
  /** Stable id. Receipts reference objectives by id. */
  id: string;
  /** Short human title. */
  title: string;
  /** Optional fuller description. */
  description?: string;
  /** Optional path the agent is expected to produce or modify. */
  expectedArtifact?: string;
};

// ---------- Rubric ----------

export type RubricCriterion = {
  /** Stable id. Used in grade() output. */
  id: string;
  /** Points awarded if this criterion passes. */
  weight: number;
  /**
   * Human-readable pass condition.
   *
   * In v0 the grader is structural — it inspects the receipt log for the
   * presence/absence/order of operations referenced by `mustEvent`. The
   * `must` string is documentation for humans and for an LLM-judge fallback.
   */
  must: string;
  /**
   * Optional structured pass condition. v0 supports a small DSL of
   * receipt-pattern matchers; if absent, the criterion is documented but
   * not auto-graded (and the LLM-judge fallback would be used instead).
   */
  mustEvent?: RubricEvent;
};

/**
 * Structured rubric matchers, evaluated against the receipt log.
 * Keep this small. New shapes are easy to add later.
 */
export type RubricEvent =
  /** Agent read `path` at some point during the run. */
  | { type: "read"; path: string }
  /** Agent wrote `path` at some point during the run. */
  | { type: "wrote"; path: string }
  /** Agent read `before` strictly before `after`. */
  | { type: "readBefore"; before: string; after: string }
  /** Agent submitted to `objective` with `decision` (or any decision). */
  | { type: "submitted"; objective: string; decision?: string }
  /** Agent asked collaborator `who` at least once. */
  | { type: "asked"; who: string }
  /** Agent asked `who` and not `notWho`. */
  | { type: "askedOnly"; who: string; notWho: string };

// ---------- defineComputer ----------

/**
 * Identity function with stronger types. The type system is the validator
 * in v0; misuse is the caller's problem. (Runtime validation is roadmap.)
 *
 * Use this whenever you author a spec inline so TS can narrow the file kinds,
 * collaborator roles, and rubric event shapes against the values you wrote.
 */
export function defineComputer<T extends ComputerSpec>(spec: T): T {
  return spec;
}
