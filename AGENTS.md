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
    post-merge-docs-review/
    post-merge-tests/
    pr-agent/
    commit-review/
    release-notes/
    review-thread-resolver/
    shared/                         # incl. router-chat.sh, wait-for-router.sh
    verification/
  workflows/
    *.yml                           # Pure YAML workflow definitions (no embedded content)
```

### Workflow Types

There are three families, and they do not share a credential contract:

1. **Agentic workflows** use the shared `run-ai-agent` adapter, which selects
   Claude or Codex from `GH_ACTION_AI_AGENT` and defaults to Claude. These are
   the workflows that edit a tree and open a pull request.
2. **`pr-agent.yml`** runs PR-Agent against the model router for PR-scoped
   review, code suggestions and descriptions. Its prompts live in the consumer
   repository's own `.pr_agent.toml`; see docs/pr-agent.md.
3. **Router workflows** (`commit-review`, `thread-triage`, `docs-drift`,
   `repo-hygiene-digest`)
   make one chat completion through `scripts/shared/router-chat.sh`. They take
   `LLM_ROUTER_BASE_URL` and `LLM_ROUTER_API_KEY` — both secrets — and default
   to a `self-hosted` runner, because only such a runner reaches the router.

A router workflow that cannot reach the router WAITS with exponential backoff
and then FAILS on the job timeout. Never restore a skip-and-succeed path: a
green check that did no work is what these replaced.

Non-AI utility workflows (`ci-fail-issue`, `review-thread-resolver`) use plain
`actions/github-script` — see docs/PATTERNS.md "Non-AI Utility Workflow
Pattern".

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

The scripts checkout takes its ref from a `scripts_ref` input, empty by
default, which checks out this repository's default branch. Do not reach for
`github.job_workflow_sha`: it is empty whenever a reusable workflow is reached
through another reusable workflow, and an empty `ref:` resolves to the default
branch silently. A dogfood caller passes the pull request head SHA, so a pull
request exercises its own scripts.

```yaml
- uses: actions/checkout@v7
  with:
    repository: dryvist/ai-workflows
    ref: ${{ inputs.scripts_ref }}
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

A caller must not declare a `concurrency:` block that repeats the reusable
workflow's own group. A caller sharing the exact group produces an opaque
zero-job `startup_failure` that appears nowhere in the API.

Router workflows group per REPOSITORY, not per pull request: during an outage
each waiting job holds a runner slot, and one repository must not be able to
park the whole shared pool.

### Authentication

Agentic workflows select their implementation with org/repo variable
`GH_ACTION_AI_AGENT=claude|codex` (default `claude`). Keep the credentials
separate: Claude uses `GH_ACTION_AI_API_KEY`; Codex uses `OPENAI_API_KEY`.
Explicit-secret callers forward both so the selector is the only switch.

Provider tuning stays optional. Claude uses `GH_ACTION_AI_BASE_URL` and the
existing `GH_ACTION_AI_MODEL*` variables. Codex uses
`GH_ACTION_AI_CODEX_RESPONSES_API_ENDPOINT`, `GH_ACTION_AI_CODEX_MODEL`,
`GH_ACTION_AI_CODEX_EFFORT`, and `GH_ACTION_AI_CODEX_VERSION`. Never hard-code
model IDs. See `docs/AUTHENTICATION.md`.

`pr-agent.yml` and the router workflows use a different contract, because the
router speaks the OpenAI protocol rather than Anthropic's: secrets
`LLM_ROUTER_BASE_URL` and `LLM_ROUTER_API_KEY`, both required. The base URL is a
secret, not a variable — a run log prints each step's environment verbatim, and
these repositories are public.

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
