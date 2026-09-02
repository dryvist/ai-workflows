# Repository Hygiene Digest

`repo-hygiene-digest.yml` reports, once a night, what has accumulated in one or
more repositories: branches that can go, open pull requests grouped by what is
holding them, promotion drift on git-flow repos, and branches nothing has
touched in a month.

It is **read-only**. Every fact comes from a `gh` read under the job's default
token; the workflow never creates, deletes, merges, or pushes anything. Acting
on the digest stays a human decision.

A model is used for one thing only: a five-line plain-prose summary of facts
that were already computed. With no router credential the summary is skipped
and the digest is posted with facts only, and the job still succeeds.

## What it computes

| Section | Meaning |
| --- | --- |
| Deletion candidates | A branch still present whose head commit's pull request is merged or closed. Listed only — never deleted. |
| Stale branches | A branch with no associated pull request and no commit in `stale_days` days. |
| Open pull requests | Bucketed as mergeable-and-green, blocked by checks, unresolved review threads, draft, or bot-authored. |
| Promotion candidate | On a git-flow repo (default branch `develop`), how many commits `develop` carries that `main` does not, plus the last subject. |

Each pull request lands in exactly one bucket, in that order — draft first,
then the named dependency and release bots (renovate, dependabot,
release-please), then unresolved threads, then failing or pending checks, and
what is left is mergeable and green. A pull request opened by an agent through
a GitHub App installation is **not** treated as a bot: it still needs a human.

The branch scan reads the remote, so "upstream is gone" is not observable —
what is reported instead is the remote-side equivalent, a branch whose pull
request has already been merged or closed.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `runner_label` | `ubuntu-latest` | Runner label for the job |
| `repos` | the calling repository | Comma-separated `owner/name` list |
| `model` | `cheap` | Router **role alias** for the summary — never a vendor model id |
| `slack` | `false` | Post the digest to Slack when the webhook secret is present |
| `stale_days` | `30` | Age at which a pull-request-less branch counts as stale |
| `max_tokens` | `400` | Completion token ceiling for the summary |
| `base_url_var_name` | `LLM_ROUTER_BASE_URL` | Name of the Actions variable holding the router base URL |

## Configuration

| Name | Kind | Holds |
| --- | --- | --- |
| `LLM_ROUTER_BASE_URL` | Actions variable | The router's OpenAI-compatible base URL, ending in `/v1` |
| `LLM_ROUTER_API_KEY` | Actions secret | A scoped router key. Never the router's master key. |
| `GH_SLACK_WEBHOOK_URL_GITHUB_AUTOMATION` | Actions secret | Slack incoming webhook, used only when `slack` is true |

## Output

The digest is written to the job summary, uploaded as the artifact
`repo-hygiene-digest.md`, and — when `slack` is true and the webhook secret
exists — posted to Slack, truncated there because the artifact and job summary
carry the full text.

## Calling it

```yaml
name: Repository Hygiene Digest
on:
  schedule:
    - cron: '17 6 * * *'
  workflow_dispatch:
permissions:
  contents: read
  pull-requests: read
  actions: read
jobs:
  digest:
    uses: dryvist/ai-workflows/.github/workflows/repo-hygiene-digest.yml@main
    with:
      repos: owner/one,owner/two
      slack: true
    secrets: inherit
```

## Security notes

- Permissions are read-only throughout: `contents: read`, `pull-requests: read`,
  `actions: read`. There is no write path to any repository.
- Checkout sets `persist-credentials: false`; actions are SHA-pinned.
- Only the computed facts — repository names, branch names, pull request titles
  and numbers — reach the router. No diff and no source is sent.
- A repository the token cannot read is reported as unreadable in the digest
  rather than failing the job.
