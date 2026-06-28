# Getting Started

Add ai-workflows reusable workflows to your repository using thin caller files.

## Prerequisites

1. [GitHub CLI](https://cli.github.com/) installed and authenticated
2. One secret + base-URL variable configured at the org (or repo) level:
   - Secret `GH_ACTION_AI_API_KEY` — your AI provider's API key (required by all workflows; see [README — Authentication](../README.md#authentication))
   - Variable `GH_ACTION_AI_BASE_URL` — provider base URL (leave empty for direct Anthropic)

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
    uses: dryvist/ai-workflows/.github/workflows/<name>.yml@main
    secrets: inherit
```

**Important**: Consumer callers must declare `permissions:` explicitly. CodeQL and branch protection rules may block merges if permissions are missing.

**Versioning**: Always pin `@main`, never a SemVer tag or SHA. `ai-workflows` is a first-party `dryvist/*` reusable workflow, so consumers ride `@main` and pick up fixes the moment they land — no per-repo Renovate PR. SemVer tags still exist (release-please keeps bumping them for the changelog and the per-run resolved-SHA audit trail), but callers do not pin them. The org scanners are configured to allow `@main`; see [CI/CD policy → scanner posture](https://docs.jacobpevans.com/infrastructure/cicd/policy#scanner-posture-for-self-references).

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

#### `cc-issue-resolver.yml`
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

#### `cc-ci-fix.yml`
Triggered by `workflow_run` with `conclusion: failure`. Analyzes CI failure logs and pushes fixes.

```yaml
on:
  workflow_run:
    workflows: ["CI"]    # name of your CI workflow
    types: [completed]
permissions:
  actions: read
  contents: write
  id-token: write
  issues: write
  pull-requests: write
```

Inputs: `repo_context` (required), `ci_structure` (required), `extra_tools` (optional)

#### `cc-post-merge-docs-review.yml`
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

#### `cc-post-merge-tests.yml`
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

#### `cc-code-simplifier.yml`
Simplifies recently changed code for clarity and maintainability (preserving functionality); opens a PR.

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

#### `cc-next-steps.yml`
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

---

## Verifying Deployment

After adding callers to your repo, use the verification runbook at [VERIFICATION.md](VERIFICATION.md)
or run the e2e test script:

```bash
bash .github/scripts/verification/e2e-test.sh check-scheduled
bash .github/scripts/verification/e2e-test.sh issue-lifecycle JacobPEvans/my-repo
```
