# ai-workflows

Reusable AI agent workflows for GitHub Actions. Each workflow is a
`workflow_call` reusable that your repository invokes with a thin caller file.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/dryvist/ai-workflows?style=social)](https://github.com/dryvist/ai-workflows/stargazers)

---

## What's Inside

| Workflow | Trigger | Schedule | What It Does |
|----------|---------|----------|--------------|
| `best-practices.yml` | `workflow_call` | Wed 3am UTC | Weekly audit creating actionable best-practices recommendations |
| `cc-ci-fix.yml` | `workflow_run` | On CI failure | Analyzes failed CI logs and pushes fixes (max 2 attempts per PR) |
| `cc-dep-review.yml` | `pull_request: [opened]` | On Renovate PR | Posts one AI risk-assessment comment on major/minor dependency PRs (breaking changes, migrations, verdict) |
| `cc-code-simplifier.yml` | `workflow_call` | Daily 4am UTC | Simplifies recently changed code for clarity and maintainability (functionality preserved); opens a PR |
| `issue-hygiene.yml` | `workflow_call` | Mon 7am UTC | Detects duplicates, links merged PRs, flags stale issues |
| `cc-issue-resolver.yml` | `issues: [opened]` | On issue open | Creates draft PRs for simple, well-scoped issues |
| `issue-backlog-sweep.yml` | `workflow_call` | Weekly (consumer) | Labels the oldest untriaged issues so `ai:ready` ones enter the resolver — shrinks a pre-existing backlog |
| `issue-sweeper.yml` | `workflow_call` | Mon 6am UTC | Scans open issues, comments on progress, closes resolved |
| `issue-triage.yml` | `issues: [opened]` | On issue open | Categorizes, deduplicates, and labels new issues |
| `label-sync.yml` | `workflow_call` | On-demand | Syncs a canonical label set into target repositories |
| `cc-next-steps.yml` | `workflow_call` | Daily 5am UTC | Analyzes merge momentum, suggests next logical action |
| `notify-ai-pr.yml` | `pull_request` | On bot PR open | Posts Slack notification to a configured channel when an AI agent opens a PR |
| `cc-post-merge-docs-review.yml` | `workflow_call` (dispatch pattern) | On merge | Reviews documentation after merges, creates fix PRs |
| `cc-post-merge-tests.yml` | `workflow_call` (dispatch pattern) | On merge | Analyzes merged code, creates draft PRs with targeted tests |
| `pr-issue-linker.yml` | `pull_request` | On PR open/close | Auto-links PRs to referenced issues via Development sidebar |
| `project-router.yml` | `workflow_call` | On issue/PR events | Routes items to GitHub Projects with smart field assignment |
| `repo-orchestrator.yml` | `workflow_call` | On-demand | Hub-and-spoke multi-repo workflow dispatcher |

---

## Installation

### Prerequisites

1. [GitHub CLI](https://cli.github.com/) installed and authenticated
2. One secret + base-URL variable configured at the org (or repo) level:
   - Secret `GH_ACTION_AI_API_KEY` — your AI provider's API key (required by all workflows)
   - Variable `GH_ACTION_AI_BASE_URL` — provider base URL (leave empty for direct Anthropic)

### Authentication

All workflows reference a single **provider-agnostic** namespace, so you can
switch providers at the org level without touching any workflow. Configure these
org (or repo) variables and secret:

1. **Secret**: `GH_ACTION_AI_API_KEY` — your AI provider's API key (set a spend limit at the provider)
2. **Variable**: `GH_ACTION_AI_BASE_URL` — provider base URL; leave empty for direct Anthropic (`https://api.anthropic.com`)
3. **Variable**: `GH_ACTION_AI_MODEL` — default model name for your provider

Set them with the GitHub CLI (org-level shown; drop `--org dryvist` for repo-level):

```bash
gh secret   set GH_ACTION_AI_API_KEY   --org dryvist   # paste your key
gh variable set GH_ACTION_AI_BASE_URL  --org dryvist -b ""                       # empty = direct Anthropic
gh variable set GH_ACTION_AI_MODEL     --org dryvist -b "claude-sonnet-4-6"
```

Set per-category vars (`GH_ACTION_AI_MODEL_CODE`, `_ISSUES`, `_PLAN`) to tier
models by task; each falls back to `GH_ACTION_AI_MODEL`. `cc-post-merge-docs-review`
and `cc-post-merge-tests` require at least `GH_ACTION_AI_MODEL` and fail with a
clear error when unset. See [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for
provider mapping examples and model configuration.

---

## Usage

Add a thin caller file to your repository that points at the reusable workflow
you want. Example for issue triage:

```yaml
# .github/workflows/issue-triage.yml
name: Issue Triage
on:
  issues:
    types: [opened]
permissions:
  contents: read
  id-token: write
  issues: write
jobs:
  triage:
    uses: dryvist/ai-workflows/.github/workflows/issue-triage.yml@main
    secrets: inherit
```

For scheduled workflows:

```yaml
# .github/workflows/issue-sweeper.yml
name: Issue Sweeper
on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:
permissions:
  contents: read
  id-token: write
  issues: write
  pull-requests: read
jobs:
  sweep:
    uses: dryvist/ai-workflows/.github/workflows/issue-sweeper.yml@main
    secrets: inherit
```

Each caller declares only the `permissions` the workflow needs and passes
secrets through with `secrets: inherit`. See
[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for the full list of workflows
with their required permissions.

---

## Architecture

```text
.github/
  prompts/              # Prompt files (one per workflow)
  scripts/
    render-prompt.sh    # Shared: envsubst + GITHUB_OUTPUT
    best-practices/     # Extracted JS scripts per workflow
    ci-fail-issue/
    ci-fix/
    issue-linker/
    issue-resolver/
    notification/
    post-merge-docs-review/
    post-merge-tests/
    shared/             # Shared scripts (check-daily-limit.js, constants.js)
    verification/       # E2E test script
  workflows/            # Reusable workflow YAML definitions
docs/                   # Documentation and verification runbook
```

All workflows use `anthropics/claude-code-action@v1` with OIDC auth (`id-token: write`).
Prompts are rendered at runtime via `render-prompt.sh` and a sparse checkout of
this repository's prompts and scripts:

```yaml
- uses: actions/checkout@v6
  with:
    repository: dryvist/ai-workflows
    sparse-checkout: |
      .github/prompts
      .github/scripts
    path: .ai-workflows
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding new workflows.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

[MIT](LICENSE)

---

> Part of a [larger ecosystem of ~40 repos](https://docs.jacobpevans.com) — see how it all fits together.
