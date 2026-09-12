# Code Simplifier

`cc-code-simplifier.yml` looks for code that can be reused, deduplicated,
deleted, or shortened without changing behaviour. A premium coding agent edits
the working tree and a focused pull request is opened with the result.

For a read-only pass that comments on an open pull request instead of opening
one, call [`pr-agent.yml`](pr-agent.md) with `improve: true`. Its suggestions
come from the same model router, need no write permission, and land as review
comments the author can apply. That replaces this workflow's former `router`
provider.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `runner_label` | `ubuntu-latest` | Runner label for the job(s) |
| `daily_run_limit` | `5` | Max runs per day (`0` disables the cap) |

## Configuration

The agent variables and secrets described in
[AUTHENTICATION.md](AUTHENTICATION.md): `GH_ACTION_AI_AGENT` selects the
implementation, and the selected provider's credential plus the App key that
opens the pull request must be available.

## Calling it

```yaml
name: Code Simplifier
on:
  schedule:
    - cron: "0 4 * * *"
  workflow_dispatch:
permissions:
  actions: read
  contents: write
  pull-requests: write
jobs:
  simplify:
    uses: dryvist/ai-workflows/.github/workflows/cc-code-simplifier.yml@main
    secrets: inherit
```

## Security notes

- The agent only edits files and writes its pull request description; a
  separate publisher job opens a GitHub-verified pull request from that
  (docs/PATTERNS.md, "Verified Commit & PR Pattern").
- Checkout sets `persist-credentials: false`.
- Two ceilings bound cost: the bot pull request ceiling and `daily_run_limit`.
