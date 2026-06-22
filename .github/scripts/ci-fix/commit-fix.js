// Commit Claude's working-tree changes to the failing PR's branch. Thin wrapper
// over the shared verified-commit helper (App-token createCommitOnBranch →
// GitHub-VERIFIED, satisfies required_signatures, re-triggers CI). See
// shared/verified-commit.js and docs/PATTERNS.md "Verified Commit & PR Pattern".
const { commitToBranch } = require('../shared/verified-commit.js');

module.exports = async ({ github, context, core }) => {
  await commitToBranch({
    github,
    context,
    core,
    branch: process.env.HEAD_BRANCH,
    message: process.env.COMMIT_MESSAGE,
  });
};
