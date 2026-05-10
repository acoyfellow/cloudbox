# 09 — Product readiness review

Lens: team lead/supportability/customer promise.

## Top blockers

1. Promise shifted from synthetic workspace to remote-computer verified runs; docs need to catch up consistently.
2. Deploy funnel exists but the deploy button is unverified for external accounts.
3. Public demo is current receipt workspace, not remote bugfix run, so expectation mismatch risk is high.
4. No issue templates or PR template for OSS contributors.

## Sharp questions

- What exactly will a Cloudflare customer get after clicking deploy?
- Which features are alpha vs roadmap?
- Who is the target user: individual agent builder, Cloudflare customer, or internal AX engineer?
- How should users report deploy failures?

## Actions

- Add `STATUS.md` or README status table.
- Add issue templates: deploy failure, bug, feature request.
- Add PR template.
- Make demo copy say what it demonstrates: receipts/artifacts/grading, not remote computer.
- Add explicit target audience copy.
