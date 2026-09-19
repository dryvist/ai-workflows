#!/usr/bin/env bash
# Probe the endpoint a few times inside a 15-second budget, or fail.
#
# Retries only what a moment can fix: a connection failure, or 408/429/5xx. A
# 401, 403 or 404 means the key or the base URL is wrong, so it fails at once.
#
# CI never waits for a model that is down or at capacity: three probes five
# seconds apart (WAIT_MAX 15, BACKOFF_START 5, no growth) and then the job
# fails, releasing the runner. The endpoint's own fallback ladder is what
# absorbs load — the router's role aliases on a private repo, the external
# provider on a public one — not a runner sitting in a loop. There is
# deliberately no succeed-on-outage path — a green check that reviewed nothing
# is worse than a red one; a push or a close/reopen re-fires the review once
# the endpoint is back.
#
# Env: BASE_URL, API_KEY. Optional: BACKOFF_START (default 5), BACKOFF_MAX
# (5), WAIT_MAX (15) — all in seconds.
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
max="${BACKOFF_MAX:-5}"
wait_max="${WAIT_MAX:-15}"
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
    echo "Endpoint unreachable (HTTP $code) for ${elapsed}s, past the ${wait_max}s budget: failing so the runner is released. Re-run once the endpoint is back." >&2
    exit 1
  fi
  [ "$delay" -gt "$remaining" ] && delay=$remaining
  echo "Endpoint unreachable (HTTP $code); retrying in ${delay}s (${remaining}s left)."
  sleep "$delay"
  delay=$((delay * 2 > max ? max : delay * 2))
done
