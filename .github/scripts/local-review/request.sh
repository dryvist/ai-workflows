#!/usr/bin/env bash
# Ask the router for a review. Never fails the job on a model or router problem:
# it writes review.error with a reason instead, which render.sh turns into an
# "unavailable" comment.
set -euo pipefail

rm -f review.json review.error

if [ -z "${BASE_URL:-}" ] || [ -z "${API_KEY:-}" ]; then
  echo "router credential not configured" > review.error
  echo "No router base URL or API key - skipping the model call."
  exit 0
fi

system='You are a strict code reviewer. Answer ONLY JSON: {"items":[{"id":"...","verdict":"pass|fail|unclear","evidence":"..."}],"summary":"..."}. One item per checklist entry, with evidence citing the diff.'

jq -n \
  --arg model "${MODEL:?MODEL is required}" \
  --arg system "$system" \
  --arg checklist "$(cat checklist.txt)" \
  --arg diff "$(cat diff.txt)" \
  --argjson max_tokens "${MAX_TOKENS:-1500}" \
  '{
     model: $model,
     temperature: 0,
     max_tokens: $max_tokens,
     response_format: {type: "json_object"},
     messages: [
       {role: "system", content: $system},
       {role: "user", content: ("CHECKLIST:\n" + $checklist + "\n\nDIFF:\n" + $diff)}
     ]
   }' > request.json

call() {
  curl -sS --max-time 240 -o response.json -w '%{http_code}' \
    "${BASE_URL%/}/chat/completions" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "x-litellm-tags: local-review,repo=${REPO:-unknown}" \
    -H 'x-langfuse-trace-name: local-review' \
    --data @request.json || echo 000
}

code="$(call)"

# Some backends reject response_format; retry once without it rather than
# reporting the review unavailable.
if [ "$code" != "200" ] && grep -qi 'response_format' response.json 2>/dev/null; then
  echo "Retrying without response_format (the backend rejected it)."
  jq 'del(.response_format)' request.json > request.noformat.json
  mv request.noformat.json request.json
  code="$(call)"
fi

if [ "$code" != "200" ]; then
  echo "router returned HTTP $code" > review.error
  echo "Router call failed with HTTP $code."
  exit 0
fi

content="$(jq -r '.choices[0].message.content // ""' response.json)"
# Models sometimes wrap JSON in a fenced block; strip the fences before parsing.
cleaned="$(printf '%s' "$content" | sed -e 's/^```[a-zA-Z]*$//' -e 's/^```$//')"
if printf '%s' "$cleaned" | jq -e 'has("items")' > /dev/null 2>&1; then
  printf '%s' "$cleaned" > review.json
else
  echo "model returned unparseable output" > review.error
fi
