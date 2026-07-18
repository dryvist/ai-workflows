# ai-workflows

Reusable AI agent workflows for GitHub Actions. Consumer repos call these with thin ~10-20 line callers.

## Architecture

This repo is the single source of truth for CI/CD automation workflows.
Each workflow is a GitHub reusable workflow (`on: workflow_call`) that consumer
repos invoke via `uses: dryvist/ai-workflows/.github/workflows/<name>.yml@main`.

### Directory Structure

```text
.github/
  prompts/
    *.md                            # Prompt files (one per workflow)
  scripts/
    render-prompt.sh                # Shared: envsubst + GITHUB_OUTPUT
    best-practices/                 # Extracted JS scripts per workflow
    ci-fail-issue/
    ci-fix/
    dep-review/
    issue-backlog-sweep/
    issue-linker/
    issue-resolver/
    notification/
    post-merge-docs-review/
    post-merge-tests/
    release-notes/
    review-thread-resolver/
    shared/
    verification/
  workflows/
    *.yml                           # Pure YAML workflow definitions (no embedded content)
```

### Workflow Types

**All AI workflows use the shared `run-ai-agent` adapter.** The adapter selects
Claude or Codex from `GH_ACTION_AI_AGENT` and defaults to Claude.
Non-AI utility workflows (`notify-ai-pr`, `ci-fail-issue`,
`review-thread-resolver`) use plain `actions/github-script` — see
docs/PATTERNS.md "Non-AI Utility Workflow Pattern".

- Prompts rendered via `render-prompt.sh` + step output (envsubst)
- Static prompts: most workflows
- Dynamic prompts (ci-fix, post-merge-tests, post-merge-docs-review): `render-prompt.sh` with named env vars
- Write workflows (code-simplifier, next-steps, post-merge-*, ci-fix,
  issue-resolver, pr-review-responder): the selected agent only edits files and
  writes typed handoffs (no git or GitHub mutations). A fresh publisher job
  lands a GitHub-VERIFIED commit/PR via `createCommitOnBranch` (shared
  `scripts/shared/verified-commit.js`).
  This is mandatory — native `use_commit_signing` cannot target a branch on our
  workflow_run/issues/schedule/dispatch triggers. See docs/PATTERNS.md
  "Verified Commit & PR Pattern".

**Supported event types**: `issues`, `issue_comment`, `pull_request`,
`pull_request_review`, `pull_request_review_comment`, `workflow_dispatch`,
`repository_dispatch`, `schedule`, `workflow_run`. `push` is NOT supported —
post-merge workflows use the dispatch pattern (see `docs/PATTERNS.md`).

**Bot guard**: All agent steps allow the `github-actions` bot for
dispatch-triggered runs (which set
`github.actor` to `github-actions[bot]`). Cost control is handled by
consumer-level daily dispatch limits, not by blocking bots at the workflow
level. See `docs/PATTERNS.md` for the Bot Guard and AI Dispatch patterns.

**AI Provenance**: All PR-creating workflows (`code-simplifier`, `next-steps`,
`post-merge-docs-review`, `post-merge-tests`, `issue-resolver`) include a
standardized provenance footer in every PR body. See `docs/PATTERNS.md` for the
AI Provenance Pattern.

**Slack notifications**: `notify-ai-pr.yml` is a reusable workflow that
consumer repos call on `pull_request: opened`. It filters for `claude[bot]`-
authored PRs and posts to `#github-automation` via Slack Incoming Webhook.
Requires `GH_SLACK_WEBHOOK_URL_GITHUB_AUTOMATION` secret (synced via
secrets-sync).

### Consumer Repo Caller Pattern

```yaml
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

### Cross-repo Checkout

Workflows check out this repo for scripts and the immutable prompt catalog for prompt assets:

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
    sparse-checkout: automation/ai-workflows-<name>.md
    sparse-checkout-cone-mode: false
    path: .ai-llm-prompts
```

## Workflow Authoring Rules

### File Format Separation

Never mix programming languages inline within workflow files. Each file must contain a single language:

- `.yml` files contain only YAML (workflow configuration)
- `.js` files contain only JavaScript
- Prompt Markdown lives in `dryvist/ai-llm-prompts`; this repo references immutable catalog files
- `.json.template` files contain JSON config templates

**Inline threshold**: Scripts of 5 lines or fewer may be embedded directly in
YAML workflow steps. Scripts exceeding 5 lines must be extracted to a dedicated
file under `.github/scripts/` and referenced via the cross-repo checkout
pattern.

**Pattern for extracted scripts** (`actions/github-script`):

```yaml
- uses: actions/github-script@v9
  with:
    script: |
      const run = require('./.ai-workflows/.github/scripts/<dir>/<name>.js');
      await run({ github, context, core });
```

```javascript
// .github/scripts/<dir>/<name>.js
module.exports = async ({ github, context, core }) => {
  // All logic here — one file, one language
};
```

Pass GitHub Actions expression values (`${{ }}`) via `env:` on the step, then
read them with `process.env` in the script. Never interpolate expressions
inside `.js` files.

### Concurrency

Never use `cancel-in-progress: true` in AI workflows. Cancelling an
in-progress run wastes tokens — always use `cancel-in-progress: false` to
queue runs instead.

### Authentication

All AI workflows select their implementation with org/repo variable
`GH_ACTION_AI_AGENT=claude|codex` (default `claude`). Keep the credentials
separate: Claude uses `GH_ACTION_AI_API_KEY`; Codex uses `OPENAI_API_KEY`.
Explicit-secret callers forward both so the selector is the only switch.

Provider tuning stays optional. Claude uses `GH_ACTION_AI_BASE_URL` and the
existing `GH_ACTION_AI_MODEL*` variables. Codex uses
`GH_ACTION_AI_CODEX_RESPONSES_API_ENDPOINT`, `GH_ACTION_AI_CODEX_MODEL`,
`GH_ACTION_AI_CODEX_EFFORT`, and `GH_ACTION_AI_CODEX_VERSION`. Never hard-code
model IDs. See `docs/AUTHENTICATION.md`.

Agent jobs must not receive a write-capable GitHub token or App token. Publish
comments, labels, commits, and PRs deterministically from a fresh job with the
minimum required permissions.

### Version Tags for Actions

Use version tags (`@v7`, `@v4`, `@v1`) for trusted first-party GitHub actions (`actions/*`, `anthropics/*`). SHA pinning is not required for these.

### Testing

All JavaScript scripts in `.github/scripts/` have unit tests in the `tests/` directory.
Run `bun test` before pushing any changes to scripts.

- Test framework: bun:test (built-in, no external dependencies, no install step)
- Helpers: `tests/helpers.js` (shared mock factories for github, context, core)
- CI: `.github/workflows/test.yml` runs automatically on PRs touching scripts
- E2E: `.github/scripts/verification/e2e-test.sh` (manual — creates real GitHub events)
- New scripts must include a test file in `tests/`; test happy path + key failure modes
