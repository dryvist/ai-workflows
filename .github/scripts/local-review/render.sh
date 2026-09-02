#!/usr/bin/env bash
# Render the review - or the unavailable notice - into .local-review.md.
set -euo pipefail

out=.local-review.md
{
  echo "## Local review"
  echo
  if [ -f review.error ]; then
    echo "review unavailable: $(cat review.error)"
    echo
    echo "_Advisory only - this does not block the pull request._"
  else
    printf '%s\n\n' "$(jq -r '.summary // "(no summary)"' review.json)"
    echo "| Item | Verdict | Evidence |"
    echo "| --- | --- | --- |"
    jq -r '.items[]? | "| \(.id // "?") | \(.verdict // "unclear") | \((.evidence // "") | gsub("[|\n]"; " ")) |"' review.json
    echo
    echo "_Advisory only, produced by router role \`${MODEL:-?}\` - not a merge gate._"
  fi
} > "$out"
cat "$out"
