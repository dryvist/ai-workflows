# GitHub Copilot Instructions — ai-workflows

## Repository Purpose

Reusable GitHub Actions workflows for AI-assisted automation. Consumer repos call these with thin
callers (~10-20 lines). This is the single source of truth for CI/CD automation workflows.

## Build & Test

- **Package manager**: bun (not npm or node)
- **Run tests**: `bun test`
- **Watch mode**: `bun test --watch`
- bun is globally available; no install step needed

## File Structure Rules

Each file must contain a single language — never mix:

- `.yml` files: YAML only (workflow configuration)
- `.js` files: JavaScript only (logic — one script per purpose)
- `.md` files: prompts with `${VAR}` placeholders for dynamic values
- `.json` files: configuration only

**Inline threshold**: Scripts of 5 lines or fewer may be embedded in YAML `run:` steps.
Scripts exceeding 5 lines must be extracted to `.github/scripts/<workflow-name>/<script>.js`.

## JavaScript Script Pattern

All scripts use this module pattern:

```js
module.exports = async ({ github, context, core }) => {
  // logic here
};
```

Pass GitHub Actions expression values (`${{ }}`) via `env:` on the step, then read with
`process.env` in the script. Never interpolate expressions inside `.js` files.

**Invoke extracted scripts in YAML:**

```yaml
- uses: actions/github-script@v8
  env:
    MY_VAR: ${{ steps.prev.outputs.value }}
  with:
    script: |
      const run = require('./.ai-workflows/.github/scripts/<dir>/<name>.js');
      await run({ github, context, core });
```

## Testing Requirements

- Framework: bun:test (built-in globals: describe, it, expect, beforeEach)
- One test file per script: `tests/<script-name>.test.js`
- Mock factories in `tests/helpers.js` — use `createMockCore`, `createMockContext`, `createMockGithub`
- Use `mock()` from `bun:test` for mock functions
- Every new script must include a test: happy path + key failure modes

## Prompt Files

Prompts live in `.github/prompts/<name>.md` with `${VAR}` placeholders.
Rendered via `.github/scripts/render-prompt.sh` + `envsubst` in workflow steps.

## Authentication

All Claude Code workflows reference a provider-agnostic namespace: secret `GH_ACTION_AI_API_KEY`, vars `GH_ACTION_AI_BASE_URL` and `GH_ACTION_AI_MODEL[_CODE|_ISSUES|_PLAN]`. Map these org-level vars/secrets to any provider's key/URL/model — never reference a provider-specific secret name in a workflow.

## Version Tags

Use version tags (`@v7`, `@v4`, `@v1`) for first-party actions (`actions/*`, `anthropics/*`,
`oven-sh/*`). SHA pinning is not required for these trusted actions.

## Workflow Permissions

- Workflow-level `permissions:` must be the union of all job-level permissions
- `permissions: {}` at workflow level causes startup_failure in cross-repo calls
- Both reusable workflow and caller must have sufficient permissions
- Consumer repo thin callers must have explicit `permissions:` blocks

## Reusable Workflow Pattern

All reusable workflows use `on: workflow_call` with `workflow_dispatch` fallback.
Consumer repos call via `uses: dryvist/ai-workflows/.github/workflows/<name>.yml@<version>`.
