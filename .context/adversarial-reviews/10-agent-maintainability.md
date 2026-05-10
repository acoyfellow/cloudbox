# 10 — Agent maintainability review

Lens: can an AI/code agent extend and operate this repo safely?

## Top blockers

1. No AGENTS.md in Cloudbox with repo-specific instructions.
2. Important deployment/account constraints live in conversation context, not repo docs.
3. Source has multiple concepts: ComputerSpec, demo workspace, local run API, future cloud computer.
4. Naming is still settling, which increases agent drift.

## Sharp questions

- Where should an agent start when asked to change homepage vs deploy infra vs run API?
- Which files are canonical for deploy?
- What should never be done locally, e.g. switching Wrangler account?
- What command set proves changes?

## Actions

- Add AGENTS.md with canonical commands, deploy account rules, and file map.
- Add comments in `src/run.ts` marking local proof slice vs future API.
- Add docs/internal notes excluded from public nav.
- Add a smoke checklist for agents before push.
