# 01 — Operational truth review

Lens: senior operator/CTO who cares whether the repo actually deploys and runs.

## Top blockers

1. The homepage says "Deploy on your Cloudflare account", but the deploy button path is not proven for a fresh third-party account.
2. README lists secrets, but does not say which Cloudflare token permissions are required.
3. The current cloud run API shown on homepage is aspirational. The hosted remote-computer runner is explicitly next, so homepage risks overclaiming.
4. The demo proves receipt/grading mechanics, but not the homepage cloud-computer bugfix run.
5. No status badge or deploy status shown on README/homepage.

## Sharp questions

- If I click Deploy to Cloudflare today, does it complete on a blank personal account?
- What exact token scopes do I need?
- What resources will be created, and what are they named?
- Can I destroy everything cleanly?
- Which part is production and which part is roadmap?

## Actions

- Add a "Deploy prerequisites" section with exact token scopes and resources.
- Add a "What works today" vs "Next" block near homepage or README.
- Test deploy button from a fresh account or document it as experimental.
- Add GitHub Actions badge and live demo badge.
- Add destroy/cleanup instructions.
