#!/usr/bin/env bash
# One chat completion against the model router.
#
# Failure is failure. Earlier versions of the callers wrote an "unavailable"
# note and exited 0, so an outage or a broken credential produced a green check
# that had reviewed nothing. curl's own retry absorbs what waiting can fix (a
# connection failure, 408, 429, 5xx): two retries five seconds apart inside a
# fifteen-second budget, then the job fails. MODEL is a router role; the
# router walks that role's own fallback ladder and drops a request parameter a
# backend does not support, so neither is handled here.
#
# Env (required): BASE_URL API_KEY MODEL SYSTEM_PROMPT USER_FILE OUT
# Env (optional): MAX_TOKENS (1500)  REQUIRED_KEY ("")  TAG (OUT without its
#                 extension)  RETRY_MAX (15, seconds)  RETRY_DELAY (5)
#
# REQUIRED_KEY set   -> ask for a JSON object and fail unless it has that key.
# REQUIRED_KEY empty -> the model's text is written through as-is.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=.github/scripts/shared/mask-router-url.sh
. "$(dirname "$0")/mask-router-url.sh"

: "${BASE_URL:?BASE_URL is required}"
: "${API_KEY:?API_KEY is required}"
: "${MODEL:?MODEL is required}"
: "${SYSTEM_PROMPT:?SYSTEM_PROMPT is required}"
: "${USER_FILE:?USER_FILE is required}"
: "${OUT:?OUT is required}"

required_key="${REQUIRED_KEY:-}"
tag="${TAG:-$(basename "${OUT%.*}")}"

jq -n \
  --arg model "$MODEL" \
  --arg system "$SYSTEM_PROMPT" \
  --rawfile user "$USER_FILE" \
  --argjson max_tokens "${MAX_TOKENS:-1500}" \
  --arg key "$required_key" \
  '{
     model: $model,
     temperature: 0,
     max_tokens: $max_tokens,
     messages: [
       {role: "system", content: $system},
       {role: "user", content: $user}
     ]
   }
   + (if $key != "" then {response_format: {type: "json_object"}} else {} end)' \
  > request.json

code="$(curl -sS --fail-with-body -o response.json -w '%{http_code}' --max-time 240 \
  --retry 2 --retry-delay "${RETRY_DELAY:-5}" --retry-max-time "${RETRY_MAX:-15}" \
  "${BASE_URL%/}/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $API_KEY" \
  -H "x-langfuse-trace-name: $tag" \
  --data @request.json || true)"
case "$code" in
  200) ;;
  401 | 403 | 404)
    echo "Router refused the request with HTTP $code: the key, the base URL or the model alias is wrong." >&2
    exit 1
    ;;
  *)
    echo "Router returned HTTP ${code:-000} past the ${RETRY_MAX:-15}s retry budget: failing so the runner is released." >&2
    exit 1
    ;;
esac

content="$(jq -r '.choices[0].message.content // ""' response.json)"
# Models sometimes wrap JSON in a fenced block; strip the fences before parsing.
content="$(printf '%s' "$content" | sed -e 's/^```[a-zA-Z]*$//' -e 's/^```$//')"

if [ -n "$required_key" ]; then
  if ! printf '%s' "$content" | jq -e --arg k "$required_key" 'has($k)' > /dev/null 2>&1; then
    echo "The model's output has no \"${required_key}\" key:" >&2
    printf '%s' "$content" | head -c 300 >&2
    echo >&2
    exit 1
  fi
fi

printf '%s\n' "$content" > "$OUT"
