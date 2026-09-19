# Commit Review

`commit-review.yml` reviews every push on every branch: a model reads the
pushed diff and leaves one comment on the head commit. Pull requests already
get [PR-Agent](pr-agent.md); this covers the commits that never sit in one —
direct pushes, work-in-progress branches, bot commits — so no commit lands
unreviewed.

A push to a branch that already has an open pull request is skipped, as is a
push to `develop` or `main` (merges of pull requests PR-Agent reviewed). A
first job on a GitHub-hosted runner counts the branch's open pull requests
with one `gh pr list` call, and the review job runs only when that count is
zero — the same diff is never reviewed twice.

## Where it runs

Every review goes through the org's model router, on the `self-hosted` pool
(the only runners that reach it). Repository visibility, read inside the
reusable workflow, picks the router key and role — nothing else:

| Visibility | Key | Role |
| --- | --- | --- |
| private | `LLM_ROUTER_API_KEY` | `model` (default `review-private`) |
| open-source | `LLM_ROUTER_OSS_API_KEY` | `oss_model` (default `review-public`) |

Each role carries its own fallback ladder on the router — local rungs first,
then whatever overflow the role allows — so where a diff may travel is
decided by the role and the key that may call it, never by this workflow.
The expressions never read the public key on a private repo; the only
fall-through is public to `LLM_ROUTER_API_KEY` when the public key is unset.

## What it reviews

The push's own range (`before..sha`) when the base is known and still in
history, so a multi-commit push is one review; otherwise the head commit
against its parent (a new branch, a force-push, a shallow base). A root commit
is diffed against the empty tree. The diff is capped at `max_diff_kb`; an
empty diff (a merge that changed nothing) posts a one-line note rather than
failing.

## Failure contract

If the router is unreachable or at capacity the review job fails, releasing
the runner: `actions/ai-inference` retries a connection failure or 5xx twice,
and the job is capped at ten minutes. A wrong key, base URL or alias fails
at once. It never succeeds having reviewed nothing.
Never make it a required check — a failure should be visible without blocking
a push or a merge.

## Bursts

Two things absorb a burst of pushes:

- The per-ref concurrency group queues pushes (`cancel-in-progress: false`);
  one branch's backlog holds one runner slot, never the pool.
- On the router, the role carries its own fallback ladder, edited in the
  router's admin UI. A busy first rung falls through to the next rather than
  failing the review, and the ladder can be re-ranked without touching this
  workflow.

## Permissions

The counting job runs with `contents: read`, enough to list a public
repository's open pull requests; a private caller grants `pull-requests: read`
as well. The review job runs with `contents: read`. The comment is posted from a
separate job holding `contents: write`, the permission the commit-comment
endpoint requires; that job runs no model and reads no secret.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `runner_label` | `self-hosted` | Runner label; must reach the router |
| `scripts_ref` | default branch | Ref of this repository to take the scripts from |
| `model` | `review-private` | Private repos: router **role alias** — never a vendor model id; one `LLM_ROUTER_API_KEY` may call |
| `oss_model` | `review-public` | Open-source repos: router role alias one `LLM_ROUTER_OSS_API_KEY` may call |
| `max_diff_kb` | `150` | Truncate the pushed diff at this many KiB |
| `max_tokens` | `1500` | Completion ceiling |

Secrets: `LLM_ROUTER_BASE_URL` and `LLM_ROUTER_API_KEY`, both required, same
contract as [PR-Agent](pr-agent.md#configuration); `LLM_ROUTER_OSS_API_KEY`,
optional, a second router key scoped to the open-source role, read only on
such a repo. `LLM_PUBLIC_REVIEW_API_KEY` and `LLM_PUBLIC_REVIEW_BASE_URL` are
deprecated and ignored — still accepted so existing callers validate; drop
them.

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
      LLM_ROUTER_OSS_API_KEY: ${{ secrets.LLM_ROUTER_OSS_API_KEY }}
```
