#!/usr/bin/env bash
# Collect a pull request's diff plus a per-file size table, for the fixed
# five-check rubric in policy-gate.prompt.yml. Writes: diff.txt, changed.txt, sizes.txt
#
# Unlike docs-drift's collect.sh (which diffs one merged commit against its
# parent), a PR can carry many commits, so the base is passed explicitly.
set -euo pipefail

: "${BASE_SHA:?BASE_SHA is required}"
: "${HEAD_SHA:?HEAD_SHA is required}"
max_diff_kb="${MAX_DIFF_KB:-150}"

git diff --name-only "$BASE_SHA...$HEAD_SHA" > changed.txt

git diff "$BASE_SHA...$HEAD_SHA" > diff.full.txt
head -c "$((max_diff_kb * 1024))" diff.full.txt > diff.txt
if [ "$(wc -c < diff.full.txt)" -gt "$((max_diff_kb * 1024))" ]; then
  printf '\n[diff truncated at %s KiB]\n' "$max_diff_kb" >> diff.txt
fi
rm -f diff.full.txt

# Per-changed-file line count: cheap context for the token-budget finding.
# The authoritative gate is `ci / Token Limits / Check` (tiktoken-counted
# elsewhere); this is advisory pattern-matching, not a second enforcement.
: > sizes.txt
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$f" ] || continue
  printf '%s: %s lines\n' "$f" "$(wc -l < "$f")" >> sizes.txt
done < changed.txt

echo "changed files: $(wc -l < changed.txt)"
