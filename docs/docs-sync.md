# Docs Sync

`docs-sync.yml` runs once per merged pull request in a calling ("source")
repository. A coding agent checks whether that ONE merge changed something
the private docs site (`docs_repo`, `dryvist/docs-starlight` by default)
states, and — only when it did — drafts a correction there.

It replaces the per-repo agent rule proposed in
`dryvist/ai-assistant-instructions#851` with one enforced CI job every repo
inherits by calling this workflow, instead of a convention each agent has to
remember to follow.

It never edits the calling repository. The only possible mutation is a PR in
`docs_repo`. A merge with nothing documentation-relevant, or with nothing
stale to fix, opens no PR — that is the expected, common outcome.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `source_repo` | *(required)* | `owner/repo` of the merged pull request — the repo calling this workflow |
| `pr_number` | *(required)* | Number of the merged pull request in `source_repo` |
| `merge_sha` | *(required)* | Merge commit SHA in `source_repo` |
| `docs_repo` | `dryvist/docs-starlight` | `owner/repo` of the private docs site this workflow may open a PR against |
| `docs_repo_app_id` | *(required)* | App ID of the GitHub App installed on `docs_repo`, used to mint both the read-only checkout token and the write PR token |
| `model` | `cheap` | Router **role alias** to call — never a vendor model id |
| `runner_label` | `self-hosted` | Runner label for the job(s) — must be a runner that can reach the model router |
| `draft_prs` | `"true"` | Open the resulting PR as a draft instead of ready-for-review |
| `daily_run_limit` | `"10"` | Max workflow runs per calling repo per day (`0` to disable) |

## Configuration

| Name | Kind | Holds |
| --- | --- | --- |
| `LLM_ROUTER_BASE_URL` | Actions **secret** | The router's OpenAI-compatible base URL |
| `LLM_ROUTER_API_KEY` | Actions **secret** | The scoped router key for CI |
| `DOCS_REPO_APP_PRIVATE_KEY` | Actions **secret** | Private key of `docs_repo_app_id` |

## Which App writes to docs_repo

`docs_repo` is private by default, so every checkout of it — even the
read-only one the agent works from — needs an App installation token; the
ambient `GITHUB_TOKEN` only covers the calling (`source_repo`) repository.
Two candidates already exist in this org, and the caller's own workflow picks
one by the `docs_repo_app_id`/`DOCS_REPO_APP_PRIVATE_KEY` it passes in:

- The App behind `docs-publisher.yml`'s `private_app_id` /
  `DOCS_PRIVATE_APP_PRIVATE_KEY` — already proven installed on
  `dryvist/docs-starlight`, since that workflow uses it today to open PRs on
  that exact repo (its own "curate" job, self-referencing).
- The App behind `cc-post-merge-docs-review.yml`'s `GH_APP_CLAUDE_BOT_ID` /
  `GH_APP_CLAUDE_BOT_PRIVATE_KEY` (`dryvist-claude`) — proven to write PRs
  only into the SAME repo that calls it (no `owner`/`repositories` override
  in that workflow). Whether it is *also* installed on `docs-starlight` is
  unconfirmed from this repo; that has to be checked against the App's
  installation list before it can be passed as `docs_repo_app_id` here.

This workflow does not hardcode either — passing the wrong App ID fails the
token-mint step immediately (a 404/403 from the Apps API), it does not
silently write nothing.

## Two-token design

`docs_repo` never gets a write-capable token in the same job that runs the
AI agent (this repo's "Agent jobs must not receive a write-capable GitHub
token" rule): the `docs-sync` job mints a `permission-contents: read` token
for its checkout of `docs_repo`, and the `publish` job — which never invokes
the agent — mints a fresh `permission-contents: write` /
`permission-pull-requests: write` token from the same App for its own
checkout and the PR it opens. Both are scoped to exactly `docs_repo` via the
token-mint step's `owner`/`repositories` inputs, never a wider installation.

## Calling it

A calling repo re-dispatches on its own default-branch push, the same
[Post-Merge Dispatch Pattern](PATTERNS.md#post-merge-dispatch-pattern) other
post-merge workflows use, resolving the merged PR number itself (see
`docs-drift.yml`'s "Find the merged pull request" job for the `gh pr list
--search "$SHA" --state merged` lookup):

```yaml
name: Docs Sync
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      pr_number:
        required: false
        type: string
permissions:
  actions: write
  contents: read
jobs:
  find-pr:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - name: Find merged PR and re-dispatch
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          number="$(gh pr list --repo "${{ github.repository }}" --search "${{ github.sha }}" --state merged --limit 1 --json number --jq '.[0].number // ""')"
          [ -n "$number" ] && gh workflow run "${{ github.workflow }}" --repo "${{ github.repository }}" --ref main -f pr_number="$number"
  sync:
    if: github.event_name == 'workflow_dispatch' && inputs.pr_number != ''
    uses: dryvist/ai-workflows/.github/workflows/docs-sync.yml@main
    with:
      source_repo: ${{ github.repository }}
      pr_number: ${{ inputs.pr_number }}
      merge_sha: ${{ github.sha }}
      docs_repo_app_id: ${{ vars.DOCS_PRIVATE_APP_ID }}
    secrets: inherit
```

On a repository whose default branch is not `main`, name that branch instead.
