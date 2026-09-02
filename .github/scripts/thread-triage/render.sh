#!/usr/bin/env bash
# Render the triage table - or the unavailable notice - into .thread-triage.md.
set -euo pipefail

out=.thread-triage.md
{
  echo "## Review thread triage"
  echo
  if [ -f triage.empty ]; then
    echo "No unresolved review threads."
  elif [ -f triage.error ]; then
    echo "triage unavailable: $(cat triage.error)"
    echo
    echo "_Advisory only - this does not block the pull request._"
  else
    echo "| Thread | File | Verdict | Reason |"
    echo "| --- | --- | --- | --- |"
    # Join the model's verdicts onto the collected threads, so a thread the
    # model skipped still shows up (as unclassified) rather than vanishing.
    jq -r --slurpfile triage triage.json '
      ($triage[0].threads // []) as $v
      | .[]
      | . as $t
      | (($v[] | select(.id == $t.key)) // {}) as $m
      | [
          $t.key,
          (($t.path + (if $t.line then ":" + ($t.line | tostring) else "" end))
            | gsub("[|\n]"; " ")),
          ($m.verdict // "unclassified"),
          (($m.reason // "the model returned no verdict for this thread")
            | gsub("[|\n]"; " "))
        ]
      | "| " + join(" | ") + " |"
    ' threads.json
    echo
    echo "_Advisory only, produced by router role \`${MODEL:-?}\` - no thread was"
    echo "resolved or replied to._"
  fi
} > "$out"
cat "$out"
