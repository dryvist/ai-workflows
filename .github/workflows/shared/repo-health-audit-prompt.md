# Repo Health Audit

## Step 1 — Parent issue

Create `[health-audit] Daily Health Audit - <YYYY-MM-DD>` (today's date from the workflow run timestamp).
`ai:created` is applied automatically. Use `add-labels` for `type:chore`, `priority:low`, `size:xs`.
Body holds the summary table from Step 3.

## Step 2 — Per-category findings

For each row below, gather findings. If any exist, file a sub-issue `[health-audit] <Category>` that
links to the parent, lists findings concisely (IDs + dates), and applies the listed labels. No findings = Pass.

| Category | Detection / window | Exclusions | Labels |
| --- | --- | --- | --- |
| Failed CI on Main | runs on `main`, last 7d, conclusion=failure or cancelled | — | type:ci, size:xs; priority:high if any failure <24h, else priority:medium |
| Failed CI on Open PRs | most-recent check suite failing >48h | drafts, Renovate, Dependabot | type:ci, priority:medium, size:xs |
| CodeQL Alerts | open code-scanning alerts, group by severity | — | type:security, size:xs; priority:critical if any high+, else priority:medium |
| Dependency Alerts | open Dependabot/Renovate vuln alerts (pkg, severity, CVE) | — | type:security, size:xs; priority:critical/high/medium per max severity |
| Secret Scanning | open secret-scanning alerts — alert *type* only, never the value | — | type:security, priority:critical, size:xs |
| Stale PRs | open >7d, no activity last 7d | drafts, Renovate, Dependabot, copilot | type:chore, priority:low, size:xs |
| Failed Scheduled Workflows | cron tiers: daily-or-more=25h, weekly=8d, monthly=skip | self | type:ci, priority:high, size:xs |

## Step 3 — Finalize parent

Update the parent body with a Pass/Fail summary table for all 7 categories, one-line note each.
Create the parent even if all categories pass — it serves as an audit trail.
