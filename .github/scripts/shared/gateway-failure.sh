#!/usr/bin/env bash
# Router, gateway and budget failures are not review findings. A job that hits
# one says so four ways: a job-summary line, an annotation, a check run on the
# head commit with the reason in its output, and an optional ntfy ops alert.
# Advisory callers end neutral. Blocking and required callers end failed.
#
#   gateway-failure.sh classify <file|->      print the reason class, or nothing
#   gateway-failure.sh report <job> <class>   write the four signals; exit 1 when failed
#
# report reads:
#   CONCLUSION        neutral (default, advisory) or failure (blocking or required)
#   GITHUB_TOKEN      Claude bot App installation token with checks: write, minted by
#                     the caller. The callee's own GITHUB_TOKEN is never used for this.
#   CHECK_TOKEN_CAUSE why no token exists (key not set, mint failed); named in the error
#   CHECK_HEAD_SHA    commit the check run attaches to (required)
#   GITHUB_REPOSITORY owner/repo, set by the runner
#   NTFY_BASE_URL     optional: the alert is skipped when unset
#   RUN_URL           optional: appended to the alert body
#
# Exit status: 1 when the check run cannot be created (no token, or a 403 from
# the API), and 1 whenever CONCLUSION is failure. A missing token or grant never
# looks green.
set -euo pipefail

classify() {
  local text
  text="$(cat -- "$1")"
  if grep -Eqi 'Budget has been exceeded' <<< "$text"; then
    echo budget-exceeded
  elif grep -Eqi 'No fallback model group (was )?found' <<< "$text"; then
    echo no-fallback-model
  elif grep -Eqi '(^|[^0-9])429([^0-9]|$)|too many requests|rate.?limit' <<< "$text"; then
    echo rate-limited
  elif grep -Eqi 'ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|connection (error|refused|reset)|socket hang up|fetch failed' <<< "$text"; then
    echo connection
  elif grep -Eqi 'APITimeoutError|Request timed out|litellm\.Timeout' <<< "$text"; then
    echo timeout
  fi
}

create_check() {
  local job="$1" reason="$2" conclusion="$3" body response
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "::error::$job: cannot post the check run: no Claude bot App token (${CHECK_TOKEN_CAUSE:-unknown cause})"
    return 1
  fi
  if [ -z "${CHECK_HEAD_SHA:-}" ] || [ -z "${GITHUB_REPOSITORY:-}" ]; then
    echo "::error::$job: cannot post the check run; CHECK_HEAD_SHA and GITHUB_REPOSITORY must be set"
    return 1
  fi
  body="$(printf '{"name":"%s: AI review not performed","head_sha":"%s","status":"completed","conclusion":"%s","output":{"title":"AI review not performed","summary":"gateway unavailable (%s)"}}' \
    "$job" "$CHECK_HEAD_SHA" "$conclusion" "$reason")"
  if response="$(GH_TOKEN="$GITHUB_TOKEN" gh api --method POST "repos/$GITHUB_REPOSITORY/check-runs" --input - <<< "$body" 2>&1)"; then
    return 0
  fi
  if grep -qiE 'HTTP 403|not accessible by integration' <<< "$response"; then
    echo "::error::$job: the check run was refused with 403. The Claude bot App needs checks: write on this repository and must be installed on it."
  else
    echo "::error::$job: the check run could not be created: $(head -c 300 <<< "$response")"
  fi
  return 1
}

send_alert() {
  local job="$1" line="$2" host
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
  return 0
}

report() {
  local job="$1" reason="$2" line conclusion="${CONCLUSION:-neutral}" check_status=0
  line="AI review not performed: gateway unavailable ($reason)"
  printf '%s\n' "$line" >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
  if [ "$conclusion" = failure ]; then
    echo "::error::$job: $line"
  else
    echo "::warning::$job: $line"
  fi

  create_check "$job" "$reason" "$conclusion" || check_status=$?
  send_alert "$job" "$line"
  if [ "$check_status" -ne 0 ]; then
    return "$check_status"
  fi
  if [ "$conclusion" = failure ]; then
    echo "::error::$job is blocking or required; failing closed on a gateway failure."
    return 1
  fi
  return 0
}

case "${1:-}" in
  classify) classify "${2:--}" ;;
  report) report "${2:?job name is required}" "${3:?reason class is required}" ;;
  *)
    echo "usage: gateway-failure.sh classify <file|-> | report <job> <class>" >&2
    exit 2
    ;;
esac
