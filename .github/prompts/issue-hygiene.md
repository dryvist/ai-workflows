# Issue Hygiene

Analyze issue hygiene and write a structured verdict. Work read-only: never comment,
label, close, or otherwise mutate GitHub. A fresh deterministic publisher job validates
the verdict and constructs the allowed comments.

Retrieve at most 50 open issues, oldest first. Compare titles and bodies for likely
duplicates. Search merged pull requests that reference issues without closing them.
Identify issues 90+ days old with no linked work and no author comment in 60+ days.
Identify closely related issues that could be combined. Check existing comments and omit
anything already reported by an earlier hygiene run.

Write `.issue-hygiene.json` in the repository root:

```json
{
  "actions": [
    {"kind": "duplicate", "issue_number": 20, "related_issue_number": 10},
    {"kind": "merged_pr", "issue_number": 21, "pr_number": 44, "pr_title": "Fix widget"},
    {"kind": "wontfix", "issue_number": 22, "age_days": 120},
    {"kind": "combine", "issue_number": 23, "related_issue_number": 24}
  ]
}
```

Allowed kinds and fields are exactly those shown. For duplicates, comment only on the
newer issue and reference the older one. `age_days` must be at least 90. Include at most
100 actions, no duplicate actions, no extra fields, and no action for an existing hygiene
comment. Write `{"actions": []}` when there is nothing to report. Do not edit other files.
