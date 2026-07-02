// Commit Claude's working-tree edits (fixes it made for valid review feedback)
// onto the PR branch as a GitHub-VERIFIED bot commit. Thin wrapper over the shared
// verified-commit helper. Excludes the responder's own scratch files so the
// thread/verdict JSON never lands in the commit. No-op when Claude made no edits.
const { commitToBranch } = require('../shared/verified-commit.js');

module.exports = async ({ github, context, core }) => {
  await commitToBranch({
    github,
    context,
    core,
    branch: process.env.HEAD_BRANCH,
    message: process.env.COMMIT_MESSAGE,
    extraExcludes: ['.review-threads.json', '.review-responses.json'],
  });
};
