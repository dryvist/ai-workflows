#!/usr/bin/env bash
# File the Vikunja task run.js proposed (vikunja-body.md), if any. The PR half
# is opened by the workflow's own github-script step (verified-commit.js's
# openPr, App-signed) rather than here — a plain unsigned `git push` would be
# rejected by dryvist's org-wide required_signatures ruleset.
set -euo pipefail

if [ -f vikunja-body.md ]; then
  : "${VIKUNJA_URL:?VIKUNJA_URL not set}"
  : "${VIKUNJA_API_TOKEN:?VIKUNJA_API_TOKEN not set}"
  title="Pricing-discovery: review needed ($(date -u +%Y-%m-%d))"
  jq -n --arg title "$title" --rawfile description vikunja-body.md \
    '{title: $title, description: $description}' \
    | curl -sS -f -X PUT "${VIKUNJA_URL%/}/api/v1/projects/48/tasks" \
        -H "Authorization: Bearer ${VIKUNJA_API_TOKEN}" \
        -H "Content-Type: application/json" \
        -d @- > /dev/null
fi
