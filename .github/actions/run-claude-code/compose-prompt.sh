#!/usr/bin/env bash
# Compose the prompt sent to Claude inside the run-claude-code composite.
# When source_slug is non-empty, prepend the attribution preamble (which
# instructs Claude to add [aw:<slug>] suffixes, Provenance blocks, and the
# agentic-workflows label to every PR/issue it creates).
#
# Reads: USER_PROMPT, SOURCE_SLUG, WORKFLOW_REF, RUN_URL, EVENT_NAME,
#        ACTION_PATH, GITHUB_OUTPUT (all required env vars).
# Writes: a `content` step output containing the composed prompt.
set -euo pipefail

: "${USER_PROMPT:?USER_PROMPT is required}"
: "${ACTION_PATH:?ACTION_PATH is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

preamble=""
if [[ -n "${SOURCE_SLUG:-}" ]]; then
  preamble=$(sed \
    -e "s|{{SOURCE_SLUG}}|${SOURCE_SLUG}|g" \
    -e "s|{{WORKFLOW_REF}}|${WORKFLOW_REF:-}|g" \
    -e "s|{{RUN_URL}}|${RUN_URL:-}|g" \
    -e "s|{{EVENT_NAME}}|${EVENT_NAME:-}|g" \
    "${ACTION_PATH}/attribution-preamble.md")
fi

delim="EOF_COMPOSED_PROMPT_$$"
{
  printf 'content<<%s\n' "$delim"
  if [[ -n "$preamble" ]]; then
    printf '%s\n\n' "$preamble"
  fi
  printf '%s\n' "$USER_PROMPT"
  printf '%s\n' "$delim"
} >> "$GITHUB_OUTPUT"
