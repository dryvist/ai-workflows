## CI Failure Auto-Fix

You are fixing a CI failure. Context: ${REPO_CONTEXT}

### CI Structure
${CI_STRUCTURE}

### Failure Logs
```
${FAILURE_LOGS}
```

### Instructions
1. Analyze the failure logs to identify the root cause
2. Fix the issue in the source files
3. Commit all changed files to the PR branch with message:
   ```
   fix: resolve CI failure (auto-fix attempt ${ATTEMPT_NUM})
   ```

Only fix what the CI is complaining about. Do not refactor or improve unrelated code.
