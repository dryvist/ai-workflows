#!/usr/bin/env bash
# promote-major-tag.sh <sha> [--gate-verified]
#
# Moves the floating major tag (v0 for v0.x.y) to <sha>, the commit of the
# highest vX.Y.Z tag pointing at it, once the Canary check on <sha> succeeded.
#
# Called by promote-major-tag.yml (release published, workflow_dispatch) and by
# the `promote` job in canary.yml (push to main). Whichever arrives second
# promotes. Exit 0 with a notice means nothing to do yet: no release tag on the
# commit, or the Canary check is missing or still running. Exit 1 means the
# Canary concluded otherwise, or the move would go backwards.
#
# --gate-verified: the caller has already seen the Canary summary job succeed
# (canary.yml `needs`), so the check-run lookup is skipped.
#
# Required env: GH_TOKEN (checks: read on the repo), GITHUB_REPOSITORY.

set -euo pipefail

sha="${1:?usage: promote-major-tag.sh <sha> [--gate-verified]}"
gate_verified=false
[[ "${2:-}" == --gate-verified ]] && gate_verified=true

tag_re='^v[0-9]+\.[0-9]+\.[0-9]+$'
tag="$(git tag --points-at "$sha" | grep -E "$tag_re" | sort -V | tail -n 1 || true)"
if [[ -z "$tag" ]]; then
  echo "::notice::$sha has no vX.Y.Z tag; nothing to promote."
  exit 0
fi
major="${tag%%.*}"

if [[ "$gate_verified" != true ]]; then
  check="$(gh api "repos/$GITHUB_REPOSITORY/commits/$sha/check-runs?check_name=Canary" \
    --jq '.check_runs | sort_by(.started_at) | last // empty | "\(.status) \(.conclusion)"')"
  if [[ -z "$check" ]]; then
    echo "::notice::No Canary check-run on $sha yet; the Canary run on main promotes $tag once it finishes."
    exit 0
  fi
  read -r status conclusion <<<"$check"
  if [[ "$status" != completed ]]; then
    echo "::notice::Canary on $sha is $status; the Canary run on main promotes $tag once it finishes."
    exit 0
  fi
  if [[ "$conclusion" != success ]]; then
    echo "::error::Canary on $sha concluded '$conclusion'; not promoting $tag."
    exit 1
  fi
fi

if current="$(git rev-parse -q --verify "refs/tags/$major^{commit}")"; then
  if ! git merge-base --is-ancestor "$current" "$sha"; then
    echo "::error::$major is $current, which is not an ancestor of $tag ($sha). Refusing to move it backwards."
    exit 1
  fi
fi
git tag -f "$major" "$sha"
git push -f origin "refs/tags/$major"
echo "::notice::$major -> $sha ($tag)"
