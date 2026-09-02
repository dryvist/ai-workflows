#!/usr/bin/env bash
# Ask the router for a five-line natural-language summary of the computed facts.
# Never fails the job: a missing credential or a router error writes
# summary.error and the digest is posted with facts only.
set -euo pipefail

rm -f summary.txt summary.error

if [ -z "${BASE_URL:-}" ] || [ -z "${API_KEY:-}" ]; then
  echo "router credential not configured" > summary.error
  echo "No router base URL or API key - posting facts only."
  exit 0
fi

system='You summarise repository hygiene facts. Answer with at most five short lines of plain prose, no markdown headings, no lists, no invented facts. Only describe what the JSON contains.'

jq -n \
  --arg model "${MODEL:?MODEL is required}" \
  --arg system "$system" \
  --arg facts "$(cat digest.json)" \
  --argjson max_tokens "${MAX_TOKENS:-400}" \
  '{
     model: $model,
     temperature: 0,
     max_tokens: $max_tokens,
     messages: [
       {role: "system", content: $system},
       {role: "user", content: ("FACTS:\n" + $facts)}
     ]
   }' > summary-request.json

code="$(curl -sS --max-time 180 -o summary-response.json -w '%{http_code}' \
  "${BASE_URL%/}/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "x-litellm-tags: repo-hygiene-digest,repo=${REPO:-unknown}" \
  -H 'x-langfuse-trace-name: repo-hygiene-digest' \
  --data @summary-request.json || echo 000)"

if [ "$code" != "200" ]; then
  echo "router returned HTTP $code" > summary.error
  echo "Router call failed with HTTP $code."
  exit 0
fi

content="$(jq -r '.choices[0].message.content // ""' summary-response.json)"
if [ -n "$content" ]; then
  printf '%s\n' "$content" | head -n 5 > summary.txt
else
  echo "model returned no content" > summary.error
fi
