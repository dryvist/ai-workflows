# Commit Review

`commit-review.yml` reviews every push on every branch: the router's model
reads the pushed diff and leaves one comment on the head commit. Pull requests
already get [PR-Agent](pr-agent.md); this covers the commits that never sit in
one — direct pushes, work-in-progress branches, bot commits — so no commit
lands unreviewed.

## What it reviews

The push's own range (`before..sha`) when the base is known and still in
history, so a multi-commit push is one review; otherwise the head commit
against its parent (a new branch, a force-push, a shallow base). A root commit
is diffed against the empty tree. The diff is capped at `max_diff_kb`; an
empty diff (a merge that changed nothing) posts a one-line note rather than
failing.

## Failure contract

Same as PR-Agent: if the router is unreachable the review job waits with
exponential backoff and fails on `timeout-minutes` (60). A wrong key, base
URL or alias fails in seconds. It never succeeds having reviewed nothing.
Never make it a required check — a failure should be visible without blocking
a push or a merge.

## Bursts

Two things absorb a burst of pushes:

- The per-repository concurrency group queues pushes (`cancel-in-progress:
  false`); one repository's backlog holds one runner slot, never the pool.
- The router role alias (`model`, default `judge`) carries its own fallback
  ladder, edited in the router's admin UI. A busy first rung falls through
  to the next rather than failing the review, and the ladder can be re-ranked
  without touching this workflow.

## Permissions

The review job runs with `contents: read`. The comment is posted from a
separate job holding `contents: write`, the permission the commit-comment
endpoint requires; that job runs no model and reads no secret.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `runner_label` | `self-hosted` | Runner label; must reach the router |
| `scripts_ref` | default branch | Ref of this repository to take the scripts from |
| `model` | `judge` | Router **role alias** — never a vendor model id |
| `max_diff_kb` | `150` | Truncate the pushed diff at this many KiB |
| `max_tokens` | `1500` | Completion ceiling |

Secrets: `LLM_ROUTER_BASE_URL` and `LLM_ROUTER_API_KEY`, both required, same
contract as [PR-Agent](pr-agent.md#configuration).

## Caller

```yaml
name: Commit Review
on:
  push:
    branches: ["**"]
permissions:
  contents: write
jobs:
  commit-review:
    uses: dryvist/ai-workflows/.github/workflows/commit-review.yml@main
    secrets:
      LLM_ROUTER_BASE_URL: ${{ secrets.LLM_ROUTER_BASE_URL }}
      LLM_ROUTER_API_KEY: ${{ secrets.LLM_ROUTER_API_KEY }}
```
