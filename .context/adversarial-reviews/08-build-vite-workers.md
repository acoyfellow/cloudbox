# 08 — Build and Workers integration review

Lens: Vite/Astro/Workers build correctness.

## Top blockers

1. We already hit assets/entrypoint/ASSETS binding failures; regression protection should be stronger.
2. Build deploys built Astro worker entrypoint from `web/dist/_worker.js/index.js`, which is easy to break if Astro output changes.
3. Static asset binding is non-obvious in Alchemy.
4. Local dev warnings about DO class export may confuse contributors.

## Sharp questions

- What test fails if `ASSETS` binding disappears?
- What test fails if Astro output path changes?
- Is `createExports` pattern documented in repo?
- Are Durable Object exports visible in the built worker?

## Actions

- Add smoke test for built `web/dist/_worker.js/index.js` existence after build.
- Add deploy config comments explaining Astro entrypoint + ASSETS binding.
- Add CI check that `alchemy.run.ts` binds ASSETS and CLOUDBOX_COMPUTER.
- Add troubleshooting section for 404/1101 failures.
