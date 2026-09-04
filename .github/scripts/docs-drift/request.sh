#!/usr/bin/env bash
# Ask the router which documented behaviours the merged change contradicts or
# leaves undocumented. Never fails the job: a router or model problem writes
# drift.error, which render.sh turns into an "unavailable" note.
set -euo pipefail

rm -f drift.json drift.error

if [ -f drift.skip ]; then
  echo "Nothing to ask about: $(cat drift.skip)"
  exit 0
fi

if [ -z "${BASE_URL:-}" ] || [ -z "${API_KEY:-}" ]; then
  echo "router credential not configured" > drift.error
  echo "No router base URL or API key - skipping the model call."
  exit 0
fi

system='You detect documentation drift. Given a merged code diff and the documentation that mentions it, list only documented claims the diff CONTRADICTS, and behaviour the diff adds that the documentation does not mention. Do not review the code, do not suggest edits to code, do not restate the diff. Answer ONLY JSON: {"items":[{"doc":"path","section":"heading or line","claim":"what the docs say or omit","contradicted_by":"what in the diff makes it wrong","action":"update|add|none"}],"summary":"..."}. Omit anything you cannot cite from both inputs. An empty items array is the correct answer when the documentation still matches.'

jq -n \
  --arg model "${MODEL:?MODEL is required}" \
  --arg system "$system" \
  --arg changed "$(cat changed.txt)" \
  --arg diff "$(cat diff.txt)" \
  --arg docs "$(cat docs.txt)" \
  --argjson max_tokens "${MAX_TOKENS:-1500}" \
  '{
     model: $model,
     temperature: 0,
     max_tokens: $max_tokens,
     response_format: {type: "json_object"},
     messages: [
       {role: "system", content: $system},
       {role: "user", content: ("CHANGED FILES:\n" + $changed + "\n\nDIFF:\n" + $diff + "\n\nDOCUMENTATION:\n" + $docs)}
     ]
   }' > request.json

call() {
  curl -sS --max-time 240 -o response.json -w '%{http_code}' \
    "${BASE_URL%/}/chat/completions" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "x-litellm-tags: docs-drift,repo=${REPO:-unknown}" \
    -H 'x-langfuse-trace-name: docs-drift' \
    --data @request.json || echo 000
}

code="$(call)"

# Some backends reject response_format; retry once without it rather than
# reporting the check unavailable.
if [ "$code" != "200" ] && grep -qi 'response_format' response.json 2>/dev/null; then
  echo "Retrying without response_format (the backend rejected it)."
  jq 'del(.response_format)' request.json > request.noformat.json
  mv request.noformat.json request.json
  code="$(call)"
fi

if [ "$code" != "200" ]; then
  echo "router returned HTTP $code" > drift.error
  echo "Router call failed with HTTP $code."
  exit 0
fi

content="$(jq -r '.choices[0].message.content // ""' response.json)"
# Models sometimes wrap JSON in a fenced block; strip the fences before parsing.
cleaned="$(printf '%s' "$content" | sed -e 's/^```[a-zA-Z]*$//' -e 's/^```$//')"
if printf '%s' "$cleaned" | jq -e 'has("items")' > /dev/null 2>&1; then
  printf '%s' "$cleaned" > drift.json
else
  echo "model returned unparseable output" > drift.error
fi
