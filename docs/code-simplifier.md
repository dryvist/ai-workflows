# Code Simplifier

`cc-code-simplifier.yml` looks for code that can be reused, deduplicated,
deleted, or shortened without changing behaviour. It has two providers.

| Provider | What runs | What it produces |
| --- | --- | --- |
| `claude` (default) | A premium coding agent edits the working tree | A focused pull request with the refinements |
| `router` | A cheap or local model on a self-hosted OpenAI-compatible router reads the PR diff | One sticky advisory comment. No file edited, nothing pushed. |

Router mode is **advisory**. A router outage, a model error, or unparseable
model output posts `simplifier unavailable: <reason>` and the job still
succeeds. Only a bug in the workflow itself fails it. Never make it a required
check.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `runner_label` | `ubuntu-latest` | Runner label for the job(s) |
| `daily_run_limit` | `5` | Max runs per day in `claude` mode (`0` disables the cap) |
| `provider` | `claude` | `claude` opens a PR; `router` posts an advisory comment |
| `model` | `subagent` | Router **role alias** to call — never a vendor model id |
| `max_diff_kb` | `200` | Diff is truncated to this many KiB before it is sent |
| `max_tokens` | `1500` | Completion token ceiling for the router call |
| `base_url_var_name` | `LLM_ROUTER_BASE_URL` | Name of the Actions variable holding the router base URL |

## Configuration (router mode only)

| Name | Kind | Holds |
| --- | --- | --- |
| `LLM_ROUTER_BASE_URL` | Actions variable | The router's OpenAI-compatible base URL, ending in `/v1` |
| `LLM_ROUTER_API_KEY` | Actions secret | A scoped router key. Never the router's master key. |

With either missing, the job posts `simplifier unavailable: router credential
not configured` and exits successfully.

`claude` mode needs neither; it keeps using the existing agent variables and
secrets.

## Findings

The model answers strict JSON and each finding is one row of the comment table:

| Field | Meaning |
| --- | --- |
| `file` | One of the changed files |
| `line` | A line number from the diff |
| `kind` | `reuse`, `dedupe`, `dead-code`, or `simplify` |
| `evidence` | A quote from the diff |
| `suggestion` | One sentence |

Zero findings is a valid answer and renders as "No simplification findings."

## Calling it

Router mode, on every pull request:

```yaml
name: Code Simplifier
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
permissions:
  contents: read
  pull-requests: write
jobs:
  simplify:
    uses: dryvist/ai-workflows/.github/workflows/cc-code-simplifier.yml@main
    with:
      provider: router
    secrets:
      LLM_ROUTER_API_KEY: ${{ secrets.LLM_ROUTER_API_KEY }}
```

Claude mode is unchanged — call it with no `provider` input.

## Security notes

- Router mode is `pull_request` only, never `pull_request_target`.
- It runs only for same-repo PR heads, so a fork never reaches the router key.
  Draft pull requests are skipped.
- Checkout sets `persist-credentials: false`, and router mode's job token is
  read-only on contents.
- The diff is sent to the configured router and nowhere else. Point it only at
  a router you trust with the repository's source.
- Requests carry `x-litellm-tags` and `x-langfuse-trace-name` headers so runs
  group in the router's own observability.
