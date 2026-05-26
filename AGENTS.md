# ai-workflows

Reusable AI agent workflows for GitHub Actions. Consumer repos call these with thin ~10-20 line callers.

## Architecture

This repo is the single source of truth for CI/CD automation workflows. Each workflow is a GitHub reusable workflow (`on: workflow_call`) that consumer repos invoke via `uses: JacobPEvans/ai-workflows/.github/workflows/<name>.yml@v0.1.0`.

### Directory Structure

```
.github/
  prompts/
    *.md                            # Prompt files (one per workflow)
  scripts/
    render-prompt.sh                # Shared: envsubst + GITHUB_OUTPUT
    best-practices/                 # Extracted JS scripts per workflow
    ci-fail-issue/
    ci-fix/
    claude-review/
    final-pr-review/
    issue-linker/
    issue-resolver/
    notification/
    post-merge-docs-review/
    post-merge-tests/
    shared/
    verification/
  workflows/
    *.yml                           # Pure YAML workflow definitions (no embedded content)
```

### Workflow Types

**All workflows use `claude-code-action@v1`** with OIDC auth (`id-token: write`).

- Prompts rendered via `render-prompt.sh` + step output (envsubst)
- Static prompts: most workflows
- Dynamic prompts (ci-fix, post-merge-tests, post-merge-docs-review): `render-prompt.sh` with named env vars
- Write workflows (code-simplifier, next-steps, post-merge-*, ci-fix, issue-resolver): add `use_commit_signing: "true"` and restrict git to read-only subcommands (see docs/PATTERNS.md Commit Signing Pattern)

**Supported event types**: `issues`, `issue_comment`, `pull_request`, `pull_request_review`, `pull_request_review_comment`, `workflow_dispatch`, `repository_dispatch`, `schedule`, `workflow_run`. `push` is NOT supported — post-merge workflows use the dispatch pattern (see `docs/PATTERNS.md`).

**Bot guard**: All `claude-code-action@v1` steps include `allowed_bots: "github-actions"` to allow dispatch-triggered runs (which set `github.actor` to `github-actions[bot]`). Cost control is handled by consumer-level daily dispatch limits, not by blocking bots at the workflow level. See `docs/PATTERNS.md` for the Bot Guard and AI Dispatch patterns.

**AI Provenance**: All PR-creating workflows (`code-simplifier`, `next-steps`, `post-merge-docs-review`, `post-merge-tests`, `issue-resolver`) include a standardized provenance footer in every PR body. `ci-fix` appends provenance to the commit message. See `docs/PATTERNS.md` for the AI Provenance Pattern.

**Slack notifications**: `notify-ai-pr.yml` is a reusable workflow that consumer repos call on `pull_request: opened`. It filters for `claude[bot]`-authored PRs and posts to `#github-automation` via Slack Incoming Webhook. Requires `GH_SLACK_WEBHOOK_URL_GITHUB_AUTOMATION` secret (synced via secrets-sync).

### Consumer Repo Caller Pattern

```yaml
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
    uses: JacobPEvans/ai-workflows/.github/workflows/issue-sweeper.yml@v0.3.3
    secrets: inherit
```

### Cross-repo Checkout

Workflows check out this repo at runtime for scripts and prompts:

```yaml
- uses: actions/checkout@v6
  with:
    repository: JacobPEvans/ai-workflows
    sparse-checkout: |
      .github/scripts
      .github/prompts
    path: .ai-workflows
```

## Workflow Authoring Rules

### File Format Separation

Never mix programming languages inline within workflow files. Each file must contain a single language:

- `.yml` files contain only YAML (workflow configuration)
- `.js` files contain only JavaScript
- `.md` files contain prompts (with `${VAR}` placeholders for dynamic values)
- `.json.template` files contain JSON config templates

**Inline threshold**: Scripts of 5 lines or fewer may be embedded directly in YAML workflow steps. Scripts exceeding 5 lines must be extracted to a dedicated file under `.github/scripts/` and referenced via the cross-repo checkout pattern.

**Pattern for extracted scripts** (`actions/github-script`):

```yaml
- uses: actions/github-script@v8
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

Pass GitHub Actions expression values (`${{ }}`) via `env:` on the step, then read them with `process.env` in the script. Never interpolate expressions inside `.js` files.

### Concurrency

Never use `cancel-in-progress: true` in AI workflows. Cancelling an in-progress run wastes tokens — always use `cancel-in-progress: false` to queue runs instead.

### Authentication

Use `OPENROUTER_API_KEY` for all Claude Code workflows, routed via `OPENROUTER_BASE_URL` (repo secret). Do not create aliases or alternative secret names. See README.md for why OpenRouter is used instead of direct Anthropic or OAuth tokens.

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
