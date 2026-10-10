#!/usr/bin/env bash
# Decide whether the release-highlights agent step ended the job neutrally.
#
#   gateway, budget or 429 failure (the action reported gateway_class): neutral
#   the agent step hit its deadline (elapsed >= DEADLINE_SECONDS):          neutral
#   the step failed for any other reason:                                   fail
#   otherwise:                                                              publish
#
# A neutral outcome writes the job-summary line, a warning and an ops alert,
# and sets the step output `neutral=true` so publish is skipped. Nothing is
# published in that case.
#
# Env: AGENT_OUTCOME GATEWAY_CLASS STARTED DEADLINE_SECONDS JOB_NAME
#      NTFY_BASE_URL (optional) RUN_URL (optional)
set -euo pipefail

reason=""
if [ -n "${GATEWAY_CLASS:-}" ]; then
  reason="$GATEWAY_CLASS"
elif [ "$AGENT_OUTCOME" != "success" ]; then
  if [ $(( $(date +%s) - STARTED )) -ge "${DEADLINE_SECONDS:-360}" ]; then
    reason=deadline-exceeded
  else
    echo "::error::Release highlights agent failed for a reason other than the router, a budget or the deadline."
    exit 1
  fi
fi

if [ -z "$reason" ]; then
  exit 0
fi

bash "$(dirname "$0")/../shared/gateway-failure.sh" report "$JOB_NAME" "$reason"
echo "neutral=true" >> "$GITHUB_OUTPUT"
