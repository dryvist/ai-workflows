#!/usr/bin/env bash
# Bound what the release-notes agent is sent: the commit list and diff stat
# since the last tag, each capped, with a note wherever a cap truncates. Writes
# release-input.md and returns the rendered prompt plus that block as the step
# output `content`, so the agent's input is bounded by construction.
#
# Env: PROMPT (the rendered prompt). Runs in the repository checkout.
set -euo pipefail

commit_cap=100
stat_cap=80

base="$(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD | tail -n 1)"
git log --oneline "$base..HEAD" > commits.txt
git diff --stat "$base..HEAD" > stat.txt

commits_total="$(wc -l < commits.txt)"
stat_total="$(wc -l < stat.txt)"
{
  echo "## Bounded release input (since $base)"
  echo
  echo "Commits:"
  head -n "$commit_cap" commits.txt
  if [ "$commits_total" -gt "$commit_cap" ]; then
    echo "[commit list truncated: showing $commit_cap of $commits_total commits]"
  fi
  echo
  echo "Diff stat:"
  head -n "$stat_cap" stat.txt
  if [ "$stat_total" -gt "$stat_cap" ]; then
    echo "[diff stat truncated: showing $stat_cap of $stat_total lines]"
  fi
} > release-input.md

delimiter="BOUND_$(openssl rand -hex 8)"
{
  echo "content<<${delimiter}"
  printf '%s\n\n' "$PROMPT"
  cat release-input.md
  echo "${delimiter}"
} >> "$GITHUB_OUTPUT"
