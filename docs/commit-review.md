# Commit Review

`commit-review.yml` reviews every push on every branch: a model reads the
pushed diff and leaves one comment on the head commit. Pull requests already
get [PR-Agent](pr-agent.md); this covers the commits that never sit in one —
direct pushes, work-in-progress branches, bot commits — so no commit lands
unreviewed.

## Where it runs

Repository visibility decides, inside the reusable workflow, unless the caller
pins `runner_label`:

| Visibility | Runner | Endpoint secrets | Model |
| --- | --- | --- | --- |
| private | `self-hosted` | `LLM_ROUTER_BASE_URL` / `LLM_ROUTER_API_KEY` | `model` (router role alias) |
| public | `ubuntu-latest` | `LLM_PUBLIC_REVIEW_BASE_URL` / `LLM_PUBLIC_REVIEW_API_KEY` | `public_model` (the vendor's id) |

Only the self-hosted pool reaches the router, so private diffs never leave the
estate. The public pair is an org secret scoped to the public repositories; a
private repo's run cannot read it. The expressions fall through only from
public to router, which a GitHub-hosted runner cannot reach — a missing public
secret fails at the endpoint probe instead of reviewing on the wrong path.

## What it reviews

The push's own range (`before..sha`) when the base is known and still in
history, so a multi-commit push is one review; otherwise the head commit
against its parent (a new branch, a force-push, a shallow base). A root commit
is diffed against the empty tree. The diff is capped at `max_diff_kb`; an
empty diff (a merge that changed nothing) posts a one-line note rather than
failing.

## Failure contract

Same as PR-Agent: if the endpoint is down or at capacity the review job probes
it three times inside fifteen seconds, then fails and releases the runner; the
completion request itself retries inside the same fifteen-second budget
(`RETRY_MAX` in `router-chat.sh`). A wrong key, base URL or model fails at
once. It never succeeds having reviewed nothing.
Never make it a required check — a failure should be visible without blocking
a push or a merge.

## Bursts

Two things absorb a burst of pushes:

- The per-repository concurrency group queues pushes (`cancel-in-progress:
  false`); one repository's backlog holds one runner slot, never the pool.
- On the router, the role alias (`model`, default `cheap`) carries its own
  fallback ladder, edited in the router's admin UI. A busy first rung falls
  through to the next rather than failing the review, and the ladder can be
  re-ranked without touching this workflow. The external endpoint has no
  ladder; its own capacity is the bound.

## Permissions

The review job runs with `contents: read`. The comment is posted from a
separate job holding `contents: write`, the permission the commit-comment
endpoint requires; that job runs no model and reads no secret.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `runner_label` | empty | Runner label; empty picks by visibility (see above). Must reach the endpoint the job is given |
| `scripts_ref` | default branch | Ref of this repository to take the scripts from |
| `model` | `cheap` | Private repos: router **role alias** — never a vendor model id; must be one the CI key may reach |
| `public_model` | `glm-5.3-flash` | Public repos: the external endpoint's model id |
| `max_diff_kb` | `150` | Truncate the pushed diff at this many KiB |
| `max_tokens` | `1500` | Completion ceiling |

Secrets: `LLM_ROUTER_BASE_URL` and `LLM_ROUTER_API_KEY`, both required, same
contract as [PR-Agent](pr-agent.md#configuration); `LLM_PUBLIC_REVIEW_BASE_URL`
and `LLM_PUBLIC_REVIEW_API_KEY`, optional, passed by every caller and present
only where the org has scoped them.

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
      LLM_PUBLIC_REVIEW_BASE_URL: ${{ secrets.LLM_PUBLIC_REVIEW_BASE_URL }}
      LLM_PUBLIC_REVIEW_API_KEY: ${{ secrets.LLM_PUBLIC_REVIEW_API_KEY }}
```
