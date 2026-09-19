# Thread Triage

`thread-triage.yml` asks a cheap model, served through the org's
OpenAI-compatible model router, to classify every unresolved review thread on a
pull request. The verdicts are rendered as one sticky comment that is updated in
place as reviews come in.

It exists to take a specific job off the premium models. Both the
`resolve-pr-threads` and `receiving-code-review` skills begin the same way:
read every unresolved thread and decide which ones still matter. That first
pass is classification, not authorship, so it belongs on the cheap router role;
the premium model then starts from the shortlist.

It is deliberately inert: it never resolves a thread, never replies in one,
and never edits code.

## Failure contract

Not advisory. If the router is unreachable the job fails, releasing the
runner: `actions/ai-inference` retries a connection failure or 5xx twice, and
the job is capped at ten minutes (`timeout-minutes`). A wrong key, base URL
or model alias fails in seconds instead of waiting.

`runner_label` defaults to `self-hosted` because the router is only reachable
from inside the estate; a GitHub-hosted runner would review nothing. Never make
this a required check — a failure should be visible without blocking a merge.

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
| `runner_label` | `self-hosted` | Runner label for the job |
| `model` | `cheap` | Router **role alias** to call — never a vendor model id |
| `max_threads` | `20` | Triage at most this many unresolved threads |
| `max_tokens` | `1200` | Completion token ceiling |

## Configuration

| Name | Kind | Holds |
| --- | --- | --- |
| `LLM_ROUTER_BASE_URL` | Actions **secret** | The router's OpenAI-compatible base URL, ending in `/v1`. A secret: run logs print step environments. |
| `LLM_ROUTER_API_KEY` | Actions **secret** | The scoped router key for CI. Never the router's master key. |

Both are required. With either missing the job fails immediately, naming the
one that did not arrive.

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
      LLM_ROUTER_BASE_URL: ${{ secrets.LLM_ROUTER_BASE_URL }}
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
- Requests carry an `x-langfuse-trace-name` header so runs group in the
  router's own observability. Spend is attributed by the calling key itself.
