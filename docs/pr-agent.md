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

Not advisory. If the router is down or at capacity the job fails, releasing
the runner: the router admits or refuses at once, and the job is capped at
ten minutes. The router role's fallback ladder absorbs load. A wrong key,
base URL or model fails at once. A
model error fails the job rather than being swallowed: PR-Agent 0.45.0's
CLI exits 0 either way (`config.propagate_tool_errors` only changes what it
logs; fixed upstream in qodo-ai/pr-agent#3368, not yet in an image), so
`run.sh` fails the step on its failure log line.

This is deliberate: the workflow this replaced reported success while doing
nothing for weeks, because "router credential not configured" was a
skip-and-succeed path. The org ruleset runs this workflow as a required check
on every pull request, so an outage blocks merges until the review is re-fired
(a push or a close/reopen) once the endpoint is back.

## Runner

`runner_label` defaults to `self-hosted`. The router is only reachable from
inside the estate, so nothing else can review anything. Repository visibility
picks the router key and role — a private repo uses `LLM_ROUTER_API_KEY` with
`model`, an open-source repo `LLM_ROUTER_OSS_API_KEY` with `oss_model` — and
each role carries its own fallback ladder on the router, so where a diff may
travel is decided there, never here.

PR-Agent runs as its published container through the CLI it documents, not as
a container action: the shared runner pool passes the Docker socket through
without a host-identical work directory, so a container action would receive an
empty workspace and no event payload. The CLI needs neither — it reads the pull
request over the API — and the image is pinned by digest in
`.github/scripts/pr-agent/run.sh`.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `runner_label` | `self-hosted` | Runner label; must reach the router |
| `model` | `review-private` | Private repos: router **role alias** (never a vendor id) one `LLM_ROUTER_API_KEY` may call |
| `oss_model` | `review-public` | Open-source repos: router role alias one `LLM_ROUTER_OSS_API_KEY` may call |
| `max_tokens` | `32000` | Input context to assume for the model (`custom_model_max_tokens`) |
| `review` | `true` | Run the review tool |
| `improve` | `false` | Run the improve tool |
| `describe` | `false` | Run the describe tool (rewrites title and body) |

## Configuration

| Name | Kind | Holds |
| --- | --- | --- |
| `LLM_ROUTER_BASE_URL` | Actions **secret** | The router's OpenAI-compatible base URL, ending in `/v1` |
| `LLM_ROUTER_API_KEY` | Actions **secret** | Scoped router virtual key for private repositories (never the router's master key) |
| `LLM_ROUTER_OSS_API_KEY` | Actions **secret** | A second router virtual key, scoped to the open-source role; read only on such a repo |
| `LLM_PUBLIC_REVIEW_API_KEY` | Actions **secret** | Deprecated and ignored predecessor of the row above; removed next release |

The first two are required. The base URL is a secret rather than a variable
because a run log prints each step's environment verbatim, and these
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
      LLM_ROUTER_OSS_API_KEY: ${{ secrets.LLM_ROUTER_OSS_API_KEY }}
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
