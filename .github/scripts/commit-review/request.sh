#!/usr/bin/env bash
# Ask the router for a review of the pushed diff. Writes review.txt.
#
# The request itself, its retries, and its failure contract live in
# shared/router-chat.sh; this file is the prompt and the inputs.
set -euo pipefail

rm -f review.txt

if [ -f review.skip ]; then
  echo "Nothing to review: $(cat review.skip)"
  printf '_No diff to review: %s._\n' "$(cat review.skip)" > review.txt
  exit 0
fi

# The backticks are Markdown for the model, not shell expansion.
# shellcheck disable=SC2016
export SYSTEM_PROMPT='You are a code reviewer. Review ONLY the diff you are given. Report defects a maintainer must act on: bugs, unhandled failure paths, security or secret-handling mistakes, broken contracts with the surrounding code, tests that cannot fail. Be specific: cite the file and the added or removed line. Do not restate the diff, do not praise, do not comment on style unless it hides a defect. Output Markdown with two sections: "### Findings" (a bullet per finding, most severe first, `file:line — what is wrong — why it matters`; write "None." if there are none) and "### Verdict" (one sentence: safe to keep, or what must change). At most 12 findings. STOP after the verdict.'

{
  echo "COMMITS:"
  cat log.txt
  printf '\nCHANGED FILES:\n'
  cat changed.txt
  printf '\nDIFF:\n'
  cat diff.txt
} > user.txt

USER_FILE=user.txt \
  OUT=review.txt \
  MAX_TOKENS="${MAX_TOKENS:-1500}" \
  TAG=commit-review \
  bash "$(dirname "$0")/../shared/router-chat.sh"
