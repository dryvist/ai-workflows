# ai-workflows

Reusable AI agent workflows for GitHub Actions. Each workflow is a
`workflow_call` reusable that your repository invokes with a thin caller file.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/dryvist/ai-workflows?style=social)](https://github.com/dryvist/ai-workflows/stargazers)

---

## What's Inside

| Workflow | Trigger | Schedule | What It Does |
| ---------- | --------- | ---------- | -------------- |
| `best-practices.yml` | `workflow_call` | Wed 3am UTC | Weekly audit creating actionable best-practices recommendations |
| `cc-ci-fix.yml` | `workflow_run` | On CI failure | Analyzes failed CI logs and pushes fixes (max 2 attempts per PR) |
| `cc-dep-review.yml` | `pull_request: [opened]` | On Renovate PR | Native Dependency Review + advisory AI `risk:*` label + sticky comment; Renovate merges |
| `cc-code-simplifier.yml` | `workflow_call` | Daily 4am UTC | Simplifies recently changed code for clarity (functionality preserved); opens a PR |
| `cc-release-notes.yml` | `pull_request` | On release PR | Posts sticky AI release-highlights comment on release-please PRs (refreshed per head SHA) |
| `issue-hygiene.yml` | `workflow_call` | Mon 7am UTC | Detects duplicates, links merged PRs, flags stale issues |
| `cc-issue-resolver.yml` | `issues: [opened]` | On issue open | Creates draft PRs for simple, well-scoped issues |
| `issue-backlog-sweep.yml` | `workflow_call` | Weekly (consumer) | Labels the oldest untriaged issues so `ai:ready` ones enter the resolver |
| `issue-sweeper.yml` | `workflow_call` | Mon 6am UTC | Scans open issues, comments on progress, closes resolved |
| `issue-triage.yml` | `issues: [opened]` | On issue open | Categorizes, deduplicates, and labels new issues |
| `local-review.yml` | `workflow_call` | On PR (consumer) | Cheap/local model reviews the diff against a repo checklist; one sticky advisory comment |
| `label-sync.yml` | `workflow_call` | On-demand | Syncs a canonical label set into target repositories |
| `cc-next-steps.yml` | `workflow_call` | Daily 5am UTC | Analyzes merge momentum, suggests next logical action |
| `notify-ai-pr.yml` | `pull_request` | On bot PR open | Posts Slack notification to a configured channel when an AI agent opens a PR |
| `cc-post-merge-docs-review.yml` | `workflow_call` (dispatch pattern) | On merge | Reviews documentation after merges, creates fix PRs |
| `cc-post-merge-tests.yml` | `workflow_call` (dispatch pattern) | On merge | Analyzes merged code, creates draft PRs with targeted tests |
| `cc-pr-review-responder.yml` | `pull_request_review*` | On PR review (consumer) | Fixes valid review feedback, replies, resolves threads (never merges) |
| `pr-issue-linker.yml` | `pull_request` | On PR open/close | Auto-links PRs to referenced issues via Development sidebar |
| `project-router.yml` | `workflow_call` | On issue/PR events | Routes items to GitHub Projects with smart field assignment |
| `repo-orchestrator.yml` | `workflow_call` | On-demand | Hub-and-spoke multi-repo workflow dispatcher |
| `review-thread-resolver.yml` | `workflow_call` | Hourly org sweep (hub) | Resolves outdated/failed bot review threads that block merges — no AI tokens |
| `thread-triage.yml` | `workflow_call` | On PR review (consumer) | Cheap model classifies each unresolved review thread; one sticky advisory comment |

---

## Installation

### Prerequisites

1. [GitHub CLI](https://cli.github.com/) installed and authenticated
2. The credential for the selected agent configured at the org (or repo) level:
   - Claude: secret `GH_ACTION_AI_API_KEY`
   - Codex: secret `OPENAI_API_KEY`

### Authentication

Every AI workflow selects the implementation from one org (or repo) variable:
`GH_ACTION_AI_AGENT=claude|codex`. It defaults to `claude`, so existing callers
keep working. Each provider keeps its native credential contract:

1. **Variable**: `GH_ACTION_AI_AGENT` — `claude` or `codex`; omitted means `claude`
2. **Secret**: `GH_ACTION_AI_API_KEY` — Anthropic API key used only by Claude
3. **Secret**: `OPENAI_API_KEY` — OpenAI API key used only by Codex

Model, endpoint, effort, and Codex CLI version are optional variables. Leaving
them unset lets each upstream action use its current default.

Set them with the GitHub CLI (org-level shown; drop `--org dryvist` for repo-level):

```bash
gh variable set GH_ACTION_AI_AGENT --org dryvist -b "codex"
gh secret set OPENAI_API_KEY --org dryvist
```

See [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for the complete variable
contract, optional provider tuning, and explicit-secret caller examples.

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

All AI workflows use the shared `run-ai-agent` adapter, which selects Claude or
Codex from `GH_ACTION_AI_AGENT`. Prompts are rendered at runtime via
`render-prompt.sh`; scripts come from this repository and prompt assets come
from the immutable `dryvist/ai-llm-prompts` catalog:

```yaml
- uses: actions/checkout@v7
  with:
    repository: dryvist/ai-workflows
    sparse-checkout: .github/scripts
    path: .ai-workflows
- uses: actions/checkout@v7
  with:
    repository: dryvist/ai-llm-prompts
    ref: 0431be6994d51169b9f705ddeba958eb8a4d0fc4
    sparse-checkout: automation
    sparse-checkout-cone-mode: false
    path: .ai-llm-prompts
```

GitHub Agentic Workflows are no longer an active runtime dependency. One
[historical GH-AW reference template][gh-aw-template] remains in the prompt
catalog for format archaeology; this repository does not compile or execute it.

---

[gh-aw-template]: https://github.com/dryvist/ai-llm-prompts/blob/v0.1.0/automation/gh-aw-reference-template.md

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding new workflows.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

[MIT](LICENSE)

---

> Part of a [larger ecosystem of ~40 repos](https://docs.jacobpevans.com) — see how it all fits together.
