#!/usr/bin/env bash
# Render the rubric verdict - or the override notice - into policy-gate.md,
# and decide the job's exit code in policy-gate.exit ("0" or "1").
#
# "1" means at least one check failed; the workflow only turns that into a
# non-zero job exit when POLICY_GATE_BLOCKING is true and no override label
# is present — both decided by the caller, not this script.
set -euo pipefail

out=policy-gate.md
exit_file=policy-gate.exit
echo 0 > "$exit_file"

if [ -f override.flag ]; then
  {
    echo "## Policy gate"
    echo
    echo "Skipped: the \`policy-gate-override\` label is set on this pull request."
    echo "An audit line was published to the ntfy hub."
  } > "$out"
  cat "$out"
  exit 0
fi

# The router returned something, but not a JSON object (a truncated
# completion, a plain-text refusal, ...). This is advisory by contract — it
# reports "unable to score" and exits 0, it never crashes the job over a
# malformed response.
if ! jq -e 'type == "object"' "$RESPONSE_FILE" > /dev/null 2>&1; then
  {
    echo "## Policy gate"
    echo
    echo "Unable to score: the router response was not a JSON object."
    echo
    echo "_Advisory only for the first two weeks. Router role \`${MODEL:-?}\`._"
  } > "$out"
  cat "$out"
  exit 0
fi

{
  echo "## Policy gate"
  echo
  printf '%s\n\n' "$(jq -r '.summary // "(no summary)"' "$RESPONSE_FILE")"
  echo "| Check | Result | File | Line | Detail |"
  echo "| --- | --- | --- | --- | --- |"
  jq -r '
    def cell: (. // "") | tostring | gsub("[|\n]"; " ");
    .findings[]? |
    "| \(.check | cell) | \(.result | cell) | \(.file | cell) | \(.line | cell) | \(.detail | cell) |"
  ' "$RESPONSE_FILE"
  echo
  echo "_Advisory only for the first two weeks. Router role \`${MODEL:-?}\`._"
} > "$out"
cat "$out"

if jq -e '.findings[]? | select(.result == "fail")' "$RESPONSE_FILE" > /dev/null 2>&1; then
  echo 1 > "$exit_file"
fi
