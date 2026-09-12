#!/usr/bin/env bash
# Ask the router for a five-line natural-language summary of the computed facts.
#
# The request itself, its retries, and its failure contract live in
# shared/router-chat.sh; this file is the prompt and the inputs.
set -euo pipefail

rm -f summary.txt

export SYSTEM_PROMPT='You summarise repository hygiene facts. Answer with at most five short lines of plain prose, no markdown headings, no lists, no invented facts. Only describe what the JSON contains.'

{
  echo "FACTS:"
  cat digest.json
} > summary-user.txt

USER_FILE=summary-user.txt \
  OUT=summary.full.txt \
  MAX_TOKENS="${MAX_TOKENS:-400}" \
  TAG=repo-hygiene-digest \
  bash "$(dirname "$0")/../shared/router-chat.sh"

head -n 5 summary.full.txt > summary.txt
