#!/usr/bin/env bash
# Compute repository hygiene facts for every repo in REPOS (comma separated),
# writing one JSON object per repo into digest.json.
#
# Read-only: every call is a GitHub read. Nothing is created, deleted, or pushed.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${REPOS:?REPOS is required}"
stale_days="${STALE_DAYS:-30}"
now="$(date -u +%s)"

: > repos.ndjson

IFS=',' read -r -a repo_list <<< "$REPOS"
for entry in "${repo_list[@]}"; do
  repo="$(echo "$entry" | tr -d '[:space:]')"
  [ -n "$repo" ] || continue
  owner="${repo%%/*}"
  name="${repo##*/}"

  if ! gh api graphql -F owner="$owner" -F name="$name" \
      -f query="$(cat "$here/query.graphql")" > raw.json 2> graphql.err; then
    echo "::warning::could not read $repo: $(head -c 300 graphql.err)"
    jq -n --arg repo "$repo" --arg err "$(head -c 300 graphql.err)" \
      '{repo: $repo, error: $err}' >> repos.ndjson
    continue
  fi

  default_branch="$(jq -r '.data.repository.defaultBranchRef.name // "main"' raw.json)"

  # Promotion candidate: on a git-flow repo (default branch develop), how far
  # ahead of main develop has drifted.
  promotion='null'
  if [ "$default_branch" = "develop" ]; then
    if gh api "repos/$repo/compare/main...develop" > compare.json 2> compare.err; then
      promotion="$(jq '{ahead: (.ahead_by // 0),
                        last: ((.commits // []) | last | .commit.message // "" | split("\n")[0])}' compare.json)"
    else
      echo "::warning::could not compare main...develop on $repo"
    fi
  fi

  jq -n \
    --arg repo "$repo" \
    --arg default_branch "$default_branch" \
    --argjson now "$now" \
    --argjson stale_days "$stale_days" \
    --argjson promotion "$promotion" \
    --slurpfile raw raw.json '
    def age($iso): (($now - ($iso | fromdateiso8601)) / 86400) | floor;
    # Named dependency and release bots only. Not every App-authored PR: work
    # an agent opened through an App installation still needs a human.
    def is_bot($a):
      ($a.login // "") | ascii_downcase
      | test("renovate|dependabot|release-please");

    ($raw[0].data.repository) as $r
    | ($r.refs.nodes // []) as $refs
    | ($r.pullRequests.nodes // []) as $prs
    | {
        repo: $repo,
        default_branch: $default_branch,
        promotion: $promotion,
        deletable: (
          $refs
          | map(select(.name != $default_branch and .name != "main"))
          | map({
              branch: .name,
              pr: (.target.associatedPullRequests.nodes // []
                   | map(select(.state != "OPEN")) | first)
            })
          | map(select(.pr != null))
          | map({branch: .branch, pr: .pr.number, state: .pr.state})
        ),
        stale: (
          $refs
          | map(select(.name != $default_branch and .name != "main"))
          | map(select((.target.associatedPullRequests.nodes // []) | length == 0))
          | map({branch: .name, days: age(.target.committedDate)})
          | map(select(.days > $stale_days))
        ),
        prs: (
          $prs
          | map(
              . as $p
              | (($p.reviewThreads.nodes // []) | map(select(.isResolved | not)) | length) as $unresolved
              | (($p.commits.nodes // []) | first | .commit.statusCheckRollup.state // "NONE") as $checks
              | {
                  number: $p.number,
                  title: $p.title,
                  age: age($p.createdAt),
                  author: ($p.author.login // "unknown"),
                  checks: $checks,
                  unresolved: $unresolved,
                  bucket: (
                    if $p.isDraft then "draft"
                    elif is_bot($p.author // {}) then "bot"
                    elif $unresolved > 0 then "threads"
                    elif $checks == "SUCCESS" and ($p.mergeable == "MERGEABLE") then "ready"
                    else "blocked"
                    end
                  )
                }
            )
        )
      }' >> repos.ndjson
done

jq -s '.' repos.ndjson > digest.json
jq -r '"collected \(length) repo(s)"' digest.json
