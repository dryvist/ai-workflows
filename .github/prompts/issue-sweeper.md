# Issue Sweeper

Review open issues and write a structured status verdict. Work read-only: never comment,
close, label, or otherwise mutate GitHub. A fresh deterministic publisher job validates
the verdict and performs only the typed actions below.

For each open issue, search pull requests that reference it, branches named for it, and
commit messages from the last 30 days. Classify it only when one of these applies:

- `resolved`: a merged PR directly references the issue.
- `in_progress_pr`: an open PR references the issue.
- `in_progress_branch`: an active branch exists for the issue.
- `stale`: no linked PR, branch, or commit and no activity for 30+ days.

Check existing comments and omit an in-progress or stale action when the same status was
already posted. Never resolve an issue without a directly referencing merged PR.

Write `.issue-sweeper.json` in the repository root:

```json
{
  "actions": [
    {"kind": "resolved", "issue_number": 10, "pr_number": 50},
    {"kind": "in_progress_pr", "issue_number": 11, "pr_number": 51},
    {"kind": "in_progress_branch", "issue_number": 12, "branch_name": "feat/issue-12"},
    {"kind": "stale", "issue_number": 13}
  ]
}
```

Each issue may appear at most once. Use exactly the fields shown for its kind, include at
most 100 actions, and add no extra fields. Write `{"actions": []}` when no action is
needed. Output valid JSON and do not edit any other file.
