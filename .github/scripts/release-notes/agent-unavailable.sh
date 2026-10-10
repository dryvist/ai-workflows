#!/usr/bin/env bash
# Decide whether the release-highlights agent step ended the job neutrally.
#
#   agent succeeded, gateway_class set:  neutral; the action already reported
#   agent failed, elapsed >= DEADLINE:   neutral with deadline-exceeded (reported here)
#   agent failed, elapsed <  DEADLINE:   fail (any other error, or the action's own report failed)
#   agent succeeded, no gateway_class:   publish
#
# A neutral outcome sets the step output `neutral=true` so publish is skipped.
# The action writes the summary, annotation, check run and ops alert for a
# gateway failure, so this script does not repeat them for that case.
#
# Env: AGENT_OUTCOME GATEWAY_CLASS STARTED DEADLINE_SECONDS JOB_NAME
#      CONCLUSION (neutral) GITHUB_TOKEN CHECK_HEAD_SHA NTFY_BASE_URL RUN_URL
set -euo pipefail

if [ "$AGENT_OUTCOME" = "success" ]; then
  if [ -n "${GATEWAY_CLASS:-}" ]; then
    echo "neutral=true" >> "$GITHUB_OUTPUT"
  fi
  exit 0
fi

if [ $(( $(date +%s) - STARTED )) -lt "${DEADLINE_SECONDS:-360}" ]; then
  echo "::error::Release highlights agent failed for a reason other than the router, a budget or the deadline."
  exit 1
fi

bash "$(dirname "$0")/../shared/gateway-failure.sh" report "$JOB_NAME" deadline-exceeded
echo "neutral=true" >> "$GITHUB_OUTPUT"
