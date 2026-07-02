# Authentication & API Providers

All workflows use [`anthropics/claude-code-action@v1`](https://github.com/anthropics/claude-code-action), which accepts an API key via the `anthropic_api_key` input. Every workflow references a single **provider-agnostic** namespace — `GH_ACTION_AI_*` — so you can switch providers, endpoints, or models at the GitHub **org level** without editing any workflow.

## How Authentication Works

The `claude-code-action` action needs two things to talk to an AI model:

1. **An API key** — passed via the `anthropic_api_key` input, sourced from secret `GH_ACTION_AI_API_KEY`
2. **A base URL** — set via the `ANTHROPIC_BASE_URL` environment variable, sourced from variable `GH_ACTION_AI_BASE_URL`

When `GH_ACTION_AI_BASE_URL` is empty, the action talks directly to Anthropic (`https://api.anthropic.com`). Point it at a router (OpenRouter, Chutes, a proxy) and the action sends requests there instead — the key authenticates with whatever endpoint the URL names.

## The `GH_ACTION_AI_*` Namespace

Configure these as GitHub **org** (or repo) secrets/variables. Workflows never name a provider directly — you map the generic names to a real provider's values, and can re-map them at any time with zero workflow changes.

| Name | Kind | Maps to | Notes |
|------|------|---------|-------|
| `GH_ACTION_AI_API_KEY` | Secret | `anthropic_api_key:` | Your provider's API key. Required. |
| `GH_ACTION_AI_BASE_URL` | Variable | `ANTHROPIC_BASE_URL` env | Provider endpoint. Leave **empty** for direct Anthropic. |
| `GH_ACTION_AI_MODEL` | Variable | `--model` | Global default model name. |
| `GH_ACTION_AI_MODEL_CODE` | Variable | `--model` | Code generation tier (falls back to `GH_ACTION_AI_MODEL`). |
| `GH_ACTION_AI_MODEL_ISSUES` | Variable | `--model` | Issue management tier (falls back to `GH_ACTION_AI_MODEL`). |
| `GH_ACTION_AI_MODEL_PLAN` | Variable | `--model` | Deep planning tier (falls back to `GH_ACTION_AI_MODEL`). |

Model names are not sensitive — set them as variables, not secrets.

### Swapping Providers (examples)

The same workflows run unchanged against any of these — you only change the org-level values:

| Provider | `GH_ACTION_AI_API_KEY` | `GH_ACTION_AI_BASE_URL` | Example `GH_ACTION_AI_MODEL` |
|----------|------------------------|--------------------------|------------------------------|
| **Direct Anthropic** | `sk-ant-…` | *(empty)* | `claude-sonnet-4` |
| **OpenRouter** | OpenRouter key | `https://openrouter.ai/api/v1` | `anthropic/claude-sonnet-4` |
| **Chutes.ai** | Chutes key | Chutes endpoint | provider-specific name |

Set a spend limit at the provider (OpenRouter per-key daily cap, Chutes flat subscription, [Anthropic usage limits](https://console.anthropic.com/settings/limits)) — this repo no longer hard-codes a free-tier fallback.

## Why Not `CLAUDE_CODE_OAUTH_TOKEN`?

The Claude Code subscription is cheaper per-token, but using a subscription token in **unattended CI** (no human in the loop) **violates the [Claude Code Terms of Service](https://www.anthropic.com/legal/terms)** and risks an account ban.

| | OAuth Token (subscription) | API Key (`GH_ACTION_AI_API_KEY`) |
|---|---|---|
| **Intended use** | Interactive CLI sessions | Programmatic access |
| **Unattended CI** | Prohibited by ToS | Allowed |
| **Cost control** | Per-subscription | Per-key spend limits |
| **Account risk** | Ban possible | None |

API access via a standard key (direct Anthropic or any router) is purpose-built for programmatic use — no ToS concerns.

## Model Configuration

### Precedence Chain

Workflows resolve the model by category precedence — **not** provider fallback:

```
inputs.model → GH_ACTION_AI_MODEL_{CATEGORY} → GH_ACTION_AI_MODEL
     |                    |                            |
  Caller override    Per-task tier var          Global default var
```

There is no hard-coded model fallback. If nothing is set, the action receives an empty `--model` and uses its own default.

**Exceptions** — `cc-post-merge-docs-review` and `cc-post-merge-tests` validate up front and fail with a clear `::error::` when no model variable is set. Configure at least `GH_ACTION_AI_MODEL` to enable them.

### Categories

| Variable | Tier | Used by |
|----------|------|---------|
| `GH_ACTION_AI_MODEL` | Global default | label-sync, best-practices, repo-orchestrator, next-steps, cc-post-merge-docs-review |
| `GH_ACTION_AI_MODEL_CODE` | Code generation | cc-ci-fix, cc-code-simplifier, cc-post-merge-tests |
| `GH_ACTION_AI_MODEL_ISSUES` | Issue management | issue-triage, issue-hygiene, issue-sweeper, issue-linker |
| `GH_ACTION_AI_MODEL_PLAN` | Deep planning | cc-issue-resolver |

### Quick Setup

**Minimal** (one variable, all workflows enabled):

```
GH_ACTION_AI_API_KEY  = <your key>        # secret
GH_ACTION_AI_BASE_URL = <empty>           # direct Anthropic
GH_ACTION_AI_MODEL    = claude-sonnet-4
```

**Tiered** (cost-optimize by task):

```
GH_ACTION_AI_MODEL        = claude-haiku-4
GH_ACTION_AI_MODEL_PLAN   = claude-opus-4
GH_ACTION_AI_MODEL_CODE   = claude-sonnet-4
GH_ACTION_AI_MODEL_ISSUES = claude-sonnet-4
```

## Testing Your Setup

After creating the `GH_ACTION_AI_*` org vars/secret, verify auth end-to-end with the dogfood CI loop or any dispatchable workflow:

```bash
# Dispatch the dogfood CI suite (exercises a real claude-code-action run):
gh workflow run dogfood-ci.yml --repo dryvist/ai-workflows
gh run watch
```

A green run confirms the action authenticated with whatever provider `GH_ACTION_AI_*` currently points at. To switch providers, re-map the org values and re-run — no workflow edits needed.

For full end-to-end workflow testing (issue lifecycle, CI fix, etc.), see [VERIFICATION.md](VERIFICATION.md).
