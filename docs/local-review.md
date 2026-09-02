# Local Review

`local-review.yml` asks a cheap or local model, served through a self-hosted
OpenAI-compatible router, to judge a pull request diff against a checklist the
repository owns. The verdicts are rendered as one sticky comment that is
updated in place on every push.

It is **advisory**. A router outage, a model error, or unparseable model output
posts `review unavailable: <reason>` and the job still succeeds. Only a bug in
the workflow itself fails it. Never make it a required check.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `runner_label` | `ubuntu-latest` | Runner label for the job |
| `checklist_path` | `.github/ai-review/checklist.md` | Repo-relative checklist file |
| `model` | `cheap` | Router **role alias** to call — never a vendor model id |
| `max_diff_kb` | `200` | Diff is truncated to this many KiB before it is sent |
| `max_tokens` | `1500` | Completion token ceiling |
| `base_url_var_name` | `LLM_ROUTER_BASE_URL` | Name of the Actions variable holding the router base URL |

## Configuration

| Name | Kind | Holds |
| --- | --- | --- |
| `LLM_ROUTER_BASE_URL` | Actions variable | The router's OpenAI-compatible base URL, ending in `/v1` |
| `LLM_ROUTER_API_KEY` | Actions secret | A scoped router key. Never the router's master key. |

With either missing, the workflow posts `review unavailable: router credential
not configured` and exits successfully.

## Checklist format

Plain markdown. Give each entry an `id:` line so the model can key its verdicts
to it; everything else on the entry is the question the model answers.

```markdown
- id: secrets
  Does the diff add a credential, token, private hostname, or address literal?
- id: docs
  Does changed behaviour come with the documentation update it needs?
```

When the file is absent the workflow falls back to a generic built-in checklist
rather than failing.

## Calling it

```yaml
name: Local Review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
permissions:
  contents: read
  pull-requests: write
jobs:
  local-review:
    uses: dryvist/ai-workflows/.github/workflows/local-review.yml@main
    secrets:
      LLM_ROUTER_API_KEY: ${{ secrets.LLM_ROUTER_API_KEY }}
```

## Security notes

- `pull_request` only, never `pull_request_target`.
- The job runs only for same-repo PR heads, so a fork never reaches the router
  key. Draft pull requests are skipped.
- Checkout sets `persist-credentials: false`; the job token is read-only on
  contents and write only on pull requests, which is what posting the comment
  needs.
- The diff is sent to the configured router and nowhere else. Point it only at
  a router you trust with the repository's source.
- Requests carry `x-litellm-tags` and `x-langfuse-trace-name` headers so runs
  group in the router's own observability.
