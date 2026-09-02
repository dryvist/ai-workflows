#!/usr/bin/env bash
# Render the drift report - or the skip/unavailable notice - into docs-drift.md.
set -euo pipefail

out=docs-drift.md
{
  echo "## Docs drift"
  echo
  if [ -f drift.skip ]; then
    echo "No drift check run: $(cat drift.skip)."
  elif [ -f drift.error ]; then
    echo "Drift check unavailable: $(cat drift.error)."
  elif [ "$(jq '.items | length' drift.json)" = "0" ]; then
    printf '%s\n' "$(jq -r '.summary // "The documentation still matches this change."' drift.json)"
  else
    printf '%s\n\n' "$(jq -r '.summary // "(no summary)"' drift.json)"
    echo "| Doc | Section | What the docs say | Contradicted by | Action |"
    echo "| --- | --- | --- | --- | --- |"
    jq -r '
      def cell: (. // "") | gsub("[|\n]"; " ");
      .items[]? |
      "| \(.doc | cell) | \(.section | cell) | \(.claim | cell) | \(.contradicted_by | cell) | \(.action // "none" | cell) |"
    ' drift.json
  fi
  echo
  echo "_Advisory only, produced by router role \`${MODEL:-?}\` after the merge of \`${COMMIT_SHA:-HEAD}\`. It edits nothing and blocks nothing._"
} > "$out"
cat "$out"
