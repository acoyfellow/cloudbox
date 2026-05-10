# Action plan from adversarial reviews

## P0 — Before pushing the Cloudflare-customer funnel hard

1. Verify or downgrade the Deploy to Cloudflare button.
   - If unverified, label it "Fork/deploy" or "experimental".
   - Action: run a deploy-button test or document exact manual GitHub Actions path.

2. Add exact Cloudflare token/resource prerequisites.
   - Account ID, API token permissions, secrets, resource names.
   - Include what gets created and destroy instructions.

3. Separate current vs next.
   - Current: deployed app, demo workspace, receipts, artifacts, grading, local proof-run slice.
   - Next: hosted remote-computer runner.
   - This prevents homepage/API overclaiming.

4. Add deploy/docs/source funnel in README and homepage.
   - Mostly done; needs verification and maybe screenshot.

5. Add AGENTS.md.
   - Preserve critical operational constraints for future agents.

## P1 — Repo audit score boosters with real value

6. Add README badges.
   - CI, license, deploy to Cloudflare.

7. Add README screenshot or short demo GIF.
   - Repo audit explicitly flagged no screenshots/demos.

8. Add issue templates and PR template.
   - Deploy failure template is highest value.

9. Add docs pages matching reader jobs.
   - Quickstart
   - Deploy
   - Concepts
   - Recipes
   - API reference
   - Tools

10. Add regression tests for known failures.
   - Missing `CLOUDBOX_COMPUTER` binding.
   - Missing `ASSETS` binding.
   - Demo button disabled.
   - Deploy link present.

## P2 — Implementation alignment

11. Make homepage snippet backed by tests.
   - Exact import names: `agentBrowser`, `cloudbox`.
   - Exact run response shape.

12. Implement documented tool interface.
   - shell/files built in.
   - explicit tools become receipted capabilities.

13. Build cloud computer adapter.
   - Keep implementation name private.
   - Public concept: clean remote computer.

14. Add coverage config.
   - Start low, report only if needed.

15. Add releases/dependency automation.
   - Tag alpha releases.
   - Dependabot or Renovate.

## Immediate recommendation

Do these now:

- Add AGENTS.md.
- Add deploy prerequisites section/page.
- Add status table to README.
- Add issue/PR templates.
- Add CI badge.
- Add screenshot after homepage/demo polish.
- Commit the demo terminology cleanup and README/homepage changes.
