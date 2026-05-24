#!/usr/bin/env bash
# Compose the prompt sent to Claude inside the run-claude-code composite.
# When source_slug is non-empty, prepend the attribution preamble (which
# instructs Claude to add [aw:<slug>] suffixes, Provenance blocks, and the
# agentic-workflows label to every PR/issue it creates).
#
# Reads: USER_PROMPT, SOURCE_SLUG, WORKFLOW_REF, RUN_URL, EVENT_NAME,
#        ACTION_PATH, GITHUB_OUTPUT (all required env vars).
# Writes: a `content` step output containing the composed prompt.
#
# Security:
# - Template substitution uses bash parameter expansion (${var//pattern/repl})
#   rather than `sed`. Parameter expansion does not interpret the
#   replacement string, so a `|`, `/`, `&`, or other sed-special character
#   in a value cannot escape the template.
# - The heredoc delimiter is randomized per invocation via /dev/urandom so
#   USER_PROMPT cannot escape the GITHUB_OUTPUT block by guessing the
#   delimiter.
set -euo pipefail

: "${USER_PROMPT:?USER_PROMPT is required}"
: "${ACTION_PATH:?ACTION_PATH is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

preamble=""
if [[ -n "${SOURCE_SLUG:-}" ]]; then
  preamble=$(< "${ACTION_PATH}/attribution-preamble.md")
  preamble="${preamble//\{\{SOURCE_SLUG\}\}/${SOURCE_SLUG}}"
  preamble="${preamble//\{\{WORKFLOW_REF\}\}/${WORKFLOW_REF:-}}"
  preamble="${preamble//\{\{RUN_URL\}\}/${RUN_URL:-}}"
  preamble="${preamble//\{\{EVENT_NAME\}\}/${EVENT_NAME:-}}"
fi

delim="ghadelimiter_$(LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c 32)"
{
  printf 'content<<%s\n' "$delim"
  if [[ -n "$preamble" ]]; then
    printf '%s\n\n' "$preamble"
  fi
  printf '%s\n' "$USER_PROMPT"
  printf '%s\n' "$delim"
} >> "$GITHUB_OUTPUT"
