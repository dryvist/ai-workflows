#!/usr/bin/env bash
# Collect the PR diff (truncated) and the repo's review checklist.
# Writes: diff.txt, checklist.txt
set -euo pipefail

: "${PR_NUMBER:?PR_NUMBER is required}"
max_kb="${MAX_DIFF_KB:-200}"
checklist_path="${CHECKLIST_PATH:-.github/ai-review/checklist.md}"

gh pr diff "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" > diff.full.txt
head -c "$((max_kb * 1024))" diff.full.txt > diff.txt
if [ "$(wc -c < diff.full.txt)" -gt "$((max_kb * 1024))" ]; then
  printf '\n[diff truncated at %s KiB]\n' "$max_kb" >> diff.txt
fi
rm -f diff.full.txt

if [ -f "$checklist_path" ]; then
  cp "$checklist_path" checklist.txt
  echo "Using checklist $checklist_path"
else
  echo "No checklist at $checklist_path - using the generic default."
  cat > checklist.txt <<'DEFAULT'
- id: secrets
  Does the diff add a credential, token, password, or private hostname/address literal?
- id: correctness
  Does any changed logic look wrong, unreachable, or inverted?
- id: error-handling
  Are new failure paths handled, or silently swallowed?
- id: tests
  Does changed behaviour come with a test, or an updated one?
- id: docs
  Does changed behaviour come with the documentation update it needs?
DEFAULT
fi
