#!/usr/bin/env bash
# Ask the router which documented behaviours the merged change contradicts or
# leaves undocumented.
#
# The request itself, its retries, and its failure contract live in
# shared/router-chat.sh; this file is the prompt and the inputs.
set -euo pipefail

rm -f drift.json

if [ -f drift.skip ]; then
  echo "Nothing to ask about: $(cat drift.skip)"
  exit 0
fi

export SYSTEM_PROMPT='You detect documentation drift. Given a merged code diff and the documentation that mentions it, list only documented claims the diff CONTRADICTS, and behaviour the diff adds that the documentation does not mention. Do not review the code, do not suggest edits to code, do not restate the diff. Answer ONLY JSON: {"items":[{"doc":"path","section":"heading or line","claim":"what the docs say or omit","contradicted_by":"what in the diff makes it wrong","action":"update|add|none"}],"summary":"..."}. Omit anything you cannot cite from both inputs. An empty items array is the correct answer when the documentation still matches.'

{
  echo "CHANGED FILES:"
  cat changed.txt
  printf '\nDIFF:\n'
  cat diff.txt
  printf '\nDOCUMENTATION:\n'
  cat docs.txt
} > user.txt

USER_FILE=user.txt \
  OUT=drift.json \
  REQUIRED_KEY=items \
  MAX_TOKENS="${MAX_TOKENS:-1500}" \
  TAG=docs-drift \
  bash "$(dirname "$0")/../shared/router-chat.sh"
