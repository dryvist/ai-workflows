#!/usr/bin/env bash
# Collect the PR diff (truncated) and the list of changed files.
# Writes: diff.txt, files.txt
set -euo pipefail

: "${PR_NUMBER:?PR_NUMBER is required}"
max_kb="${MAX_DIFF_KB:-200}"

gh pr diff "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" > diff.full.txt
head -c "$((max_kb * 1024))" diff.full.txt > diff.txt
if [ "$(wc -c < diff.full.txt)" -gt "$((max_kb * 1024))" ]; then
  printf '\n[diff truncated at %s KiB]\n' "$max_kb" >> diff.txt
fi
rm -f diff.full.txt

gh pr view "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" \
  --json files --jq '.files[].path' > files.txt

printf 'Collected %s changed files.\n' "$(wc -l < files.txt)"
