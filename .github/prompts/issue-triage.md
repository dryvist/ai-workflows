# Issue Triage

Analyze issue #${ISSUE_NUMBER} and write a structured triage verdict. Work read-only:
do not apply labels, comment, close issues, or make any other GitHub mutation. A fresh,
deterministic publisher job validates and applies the verdict.

If the issue number is not 0, fetch it with `gh issue view ${ISSUE_NUMBER}`. Otherwise,
identify the issue from the triggering event. Read the title, body, form fields, and
existing labels. Search open issues for likely duplicates.

Choose exactly one label from each group, preserving an existing group selection:

- Type: `type:bug`, `type:feature`, `type:docs`, `type:chore`, `type:ci`, `type:test`,
  `type:refactor`, `type:perf`, or `type:breaking`.
- Size: `size:xs` (<1 hour), `size:s` (1-4 hours), `size:m` (1-2 days), `size:l`
  (3-5 days), or `size:xl` (1+ weeks).
- Priority: `priority:critical`, `priority:high`, `priority:medium`, or `priority:low`.

Also add `duplicate` only for a likely duplicate. Add `ai:ready` only when the type is
bug, docs, chore, ci, test, refactor, or perf; the issue is concrete and self-contained;
and duplicate, invalid, wontfix, and question do not apply. Never use `ai:ready` for a
feature or breaking change.

Write `.issue-triage.json` in the repository root with exactly this shape:

```json
{
  "issue_number": 42,
  "labels": ["type:bug", "size:s", "priority:medium", "ai:ready"],
  "comment": "Concise triage summary explaining the labels and whether ai:ready was applied."
}
```

The comment must be non-empty and under 200 words. Include a duplicate reference when
applicable. Output valid JSON with no additional fields, and do not edit any other file.
