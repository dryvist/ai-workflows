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
2. Fix the issue in the source files using your file-editing tools (Edit, Write,
   MultiEdit). Apply the change directly in the files. Avoid shell commands that
   modify files (e.g. formatters): reproduce the intended result by editing the
   files yourself.
3. Do not run git or attempt to commit — your file edits are committed to the PR
   branch automatically after you finish.

Only fix what the CI is complaining about. Do not refactor or improve unrelated code.
