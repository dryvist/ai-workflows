# CI Failure Auto-Fix

You are fixing a CI failure. Context: ${REPO_CONTEXT}

## CI Structure

${CI_STRUCTURE}

## Failure Logs

```text
${FAILURE_LOGS}
```

## Instructions

1. Analyze the failure logs to identify the root cause
2. Fix the issue in the source files (use your edit tools or shell tools such as
   formatters as appropriate)

Do NOT run `git add`, `git commit`, or `git push` — the workflow commits and
pushes your working-tree changes automatically after you finish. Only fix what
the CI is complaining about; do not refactor or improve unrelated code.
