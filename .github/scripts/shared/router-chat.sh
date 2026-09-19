#!/usr/bin/env bash
# One chat completion against the model router, retried with exponential
# backoff until it succeeds or the job's timeout-minutes ends the run.
#
# Failure is failure. Earlier versions of the callers wrote an "unavailable"
# note and exited 0, so an outage or a broken credential produced a green check
# that had reviewed nothing. Waiting fixes a connection failure or a 5xx; it
# cannot fix a 401, 403 or 404, so those exit immediately.
#
# Env (required): BASE_URL API_KEY MODEL SYSTEM_PROMPT USER_FILE OUT
# Env (optional): MAX_TOKENS (1500)  REQUIRED_KEY ("")  BACKOFF_START (5)
#                 BACKOFF_MAX (300)  TAG (OUT without its extension)
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

# Retries live inside a 15-second budget (RETRY_MAX): a 5xx/429/timeout is the
# endpoint's fallback ladder's problem, not something a runner waits out.
delay="${BACKOFF_START:-5}"
max="${BACKOFF_MAX:-5}"
retry_max="${RETRY_MAX:-15}"
started=$(date +%s)
while :; do
  code="$(curl -s --max-time 240 -o response.json -w '%{http_code}' \
    "${BASE_URL%/}/chat/completions" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $API_KEY" \
    -H "x-langfuse-trace-name: $tag" \
    --data @request.json || echo 000)"

  [ "$code" = 200 ] && break

  # A backend that rejects response_format gets one retry without it, before
  # the status is treated as an outage.
  if grep -qi 'response_format' response.json 2> /dev/null \
    && jq -e 'has("response_format")' request.json > /dev/null; then
    echo "The backend rejected response_format; retrying without it."
    jq 'del(.response_format)' request.json > request.next.json
    mv request.next.json request.json
    continue
  fi

  case "$code" in
    401 | 403 | 404)
      echo "Router refused the request with HTTP $code: the key, the base URL or the model alias is wrong." >&2
      exit 1
      ;;
    *)
      elapsed=$(( $(date +%s) - started ))
      remaining=$(( retry_max - elapsed ))
      if [ "$remaining" -le 0 ]; then
        echo "Router returned HTTP $code for ${elapsed}s, past the ${retry_max}s retry budget: failing so the runner is released." >&2
        exit 1
      fi
      [ "$delay" -gt "$remaining" ] && delay=$remaining
      echo "Router returned HTTP $code; retrying in ${delay}s (${remaining}s left)."
      sleep "$delay"
      delay=$((delay * 2 > max ? max : delay * 2))
      ;;
  esac
done

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
