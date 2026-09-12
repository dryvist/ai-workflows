#!/usr/bin/env bash
# Ask the router to classify each unresolved thread.
#
# The request itself, its retries, and its failure contract live in
# shared/router-chat.sh; this file is the prompt and the inputs.
set -euo pipefail

rm -f triage.json triage.empty

if [ "$(jq 'length' threads.json)" -eq 0 ]; then
  echo "no unresolved review threads" > triage.empty
  echo "Nothing to triage."
  exit 0
fi

export SYSTEM_PROMPT='You triage unresolved pull request review threads. For each thread choose exactly one verdict:
"outdated" - the code the comment points at no longer exists in the current diff;
"addressed" - the current hunk already does what the comment asked;
"needs-code" - a code change is still required and is mechanical enough to specify;
"needs-human" - it is a question, a judgement call, or a disagreement a person must settle.
Cite the hunk line or the commit evidence you relied on. Answer ONLY JSON:
{"threads":[{"id":"t1","verdict":"outdated|addressed|needs-code|needs-human","reason":"one line, with evidence"}]}
Use the given thread ids verbatim and emit one entry per thread.'

{
  echo "THREADS:"
  cat threads.json
} > user.txt

USER_FILE=user.txt \
  OUT=triage.json \
  REQUIRED_KEY=threads \
  MAX_TOKENS="${MAX_TOKENS:-1200}" \
  TAG=thread-triage \
  bash "$(dirname "$0")/../shared/router-chat.sh"
