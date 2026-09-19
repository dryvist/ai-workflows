# Authentication and agent selection

All reusable AI workflows call one shared `run-ai-agent` adapter. Both agents
talk to the org's model router and nothing else: Claude Code through the
router's Anthropic `/v1/messages` route, Codex through its `/v1/responses`
route. Set `GH_ACTION_AI_AGENT` to select the implementation for every
inheriting repository:

| Value | Action | Wire format |
| --- | --- | --- |
| `claude` (default) | `anthropics/claude-code-action` | Anthropic Messages, at the parent of the `/v1` base |
| `codex` | `openai/codex-action` | OpenAI Responses, at `<base>/responses` |

The adapter derives both endpoints from one base URL and sends one key as the
bearer token, so changing `GH_ACTION_AI_AGENT` is the only switch a caller
needs.

## Required configuration

| Name | Kind | Purpose |
| --- | --- | --- |
| `GH_ACTION_AI_AGENT` | Variable | `claude` or `codex`; defaults to `claude` |
| `LLM_ROUTER_BASE_URL` | Secret | The router's OpenAI-compatible base URL, ending in `/v1` |
| `LLM_ROUTER_API_KEY` | Secret | The scoped router key for CI, never the master key |

Both secrets are required. The base URL is a secret rather than a variable
because a run log prints each step's environment verbatim and these
repositories are public. An explicit-secret caller forwards the pair:

```yaml
jobs:
  run:
    uses: dryvist/ai-workflows/.github/workflows/<name>.yml@main
    secrets:
      LLM_ROUTER_BASE_URL: ${{ secrets.LLM_ROUTER_BASE_URL }}
      LLM_ROUTER_API_KEY: ${{ secrets.LLM_ROUTER_API_KEY }}
```

Callers that use `secrets: inherit` need no change. `cc-dep-review` and
`cc-release-notes` still declare the retired `GH_ACTION_AI_API_KEY` and
`OPENAI_API_KEY` secrets so an older explicit caller starts; both are
ignored, and the run fails at the adapter's validation step until the caller
passes the router pair.

Every agent job probes the router for at most fifteen seconds before the
agent starts and fails, releasing the runner, if nothing answers. The runner
must reach the router, so `runner_label` should be `self-hosted`.

## Model selection

A model variable names a **router role alias** (the router's own contract
lists them), never a vendor model id. Leave a variable empty to let the
router's default for the request apply.

| Name | Purpose |
| --- | --- |
| `GH_ACTION_AI_MODEL` | Global role; every task falls back to it |
| `GH_ACTION_AI_MODEL_CHEAP` | Issue-task fallback before the global role |
| `GH_ACTION_AI_MODEL_CODE` | Code-task role |
| `GH_ACTION_AI_MODEL_ISSUES` | Issue-task role |
| `GH_ACTION_AI_MODEL_PLAN` | Planning-task role |
| `GH_ACTION_AI_MODEL_REVIEW` | Review-task role |
| `GH_ACTION_AI_CODEX_MODEL` | Codex role; empty uses the Claude role for the same task |

## Optional Codex configuration

| Name | Maps to |
| --- | --- |
| `GH_ACTION_AI_CODEX_EFFORT` | `effort` |
| `GH_ACTION_AI_CODEX_VERSION` | `codex-version` |

Leave these variables empty to use the Codex Action defaults.

## Security boundary

The adapter runs Codex with `drop-sudo` and an explicit read-only or workspace
permission profile. AI jobs receive read-only GitHub permissions. Workflows that
publish comments, labels, commits, or pull requests perform that operation in a
fresh deterministic publisher job with only the minimum GitHub permission and,
where required, the existing GitHub App identity.

Do not give a model an App token or a write-capable `GITHUB_TOKEN`. Treat issue
bodies, pull-request descriptions, comments, and repository files as untrusted
prompt input.

## Router-backed workflows

`pr-agent.yml` and the router workflows (`thread-triage`, `docs-drift`,
`repo-hygiene-digest`, `policy-gate`) do not use the adapter above. They speak
the OpenAI protocol to the router directly with the same two secrets, and
register the URL and its bare host with `::add-mask::` before the first
request, since a connection error names the host in a string Actions would
not otherwise mask.

Two consequences worth stating plainly:

- These workflows need a runner that can reach the router, so `runner_label`
  defaults to `self-hosted`. On a GitHub-hosted runner they would review
  nothing.
- A router outage fails the job, releasing the runner: the client retries
  twice, and the job is capped at ten minutes. There is no skip-and-succeed
  path. Do not make any of them a required check.

`policy-gate.yml` is advisory by default (its `blocking` input defaults to
`false`): a failing check posts a sticky comment and still exits 0. The
`policy-gate-override` label on a pull request skips the router call entirely
and, if the optional `NTFY_BASE_URL` secret is configured, publishes one
audit line to the ntfy hub's `ai` topic instead of failing silently.

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
