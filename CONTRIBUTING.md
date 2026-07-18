# Contributing

Thank you for your interest in contributing to ai-workflows.

## Getting Started

1. Fork this repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes following the guidelines below
4. Commit and push
5. Open a pull request

## Testing

Run the test suite before submitting a PR:

```bash
bun test   # No install step needed — bun:test is built-in
```

Every `.js` script in `.github/scripts/` must have a corresponding test in `tests/`.

## Adding a New Reusable Workflow

1. Create `.github/workflows/<name>.yml` — the reusable workflow
2. Add the prompt to `dryvist/ai-llm-prompts` under `automation/`, release it, and pin the immutable release commit here
3. If the workflow needs scripts >5 lines, extract to `.github/scripts/<name>/<script>.js`

### Workflow Template

```yaml
name: "My Workflow"

on:
  workflow_call:
  workflow_dispatch:

permissions:
  contents: read
  id-token: write
  issues: write    # add only what's needed

concurrency:
  group: my-workflow-${{ github.repository }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: false  # Never cancel — queue instead to avoid wasting AI tokens

jobs:
  run:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
      issues: write
    timeout-minutes: 5
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Checkout ai-workflows scripts
        uses: actions/checkout@v7
        with:
          repository: dryvist/ai-workflows
          sparse-checkout: .github/scripts
          path: .ai-workflows

      - name: Checkout prompt catalog
        uses: actions/checkout@v7
        with:
          repository: dryvist/ai-llm-prompts
          ref: 0431be6994d51169b9f705ddeba958eb8a4d0fc4
          sparse-checkout: automation/ai-workflows-my-workflow.md
          sparse-checkout-cone-mode: false
          path: .ai-llm-prompts

      - name: Render prompt
        id: prompt
        run: bash .ai-workflows/.github/scripts/render-prompt.sh .ai-llm-prompts/automation/ai-workflows-my-workflow.md

      - name: Run Claude
        uses: anthropics/claude-code-action@v1
        env:
          ANTHROPIC_BASE_URL: ${{ vars.GH_ACTION_AI_BASE_URL }}
        with:
          anthropic_api_key: ${{ secrets.GH_ACTION_AI_API_KEY }}
          allowed_bots: "github-actions"
          prompt: ${{ steps.prompt.outputs.content }}
          claude_args: >-
            --allowedTools "Read,Glob,Grep,LS,Bash(gh issue:*)"
            --model ${{ vars.GH_ACTION_AI_MODEL_EXAMPLE || vars.GH_ACTION_AI_MODEL }}
```

For workflows that create commits or PRs, add API commit signing:

```yaml
        env:
          ANTHROPIC_BASE_URL: ${{ vars.GH_ACTION_AI_BASE_URL }}
        with:
          anthropic_api_key: ${{ secrets.GH_ACTION_AI_API_KEY }}
          use_commit_signing: "true"
```

### Dynamic Prompts

For prompts with runtime values, use `render-prompt.sh` with named env vars:

```yaml
- name: Render prompt
  id: prompt
  env:
    MERGE_SHA: ${{ github.sha }}
    REPO_FULL_NAME: ${{ github.repository }}
  run: bash .ai-workflows/.github/scripts/render-prompt.sh .ai-llm-prompts/automation/ai-workflows-my-workflow.md MERGE_SHA REPO_FULL_NAME
```

In the catalog prompt, use `${MERGE_SHA}` and `${REPO_FULL_NAME}` as placeholders.

## File Format Separation

Never mix programming languages within a file. Each file must contain a single language:

- `.yml` files — only YAML (workflow configuration)
- `.md` files — prompts only (with `${VAR}` placeholders for dynamic values)
- `.js` files — only JavaScript (extracted scripts)
- `.sh` files — only shell scripts

**Inline threshold**: Shell commands of 5 lines or fewer may be embedded directly in YAML `run:` steps. Anything longer must be extracted to a
`.sh` or `.js` file.

**Pattern for extracted JS scripts** (`actions/github-script`):

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

Pass `${{ }}` expression values via `env:` on the step, then read via `process.env`. Never interpolate GitHub expressions inside `.js` files.

## Authentication

- `GH_ACTION_AI_API_KEY` (secret) + `GH_ACTION_AI_BASE_URL` (var) — provider-agnostic; all Claude Code workflows reference these generic names,
  mapped to a real provider at the org level (never reference a provider-specific secret in a workflow)
- Write workflows use `use_commit_signing: "true"` (API mode); no SSH key needed

## Permissions

Workflow-level `permissions:` must be the union of all job-level permissions. Job-level permissions cannot escalate beyond the workflow-level
maximum. Consumer repo callers must also declare sufficient permissions.

## Version Tags

Use version tags (`@v1`, `@v6`, `@v8`) for trusted first-party GitHub actions (`actions/*`, `anthropics/*`). SHA pinning is not required for these.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new workflow, script, or prompt
- `fix:` bug fix in existing workflow
- `docs:` documentation changes
- `refactor:` restructuring without behavior change

## Code of Conduct

Be respectful and constructive. See our inherited community guidelines
from [JacobPEvans/.github](https://github.com/JacobPEvans/.github).
