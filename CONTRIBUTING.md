# Contributing

Cloudbox is optimized for the seven-minute rule: a new engineer should understand and use the repo quickly.

Before opening a PR:

```sh
bun install
bun run check
bun run --cwd docs build
bunx wrangler deploy --dry-run
```

For UI changes, run the Worker locally and then run the E2E script:

```sh
bunx wrangler dev --local --port 8799
CLOUDBOX_E2E_URL=http://127.0.0.1:8799 bun run e2e
```

Keep the README short. Put deeper explanation in `docs/`.
