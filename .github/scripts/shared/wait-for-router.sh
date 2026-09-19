#!/usr/bin/env bash
# Block until the endpoint answers, or fail within a bounded wait.
#
# Retries only what waiting can fix: a connection failure, or 408/429/5xx. A
# 401, 403 or 404 means the key or the base URL is wrong, so it fails in
# seconds instead of holding a runner.
#
# The wait is bounded (WAIT_MAX, default 180 s). An endpoint that stays down
# past that fails the job right there: a runner slot held for the job's whole
# timeout starves every other job in the pool, and the required check reports
# the outage just as honestly after three minutes as after sixty. There is
# deliberately no succeed-on-outage path — a green check that reviewed nothing
# is worse than a red one; a push or a close/reopen re-fires the review once
# the endpoint is back.
#
# Env: BASE_URL, API_KEY. Optional: BACKOFF_START (default 5), BACKOFF_MAX
# (300), WAIT_MAX (180) — all in seconds.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=.github/scripts/shared/mask-router-url.sh
. "$(dirname "$0")/mask-router-url.sh"

if [ -z "${BASE_URL:-}" ]; then
  echo "BASE_URL is empty: the endpoint base URL secret did not reach this job." >&2
  exit 1
fi
if [ -z "${API_KEY:-}" ]; then
  echo "API_KEY is empty: the endpoint key secret did not reach this job." >&2
  exit 1
fi

delay="${BACKOFF_START:-5}"
max="${BACKOFF_MAX:-300}"
wait_max="${WAIT_MAX:-180}"
started=$(date +%s)
while :; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
    -H "Authorization: Bearer $API_KEY" "${BASE_URL%/}/models" || echo 000)"
  case "$code" in
    200)
      echo "Endpoint reachable."
      exit 0
      ;;
    401 | 403 | 404)
      echo "Endpoint refused the request with HTTP $code: the key or the base URL is wrong." >&2
      exit 1
      ;;
  esac
  elapsed=$(( $(date +%s) - started ))
  remaining=$(( wait_max - elapsed ))
  if [ "$remaining" -le 0 ]; then
    echo "Endpoint unreachable (HTTP $code) for ${elapsed}s, past the ${wait_max}s bound: failing so the runner is released. Re-run once the endpoint is back." >&2
    exit 1
  fi
  [ "$delay" -gt "$remaining" ] && delay=$remaining
  echo "Endpoint unreachable (HTTP $code); retrying in ${delay}s (${remaining}s left)."
  sleep "$delay"
  delay=$((delay * 2 > max ? max : delay * 2))
done
