#!/usr/bin/env bash
# AI Merge Gate: fail when any Copilot agent check-run on HEAD_SHA has
# failed or timed out. Writes the decision (count + the check-runs it
# counted) to the job summary; exits 1 on any failure.
#
# Inputs (env): GH_TOKEN, REPO (owner/name), HEAD_SHA,
#               GITHUB_STEP_SUMMARY (optional).
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN not set}"
: "${REPO:?REPO not set}"
: "${HEAD_SHA:?HEAD_SHA not set}"

# The API occasionally answers with a transient HTML error page; curl's own
# retry covers that, and jq refusing to parse anything else fails the gate
# visibly instead of counting zero.
runs="$(curl --silent --show-error --fail-with-body \
  --retry 3 --retry-all-errors --retry-delay 5 \
  -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/commits/$HEAD_SHA/check-runs?per_page=100" \
  | jq -c '[.check_runs[] | select(.app.slug | test("copilot"; "i"))
            | {name, conclusion, url: .html_url}]')"

failed="$(jq -r '[.[] | select(.conclusion == "failure" or .conclusion == "timed_out")] | length' <<< "$runs")"

{
  echo "### AI Merge Gate"
  echo
  echo "Copilot agent check-runs on \`${HEAD_SHA:0:7}\`: $(jq -r 'length' <<< "$runs"), failed or timed out: $failed"
  echo
  echo "| check-run | conclusion |"
  echo "| --- | --- |"
  jq -r '.[] | "| [\(.name)](\(.url)) | \(.conclusion // "in progress") |"' <<< "$runs"
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"

if [ "$failed" -gt 0 ]; then
  echo "::error::$failed Copilot agent check(s) failed"
  exit 1
fi
