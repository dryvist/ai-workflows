#!/usr/bin/env bash
# Ask the router for simplification findings. Never fails the job on a model or
# router problem: it writes simplify.error with a reason instead, which
# render.sh turns into an "unavailable" comment.
set -euo pipefail

rm -f simplify.json simplify.error

if [ -z "${BASE_URL:-}" ] || [ -z "${API_KEY:-}" ]; then
  echo "router credential not configured" > simplify.error
  echo "No router base URL or API key - skipping the model call."
  exit 0
fi

system='You review a pull request diff for SIMPLIFICATION ONLY. Do not hunt for bugs.
Look for: code that duplicates something already in the diff or the file list (reuse),
repeated blocks that should be one (dedupe), code nothing reaches (dead-code),
and logic that a shorter equivalent expresses (simplify).
Rules:
- Answer ONLY JSON. No prose, no code fences.
- Schema: {"findings":[{"file":"...","line":0,"kind":"reuse|dedupe|dead-code|simplify","evidence":"...","suggestion":"..."}],"summary":"..."}
- "file" must be one of the changed files. "line" is a number from the diff.
- "evidence" quotes the diff. "suggestion" is one sentence.
- Zero findings is a valid and common answer: {"findings":[],"summary":"nothing to simplify"}.
- Never invent a file or a line you did not see.
STOP after the JSON object.'

jq -n \
  --arg model "${MODEL:?MODEL is required}" \
  --arg system "$system" \
  --arg files "$(cat files.txt)" \
  --arg diff "$(cat diff.txt)" \
  --argjson max_tokens "${MAX_TOKENS:-1500}" \
  '{
     model: $model,
     temperature: 0,
     max_tokens: $max_tokens,
     response_format: {type: "json_object"},
     messages: [
       {role: "system", content: $system},
       {role: "user", content: ("CHANGED FILES:\n" + $files + "\n\nDIFF:\n" + $diff)}
     ]
   }' > request.json

call() {
  curl -sS --max-time 240 -o response.json -w '%{http_code}' \
    "${BASE_URL%/}/chat/completions" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "x-litellm-tags: code-simplifier,repo=${REPO:-unknown}" \
    -H 'x-langfuse-trace-name: code-simplifier' \
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
  echo "router returned HTTP $code" > simplify.error
  echo "Router call failed with HTTP $code."
  exit 0
fi

content="$(jq -r '.choices[0].message.content // ""' response.json)"
# Models sometimes wrap JSON in a fenced block; strip the fences before parsing.
cleaned="$(printf '%s' "$content" | sed -e 's/^```[a-zA-Z]*$//' -e 's/^```$//')"
if printf '%s' "$cleaned" | jq -e 'has("findings")' > /dev/null 2>&1; then
  printf '%s' "$cleaned" > simplify.json
else
  echo "model returned unparseable output" > simplify.error
fi
