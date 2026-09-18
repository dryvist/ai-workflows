#!/usr/bin/env bash
# Render the review into commit-review.md, the body of the commit comment.
set -euo pipefail

out=commit-review.md
{
  echo "<!-- commit-review -->"
  echo "## AI commit review"
  echo
  cat review.txt
  echo
  echo "_Advisory only, produced by router role \`${MODEL:-?}\` for \`${COMMIT_SHA:-HEAD}\` on \`${REF_NAME:-?}\` ([run](${RUN_URL:-#})). It edits nothing and blocks nothing._"
} > "$out"
cat "$out"
