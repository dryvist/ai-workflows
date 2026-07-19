# Patterns Reference

All AI workflows in this repository use the provider-neutral `run-ai-agent`
adapter. The following patterns are shared by the reusable workflows.

---

## Standard Pattern

Used by most workflows. Static prompt, least-privilege agent access.

**Workflows**: issue-triage, issue-hygiene, issue-sweeper, label-sync, project-router, repo-orchestrator, best-practices, next-steps (scheduled)

**Key elements**:

- Immutable checkout of the prompt asset from `dryvist/ai-llm-prompts` plus this repository's scripts
- `render-prompt.sh` to render the static prompt into a step output
- `run-ai-agent` with the org selector, both provider credentials, and the
  narrowest permission profile that can complete the task

```yaml
- name: Render prompt
  id: prompt
  run: bash .ai-workflows/.github/scripts/render-prompt.sh .ai-llm-prompts/automation/ai-workflows-<name>.md

- name: Run AI agent
  uses: dryvist/ai-workflows/.github/actions/run-ai-agent@main
  with:
    agent: ${{ vars.GH_ACTION_AI_AGENT || 'claude' }}
    anthropic_api_key: ${{ secrets.GH_ACTION_AI_API_KEY }}
    openai_api_key: ${{ secrets.OPENAI_API_KEY }}
    allowed_bots: "github-actions"
    prompt: ${{ steps.prompt.outputs.content }}
    allowed_tools: "Read,Glob,Grep,LS"
    permission_profile: read-only
    claude_model: ${{ vars.GH_ACTION_AI_MODEL_EXAMPLE || vars.GH_ACTION_AI_MODEL }}
    codex_model: ${{ vars.GH_ACTION_AI_CODEX_MODEL }}
```

---

## Canonical Instruction Injection Pattern

Gives every CI agent run the same org-wide baseline instructions a local dev
machine loads via nix (`dryvist/ai-assistant-instructions`: `AGENTS.md` +
`agentsmd/rules/`). Implemented once inside the shared `run-ai-agent`
composite action, so **all** AI workflows inherit it with no per-workflow
edits.

**How it works** (`.github/actions/run-ai-agent/action.yml`):

1. Sparse-checkout `dryvist/ai-assistant-instructions@main` (floating, stays
   current) into `.ai-instructions`, `continue-on-error: true` (fail-open).
2. Deliver the canonical guidance to the native user-instruction location for
   the selected agent.
3. `claude-code-action` loads `~/.claude/CLAUDE.md`; Codex loads the delivered
   `AGENTS.md` from its configured home.
   `settingSources` default is `user`+`project`+`local`), so the content is
   delivered verbatim — no `claude_args` escaping. The consumer repo's own
   `CLAUDE.md` still auto-loads as **project memory** on top, exactly as locally.
4. An always-run cleanup removes the `.ai-instructions` checkout so it is never
   staged into a verified commit. `~/.claude` lives outside the workspace, so it
   is not staged and persists into the Claude step.

**Why user memory, not `claude_args --append-system-prompt`**: the action runs
`claude_args` through `shell-quote` + a comment-stripper, which would blank every
`${VAR}` and delete every `#`-leading markdown heading in the payload. User
memory is loaded by the same native mechanism as a local machine, with full
fidelity and zero escaping.

**Opt out** per caller with `inject_instructions: "false"`.

---

## Verified Commit & PR Pattern

**This is the ONE way every write-workflow lands commits and PRs. Do not invent another.**

### The problem (read this before adding a write-workflow)

A write-workflow must land a **GitHub-verified** commit, because the dryvist org enforces a
`required_signatures` ruleset that rejects unsigned pushes (`GH013`). There are two tempting
ways to do this that **do not work** in our workflows:

1. **`use_commit_signing: "true"`** (claude-code-action's native web-flow). The action derives
   the commit's target branch from the **trigger event's PR context**. Per its own docs: *open
   PR → pushes to the PR branch; issue → new branch; otherwise → it cannot resolve a branch.*
   Our write-workflows fire on **`workflow_run`, `issues`, `schedule`, and `workflow_dispatch`**
   — none give it a usable branch, so it commits **nothing** (observed: `base_branch: ""`, no
   commit, no branch). Proven dead under `workflow_run` (ai-workflows #267, reverted by #268)
   and under `issues` (nix-ai #998: Claude produced the fix but every write channel was denied).
2. **Claude running `git commit && git push` or `gh pr create` itself.** A CLI push is
   **unsigned** → rejected by `required_signatures` (`GH013`). This is what #261 hit.

### The solution

The agent **only edits files** (`use_commit_signing: "false"`, and no git-write /
`gh pr` / `gh api` write tools). A fresh publisher job then commits the diff
through the GitHub **`createCommitOnBranch` GraphQL mutation** using a freshly minted
**JacobPEvans-claude App installation token**. Those commits are **GitHub-VERIFIED** (satisfy
`required_signatures`), attributed to the bot, and re-trigger CI.

All of this lives in one shared helper — **`.github/scripts/shared/verified-commit.js`** — with
two shapes:

| Shape | Helper fn | When | Used by |
| --- | --- | --- | --- |
| Commit to an **existing** branch | `commitToBranch` | fixing a PR in place | `cc-ci-fix` (via `ci-fix/commit-fix.js`) |
| **New** branch + open a PR | `openPr` | new PR from work | `cc-issue-resolver`, `code-simplifier`, `next-steps`, `post-merge-*` (`shared/pr-from-file.js`) |

**Workflows**: ci-fix, issue-resolver, code-simplifier, next-steps, post-merge-docs-review, post-merge-tests.

### Workflow shape (new-branch + PR)

```yaml
permissions:               # job-level
  contents: write
  pull-requests: write

steps:
  # 1. The agent EDITS ONLY — no git-write, no gh pr/gh api writes. For non-issue
  #    workflows it also writes its PR title (first line) + body to `.claude-pr.md`.
  - name: Run AI agent
    uses: dryvist/ai-workflows/.github/actions/run-ai-agent@main
    with:
      agent: ${{ vars.GH_ACTION_AI_AGENT || 'claude' }}
      prompt: ${{ steps.prompt.outputs.content }}
      claude_model: ${{ vars.GH_ACTION_AI_MODEL_PLAN || vars.GH_ACTION_AI_MODEL }}
      codex_model: ${{ vars.GH_ACTION_AI_CODEX_MODEL }}
      allowed_tools: "Edit,MultiEdit,Write,Read,Glob,Grep,LS,Bash(git log:*),Bash(git diff:*),Bash(git status:*)"
      anthropic_api_key: ${{ secrets.GH_ACTION_AI_API_KEY }}
      openai_api_key: ${{ secrets.OPENAI_API_KEY }}
      permission_profile: workspace
      use_commit_signing: "false"

  # 2. Mint the App token so the commit is VERIFIED + bot-attributed.
  - name: Mint PR token
    id: pr-token
    uses: actions/create-github-app-token@v3
    with:
      app-id: ${{ vars.GH_APP_CLAUDE_BOT_ID }}
      private-key: ${{ secrets.GH_APP_CLAUDE_BOT_PRIVATE_KEY }}

  # 3. Open the PR from the agent's edits via the shared helper.
  - name: Open PR
    uses: actions/github-script@v9
    env:
      PR_BRANCH: claude/<workflow>-${{ github.run_id }}
      WORKFLOW_NAME: ${{ github.workflow }}
      RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
      EVENT_NAME: ${{ github.event_name }}
      TRIGGER_ACTOR: ${{ github.triggering_actor }}
    with:
      github-token: ${{ steps.pr-token.outputs.token }}
      script: |
        const run = require('./.ai-workflows/.github/scripts/shared/pr-from-file.js');
        await run({ github, context, core });
```

`pr-from-file.js` reads `.claude-pr.md` (title = first line, body = rest), appends the AI
Provenance footer, and excludes that file from the commit. **No `.claude-pr.md` written →
Claude declined → no PR** (clean no-op). Issue-driven resolution (`open-pr.js`) composes the
title/branch from the issue instead of a file; CI-fix (`commit-fix.js`) calls `commitToBranch`.

### Prompt rules for a write-workflow

- Tell Claude to make the change with `Edit`/`Write`/`MultiEdit` only.
- Tell Claude **NOT** to run git, NOT to `gh pr create`, NOT to push — the workflow commits.
- For non-issue workflows: tell Claude to write the PR title (first line) + body to
  `.claude-pr.md`, or to write nothing if it has no change to propose.

---

## Dynamic Prompt Pattern

Used by workflows whose prompts need runtime values (SHAs, repo names).

**Workflows**: ci-fix, post-merge-docs-review, post-merge-tests

**How it works**: Pass values via `env:` on the render step, then name them as positional args to `render-prompt.sh`:

```yaml
- name: Render prompt
  id: prompt
  env:
    MERGE_SHA: ${{ github.sha }}
    REPO_FULL_NAME: ${{ github.repository }}
  run: bash .ai-workflows/.github/scripts/render-prompt.sh .ai-llm-prompts/automation/ai-workflows-post-merge-tests.md MERGE_SHA REPO_FULL_NAME
```

The prompt file uses `${MERGE_SHA}` and `${REPO_FULL_NAME}` as placeholders.

---

## Gate Pattern

Used by workflows with a pre-check job that decides whether to run the expensive Claude step.

**Workflows**: best-practices (check-recent-activity), post-merge-docs-review (check-relevance), post-merge-tests (check-test-infra),
ci-fix (should-fix), issue-resolver (eligibility check), cc-dep-review (eligibility check), cc-release-notes (head-SHA dedup)

**Structure**: Two jobs — a lightweight gating job followed by the Claude job that only runs if the gate passes:

```yaml
jobs:
  check-activity:
    outputs:
      should_run: ${{ steps.check.outputs.should_run }}
    steps:
      - uses: actions/github-script@v8
        # ... lightweight check

  run-claude:
    needs: check-activity
    if: needs.check-activity.outputs.should_run == 'true'
    # ... Claude step
```

---

## Extracted Script Pattern

Used when workflow logic exceeds the 5-line inline threshold.

**Workflows and their extracted scripts**:

- ci-fix: `find-pr.js`, `check-attempts.js`, `post-attempt-comment.js`, `get-failure-logs.js`
- best-practices: `check-recent-activity.js`
- post-merge-docs-review: `check-docs-relevance.js`
- post-merge-tests: `check-test-infra.js`
- issue-resolver: `check-eligibility.js`

```yaml
- uses: actions/github-script@v8
  with:
    script: |
      const run = require('./.ai-workflows/.github/scripts/ci-fix/find-pr.js');
      await run({ github, context, core });
```

```javascript
// .github/scripts/ci-fix/find-pr.js
module.exports = async ({ github, context, core }) => {
  // All logic here
};
```

Pass dynamic values (issue numbers, SHAs) via `env:` on the step, read via `process.env` in the script.

---

## Post-Merge Dispatch Pattern

Used by consumer callers for post-merge workflows. `push` events are NOT supported by `claude-code-action@v1`,
so callers re-dispatch as `workflow_dispatch` and pass the commit SHA as an input.

**Workflows (consumers)**: post-merge-docs-review, post-merge-tests

**Why**: `push` events cause "Unsupported event type: push" failures in the Claude step. The reusable workflow runs fine under `workflow_dispatch`.

**Reusable workflow** accepts a `commit_sha` input to override `github.sha`:

```yaml
on:
  workflow_call:
    inputs:
      commit_sha:
        description: 'Override commit SHA for workflow_dispatch callers'
        required: false
        type: string
```

**Consumer caller** (two-job pattern — dispatch on push, call reusable on workflow_dispatch):

```yaml
name: Post-Merge Test Review
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      commit_sha:
        description: 'Commit SHA to review'
        required: false
        type: string
permissions:
  actions: write
  contents: write
  pull-requests: write
jobs:
  dispatch:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - name: Re-trigger as workflow_dispatch
        run: |
          gh workflow run "${{ github.workflow }}" \
            --repo "${{ github.repository }}" \
            --ref main \
            -f commit_sha="${{ github.sha }}"
        env:
          GH_TOKEN: ${{ github.token }}
  review:
    if: github.event_name == 'workflow_dispatch'
    uses: dryvist/ai-workflows/.github/workflows/cc-post-merge-tests.yml@main
    with:
      commit_sha: ${{ inputs.commit_sha || github.sha }}
    secrets: inherit
```

Note: `actions: write` is required for `gh workflow run` to trigger the same workflow.

---

## Bot Guard Pattern

Four layers of bot filtering apply, depending on workflow type.

### Layer 1: Internal actor allowlist (`allowed_bots`)

`claude-code-action@v1` internally rejects Bot-type `github.actor` values. All dispatch patterns
(`gh workflow run` with `GITHUB_TOKEN`) set `github.actor` to `github-actions[bot]`, which would cause "Workflow initiated by non-human actor" failures.

**Fix**: Every `claude-code-action@v1` step includes `allowed_bots: "github-actions"`. This allows the trusted internal dispatch actor while
blocking external bots.

**Exception**: ci-fix uses `allowed_bots: "github-actions,claude"` because `workflow_run` events propagate the original actor.
When `claude[bot]` pushes a commit, `github.actor` is `claude[bot]` — the action strips `[bot]` and checks against `allowed_bots`.
Loop prevention is handled by the attempt counter (max 2), not by blocking the actor.

### Layer 2: PR author pre-check (`if:` on action steps)

When a bot creates a PR (e.g., the `claude` GitHub App), `claude-code-action@v1`'s built-in bot guard hard-fails the step —
producing a red CI failure. The fix: add an `if:` condition directly on the `claude-code-action` step
(and any steps that depend on its output) to check the PR author type *before* the action runs.

```yaml
      - name: Run Claude Code Review
        if: >-
          steps.eligibility.outputs.eligible == 'true' &&
          (
            github.event.pull_request.user.type != 'Bot' ||
            contains(inputs.allowed_bots, github.event.pull_request.user.login) ||
            contains(inputs.allowed_bots, '*')
          )
        uses: anthropics/claude-code-action@v1
```

When a bot creates the PR and isn't in `allowed_bots`, the step shows as **skipped** (grey) — not failed (red). CI stays green.

**Behavior by event type**:

- `pull_request` events: `github.event.pull_request.user.type` is set — bot guard applies
- `issue_comment` events (interactive job): `github.event.pull_request` is null → `'' != 'Bot'` → true — always runs
- `workflow_run` events (ci-fix): `github.event.pull_request` is null → always runs

**Consumer configuration**: the PR-triggered `issue-linker` workflow accepts an
`allowed_bots` input:

```yaml
jobs:
  link-issues:
    uses: dryvist/ai-workflows/.github/workflows/issue-linker.yml@main
    with:
      allowed_bots: "claude"  # Allow Claude App PRs to be linked
    secrets: inherit
```

Supports comma-separated logins or `*` to allow all bots.

### Layer 3: Dependency bot filtering (`if:` guards)

PR-triggered workflows (issue-linker, pr-issue-linker) add `if:` guards on their first job
to skip runs triggered by dependency bots (Renovate, Dependabot) and the Claude GitHub App.
This produces a clean **skipped** (grey) status instead of a **failed** (red) status.

```yaml
  gate-check:
    if: >-
      github.actor != 'renovate[bot]' &&
      github.actor != 'dependabot[bot]' &&
      github.actor != 'claude[bot]'
```

**Exception**: ci-fix does NOT block `claude[bot]` — it only blocks dependency bots (`renovate[bot]`, `dependabot[bot]`).
When Claude creates a PR and CI fails, ci-fix needs to run.
Loop prevention is handled by the attempt counter (`check-attempts.js`, max 2 attempts per PR), not by blocking the actor.

**Why at the job level**: Skipping the first job causes GitHub to show all downstream jobs as skipped too — a clean grey tree.

### Inverse of Layer 3: the dependency-review gate

`cc-dep-review.yml` is the deliberate **inverse** of Layer 3 — it runs ONLY on
dependency-bot PRs and skips everything else. It is two layers, reported under the
separate AI Merge Gate (dryvist/.github → SECURITY.md → Dependency Trust): a
deterministic native gate and an advisory AI review. Renovate owns all merging under
its publisher-agnostic freshness model; this workflow has no internal auto-merge — it
only labels and comments.

A `check-eligibility` job is the inverse gate: it runs the paid Claude review ONLY when the
PR author is a dependency bot (`bot_authors`), the highest bump type is in scope
(`update_types`), and no prior review comment exists (dedup marker) — otherwise every
downstream job skips cleanly (grey, not red).

```js
// .github/scripts/dep-review/check-eligibility.js
if (!authors.includes(login)) return skip(`author "${login}" is not a dependency bot`);
```

Defense in depth: a native `actions/dependency-review-action` job is authoritative (fails
closed on vulnerable/transitive deps, AI-independent); the Claude reviewer is one added,
advisory-only signal that applies a `risk:*` label and posts one sticky comment — it has
no merge or auto-merge authority of any kind.

### Layer 4: Post-merge commit-author check (JS scripts)

For post-merge workflows (push→dispatch pattern), `github.actor` in the re-dispatched `workflow_dispatch` run is
`github-actions[bot]` — not the original merger. The gate scripts (`check-docs-relevance.js`, `check-test-infra.js`)
instead check the **commit author** via the GitHub API and early-return when it matches a dependency bot.

```javascript
const authorLogin = commit.author?.login || '';
const { automationBots } = require('../shared/constants.js');
// ...
if (automationBots.includes(authorLogin)) {
  core.setOutput('is_relevant', 'false');
  core.info(`Commit authored by ${authorLogin} — skipping`);
  return;
}
```

---

## AI Dispatch Pattern

Used by consumer `issue-auto-resolve.yml` callers to dispatch issues through the triage + resolve pipeline.
All actors (human and bot) are welcome — cost control is via daily dispatch limits, not bot filtering.

**Triggers**:

- `issues: opened` — new issues auto-dispatch
- `issues: labeled` with `ai:ready` — re-trigger mechanism for existing issues

**Flow**:

```text
issues:opened  → dispatch job → workflow_dispatch → triage → resolve
issues:labeled → (ai:ready?)  → workflow_dispatch → triage → resolve
                   ↑ safety:
                   - daily dispatch limit (default: 5/day)
                   - ai:ready label removed after dispatch (re-apply to re-trigger)
```

**Consumer caller** (three-job unified pattern):

```yaml
name: Issue Auto-Resolve
on:
  issues:
    types: [opened, labeled]
  workflow_dispatch:
    inputs:
      issue_number:
        required: true
        type: string
permissions:
  actions: write
  contents: write
  issues: write
  pull-requests: write
jobs:
  dispatch:
    if: github.event_name == 'issues'
    runs-on: ubuntu-latest
    permissions:
      actions: write
      issues: write
    steps:
      - name: Dispatch as workflow_dispatch
        env:
          GH_TOKEN: ${{ github.token }}
          WORKFLOW_NAME: ${{ github.workflow }}
          REPO: ${{ github.repository }}
          ISSUE_NUM: ${{ github.event.issue.number }}
          EVENT_ACTION: ${{ github.event.action }}
          LABEL_NAME: ${{ github.event.label.name }}
        run: |
          # Filter labeled events to only ai:ready
          if [[ "$EVENT_ACTION" == "labeled" && "$LABEL_NAME" != "ai:ready" ]]; then
            echo "Label '$LABEL_NAME' is not ai:ready — skipping"
            exit 0
          fi

          # Daily dispatch limit (cost control safety valve)
          TODAY=$(date -u +%Y-%m-%d)
          COUNT=$(gh run list \
            --workflow "$WORKFLOW_NAME" \
            --repo "$REPO" \
            --event workflow_dispatch \
            --created ">=$TODAY" \
            --json databaseId --jq 'length')
          if [[ "$COUNT" -ge 5 ]]; then
            echo "Daily dispatch limit reached ($COUNT/5) — skipping"
            exit 0
          fi

          # Remove ai:ready label so it can be re-applied to re-trigger
          if [[ "$EVENT_ACTION" == "labeled" && "$LABEL_NAME" == "ai:ready" ]]; then
            gh issue edit "$ISSUE_NUM" --repo "$REPO" --remove-label "ai:ready" || true
          fi

          gh workflow run "$WORKFLOW_NAME" \
            --repo "$REPO" \
            -f issue_number="$ISSUE_NUM"
  run-triage:
    if: github.event_name == 'workflow_dispatch'
    uses: dryvist/ai-workflows/.github/workflows/issue-triage.yml@<version>
    secrets: inherit
    with:
      issue_number: ${{ inputs.issue_number }}
  resolve-issue:
    needs: [run-triage]
    if: >-
      always() &&
      github.event_name == 'workflow_dispatch' &&
      (needs.run-triage.result == 'success' || needs.run-triage.result == 'skipped')
    uses: dryvist/ai-workflows/.github/workflows/cc-issue-resolver.yml@<version>
    secrets: inherit
    with:
      repo_context: "<repo-specific>"
      issue_number: ${{ inputs.issue_number }}
```

**Key points**:

- `WORKFLOW_NAME` and `REPO` passed via `env:` (not inline `${{ }}`) to prevent template injection
- `always()` on `resolve-issue` ensures it runs even when `run-triage` was skipped
- `ai:ready` label is the re-trigger mechanism — removed after dispatch so it can be re-applied
- Daily dispatch limit (5/day) is the cost-control safety valve
- `actions: write` + `issues: write` scoped to the dispatch job
- Triage always runs (idempotent) — no `skip_triage` input needed

---

## Issue Linker Consumer Caller

The `issue-linker` workflow runs when PRs are opened or merged. Consumer repos should call it with both trigger types and inline `if:` conditions:

```yaml
name: PR Issue Linker
on:
  pull_request:
    types: [opened, closed]
    branches: [main]
permissions:
  contents: read
  issues: write
  pull-requests: write
jobs:
  link-issues:
    if: >-
      !contains(github.event.pull_request.labels.*.name, 'ai:skip-review') &&
      (
        (github.event.action == 'opened' && !github.event.pull_request.draft) ||
        (github.event.action == 'closed' && github.event.pull_request.merged == true)
      )
    uses: dryvist/ai-workflows/.github/workflows/issue-linker.yml@main
    secrets: inherit
```

The `if:` condition handles two trigger modes:

- **Link mode** (`opened`): Runs when a non-draft PR is opened, linking issues and posting reviews for related issues
- **Close mode** (`closed` + `merged`): Runs when a PR merges, closing resolved issues with a reference comment

The gate script (`check-eligibility.js`) additionally skips runs when no open issues exist or when a dedup marker is already present.

---

## AI Provenance Pattern

All PR-creating workflows attach a standardized provenance footer to every PR body so AI-created PRs are fully self-documenting.

**Workflows**: code-simplifier, next-steps, post-merge-docs-review, post-merge-tests, issue-resolver

**How it works**: Five env vars are passed to `render-prompt.sh` on the render step.
The prompt template includes a footer instruction using `${VAR}` placeholders, which `envsubst` expands at render time.

**Env vars added to render steps**:

```yaml
env:
  WORKFLOW_NAME: ${{ github.workflow }}
  RUN_ID: ${{ github.run_id }}
  RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
  EVENT_NAME: ${{ github.event_name }}
  TRIGGER_ACTOR: ${{ github.triggering_actor }}
```

**Footer format** (appended to PR body):

```markdown
---
> **AI Provenance** | Workflow: `${WORKFLOW_NAME}` | [Run ${RUN_ID}](${RUN_URL}) | Event: `${EVENT_NAME}` | Actor: `${TRIGGER_ACTOR}`
```

The model writes PR metadata into a bounded handoff file. The fresh publisher
validates it and appends the provenance footer before creating the PR.

Comment-posting workflows (cc-dep-review) get the same footer from
`sticky-comment.js` instead, which already knows the PR number — see the
Sticky Comment Pattern below.

---

## Sticky Comment Pattern

Comment-only AI workflows (cc-dep-review, cc-release-notes) post exactly ONE marker-keyed
comment per PR and update it in place on re-runs instead of stacking
duplicates.

**How it works**: the model only writes its output to a file. An artifact carries
that file to a fresh publisher job, where `actions/github-script` runs
`.github/scripts/shared/sticky-comment.js` with write permission:

- `BODY_FILE`: the file Claude wrote; missing/empty file → Claude declined →
  clean no-op (mirrors `pr-from-file.js`).
- `MARKER_MATCH`: stable HTML-comment prefix identifying the workflow's
  comment (e.g. `<!-- cc-dep-review -->`); also doubles as the gate's dedup
  marker.
- `MARKER_WRITE` (optional): full marker embedded in the new body, letting a
  workflow carry state in the marker (e.g. a head SHA) while still matching
  the stable prefix.
- Provenance: when `RUN_URL` is set, the AI Provenance footer is appended
  automatically.

**Why comments, not body edits**: bot-owned PR bodies (Renovate,
release-please) are overwritten by their owners on every refresh; a comment
survives and keeps authorship clean.

---

## Concurrency Pattern

All AI workflows use `cancel-in-progress: false`. This queues new runs behind in-progress ones rather than cancelling them.

**Why**: Cancelling an in-progress AI run wastes tokens — the model's work is discarded. Queuing ensures every run completes.

**Rule**: AI workflows must NEVER use `cancel-in-progress: true`. Consumer repos must NOT override this at their caller level.

**Concurrency group scoping**: Groups are scoped per-entity (PR number, issue number, branch) so different entities run concurrently while the
same entity queues:

```yaml
concurrency:
  group: >-
    issue-linker-${{ github.repository }}-${{ github.event_name }}-
    ${{ github.event.pull_request.number || github.event.issue.number || github.ref }}
  cancel-in-progress: false  # Never cancel — queue instead to avoid wasting AI tokens
```

---

## PR Review Responder Pattern

**Workflow**: `cc-pr-review-responder.yml` (reusable). When a reviewer leaves
feedback, the selected agent evaluates current unresolved threads and edits the
PR checkout, but receives only read permissions.

The workflow fetches review threads deterministically into
`.review-threads.json`. The model writes bounded `.review-actions.json` entries
containing only a current thread ID, a reply under 1500 characters, and a resolve
boolean. A fresh publisher re-fetches the threads, rejects stale or unknown IDs,
lands the bounded patch through `verified-commit.js`, then performs only the typed
reply and resolution mutations with the GitHub App token. The model never sees
that token.

**Consumer caller** (`examples/pr-review-responder-caller.yml`): triggers on
`pull_request_review: [submitted]` + `pull_request_review_comment: [created]`. No
cron, no enumeration, and **no** caller-level `concurrency` (the reusable owns the
per-PR group).

**Safety invariants**:

- **Never merges / approves** — no publisher operation supports either action.
- **Fork guard** — `if:` requires `head.repo.full_name == github.repository`, so a
  fork branch is never checked out with write scope. The dispatch path resolves the
  head **SHA** (a hex OID, not the attacker-influenceable `head.ref`) from the
  trusted integer `pr_number`, avoiding branch-name injection.
- **Loop guard** — the bot's own reply is itself a `pull_request_review_comment`
  event; the `if:` excludes our bot logins (`jacobpevans-claude[bot]`,
  `claude[bot]`, `github-actions[bot]`), and `allowed_bots` does not list our bot.
- **Critical evaluation** — the prompt tells the agent to verify each claim against the
  code and push back with reasoning on wrong/opinionated feedback, and to resolve a
  thread only when genuinely settled.
- **Trade-off (documented):** dropping the old scheduled sweep drops the ~10-minute
  "let a human answer first" grace window — a review event fires immediately. A hard
  timer would need `sleep 600` (burns runner minutes) or the enumeration we deleted;
  the prompt instead skips threads the author already answered.

---

## Slack Notification Pattern

Consumer repos receive real-time Slack alerts in `#github-automation` when Claude opens a PR.

**Workflow**: `notify-ai-pr.yml` (reusable)
**Filter**: Only fires for PRs authored by `claude[bot]`

**Consumer caller** (added to each repo):

```yaml
name: AI PR Notification
on:
  pull_request:
    types: [opened]
permissions:
  pull-requests: read
jobs:
  notify:
    uses: dryvist/ai-workflows/.github/workflows/notify-ai-pr.yml@main
    secrets: inherit
```

**Required secret**: `GH_SLACK_WEBHOOK_URL_GITHUB_AUTOMATION` (Slack Incoming Webhook URL for `#github-automation`, synced from Doppler via secrets-sync)

**Message content** (Slack Block Kit):

- Header: "AI-Created PR Opened"
- PR title + link
- Provenance fields: Workflow, Event, Actor, Run link (extracted from PR body footer)

**Implementation**: Extracted script at `.github/scripts/notification/send-slack-pr-notify.js`.
Parses the AI Provenance footer from the PR body using regex to populate the Slack message fields.

## Non-AI Utility Workflow Pattern

Not every reusable workflow needs Claude. When the job is deterministic
(GraphQL mutations, notifications, labeling), a plain `actions/github-script`
workflow is cheaper, faster, and immune to AI-token limits. Current members:
`notify-ai-pr.yml`, `ci-fail-issue.yml`, `review-thread-resolver.yml`.

**Review Thread Resolver** (`review-thread-resolver.yml`) exists because the
org branch ruleset enforces `required_review_thread_resolution`: bot reviewers
(gemini-code-assist, Copilot) leave review threads — including failed-run
notices — that block merges until someone manually runs a
`resolveReviewThread` GraphQL mutation per thread.

**Safety invariant**: a thread is only ever auto-resolved when EVERY comment
in it was authored by an allow-listed bot (`__typename == 'Bot'`, login in
`bot_reviewers`) AND the thread is either outdated (code changed underneath
it) or matches `failure_patterns`. One human reply anywhere means the thread
is never touched. Substantive bot feedback that is still current also
survives — responding to that is `cc-pr-review-responder`'s job, not this
workflow's.

**Two modes**:

- *Single PR* — consumer caller on `pull_request: [synchronize]` +
  `pull_request_review: [submitted]` for instant cleanup.
- *Org sweep* — the hub's `dogfood-review-thread-sweep.yml` runs hourly over
  the repos in the org-level `AI_SWEEP_REPOS` variable (managed by
  tofu-github). Consumer repos need **zero files** for sweep coverage.

**Token requirement** (hard-won): `resolveReviewThread` requires a token with
**Contents read-write** — `pull-requests: write` alone is not enough — and the
default `GITHUB_TOKEN` is often rejected (`Resource not accessible by
integration`) for bot-authored threads in non-interactive runs. The workflow
mints a GitHub App installation token from `GH_APP_CLAUDE_BOT_ID` /
`GH_APP_CLAUDE_BOT_PRIVATE_KEY` when available (org-wide in sweep mode) and
falls back to `GITHUB_TOKEN` with a per-thread warning instead of a run
failure.
