# Verification Runbook

This document describes how to verify all 15 workflows are operational after deployment.
Run via `.github/scripts/verification/e2e-test.sh` or manually using the steps below.

## Prerequisites

- `gh` CLI authenticated with sufficient scopes
- All consumer repos updated to `@v0.5.0`
- Configured: secret `GH_ACTION_AI_API_KEY` + variable `GH_ACTION_AI_BASE_URL` (empty for direct Anthropic), mapped to your provider

## Consumer Repos

- `JacobPEvans/nix` (nix)
- `JacobPEvans/terraform-proxmox`
- `JacobPEvans/ansible-proxmox-apps`

---

## Quick Auth Check

The fastest way to verify the `GH_ACTION_AI_*` namespace authenticates. No PR or issue needed.

```bash
# Dispatch the dogfood CI suite (runs a real claude-code-action step):
gh workflow run dogfood-ci.yml
gh run watch
```

**Pass condition**: Workflow completes with `conclusion: success`. To verify a provider swap, re-map the `GH_ACTION_AI_*` org values and re-run — no workflow edits needed.

---

## Test A: Issue Lifecycle Chain

Tests: **issue-triage**, **issue-resolver** (via issue-auto-resolve.yml), **claude-review**

**Target repo**: `JacobPEvans/ansible-proxmox-apps` (least activity)

**Trigger**:

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
gh issue create \
  --repo JacobPEvans/ansible-proxmox-apps \
  --title "chore: add comment to main playbook ($TIMESTAMP)" \
  --body "Add a brief descriptive comment to the top of site.yml" \
  --label ""
```

**Expected chain**:

1. `issues: [opened]` → **issue-triage** → adds `type:chore` + `size:xs` labels
2. `issues: [opened]` → **issue-resolver** (eligibility passes for chore+xs) → creates non-draft PR with signed commit
3. PR creation → **claude-review** triggers on `pull_request: [opened]`

**Verify**:

```bash
# Wait ~2 minutes, then check:
gh run list --repo JacobPEvans/ansible-proxmox-apps --workflow "Issue Triage" --limit 1 --json status,conclusion,url
gh run list --repo JacobPEvans/ansible-proxmox-apps --workflow "Issue Auto-Resolve" --limit 1 --json status,conclusion,url
gh run list --repo JacobPEvans/ansible-proxmox-apps --workflow "Claude Code Review" --limit 1 --json status,conclusion,url
# Check issue labels:
ISSUE=$(gh issue list --repo JacobPEvans/ansible-proxmox-apps --search "add comment to main playbook" --json number -q '.[0].number')
gh issue view $ISSUE --repo JacobPEvans/ansible-proxmox-apps --json labels
# Check for linked PR with signed commits and mergeable state:
PR=$(gh pr list --repo JacobPEvans/ansible-proxmox-apps --state open --json number,title -q '.[0].number')
HEAD_SHA=$(gh pr view $PR --repo JacobPEvans/ansible-proxmox-apps --json headRefOid -q '.headRefOid')
gh api "repos/JacobPEvans/ansible-proxmox-apps/commits/$HEAD_SHA" --jq '.commit.verification'
gh pr view $PR --repo JacobPEvans/ansible-proxmox-apps --json mergeStateStatus
```

**Pass condition**: issue-triage run has `conclusion: success`, issue has labels, non-draft PR created with `verification.verified: true`
and merge state CLEAN or UNSTABLE. If UNSTABLE and only **AI Moderator / conclusion** is failing, see
[AI Moderator UNSTABLE Workaround](PATTERNS.md#ai-moderator-unstable-workaround) — the failure is benign for admin-opened PRs.

---

## Test C: Post-Merge Chain

Tests: **post-merge-docs-review**, **post-merge-tests**

**Precondition**: Test A/B PR exists and is approved.

**Trigger**:

```bash
PR=$(gh pr list --repo JacobPEvans/ansible-proxmox-apps --state open --json number -q '.[0].number')
gh pr merge $PR --repo JacobPEvans/ansible-proxmox-apps --squash
```

**Expected**: `push: branches: [main]` triggers the `dispatch` job in both post-merge callers → re-triggers as `workflow_dispatch` → runs the reusable workflow

**Verify**:

```bash
# Check dispatch runs (event_name=push) — should show "dispatch" job succeeded:
gh run list --repo JacobPEvans/ansible-proxmox-apps --workflow "cc-Post-Merge Docs Review" --limit 2 --json status,conclusion,event,url
gh run list --repo JacobPEvans/ansible-proxmox-apps --workflow "cc-Post-Merge Tests" --limit 2 --json status,conclusion,event,url
```

**Pass condition**: Two runs each — a `push`-triggered dispatch run (success) and a `workflow_dispatch` review run.
The review run may skip via gate job (no test infra / no doc changes) — that is valid.

---

## Test D: CI Fix

Tests: **ci-fix**

**Target repo**: `JacobPEvans/terraform-proxmox` (has Markdown Lint CI)

**Trigger**:

```bash
# Create branch with intentional markdown lint error
git clone https://github.com/JacobPEvans/terraform-proxmox /tmp/tf-test
cd /tmp/tf-test
git checkout -b test/ci-fix-verification
# Add trailing whitespace to README
echo "test line with trailing space   " >> README.md
git add README.md
git commit -m "test: intentional lint error for ci-fix verification"
git push origin test/ci-fix-verification
gh pr create \
  --repo JacobPEvans/terraform-proxmox \
  --head test/ci-fix-verification \
  --base main \
  --title "test: CI fix verification" \
  --body "Intentional lint error to test ci-fix workflow. Close after verification."
```

**Expected**: Markdown Lint fails → `workflow_run: [completed]` with failure → **ci-fix** triggers

**Verify**:

```bash
# Wait ~3 minutes for CI to fail, then ci-fix to trigger:
gh run list --repo JacobPEvans/terraform-proxmox --workflow "cc-CI Fix" --limit 1 --json status,conclusion,url
```

**Pass condition**: ci-fix run triggered, attempts fix (pushes commit or posts comment).

**Cleanup**:

```bash
PR=$(gh pr list --repo JacobPEvans/terraform-proxmox --head test/ci-fix-verification --json number -q '.[0].number')
gh pr close $PR --repo JacobPEvans/terraform-proxmox
gh api -X DELETE repos/JacobPEvans/terraform-proxmox/git/refs/heads/test/ci-fix-verification
```

---

## Test E: Scheduled Workflows

These fire on cron — verify by checking the most recent run after deployment.

| Workflow | Schedule | Check Command |
|----------|----------|---------------|
| Best Practices Recommender | Wed 3am UTC | `gh run list --workflow "Best Practices Recommender"` |
| cc-Code Simplifier | Daily 4am UTC | `gh run list --workflow "cc-Code Simplifier"` |
| cc-Next Steps | Daily 5am UTC | `gh run list --workflow "cc-Next Steps"` |
| Issue Sweeper | Mon 6am UTC | `gh run list --workflow "Issue Sweeper"` |
| Issue Hygiene | Mon 7am UTC | `gh run list --workflow "Issue Hygiene"` |

Run across each consumer repo:

```bash
for REPO in JacobPEvans/nix JacobPEvans/terraform-proxmox JacobPEvans/ansible-proxmox-apps; do
  for WF in "Best Practices Recommender" "cc-Code Simplifier" "cc-Next Steps" "Issue Sweeper" "Issue Hygiene"; do
    echo "=== $REPO / $WF ==="
    gh run list --repo "$REPO" --workflow "$WF" --limit 1 \
      --json status,conclusion,createdAt,url 2>/dev/null || echo "Not found"
  done
done
```

**Pass condition**: `conclusion != "failure"`. Any result other than "failure" confirms the migration worked
(the old failure mode was "Invalid API key" at 0 tokens — ANY different result is a win).

---

## Summary

| Test | Workflows | Pass Condition |
|------|-----------|----------------|
| A: Issue Lifecycle | issue-triage, issue-resolver, claude-review | Labels applied, PR created, review runs |
| C: Post-Merge | post-merge-docs-review, post-merge-tests | Runs triggered (gate jobs execute) |
| D: CI Fix | ci-fix | Run triggered, fix attempted |
| E: Scheduled (next run) | best-practices, code-simplifier, next-steps, issue-sweeper, issue-hygiene | conclusion != failure |

**Total**: 11 of 14 workflows verified via real triggers. (claude-review is indirectly covered via Test A.)

---

## Test F: On-Demand Workflows (Manual Dispatch)

Tests: **label-sync**, **project-router**, **repo-orchestrator**

These workflows have no event trigger — they are `workflow_call` / `workflow_dispatch` only. Verify via manual dispatch:

```bash
for REPO in JacobPEvans/nix JacobPEvans/terraform-proxmox JacobPEvans/ansible-proxmox-apps; do
  echo "=== $REPO ==="
  gh workflow run "Label Sync" --repo "$REPO"
  sleep 5
  gh run list --repo "$REPO" --workflow "Label Sync" --limit 1 --json status,conclusion,url
done
```

**Pass condition**: Workflows triggered successfully (not stuck at startup_failure with 0 jobs).

Note: `project-router` and `repo-orchestrator` require real issue/PR events or project board configuration to do meaningful work —
verify they start without "Invalid API key" failures.
