# Docs Drift

`docs-drift.yml` runs after a merge to the default branch and asks a cheap
model, served through the org's OpenAI-compatible model router, which documented
behaviours the merged change contradicts or leaves undocumented.

It **never edits a file**. The output is a job summary, a `docs-drift.md`
artifact, and — when the push came from a merged pull request — one sticky
comment on that pull request so the author sees it while the change is fresh.

It is the router-backed counterpart to `cc-post-merge-docs-review.yml`, which
runs a full coding agent and opens a fix PR. Drift detection is a read-only
question a small model answers, so it does not need one.

## Failure contract

Not advisory. If the router is unreachable the job waits — exponential backoff
from 5 s, capped at 5 minutes — and then fails when `timeout-minutes` (60) runs
out. A wrong key, base URL or model alias fails in seconds instead of waiting.

`runner_label` defaults to `self-hosted` because the router is only reachable
from inside the estate; a GitHub-hosted runner would review nothing. Never make
this a required check — a failure should be visible without blocking a merge.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `runner_label` | `self-hosted` | Runner label for the job |
| `model` | `cheap` | Router **role alias** to call — never a vendor model id |
| `docs_globs` | `README.md,AGENTS.md,CLAUDE.md,docs/**/*.md` | Documentation considered |
| `max_diff_kb` | `150` | The merged diff is truncated to this many KiB |
| `max_docs_kb` | `200` | Ceiling on the total size of the documentation sent |
| `max_tokens` | `1500` | Completion token ceiling |

## Configuration

| Name | Kind | Holds |
| --- | --- | --- |
| `LLM_ROUTER_BASE_URL` | Actions **secret** | The router's OpenAI-compatible base URL, ending in `/v1`. A secret: run logs print step environments. |
| `LLM_ROUTER_API_KEY` | Actions **secret** | The scoped router key for CI. Never the router's master key. |

Both are required. With either missing the job fails immediately, naming the
one that did not arrive.

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
      LLM_ROUTER_BASE_URL: ${{ secrets.LLM_ROUTER_BASE_URL }}
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
- Requests carry an `x-langfuse-trace-name` header so runs group in the
  router's own observability. Spend is attributed by the calling key itself.
