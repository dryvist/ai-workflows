# Getting Started

Add ai-workflows reusable workflows to your repository using thin caller files.

## Prerequisites

1. [GitHub CLI](https://cli.github.com/) installed and authenticated
2. Select an agent with variable `GH_ACTION_AI_AGENT` (`claude` or `codex`;
   omitted means `claude`) and configure the model router pair, secrets
   `LLM_ROUTER_BASE_URL` and `LLM_ROUTER_API_KEY`

## How It Works

Each reusable workflow in this repo exposes `on: workflow_call`. You create a small "thin caller" file in your repo that calls it with `uses:`.
The reusable workflow handles all the logic; you just provide triggers, secrets, and permissions.

## Thin Caller Template

```yaml
# .github/workflows/<name>.yml in your consumer repo
name: <Workflow Name>
on:
  <trigger>:
    types: [<event>]
permissions:
  contents: read           # minimum needed by this workflow
  issues: write            # add what this workflow needs
jobs:
  run:
    uses: dryvist/ai-workflows/.github/workflows/<name>.yml@<40-hex-sha> # vX.Y.Z
    secrets: inherit
```

**Important**: Consumer callers must declare `permissions:` explicitly. CodeQL and branch protection rules may block merges if permissions are missing.

**Versioning**: Pin the reusable workflow to a full 40-character commit SHA, with the release tag in a trailing comment. Do not pin
`@main`, `@develop`, a branch, or a bare major tag such as `@vN`. Renovate moves the SHA and the comment together. A patch bump merges
after the Merge Gate is green. A minor or major bump is merged by a person.

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
  issues: write
  pull-requests: write
```

Inputs: `repo_context` (required), `file_patterns` (optional)

#### `cc-ci-fix.yml`

Call after the CI jobs fail. The reusable workflow reads the originating run and routes same-repository PR
failures to repair and default-branch failures to issue creation. Existing `workflow_run` callers remain
compatible during migration.

```yaml
jobs:
  ci-failure-handler:
    needs: [ci]
    if: >-
      always() && !cancelled() && needs.ci.result == 'failure' &&
      (github.event_name != 'pull_request' ||
       github.event.pull_request.head.repo.full_name == github.repository)
    permissions:
      actions: read
      contents: write
      id-token: write # required by the OIDC credential step in the fix job
      issues: write
      pull-requests: write
    uses: dryvist/ai-workflows/.github/workflows/suite-ci.yml@<40-hex-sha> # vX.Y.Z
    with:
      workflow_name: CI
      repo_context: Brief description of this repository
      ci_structure: Description of the CI jobs and checks
      failure_conclusion: failure
      failure_run_id: ${{ github.run_id }}
      failure_run_url: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
      failure_head_branch: ${{ github.head_ref || github.ref_name }}
      failure_head_sha: ${{ github.event.pull_request.head.sha || github.sha }}
      failure_head_repository: >-
        ${{ github.event_name == 'pull_request' &&
        github.event.pull_request.head.repo.full_name ||
        github.event_name != 'pull_request' && github.repository }}
      failure_actor: ${{ github.actor }}
    secrets:
      LLM_ROUTER_BASE_URL: ${{ secrets.LLM_ROUTER_BASE_URL }}
      LLM_ROUTER_API_KEY: ${{ secrets.LLM_ROUTER_API_KEY }}
      GH_APP_CLAUDE_BOT_PRIVATE_KEY: ${{ secrets.GH_APP_CLAUDE_BOT_PRIVATE_KEY }}
```

The caller must grant `id-token: write`. The fix job's OIDC credential step requires it, and a called workflow
cannot elevate the caller's token, so a caller without it fails at startup.

Inputs: `repo_context` (required), `ci_structure` (required), `extra_tools` (optional)

#### `cc-post-merge-docs-review.yml`

Triggered via the dispatch pattern — consumer caller listens on `push: branches: [main]` and re-dispatches as `workflow_dispatch`.
The common provider-neutral contract retains the existing dispatch boundary.

```yaml
# Required permissions for the dispatch pattern
permissions:
  actions: write   # required for gh workflow run
  contents: write
  pull-requests: write
```

See [docs/PATTERNS.md — Post-Merge Dispatch Pattern](PATTERNS.md#post-merge-dispatch-pattern) for the full two-job consumer caller template.

#### `cc-post-merge-tests.yml`

Triggered via the dispatch pattern — consumer caller listens on `push: branches: [main]` and re-dispatches as `workflow_dispatch`.
The common provider-neutral contract retains the existing dispatch boundary.

```yaml
# Required permissions for the dispatch pattern
permissions:
  actions: write   # required for gh workflow run
  contents: write
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
  actions: read # daily run limit check lists workflow runs
  contents: read
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
  actions: read # daily run limit check lists workflow runs
  contents: write
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
  issues: write
  pull-requests: read
```

#### `cc-next-steps.yml`

Daily momentum analyzer, creates issues or PRs with suggested next actions.

```yaml
on:
  schedule:
    - cron: "0 5 * * *"    # Daily 5am UTC
  workflow_dispatch:
permissions:
  actions: read # daily run limit check lists workflow runs
  contents: write
  issues: write
  pull-requests: write
```

---

## Verifying Deployment

After adding callers to your repo, use the verification runbook at [VERIFICATION.md](VERIFICATION.md)
or run the e2e test script:

```bash
bash .github/scripts/verification/e2e-test.sh check-scheduled
bash .github/scripts/verification/e2e-test.sh issue-lifecycle JacobPEvans/my-repo
```
