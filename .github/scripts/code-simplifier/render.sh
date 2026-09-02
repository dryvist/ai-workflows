#!/usr/bin/env bash
# Render the findings - or the unavailable notice - into .code-simplifier.md.
set -euo pipefail

out=.code-simplifier.md
{
  echo "## Code simplifier"
  echo
  if [ -f simplify.error ]; then
    echo "simplifier unavailable: $(cat simplify.error)"
    echo
    echo "_Advisory only - this does not block the pull request._"
  else
    printf '%s\n\n' "$(jq -r '.summary // "(no summary)"' simplify.json)"
    if [ "$(jq -r '.findings | length' simplify.json)" -eq 0 ]; then
      echo "No simplification findings."
    else
      echo "| File | Line | Kind | Evidence | Suggestion |"
      echo "| --- | --- | --- | --- | --- |"
      jq -r '.findings[]? |
        "| \(.file // "?") | \(.line // "") | \(.kind // "simplify") | \((.evidence // "") | gsub("[|\n]"; " ")) | \((.suggestion // "") | gsub("[|\n]"; " ")) |"' \
        simplify.json
    fi
    echo
    echo "_Advisory only, produced by router role \`${MODEL:-?}\` - no commits were pushed._"
  fi
} > "$out"
cat "$out"
