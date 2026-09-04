#!/usr/bin/env bash
# Collect the PR's unresolved review threads, plus the current hunk for each
# thread's file, into threads.json.
#
# Each entry carries a short key (t1, t2, ...) rather than the GraphQL node id:
# the model only ever has to echo the short key back, which keeps the prompt
# small and makes a hallucinated id impossible to mistake for a real thread.
set -euo pipefail

: "${PR_NUMBER:?PR_NUMBER is required}"
max_threads="${MAX_THREADS:-20}"
owner="${GITHUB_REPOSITORY%%/*}"
repo="${GITHUB_REPOSITORY##*/}"

# shellcheck disable=SC2016  # $owner etc. are GraphQL variables, not shell ones
query='
query ($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 20) {
            nodes { body createdAt author { login } }
          }
        }
      }
    }
  }
}'

gh api graphql --paginate \
  -f query="$query" \
  -F owner="$owner" -F repo="$repo" -F number="$PR_NUMBER" \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[]' \
  | jq -s '.' > threads.raw.json

# The unified diff of the PR as it stands now; the per-file section is the
# evidence the model needs to tell "already addressed" from "still open".
gh pr diff "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" > diff.txt || : > diff.txt

# Path comparison is literal, not a regex: a file name containing regex
# metacharacters must still match its own diff section.
hunk_for() {
  awk -v want="b/$1" '
    /^diff --git / { infile = ($NF == want); next }
    infile { print }
  ' diff.txt | head -c 4000
}

jq -c --argjson max "$max_threads" \
  '[ .[] | select(.isResolved == false) ] | .[:$max]' threads.raw.json > unresolved.json

: > threads.jsonl
index=0
while read -r thread; do
  index=$((index + 1))
  path="$(printf '%s' "$thread" | jq -r '.path // ""')"
  hunk=""
  [ -n "$path" ] && hunk="$(hunk_for "$path")"
  printf '%s' "$thread" | jq -c \
    --arg key "t$index" \
    --arg hunk "$hunk" \
    '{
       key: $key,
       thread_id: .id,
       path: (.path // "(no path)"),
       line: .line,
       outdated: .isOutdated,
       comments: [ .comments.nodes[]? | {
         author: (.author.login // "unknown"),
         created_at: .createdAt,
         body: ((.body // "") | .[:1200])
       } ],
       hunk: $hunk
     }' >> threads.jsonl
done < <(jq -c '.[]' unresolved.json)

jq -s '.' threads.jsonl > threads.json
rm -f threads.raw.json unresolved.json threads.jsonl
echo "Collected $(jq 'length' threads.json) unresolved thread(s)."
