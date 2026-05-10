# 03 — Standards and regression review

Lens: spec conformance, tests, edge cases, no untested behavior.

## Top blockers

1. Tests cover local proof slice but not homepage deploy-button flow.
2. No coverage thresholds or coverage reporting.
3. E2E checks demo page, but not homepage CTA ordering or deploy link validity.
4. No regression test for "demo button enabled" failure that already happened via missing DO binding.
5. No negative tests for token enforcement around public demo bypass.

## Sharp questions

- What test fails if DO binding is omitted again?
- What test fails if deploy button points to a bad URL?
- What test fails if a protected mutation becomes public?
- What test fails if artifact path escapes workspace?

## Actions

- Add route smoke test for `/`, `/demo`, `/docs`, deploy link presence.
- Add E2E assertion that demo button enables and completes.
- Add API tests for token bypass constraints.
- Add coverage config, even if threshold starts low.
- Add test for exact homepage snippet import names (`agentBrowser`, `cloudbox`).
