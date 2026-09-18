#!/usr/bin/env bash
# Collect the diff a push introduced. Writes: diff.txt, changed.txt, log.txt
#
# The push's own base is preferred (BEFORE_SHA, the commit the branch pointed
# at before the push) so a multi-commit push is reviewed as one change. A new
# branch or a force-push has no usable base — GitHub sends all zeros, or a
# commit the shallow checkout no longer holds — and then the head commit alone
# is reviewed against its parent. A root commit is diffed against the empty
# tree.
set -euo pipefail

max_diff_kb="${MAX_DIFF_KB:-150}"
before="${BEFORE_SHA:-}"
zeros="0000000000000000000000000000000000000000"

if [ -n "$before" ] && [ "$before" != "$zeros" ] && git cat-file -e "$before^{commit}" 2> /dev/null \
  && git merge-base --is-ancestor "$before" HEAD 2> /dev/null; then
  base="$before"
elif git rev-parse --verify -q HEAD~1 > /dev/null; then
  base="HEAD~1"
else
  base=""
fi

if [ -n "$base" ]; then
  git diff "$base"..HEAD > diff.full.txt
  git diff --name-only "$base"..HEAD > changed.txt
  git log --format='%h %s' "$base"..HEAD > log.txt
else
  git show --format= HEAD > diff.full.txt
  git show --name-only --format= HEAD > changed.txt
  git log --format='%h %s' -1 > log.txt
fi

head -c "$((max_diff_kb * 1024))" diff.full.txt > diff.txt
if [ "$(wc -c < diff.full.txt)" -gt "$((max_diff_kb * 1024))" ]; then
  printf '\n[diff truncated at %s KiB]\n' "$max_diff_kb" >> diff.txt
fi
rm -f diff.full.txt

echo "base: ${base:-<root>}, commits: $(wc -l < log.txt), changed files: $(wc -l < changed.txt), diff bytes: $(wc -c < diff.txt)"
if [ ! -s diff.txt ]; then
  echo "empty diff (merge with no changes, or a push of already-reviewed commits)" > review.skip
fi
