#!/usr/bin/env bash
# Post the digest to Slack. Skips quietly when no webhook is configured.
set -euo pipefail

if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
  echo "No Slack webhook configured - skipping the post."
  exit 0
fi

# Slack rejects very large payloads; the artifact and job summary hold the full text.
body="$(head -c 3500 "${OUT_FILE:-repo-hygiene-digest.md}")"

payload="$(printf '%s' "$body" | jq -Rs --arg url "${RUN_URL:-}" \
  '{text: ("*Repository hygiene digest*\n" + . + "\n<" + $url + "|full run log>")}')"

code="$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' \
  -H 'Content-Type: application/json' --data "$payload" "$SLACK_WEBHOOK_URL" || echo 000)"

if [ "$code" != "200" ]; then
  echo "::warning::Slack post returned HTTP $code"
fi
