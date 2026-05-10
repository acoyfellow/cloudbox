# 05 — Shared infrastructure maintainability review

Lens: maintainability, state, migrations, resource ownership.

## Top blockers

1. State/resource history is complex: manual D1/R2 creation, adopted resources, state store worker.
2. Resource naming assumptions are personal-account specific in practice.
3. Durable Object migration/binding behavior is fragile if Alchemy config changes.
4. Demo data and future run API are interleaved in product narrative.

## Sharp questions

- Can two stages deploy safely from forks?
- Can a contributor run preview deploys without touching prod resources?
- Where is resource ownership documented?
- How do migrations evolve once external users have data?

## Actions

- Document resource names per stage.
- Add `prod` vs `dev` deploy table.
- Add migration policy.
- Add preview/staging guidance.
- Keep demo workspace path separate from future remote-computer API docs.
