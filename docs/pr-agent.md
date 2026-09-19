# PR Agent

`pr-agent.yml` runs [PR-Agent](https://github.com/The-PR-Agent/pr-agent)
against the org's OpenAI-compatible model router. It replaces the hand-written
`local-review.yml` and the former `router` provider of the code simplifier: the
same three jobs (review the diff, suggest simplifications, rewrite the
description) are things PR-Agent already does, so this repository carries the
wiring and none of the prompting machinery.

| Tool | Input | What it does |
| --- | --- | --- |
| `review` | `review` (default `true`) | Verdicts on the diff as one comment, updated in place on later pushes |
| `improve` | `improve` (default `false`) | Code suggestions on the diff, as review comments |
| `describe` | `describe` (default `false`) | **Rewrites the pull request title and body** |

Leave `describe` off wherever something else owns the body — release-please's
release pull requests, or a provenance footer.

## Failure contract

Not advisory. If the router is unreachable or at capacity the job tries three
times inside fifteen seconds and then fails, releasing the runner; the job
itself is capped at ten minutes. A wrong key, base URL or model alias fails
at once.
A model error fails the job rather than being swallowed
(`config.propagate_tool_errors`).

This is deliberate: the workflow this replaced reported success while doing
nothing for weeks, because "router credential not configured" was a
skip-and-succeed path. Never make this a required check — a failure should be
visible without blocking a merge.

## Runner

`runner_label` defaults to `self-hosted`. The router is only reachable from
inside the estate, so a GitHub-hosted runner cannot review anything against
it. The runner must reach whatever `LLM_ROUTER_BASE_URL` names: pair a
GitHub-hosted label only with an external endpoint, as the org-required
caller does for public repositories.

PR-Agent runs as its published container through the CLI it documents, not as
a container action: the shared runner pool passes the Docker socket through
without a host-identical work directory, so a container action would receive an
empty workspace and no event payload. The CLI needs neither — it reads the pull
request over the API — and the image is pinned by digest in
`.github/scripts/pr-agent/run.sh`.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `runner_label` | `self-hosted` | Runner label; must reach the endpoint in `LLM_ROUTER_BASE_URL` |
| `model` | `cheap` | Model as the endpoint names it: a router **role alias** (never a vendor id), or the vendor's id against an external endpoint |
| `fallback_model` | `subagent` | Model to retry on after an error, named the same way; same key and endpoint |
| `max_tokens` | `32000` | Input context to assume for the model (`custom_model_max_tokens`) |
| `review` | `true` | Run the review tool |
| `improve` | `false` | Run the improve tool |
| `describe` | `false` | Run the describe tool (rewrites title and body) |

## Configuration

| Name | Kind | Holds |
| --- | --- | --- |
| `LLM_ROUTER_BASE_URL` | Actions **secret** | The endpoint's OpenAI-compatible base URL: the router's (ending in `/v1`) or an external provider's |
| `LLM_ROUTER_API_KEY` | Actions **secret** | Key for that endpoint: the scoped router key for CI (never the router's master key) or the provider's key |

Both are secrets, and both are required. The base URL is a secret rather than a
variable because a run log prints each step's environment verbatim, and these
repositories are public.

## Prompts live in the consumer repository

Everything PR-Agent says is steered by a `.pr_agent.toml` at the root of the
repository being reviewed — the review checklist under `[pr_reviewer]
extra_instructions`, what "simplify" means under `[pr_code_suggestions]
extra_instructions`, and any `ignore` rules. This workflow deliberately sets no
`extra_instructions` of its own: an environment value would override the file
and every repository would get the same prompt.

```toml
[pr_reviewer]
extra_instructions = """
Answer each point for this diff, citing the hunk you relied on:
- Is every third-party action pinned to a commit SHA?
- Are job permissions explicit and minimal?
- Does the diff add a credential, token, hostname, or address literal?
- Does the diff introduce an unevidenced custom script where a native platform
  feature or tool capability exists?
"""
```

The file is read from the pull request's **own head branch**
(`config.config_branch`), falling back to the default branch. A change to the
checklist is therefore exercised by the pull request that makes it.

## Calling it

```yaml
name: PR Agent
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
jobs:
  pr-agent:
    permissions:
      contents: read
      pull-requests: write
    uses: dryvist/ai-workflows/.github/workflows/pr-agent.yml@main
    with:
      improve: true
    secrets:
      LLM_ROUTER_BASE_URL: ${{ secrets.LLM_ROUTER_BASE_URL }}
      LLM_ROUTER_API_KEY: ${{ secrets.LLM_ROUTER_API_KEY }}
```

Do **not** give the caller a `concurrency:` block that repeats this workflow's
own group. A caller sharing the reusable workflow's exact concurrency group
produces an opaque zero-job `startup_failure` that appears nowhere in the API.

## Security notes

- `pull_request` only, never `pull_request_target`.
- Same-repo heads only, so a fork never sees the router key. Draft pull
  requests are skipped.
- The job token is read-only on contents and write only on pull requests.
- Configuration reaches the container through an env file, so the key never
  appears in a process listing.
- The base URL and its bare host are registered with `::add-mask::` before the
  first request: a connection error names the host, and that string is not the
  secret, so Actions would not mask it on its own.
- Review labels are off. Creating a label that does not exist would need
  `issues: write`, which no caller has to grant for a review.
- The diff is sent to the configured router and nowhere else.
