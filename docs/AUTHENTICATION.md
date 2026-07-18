# Authentication and agent selection

All reusable AI workflows call one shared `run-ai-agent` adapter. Set
`GH_ACTION_AI_AGENT` to select the implementation for every inheriting repository:

| Value | Action | Credential |
| --- | --- | --- |
| `claude` (default) | `anthropics/claude-code-action` | `GH_ACTION_AI_API_KEY` |
| `codex` | `openai/codex-action` | `OPENAI_API_KEY` |

The credentials stay separate. The adapter validates and passes only the secret
for the selected agent. Changing `GH_ACTION_AI_AGENT` is therefore the only
switch required by callers that use `secrets: inherit`.

## Required configuration

Configure these as GitHub organization or repository variables and secrets:

| Name | Kind | Required when | Purpose |
| --- | --- | --- | --- |
| `GH_ACTION_AI_AGENT` | Variable | Optional | `claude` or `codex`; defaults to `claude` |
| `GH_ACTION_AI_API_KEY` | Secret | Claude selected | Anthropic API key |
| `OPENAI_API_KEY` | Secret | Codex selected | OpenAI API key |

An explicit-secret caller must forward both credentials so changing the selector
does not require another workflow edit:

```yaml
jobs:
  run:
    uses: dryvist/ai-workflows/.github/workflows/<name>.yml@main
    secrets:
      GH_ACTION_AI_API_KEY: ${{ secrets.GH_ACTION_AI_API_KEY }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

Callers that use `secrets: inherit` need no change after both organization
secrets are available to the repository.

## Optional Claude configuration

Existing Claude variables remain supported:

| Name | Purpose |
| --- | --- |
| `GH_ACTION_AI_BASE_URL` | Anthropic-compatible endpoint; empty uses the upstream default |
| `GH_ACTION_AI_MODEL` | Global Claude model override |
| `GH_ACTION_AI_MODEL_CODE` | Code-task override |
| `GH_ACTION_AI_MODEL_ISSUES` | Issue-task override |
| `GH_ACTION_AI_MODEL_PLAN` | Planning-task override |
| `GH_ACTION_AI_MODEL_REVIEW` | Review-task override |

No model identifier is hard-coded. If no applicable model variable is set, the
upstream action chooses its default.

## Optional Codex configuration

| Name | Maps to |
| --- | --- |
| `GH_ACTION_AI_CODEX_RESPONSES_API_ENDPOINT` | `responses-api-endpoint` |
| `GH_ACTION_AI_CODEX_MODEL` | `model` |
| `GH_ACTION_AI_CODEX_EFFORT` | `effort` |
| `GH_ACTION_AI_CODEX_VERSION` | `codex-version` |

Leave these variables empty to use the Codex Action defaults. This avoids
coupling inherited workflows to model or CLI identifiers that change over time.

## Security boundary

The adapter runs Codex with `drop-sudo` and an explicit read-only or workspace
permission profile. AI jobs receive read-only GitHub permissions. Workflows that
publish comments, labels, commits, or pull requests perform that operation in a
fresh deterministic publisher job with only the minimum GitHub permission and,
where required, the existing GitHub App identity.

Do not give a model an App token or a write-capable `GITHUB_TOKEN`. Treat issue
bodies, pull-request descriptions, comments, and repository files as untrusted
prompt input.

## Verify both agents

Run the same dogfood workflow once per selector value:

```bash
gh variable set GH_ACTION_AI_AGENT --org dryvist -b claude
gh workflow run dogfood-ci.yml --repo dryvist/ai-workflows
gh run watch --repo dryvist/ai-workflows

gh variable set GH_ACTION_AI_AGENT --org dryvist -b codex
gh workflow run dogfood-ci.yml --repo dryvist/ai-workflows
gh run watch --repo dryvist/ai-workflows
```

A successful run for each value proves that selection, credential forwarding,
prompt rendering, and the provider-specific adapter path are wired correctly.
