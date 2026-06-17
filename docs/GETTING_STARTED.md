# Getting Started

Add ai-workflows reusable workflows to your repository using thin caller files.

## Prerequisites

1. [GitHub CLI](https://cli.github.com/) installed and authenticated
2. One secret configured in your repository:
   - `AI_TOKEN` — provider credential for Claude Code Action workflows; see [README — Authentication](../README.md#authentication)
3. Optional variables when you want to override defaults:
   - `AI_PROVIDER` — defaults to `claude_oauth`
   - `AI_BASE_URL` — required for `openrouter` or another Anthropic-compatible router
   - `AI_MODEL` or category model variables such as `AI_MODEL_DOCS`

## How It Works

Each reusable workflow in this repo exposes `on: workflow_call`. You create a small "thin caller" file in your repo that calls it with `uses:`. The reusable workflow handles all the logic; you just provide triggers, secrets, and permissions.

## Thin Caller Template

```yaml
# .github/workflows/<name>.yml in your consumer repo
name: <Workflow Name>
on:
  <trigger>:
    types: [<event>]
permissions:
  contents: read           # minimum needed by this workflow
  id-token: write          # required for OIDC auth
  issues: write            # add what this workflow needs
jobs:
  run:
    uses: dryvist/ai-workflows/.github/workflows/<name>.yml@v0
    secrets: inherit
```

**Important**: Consumer callers must declare `permissions:` explicitly. CodeQL and branch protection rules may block merges if permissions are missing.

---

## Available Workflows

### Event-Triggered Workflows

#### `issue-triage.yml`
Triggered by `issues: [opened]`. Categorizes, deduplicates, and labels new issues.

```yaml
on:
  issues:
    types: [opened]
permissions:
  contents: read
  id-token: write
  issues: write
```

#### `issue-resolver.yml`
Triggered by `issues: [opened]`. Creates draft PRs for simple, well-scoped issues.

```yaml
on:
  issues:
    types: [opened]
permissions:
  contents: write
  id-token: write
  issues: write
  pull-requests: write
```

Inputs: `repo_context` (required), `file_patterns` (optional)

#### `claude-review.yml`
Triggered by `pull_request`. Reviews PRs for quality and best practices.

```yaml
on:
  pull_request:
    types: [opened, synchronize, ready_for_review]
permissions:
  actions: read
  contents: read
  id-token: write
  issues: write
  pull-requests: write
```

#### `final-pr-review.yml`
Triggered by `pull_request_review`. Final review gate before merge.

```yaml
on:
  pull_request_review:
    types: [submitted]
permissions:
  checks: read
  contents: read
  id-token: write
  issues: write
  pull-requests: write
```

#### `ci-fix.yml`
Triggered by `workflow_run` when your CI workflow completes. When the run
**failed** on a PR branch, Claude analyzes the failure logs and pushes a fix
commit to that PR branch (max 2 attempts/PR) — it never merges. The reusable
workflow itself gates on `conclusion == 'failure'`, so a successful CI run is a
no-op; you do not need a conclusion guard in your caller.

Complete copy-pasteable caller (also available at
[`examples/ci-fix-caller.yml`](../examples/ci-fix-caller.yml)):

```yaml
# .github/workflows/ci-fix.yml in your consumer repo
name: CI Fix (Claude)
on:
  workflow_run:
    workflows: ["CI"]    # exact name: of your CI workflow
    types: [completed]
permissions:
  actions: read
  contents: write
  id-token: write
  issues: write
  pull-requests: write
jobs:
  ci-fix:
    uses: dryvist/ai-workflows/.github/workflows/ci-fix.yml@v0
    secrets: inherit
    with:
      repo_context: "Node service; tests with bun, lint with eslint."
      ci_structure: "CI runs lint + unit tests on every PR."
      # extra_tools: "Bash(bun:*)"   # optional: extra allowed tools
```

Inputs: `repo_context` (required), `ci_structure` (required), `extra_tools`
(optional), `daily_run_limit` (optional, default `5`), `runner_label`
(optional).

Required secrets/variables (set on the consumer repo or org):

- `AI_TOKEN` (secret) — the Claude OAuth token (default `AI_PROVIDER=claude_oauth`).
- `AI_MODEL_CODE` or `AI_MODEL` (variable) — e.g. `sonnet` or `haiku`.
- `GH_APP_CLAUDE_BOT_ID` (variable) and `GH_APP_CLAUDE_BOT_PRIVATE_KEY` (secret) —
  the GitHub App used to sign and attribute the fix commit. Required because
  this workflow writes commits; see [AUTHENTICATION.md — GitHub App Attribution](AUTHENTICATION.md#github-app-attribution).

#### `post-merge-docs-review.yml`
Triggered via the dispatch pattern — consumer caller listens on `push: branches: [main]` and re-dispatches as `workflow_dispatch`. `push` events are not directly supported by `claude-code-action@v1`.

```yaml
# Required permissions for the dispatch pattern
permissions:
  actions: write   # required for gh workflow run
  contents: write
  id-token: write
  pull-requests: write
```

See [docs/PATTERNS.md — Post-Merge Dispatch Pattern](PATTERNS.md#post-merge-dispatch-pattern) for the full two-job consumer caller template.

#### `post-merge-tests.yml`
Triggered via the dispatch pattern — consumer caller listens on `push: branches: [main]` and re-dispatches as `workflow_dispatch`. `push` events are not directly supported by `claude-code-action@v1`.

```yaml
# Required permissions for the dispatch pattern
permissions:
  actions: write   # required for gh workflow run
  contents: write
  id-token: write
  pull-requests: write
```

See [docs/PATTERNS.md — Post-Merge Dispatch Pattern](PATTERNS.md#post-merge-dispatch-pattern) for the full two-job consumer caller template.

#### `project-router.yml`
Triggered by issue/PR events. Routes items to GitHub Projects.

```yaml
on:
  issues:
    types: [opened, labeled]
  pull_request:
    types: [opened, ready_for_review]
permissions:
  contents: read
  id-token: write
  issues: write
  pull-requests: read
```

---

### Scheduled Workflows

These are typically called with `schedule:` and `workflow_dispatch:`.

#### `best-practices.yml`
Weekly audit creating actionable recommendations. Gate: skips if no recent human activity.

```yaml
on:
  schedule:
    - cron: "0 3 * * 3"    # Wed 3am UTC
  workflow_dispatch:
permissions:
  contents: read
  id-token: write
  issues: write
  pull-requests: read
```

#### `code-simplifier.yml`
Nightly DRY enforcement, creates draft PRs.

```yaml
on:
  schedule:
    - cron: "0 4 * * *"    # Daily 4am UTC
  workflow_dispatch:
permissions:
  contents: write
  id-token: write
  pull-requests: write
```

#### `issue-hygiene.yml`
Weekly duplicate detection, links merged PRs.

```yaml
on:
  schedule:
    - cron: "0 7 * * 1"    # Mon 7am UTC
  workflow_dispatch:
permissions:
  contents: read
  id-token: write
  issues: write
  pull-requests: read
```

#### `issue-sweeper.yml`
Weekly scan of open issues, closes resolved ones.

```yaml
on:
  schedule:
    - cron: "0 6 * * 1"    # Mon 6am UTC
  workflow_dispatch:
permissions:
  contents: read
  id-token: write
  issues: write
  pull-requests: read
```

#### `label-sync.yml`
Syncs canonical labels from `.github` repo.

```yaml
on:
  schedule:
    - cron: "0 5 * * 0"    # Sun 5am UTC
  workflow_dispatch:
permissions:
  contents: read
  id-token: write
  issues: write
```

#### `next-steps.yml`
Daily momentum analyzer, creates issues or PRs with suggested next actions.

```yaml
on:
  schedule:
    - cron: "0 5 * * *"    # Daily 5am UTC
  workflow_dispatch:
permissions:
  contents: write
  id-token: write
  issues: write
  pull-requests: write
```

#### `repo-orchestrator.yml`
On-demand multi-repo workflow dispatcher.

```yaml
on:
  workflow_dispatch:
permissions:
  actions: write
  contents: read
  id-token: write
```

#### Public docs updater
The public docs updater is a GitHub Agentic Workflow wrapper importing
GitHubNext Agentics `doc-updater.md`. GH-AW workflows are not `workflow_call`
reusable workflows, so the executable `.md` source and compiled `.lock.yml` live
in the target docs repository that should receive the PR, not in this reusable
workflow catalog.

```yaml
on:
  schedule: daily
  workflow_dispatch:
permissions:
  contents: read
  issues: read
  pull-requests: read
```

This workflow uses GH-AW engine authentication, not the Claude Code Action
`AI_TOKEN` contract. With the current pinned GH-AW compiler, the wrapper uses
the Copilot engine and its GH-AW-managed secrets.

---

## Verifying Deployment

After adding callers to your repo, use the verification runbook at [VERIFICATION.md](VERIFICATION.md)
or run the e2e test script:

```bash
bash .github/scripts/verification/e2e-test.sh check-scheduled
bash .github/scripts/verification/e2e-test.sh issue-lifecycle JacobPEvans/my-repo
```
