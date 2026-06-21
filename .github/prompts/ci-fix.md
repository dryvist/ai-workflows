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
   MultiEdit) — changes made this way are committed and signed automatically.
   Avoid shell commands that modify files (e.g. formatters): those changes are
   not captured. To apply a formatter result, edit the files to match.
3. Commit all changed files to the PR branch with message:

   ```text
   fix: resolve CI failure (auto-fix attempt ${ATTEMPT_NUM})
   ```

Only fix what the CI is complaining about. Do not refactor or improve unrelated code.
