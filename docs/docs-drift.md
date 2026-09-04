# Docs Drift

`docs-drift.yml` runs after a merge to the default branch and asks a cheap or
local model, served through a self-hosted OpenAI-compatible router, which
documented behaviours the merged change contradicts or leaves undocumented.

It **never edits a file**. The output is a job summary, a `docs-drift.md`
artifact, and — when the push came from a merged pull request — one sticky
comment on that pull request so the author sees it while the change is fresh.

It is **advisory**. A router outage, a model error, or unparseable model output
records the reason and the job still succeeds. Only a bug in the workflow itself
fails it. Never make it a required check.

This is the router-backed counterpart to `cc-post-merge-docs-review.yml`, which
runs a full coding agent and opens a fix PR. Drift detection is a read-only
question a small model answers, so it does not need one.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `runner_label` | `ubuntu-latest` | Runner label for the job |
| `model` | `cheap` | Router **role alias** to call — never a vendor model id |
| `docs_globs` | `README.md,AGENTS.md,CLAUDE.md,docs/**/*.md` | Documentation considered |
| `max_diff_kb` | `150` | The merged diff is truncated to this many KiB |
| `max_docs_kb` | `200` | Ceiling on the total size of the documentation sent |
| `max_tokens` | `1500` | Completion token ceiling |
| `base_url_var_name` | `LLM_ROUTER_BASE_URL` | Name of the Actions variable holding the router base URL |

## Configuration

| Name | Kind | Holds |
| --- | --- | --- |
| `LLM_ROUTER_BASE_URL` | Actions variable | The router's OpenAI-compatible base URL, ending in `/v1` |
| `LLM_ROUTER_API_KEY` | Actions secret | A scoped router key. Never the router's master key. |

With either missing, the report reads `Drift check unavailable: router
credential not configured` and the job exits successfully.

## Which documentation gets sent

Not all of it. Sending the whole documentation tree on every merge would cost
tokens on each run and bury the signal, so a file is included only when it
mentions something the change touched — a changed path, one of its components,
or an identifier on an added or removed line. Files the merge itself rewrote are
excluded: a doc updated in the same commit cannot be stale about it. The
selected set is then capped at `max_docs_kb`.

When nothing in the documentation mentions the change, no model call is made at
all and the report says so.

## Output shape

The model answers strict JSON, rendered as a table:

| Field | Meaning |
| --- | --- |
| `doc` | Path of the documentation file |
| `section` | Heading or line the claim sits under |
| `claim` | What the documentation says, or fails to say |
| `contradicted_by` | What in the diff makes it wrong |
| `action` | `update`, `add`, or `none` |

An empty list is a valid, common answer — it means the documentation still
matches.

## Calling it

```yaml
name: Docs Drift
on:
  push:
    branches: [main]
permissions:
  contents: read
  pull-requests: write
jobs:
  docs-drift:
    uses: dryvist/ai-workflows/.github/workflows/docs-drift.yml@main
    secrets:
      LLM_ROUTER_API_KEY: ${{ secrets.LLM_ROUTER_API_KEY }}
```

On a repository whose default branch is not `main`, name that branch instead.

## Security notes

- `push` on the default branch only — the merged code is already trusted.
- The drift job holds `contents: read` and nothing else; only the comment job
  gets `pull-requests: write`, and it checks out no repository code.
- Checkout sets `persist-credentials: false` with `fetch-depth: 2`, which is
  what `HEAD~1..HEAD` needs and no more.
- The diff and the selected documentation are sent to the configured router and
  nowhere else. Point it only at a router you trust with the repository's
  source.
- Requests carry `x-litellm-tags` and `x-langfuse-trace-name` headers so runs
  group in the router's own observability.
