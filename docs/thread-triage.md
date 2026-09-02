# Thread Triage

`thread-triage.yml` asks a cheap model, served through a self-hosted
OpenAI-compatible router, to classify every unresolved review thread on a pull
request. The verdicts are rendered as one sticky comment that is updated in
place as reviews come in.

It exists to take a specific job off the premium models. Both the
`resolve-pr-threads` and `receiving-code-review` skills begin the same way:
read every unresolved thread and decide which ones still matter. That first
pass is classification, not authorship, so it belongs on the cheap router role;
the premium model then starts from the shortlist.

It is **advisory**, and deliberately inert. It never resolves a thread, never
replies in one, and never edits code. A router outage, a model error, or
unparseable model output posts `triage unavailable: <reason>` and the job still
succeeds. Only a bug in the workflow itself fails it. Never make it a required
check.

## Verdicts

| Verdict | Meaning |
| --- | --- |
| `outdated` | The code the comment points at no longer exists in the current diff |
| `addressed` | The current hunk already does what the comment asked |
| `needs-code` | A code change is still required, and is mechanical enough to specify |
| `needs-human` | A question, a judgement call, or a disagreement a person must settle |
| `unclassified` | The model returned no verdict for that thread |

A thread the model skips is still listed, as `unclassified`, rather than
quietly dropped.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `runner_label` | `ubuntu-latest` | Runner label for the job |
| `model` | `cheap` | Router **role alias** to call — never a vendor model id |
| `max_threads` | `20` | Triage at most this many unresolved threads |
| `max_tokens` | `1200` | Completion token ceiling |
| `base_url_var_name` | `LLM_ROUTER_BASE_URL` | Name of the Actions variable holding the router base URL |

## Configuration

| Name | Kind | Holds |
| --- | --- | --- |
| `LLM_ROUTER_BASE_URL` | Actions variable | The router's OpenAI-compatible base URL, ending in `/v1` |
| `LLM_ROUTER_API_KEY` | Actions secret | A scoped router key. Never the router's master key. |

With either missing, the workflow posts `triage unavailable: router credential
not configured` and exits successfully.

## Calling it

```yaml
name: Thread Triage
on:
  pull_request_review:
    types: [submitted]
  pull_request_review_comment:
    types: [created]
permissions:
  contents: read
  pull-requests: write
jobs:
  thread-triage:
    uses: dryvist/ai-workflows/.github/workflows/thread-triage.yml@main
    secrets:
      LLM_ROUTER_API_KEY: ${{ secrets.LLM_ROUTER_API_KEY }}
```

## What the model is given

Per unresolved thread: a short key (`t1`, `t2`, …), the file path and line, the
GraphQL `isOutdated` flag, each comment's author, timestamp and body (truncated
to 1200 characters), and the current diff section for that file (truncated to
4 KiB). The model only ever echoes the short key back, so a hallucinated
identifier cannot be mistaken for a real thread.

## Security notes

- Review events on same-repo PR heads only, so a fork never reaches the router
  key. Comments from this org's own bot accounts are skipped, so a reply cannot
  re-trigger the workflow.
- Checkout sets `persist-credentials: false`; the job token is read-only on
  contents and write only on pull requests, which is what posting the comment
  needs.
- Thread bodies and the diff go to the configured router and nowhere else.
  Point it only at a router you trust with the repository's source.
- Requests carry `x-litellm-tags` and `x-langfuse-trace-name` headers so runs
  group in the router's own observability.
