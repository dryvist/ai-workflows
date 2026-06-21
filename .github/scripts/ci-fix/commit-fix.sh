#!/usr/bin/env bash
set -euo pipefail
# Commit Claude's working-tree changes and push to the PR branch.
#
# cc-ci-fix runs claude-code-action with use_commit_signing=false, so Claude
# applies its fix to the working tree but commits nothing. This captures ALL of
# those changes — whether made via the Edit/Write tools or via Bash tools like
# formatters (tofu fmt, prettier, ruff) — which the commit-signing path misses.
#
# Env: APP_TOKEN, BOT_SLUG, ATTEMPT_NUM, BRANCH, REPO, GH_TOKEN.

cd "${GITHUB_WORKSPACE}"

# Stage everything except the ai-workflows sparse checkout mounted at .ai-workflows.
git add -A -- ':!.ai-workflows'

if git diff --cached --quiet; then
  echo "No changes staged — Claude produced no fix to commit."
  exit 0
fi

bot="${BOT_SLUG}[bot]"
user_id="$(gh api "/users/${bot}" --jq .id 2>/dev/null || echo "")"
git config user.name "${bot}"
if [ -n "${user_id}" ]; then
  git config user.email "${user_id}+${bot}@users.noreply.github.com"
else
  git config user.email "${bot}@users.noreply.github.com"
fi

git commit -m "fix: resolve CI failure (auto-fix attempt ${ATTEMPT_NUM})"
git push "https://x-access-token:${APP_TOKEN}@github.com/${REPO}.git" "HEAD:${BRANCH}"
echo "Pushed fix commit to ${BRANCH} as ${bot}"
