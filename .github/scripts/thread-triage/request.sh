#!/usr/bin/env bash
# Ask the router to classify each unresolved thread. Never fails the job on a
# model or router problem: it writes triage.error with a reason instead, which
# render.sh turns into an "unavailable" comment.
set -euo pipefail

rm -f triage.json triage.error triage.empty

count="$(jq 'length' threads.json)"
if [ "$count" -eq 0 ]; then
  echo "no unresolved review threads" > triage.empty
  echo "Nothing to triage."
  exit 0
fi

if [ -z "${BASE_URL:-}" ] || [ -z "${API_KEY:-}" ]; then
  echo "router credential not configured" > triage.error
  echo "No router base URL or API key - skipping the model call."
  exit 0
fi

system='You triage unresolved pull request review threads. For each thread choose exactly one verdict:
"outdated" - the code the comment points at no longer exists in the current diff;
"addressed" - the current hunk already does what the comment asked;
"needs-code" - a code change is still required and is mechanical enough to specify;
"needs-human" - it is a question, a judgement call, or a disagreement a person must settle.
Cite the hunk line or the commit evidence you relied on. Answer ONLY JSON:
{"threads":[{"id":"t1","verdict":"outdated|addressed|needs-code|needs-human","reason":"one line, with evidence"}]}
Use the given thread ids verbatim and emit one entry per thread.'

jq -n \
  --arg model "${MODEL:?MODEL is required}" \
  --arg system "$system" \
  --arg threads "$(cat threads.json)" \
  --argjson max_tokens "${MAX_TOKENS:-1200}" \
  '{
     model: $model,
     temperature: 0,
     max_tokens: $max_tokens,
     response_format: {type: "json_object"},
     messages: [
       {role: "system", content: $system},
       {role: "user", content: ("THREADS:\n" + $threads)}
     ]
   }' > request.json

call() {
  curl -sS --max-time 240 -o response.json -w '%{http_code}' \
    "${BASE_URL%/}/chat/completions" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "x-litellm-tags: thread-triage,repo=${REPO:-unknown}" \
    -H 'x-langfuse-trace-name: thread-triage' \
    --data @request.json || echo 000
}

code="$(call)"

# Some backends reject response_format; retry once without it rather than
# reporting the triage unavailable.
if [ "$code" != "200" ] && grep -qi 'response_format' response.json 2>/dev/null; then
  echo "Retrying without response_format (the backend rejected it)."
  jq 'del(.response_format)' request.json > request.noformat.json
  mv request.noformat.json request.json
  code="$(call)"
fi

if [ "$code" != "200" ]; then
  echo "router returned HTTP $code" > triage.error
  echo "Router call failed with HTTP $code."
  exit 0
fi

content="$(jq -r '.choices[0].message.content // ""' response.json)"
# Models sometimes wrap JSON in a fenced block; strip the fences before parsing.
cleaned="$(printf '%s' "$content" | sed -e 's/^```[a-zA-Z]*$//' -e 's/^```$//')"
if printf '%s' "$cleaned" | jq -e 'has("threads")' > /dev/null 2>&1; then
  printf '%s' "$cleaned" > triage.json
else
  echo "model returned unparseable output" > triage.error
fi
