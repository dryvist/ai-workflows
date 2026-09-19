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

      - name: Run AI agent
        uses: dryvist/ai-workflows/.github/actions/run-ai-agent@main
        with:
          agent: ${{ vars.GH_ACTION_AI_AGENT || 'claude' }}
          prompt: ${{ steps.prompt.outputs.content }}
          claude_model: ${{ vars.GH_ACTION_AI_MODEL_EXAMPLE || vars.GH_ACTION_AI_MODEL }}
          codex_model: ${{ vars.GH_ACTION_AI_CODEX_MODEL }}
          allowed_tools: "Read,Glob,Grep,LS,Bash(gh issue:*)"
          base_url: ${{ secrets.LLM_ROUTER_BASE_URL }}
          api_key: ${{ secrets.LLM_ROUTER_API_KEY }}
          allowed_bots: "github-actions"
```

Workflows that create commits or PRs do so in a separate publisher job with
the App token; the agent job only edits the working tree.

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

- `LLM_ROUTER_BASE_URL` + `LLM_ROUTER_API_KEY` (secrets) — every agent job reaches the org's model router with
  this one pair; a workflow never references a vendor credential or a vendor model id
- Write workflows publish from a separate job with the App token; the agent job holds only a read token

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
