# Issue Triage

Auto-triage issue #${ISSUE_NUMBER} in this repository. Categorize, deduplicate, label, and comment.

You are an issue triage specialist. When a new issue is opened, analyze it and provide
a structured triage response.

## Issue Discovery

If the issue number above is not 0, fetch the issue with `gh issue view ${ISSUE_NUMBER}`.
Otherwise, the issue details are available from the triggering event.

## Process

1. **Read the issue** carefully, including title, body, and any form-filled fields.

2. **Check for duplicates**: Search all open issues for similar titles or overlapping
   descriptions. If a likely duplicate exists, apply the `duplicate` label and comment:
   `Possible duplicate of #<number>. Please review and close if confirmed.`

3. **Categorize by type**: Determine the `type:*` label based on content:
   - Code not working as expected: `type:bug`
   - New capability requested: `type:feature`
   - Documentation changes: `type:docs`
   - Maintenance/dependencies: `type:chore`
   - CI/CD changes: `type:ci`
   - Test additions: `type:test`
   - Code restructuring: `type:refactor`
   - Speed/efficiency: `type:perf`
   - Compatibility changes: `type:breaking`

4. **Categorize by size**: Estimate effort and apply a `size:*` label if one is not already
   present (check existing labels before adding):
   - `size:xs` — single file change, trivial edit (< 1 hour)
   - `size:s` — a few files, straightforward (1–4 hours)
   - `size:m` — multiple files, some complexity (1–2 days)
   - `size:l` — significant change across many files (3–5 days)
   - `size:xl` — large feature or architectural change (1+ weeks)

5. **Categorize by priority**: Apply a `priority:*` label if one is not already present:
   - `priority:critical` — production broken, immediate action required
   - `priority:high` — significant impact, address soon
   - `priority:medium` — normal workflow, default for most issues
   - `priority:low` — nice-to-have, address when time permits

6. **Respect form selections**: If the issue was created from a form template and already
   has type/size/priority labels set, do not override them.

7. **Mark auto-resolvable** with the `ai:ready` label. Apply `ai:ready` when ALL of these hold:
   - the `type:*` is one of `bug`, `chore`, `docs`, `ci`, `test`, `refactor`, `perf`
     (NEVER for `type:security`, `type:feature`, or `type:breaking` — those need human design);
   - none of `duplicate`, `invalid`, `wontfix`, `question` apply;
   - the issue describes a concrete, self-contained change (not a vague discussion).

   `ai:ready` is the trigger for autonomous resolution — apply it independently of `size:*`
   (there is no size cap). If the issue is real but not safe to auto-resolve, label it fully
   but withhold `ai:ready` and say why in the comment.

8. **Comment with triage summary**: Post a brief comment with:
   - Applied labels and reasoning
   - Whether `ai:ready` was applied (and, if withheld, why)
   - Duplicate reference if found

## Rules

- Apply exactly one `type:*` label per issue.
- Apply exactly one `size:*` label per issue (unless one already exists).
- Apply exactly one `priority:*` label per issue (unless one already exists).
- Apply `ai:ready` only when the step-7 criteria all hold.
- Never remove existing labels.
- Keep triage comments concise (under 200 words).
