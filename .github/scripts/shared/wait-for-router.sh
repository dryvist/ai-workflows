#!/usr/bin/env bash
# Block until the router answers, or fail.
#
# Retries only what waiting can fix: a connection failure, or 408/429/5xx. A
# 401, 403 or 404 means the key or the base URL is wrong, so it fails in
# seconds instead of holding a runner for the job's whole timeout.
#
# There is deliberately no succeed-on-outage path. When the router stays down
# the job's timeout-minutes ends the run as a failure: a green check that
# reviewed nothing is worse than a red one.
#
# Env: BASE_URL, API_KEY. Optional: BACKOFF_START (default 5), BACKOFF_MAX (300).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=.github/scripts/shared/mask-router-url.sh
. "$(dirname "$0")/mask-router-url.sh"

if [ -z "${BASE_URL:-}" ]; then
  echo "BASE_URL is empty: the router base URL secret did not reach this job." >&2
  exit 1
fi
if [ -z "${API_KEY:-}" ]; then
  echo "API_KEY is empty: the router key secret did not reach this job." >&2
  exit 1
fi

delay="${BACKOFF_START:-5}"
max="${BACKOFF_MAX:-300}"
while :; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
    -H "Authorization: Bearer $API_KEY" "${BASE_URL%/}/models" || echo 000)"
  case "$code" in
    200)
      echo "Router reachable."
      exit 0
      ;;
    401 | 403 | 404)
      echo "Router refused the request with HTTP $code: the key or the base URL is wrong." >&2
      exit 1
      ;;
    *)
      echo "Router unreachable (HTTP $code); retrying in ${delay}s."
      ;;
  esac
  sleep "$delay"
  delay=$((delay * 2 > max ? max : delay * 2))
done
