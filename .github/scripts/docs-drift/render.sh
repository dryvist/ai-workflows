#!/usr/bin/env bash
# Render the drift report - or the skip/unavailable notice - into docs-drift.md.
set -euo pipefail

out=docs-drift.md
response=''

if [ ! -f drift.skip ]; then
  script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
  if ! response=$(python3 "$script_dir/parse-response.py" < "$RESPONSE_FILE"); then
    echo "The model's response has no valid docs-drift JSON object:" >&2
    head -c 300 "$RESPONSE_FILE" >&2
    echo >&2
    exit 1
  fi
fi

{
  echo "## Docs drift"
  echo
  if [ -f drift.skip ]; then
    echo "No drift check run: $(cat drift.skip)."
  elif [ "$(jq '.items | length' <<< "$response")" = "0" ]; then
    printf '%s\n' "$(jq -r '.summary // "The documentation still matches this change."' <<< "$response")"
  else
    printf '%s\n\n' "$(jq -r '.summary // "(no summary)"' <<< "$response")"
    echo "| Doc | Section | What the docs say | Contradicted by | Action |"
    echo "| --- | --- | --- | --- | --- |"
    jq -r '
      def cell: (. // "") | gsub("[|\n]"; " ");
      .items[]? |
      "| \(.doc | cell) | \(.section | cell) | \(.claim | cell) | \(.contradicted_by | cell) | \(.action // "none" | cell) |"
    ' <<< "$response"
  fi
  echo
  echo "_Advisory only, produced by router role \`${MODEL:-?}\` after the merge of \`${COMMIT_SHA:-HEAD}\`. It edits nothing and blocks nothing._"
} > "$out"
cat "$out"
