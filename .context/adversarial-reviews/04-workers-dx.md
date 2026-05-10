# 04 — Workers developer experience review

Lens: Workers SDK/Wrangler/Deploy-to-Cloudflare first-run experience.

## Top blockers

1. Deploy button may not work with Alchemy state/secrets without manual setup.
2. README does not include Workers deploy permissions or exact Cloudflare dashboard setup.
3. Alchemy deploy path depends on environment secrets that deploy.workers.cloudflare.com may not prompt for cleanly.
4. Custom domain `cloudbox.coey.dev` is personal; fork deployers need a clear default workers.dev path.
5. `wrangler.jsonc` may diverge from `alchemy.run.ts` as canonical deploy path.

## Sharp questions

- Is this a Deploy to Cloudflare compatible repo, or a GitHub Actions deploy repo?
- What happens if I have no custom domain?
- Does the deploy button support Alchemy projects with state-store Worker?
- Can I run `wrangler deploy` directly?

## Actions

- Verify Deploy to Cloudflare button end-to-end or replace with "Fork and deploy" instructions.
- Add minimal `wrangler deploy` path if possible.
- Make custom domain optional and documented.
- Add exact Cloudflare API token template.
- Add troubleshooting table for common deploy failures.
