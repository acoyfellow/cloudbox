# Cloudbox remote-computer gap analysis

Private planning note. Do not use internal project names in public marketing.

## Frozen public promise

Homepage API shape:

```ts
const run = await cloudbox.run({
  computer: "cloud",
  repo: "https://github.com/acoyfellow/cloudbox",
  bug: "cloudbox.coey.dev returns 1101 instead of the homepage",
  reproduce: "curl -i https://cloudbox.coey.dev/",
  fix: "make the homepage return 200",
  verify: ["bun run build", "bun run test", "curl -i https://cloudbox.coey.dev/"],
  artifact: "HANDOFF.md",
});

console.log(run.proof);
```

Public words:
- clean remote computer
- repo cloned and commit pinned
- bug reproduced
- agent repairs inside workspace
- fix verified
- patch + commands + terminal output + artifact + grade returned

Avoid public words:
- internal project names
- implementation substrate names
- any claim that current v0 already does hosted shell execution until real

## Current state

Implemented:
- Cloudbox app deployed and serving static web + API.
- Homepage now positions remote-computer bugfix proof loop.
- Existing synthetic ComputerSpec / DO / receipts / grading primitives.
- Browser demo/demo against synthetic spec.
- `src/run.ts` green-slice API test implementation for earlier repo/reviewer shape.
- Tests prove placeholder API, not real remote computer.

Not implemented:
- Homepage API contract changed to bug/reproduce/fix/verify/artifact; tests not updated.
- Real repo clone/import.
- Real commit pin from remote.
- Real remote computer provisioning.
- Shell command execution.
- Agent edit loop against repo files.
- Diff/patch capture.
- Reproduce-failure then verify-success semantics.
- Proof report generation from receipts.
- Public run/proof page.
- Parallel runs.

## Desired product object model

RunInput:
- computer?: "cloud" | "local" (homepage can omit or use "cloud"; never mention private substrate)
- repo: Git URL
- ref?: branch/tag/sha
- bug: string
- reproduce: string | string[]
- fix: string
- verify: string[]
- artifact: relative path

RunOutput:
- id
- status: queued | running | reproduced | fixing | verifying | passed | failed
- repo: { url, ref, commit, importedAt }
- computer: { id, kind: "remote", workspace }
- proof: {
    summary,
    reproduced: CommandReceipt[],
    verified: CommandReceipt[],
    patch,
    artifact,
    grade,
    timeline
  }

Receipts:
- repo.cloned { url, ref, commit, cwd }
- command { phase, cmd, cwd, exit, stdoutTail, stderrTail, startedAt, finishedAt }
- search { query, cwd, matches }
- read { path, sha256, range? }
- write { path, sha256, bytes }
- patch { files, diff }
- artifact { path, content, sha256 }
- decision { status, summary }

## Implementation strategy

Keep Cloudbox as public contract + proof/grading UI.
Use an execution adapter hidden behind `RemoteComputer` interface.

Interface:

```ts
interface RemoteComputer {
  id: string;
  workspace: string;
  exec(cmd: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<CommandResult>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
}
```

Adapters:
1. LocalComputer: temp dir + child_process, for tests and immediate demo.
2. RemoteComputer: calls internal remote-computer service later.
3. FakeComputer: deterministic unit tests.

Reason: build product semantics once; cloud lift is adapter swap.

## Test plan, red-first

Unit contract tests:
- homepage API accepts exact bugfix shape.
- invalid repo URL rejected.
- artifact path escape rejected.
- verify empty rejected.
- command timeout surfaces structured failure.

Local integration tests:
- fixture repo with known failing test.
- run reproduces failure first.
- agent/fixer applies deterministic patch.
- verify commands pass.
- patch includes changed file.
- HANDOFF.md generated.
- proof contains reproduce + verify receipts.

Remote adapter contract tests:
- mock remote service receives clone/reproduce/fix/verify sequence.
- adapter maps remote command events to Cloudbox receipts.
- failures preserve stdout/stderr tails.

Browser/demo tests:
- homepage CTA opens run page.
- run page shows commit, reproduced failure, patch, verified fix, artifact.

## Minimal real demo milestone

No LLM at first. Deterministic scripted fixer is acceptable for proving plumbing.

Fixture repo:
- package.json test script
- src/add.ts broken
- tests/add.test.ts failing

Input:
```ts
cloudbox.run({
  computer: "local",
  repo: "file://fixtures/buggy-add",
  bug: "add(1,2) returns 4",
  reproduce: "bun test",
  fix: "make add return a + b",
  verify: ["bun test"],
  artifact: "HANDOFF.md",
})
```

Expected:
- clone fixture
- reproduce `bun test` exit 1
- edit src/add.ts
- verify `bun test` exit 0
- generate patch
- generate HANDOFF.md
- grade pass

Then replace fixture with real Cloudbox repo and scripted homepage-1101 retrospective.

## Parallel workstreams

A. API/tests
- Update tests to frozen homepage bugfix API.
- Define RunInput/RunOutput/Receipt types.
- Make current `src/run.ts` fail tests before implementing.

B. Local computer
- Implement tempdir clone/import.
- Support GitHub https clone and local file fixture.
- Resolve commit.
- Path validation.
- Command execution with timeout/tails.

C. Proof engine
- Receipt recorder.
- Reproduce/verify phase semantics.
- Patch generation via git diff.
- HANDOFF.md generator.
- Grade from receipts.

D. Agent/fixer loop
- Start deterministic: optional `patcher` callback in tests.
- Then add simple tool loop with read/search/write/exec.
- Later LLM-backed.

E. Remote computer adapter research
- Inspect internal remote computer project APIs.
- Identify minimal endpoint needed: create workspace, exec, read/write, destroy.
- Do not expose name publicly.

F. UI
- Homepage copy already close; remove internal names.
- Build proof page mock from run output.
- CTA starts/loads demo run.

G. Deployment/security
- Decide Cloudbox production remote execution auth boundary.
- Separate personal public Cloudbox from employee-only remote computer use.
- Never leak internal tokens/project names into public app.

## Risks

- Cloudflare Workers cannot run arbitrary shell commands; must rely on remote computer service or local runner.
- Public Cloudbox cannot depend on employee-only internals unless gated/hidden.
- Repo clone of arbitrary public repos has resource abuse risk; enforce allowlist initially.
- Commands can hang; strict timeout required.
- Proof can become theatre if not tied to real exit codes and diffs.

## Next concrete sequence

1. Change homepage `computer: "pai"` to public-safe `computer: "cloud"` or omit.
2. Update tests to exact homepage bugfix API.
3. Run tests red.
4. Implement LocalComputer against fixture repo.
5. Implement receipt/proof/HANDOFF generation.
6. Make tests green locally.
7. Add proof page reading saved run output.
8. Research remote adapter from internal remote computer code in parallel.
