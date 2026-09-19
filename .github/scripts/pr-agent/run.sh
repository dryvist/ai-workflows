#!/usr/bin/env bash
# Run the requested PR-Agent tools against the router.
#
# Configuration reaches PR-Agent through an env file rather than `docker run
# -e`: the key then never appears in a process listing. Everything here is
# wiring; the prompts (review checklist, what "simplify" means, ignore rules)
# come from the target repository's own .pr_agent.toml, which PR-Agent reads
# over the API. CONFIG__CONFIG_BRANCH points it at the pull request's own head
# branch, so a change to that file is reviewable in the pull request that makes
# it instead of only after merge.
#
# Env: BASE_URL API_KEY JOB_TOKEN MODEL FALLBACK_MODELS MAX_TOKENS CONFIG_BRANCH
#      PR_URL RUN_REVIEW RUN_IMPROVE RUN_DESCRIBE
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=.github/scripts/shared/mask-router-url.sh
. "$(dirname "$0")/../shared/mask-router-url.sh"

: "${BASE_URL:?BASE_URL is required}"
: "${API_KEY:?API_KEY is required}"
: "${JOB_TOKEN:?JOB_TOKEN is required}"
: "${PR_URL:?PR_URL is required}"

# Pinned by digest as well as tag: the tag is mutable, and a review's behaviour
# should change only when this line does. Renovate tracks the tag.
image="pragent/pr-agent:0.45.0@sha256:e6463e802562daa47db51950de84100a5679472844926d77d53911e529398ee5"

env_file="$(mktemp)"
chmod 600 "$env_file"
trap 'rm -f "$env_file"' EXIT

# --env-file parses KEY=VALUE literally: no quoting, no interpolation, and a
# quote character would become part of the value.
{
  echo "OPENAI__KEY=$API_KEY"
  echo "OPENAI__API_BASE=$BASE_URL"
  echo "GITHUB__USER_TOKEN=$JOB_TOKEN"
  echo "CONFIG__MODEL=openai/${MODEL:?MODEL is required}"
  # The built-in fallback list names a vendor model this key cannot reach, so
  # leaving it at its default turns the first model error into an auth error.
  # FALLBACK_MODELS is a comma-separated ladder of further router roles;
  # PR-Agent walks it on any error. Empty means the role's own ladder only.
  echo "CONFIG__FALLBACK_MODELS=$(printf '%s' "${FALLBACK_MODELS:-}" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;/^$/d' | jq -R -s -c 'split("\n") | map(select(length > 0) | "openai/" + .)')"
  echo "CONFIG__CUSTOM_MODEL_MAX_TOKENS=${MAX_TOKENS:-32000}"
  echo "CONFIG__AI_TIMEOUT=240"
  # Without this a tool that fails internally still exits 0, which is the
  # silent-green failure this whole workflow exists to remove.
  echo "CONFIG__PROPAGATE_TOOL_ERRORS=true"
  echo "PR_REVIEWER__PERSISTENT_COMMENT=true"
  # Review labels would need issues: write to create a label that is missing.
  echo "PR_REVIEWER__ENABLE_REVIEW_LABELS_SECURITY=false"
  echo "PR_REVIEWER__ENABLE_REVIEW_LABELS_EFFORT=false"
  if [ -n "${CONFIG_BRANCH:-}" ]; then
    echo "CONFIG__CONFIG_BRANCH=$CONFIG_BRANCH"
  fi
} > "$env_file"

tools=""
[ "${RUN_REVIEW:-false}" = "true" ] && tools="${tools} review"
[ "${RUN_IMPROVE:-false}" = "true" ] && tools="${tools} improve"
[ "${RUN_DESCRIBE:-false}" = "true" ] && tools="${tools} describe"

if [ -z "${tools// /}" ]; then
  echo "No tool selected: enable at least one of review, improve, describe." >&2
  exit 1
fi

for tool in $tools; do
  echo "::group::pr-agent $tool"
  docker run --rm --env-file "$env_file" "$image" --pr_url "$PR_URL" "$tool"
  echo "::endgroup::"
done
