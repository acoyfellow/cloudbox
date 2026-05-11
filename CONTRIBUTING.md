# Contributing

Cloudbox is optimized for the seven-minute rule: a new engineer should understand and use the repo quickly.

Cloudbox uses pnpm for install/CI and Bun for the local/deploy scripts that need it. Use `pnpm install` first, then run scripts with `pnpm run …` or `bun run …`.

Before opening a PR:

```sh
pnpm install
pnpm run check
bunx wrangler deploy --dry-run
```

For UI changes, run the Worker locally and then run the E2E script:

```sh
bunx wrangler dev --local --port 8799
CLOUDBOX_E2E_URL=http://127.0.0.1:8799 bun run e2e
```

If you change anything under `runner/`, also run the local Docker smoke test
(it auto-skips when Docker is not available):

```sh
pnpm run runner:test
```

Keep the README short. Put deeper explanation in `docs/`.
