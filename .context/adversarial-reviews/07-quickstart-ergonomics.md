# 07 — Quickstart ergonomics review

Lens: tunnels/dev workflow/quick tunnel/zero friction.

## Top blockers

1. Local dev and worker dev are different paths; README needs to say when to use each.
2. Docker/remote computer needs are not explained because cloud computer is not implemented yet.
3. `bun run dev` does not exercise DO locally according to warnings.
4. `bun run demo:browser` requires browser dependencies; not documented.

## Sharp questions

- Does quickstart demo work with `bun run dev`, or only production/worker dev?
- What local commands prove the app?
- How do I reset demo state?
- What if Playwright browsers are missing?

## Actions

- Add exact local validation commands and expected output.
- Add note: Astro dev is UI only; Worker/DO behavior is production/worker-dev.
- Add Playwright install hint if needed.
- Add `bun run check` meaning.
