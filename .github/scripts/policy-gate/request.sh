#!/usr/bin/env bash
# Ask the router to score a pull request's diff against the fixed five-check
# rubric. The request itself, its retries, and its failure contract live in
# shared/router-chat.sh; this file is the prompt and the inputs.
set -euo pipefail

rm -f findings.json

export SYSTEM_PROMPT='You review a pull request diff against exactly five checks. For each, return pass or fail with the file and line the finding is about (empty string/0 when the check passes or does not apply to a specific line).

- dry: the diff adds a block that substantially duplicates logic already present elsewhere in the diff or obviously duplicates a well-known existing helper by name/behaviour.
- native_first: a custom script or dependency does something a standard library, language builtin, tool CLI flag, or existing platform/infrastructure feature (e.g. Cribl Edge, OTEL, systemd/launchd) could do instead.
- disclosure: committed text (code, comments, commit-adjacent strings) names an internal hostname, IP address, internal topology, or maps a real value to a placeholder, rather than describing capability generically.
- missing_test: the diff adds non-trivial branching logic (a conditional, a loop, a parser, a money/security-relevant path) with no accompanying runnable test.
- token_budget: a listed file is unusually large relative to its peers and risks a hard token-count limit (informational only; do not fail this unless the line count for a file in FILE SIZES is far larger than every other file).

Judge only what the diff and file list show you; never claim a violation you cannot point at in the input. Answer ONLY JSON: {"findings":[{"check":"dry|native_first|disclosure|missing_test|token_budget","result":"pass|fail","file":"path or empty string","line":0,"detail":"one sentence, empty string when result is pass"}],"summary":"one sentence overall"}. Always return exactly five findings, one per check, in the order listed above.'

{
  echo "CHANGED FILES:"
  cat changed.txt
  printf '\nFILE SIZES:\n'
  cat sizes.txt
  printf '\nDIFF:\n'
  cat diff.txt
} > user.txt

USER_FILE=user.txt \
  OUT=findings.json \
  REQUIRED_KEY=findings \
  MAX_TOKENS="${MAX_TOKENS:-1500}" \
  TAG=policy-gate \
  bash "$(dirname "$0")/../shared/router-chat.sh"
