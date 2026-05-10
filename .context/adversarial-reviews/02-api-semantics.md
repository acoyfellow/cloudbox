# 02 — API semantics review

Lens: long-term API contract / capability boundaries / semantics.

## Top blockers

1. `computer: "cloud"` is vague. Is this a remote workspace, container, DO, or account-level resource?
2. Tool injection is underspecified: `tools: { browser: agentBrowser() }` is shown, but no type or security boundary is documented.
3. `reproduce`, `fix`, and `verify` mix human intent strings with executable commands.
4. `console.log(run)` response shape is illustrative but not a documented schema.
5. Artifact path safety and workspace escape semantics are not visible in docs.

## Sharp questions

- Are `reproduce` and `verify` always commands, or can they be natural language tool goals?
- Who decides whether `fix` succeeded?
- What is the exact receipt schema?
- Can tools access secrets? Network? Browser auth state?
- Is the run deterministic/replayable?

## Actions

- Publish `RunInput`, `RunResult`, `Receipt`, `Tool` reference docs.
- Separate fields: `reproduce` command(s), `goal` text, `verify` command(s).
- Define built-in tools: shell/files. Define optional tools as capability plugins.
- Document path validation and forbidden paths.
- Add examples for local vs cloud computer semantics.
