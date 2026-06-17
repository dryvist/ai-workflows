# ai-workflows

Reusable AI agent workflows for GitHub Actions. Consumer repos call these with thin ~10-20 line callers.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/dryvist/ai-workflows?style=social)](https://github.com/dryvist/ai-workflows/stargazers)

---

## What's Inside

| Workflow | Trigger | Schedule | What It Does |
|----------|---------|----------|--------------|
| `best-practices.yml` | `workflow_call` | Wed 3am UTC | Weekly audit creating actionable best-practices recommendations |
| `ci-fix.yml` | `workflow_run` | On CI failure | Analyzes failed CI logs and pushes fixes (max 2 attempts per PR) |
| `claude-review.yml` | `pull_request` | On PR open/sync | Reviews PRs for quality, security, and best practices |
| `code-simplifier.yml` | `workflow_call` | Daily 4am UTC | DRY enforcement, dead code removal, creates draft PRs |
| `final-pr-review.yml` | `pull_request_review` | On PR review | Final review gate before merge |
| `issue-hygiene.yml` | `workflow_call` | Mon 7am UTC | Detects duplicates, links merged PRs, flags stale issues |
| `issue-resolver.yml` | `issues: [opened]` | On issue open | Creates draft PRs for simple, well-scoped issues |
| `issue-sweeper.yml` | `workflow_call` | Mon 6am UTC | Scans open issues, comments on progress, closes resolved |
| `issue-triage.yml` | `issues: [opened]` | On issue open | Categorizes, deduplicates, and labels new issues |
| `label-sync.yml` | `workflow_call` | On-demand | Syncs canonical labels from `.github` repo to all targets |
| `next-steps.yml` | `workflow_call` | Daily 5am UTC | Analyzes merge momentum, suggests next logical action |
| `notify-ai-pr.yml` | `pull_request` | On bot PR open | Posts Slack notification to a configured channel when an AI agent opens a PR |
| `post-merge-docs-review.yml` | `workflow_call` (dispatch pattern) | On merge | Reviews documentation after merges, creates fix PRs |
| `post-merge-tests.yml` | `workflow_call` (dispatch pattern) | On merge | Analyzes merged code, creates draft PRs with targeted tests |
| `pr-issue-linker.yml` | `pull_request` | On PR open/close | Auto-links PRs to referenced issues via Development sidebar |
| `project-router.yml` | `workflow_call` | On issue/PR events | Routes items to GitHub Projects with smart field assignment |
| `repo-orchestrator.yml` | `workflow_call` | On-demand | Hub-and-spoke multi-repo workflow dispatcher |

---

## Quick Start

### Prerequisites

1. [GitHub CLI](https://cli.github.com/) installed and authenticated
2. One secret configured in each consumer repo:
   - `AI_TOKEN` — provider credential for Claude Code Action workflows

### Add a Workflow to Your Repo

Create a thin caller file in your repo. Example for issue triage:

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
    uses: dryvist/ai-workflows/.github/workflows/issue-triage.yml@v0
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
    uses: dryvist/ai-workflows/.github/workflows/issue-sweeper.yml@v0
    secrets: inherit
```

See [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for the full list of workflows with required permissions.

---

## Authentication

Claude Code Action workflows default to Claude OAuth and use AI-agnostic configuration names:

- **Secret**: `AI_TOKEN` — provider credential
- **Variable**: `AI_PROVIDER` — `claude_oauth` by default; set `openrouter`, `anthropic_api`, or `anthropic_compatible` to switch providers
- **Variable or secret**: `AI_BASE_URL` — required only for routed Anthropic-compatible providers such as OpenRouter
- **Variables**: `AI_MODEL`, or category-specific `AI_MODEL_DOCS`, `AI_MODEL_CODE`, `AI_MODEL_REVIEW`, `AI_MODEL_ISSUES`, `AI_MODEL_OPS`, `AI_MODEL_PLAN`

Model defaults are Claude (`sonnet`) unless org variables choose a different model. OpenRouter remains supported by setting only secrets and variables; no workflow code changes are required. See [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for provider configuration and GH-AW-specific limits.

---

## Architecture

```
.github/
  aw/                   # gh-aw import cache and action lock metadata
  prompts/              # Prompt files (one per workflow)
  scripts/
    render-prompt.sh    # Shared: envsubst + GITHUB_OUTPUT
    best-practices/     # Extracted JS scripts per workflow
    ci-fail-issue/
    ci-fix/
    claude-review/
    final-pr-review/
    issue-linker/
    issue-resolver/
    notification/
    post-merge-docs-review/
    post-merge-tests/
    shared/             # Shared scripts (check-daily-limit.js, constants.js)
    verification/       # E2E test script
  workflows/            # Reusable workflow YAML definitions
    *.md                # GitHub Agentic Workflow source wrappers
    *.lock.yml          # Generated gh-aw workflows
docs/                   # Documentation and verification runbook
```

Reusable `.yml` workflows use `claude-code-action@v1` with OIDC auth
(`id-token: write`) through the shared `run-claude-code` action. Prompts are
rendered at runtime via `render-prompt.sh` and the cross-repo checkout pattern:

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
