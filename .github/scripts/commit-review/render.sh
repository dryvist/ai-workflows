#!/usr/bin/env bash
# Render the review into commit-review.md, the body of the commit comment.
set -euo pipefail

out=commit-review.md
# request.json carries the rung that answered once the ladder moved past MODEL.
model="$(jq -r '.model // empty' request.json 2> /dev/null || true)"
model="${model:-${MODEL:-?}}"
{
  echo "<!-- commit-review -->"
  echo "## AI commit review"
  echo
  cat review.txt
  echo
  echo "_Advisory only, produced by router role \`${model}\` for \`${COMMIT_SHA:-HEAD}\` on \`${REF_NAME:-?}\` ([run](${RUN_URL:-#})). It edits nothing and blocks nothing._"
} > "$out"
cat "$out"
