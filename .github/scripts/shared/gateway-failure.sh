#!/usr/bin/env bash
# Router, gateway and budget failures are not review findings. An advisory AI
# job that hits one does not fail: it writes one job-summary line, emits a
# warning, and sends one ops alert through the ntfy hub. Every other failure
# still fails the job.
#
#   gateway-failure.sh classify <file|->      print the reason class, or nothing
#   gateway-failure.sh report <job> <class>   summary line, ::warning::, ntfy alert
#
# report reads NTFY_BASE_URL (optional: the alert is skipped when unset) and
# RUN_URL (optional: appended to the alert body).
set -euo pipefail

classify() {
  local text
  text="$(cat -- "$1")"
  if grep -Eqi 'Budget has been exceeded' <<< "$text"; then
    echo budget-exceeded
  elif grep -Eqi 'No fallback model group found' <<< "$text"; then
    echo no-fallback-model
  elif grep -Eqi '(^|[^0-9])429([^0-9]|$)|too many requests|rate.?limit' <<< "$text"; then
    echo rate-limited
  elif grep -Eqi 'ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|connection (error|refused|reset)|socket hang up|fetch failed' <<< "$text"; then
    echo connection
  fi
}

report() {
  local job="$1" reason="$2" line host
  line="AI review not performed: gateway unavailable ($reason)"
  printf '%s\n' "$line" >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
  echo "::warning::$job: $line"

  if [ -z "${NTFY_BASE_URL:-}" ]; then
    echo "NTFY_BASE_URL not configured; skipping the ops alert."
    return 0
  fi
  echo "::add-mask::$NTFY_BASE_URL"
  host="${NTFY_BASE_URL#*://}"
  host="${host%%/*}"
  if [ -n "$host" ]; then
    echo "::add-mask::$host"
    echo "::add-mask::${host%%:*}"
  fi
  curl -sS --max-time 30 -X POST "${NTFY_BASE_URL%/}/ai" \
    -H "Title: $job: AI review not performed" \
    --data "$line${RUN_URL:+ $RUN_URL}" \
    || echo "::warning::ops alert not delivered"
}

case "${1:-}" in
  classify) classify "${2:--}" ;;
  report) report "${2:?job name is required}" "${3:?reason class is required}" ;;
  *)
    echo "usage: gateway-failure.sh classify <file|-> | report <job> <class>" >&2
    exit 2
    ;;
esac
