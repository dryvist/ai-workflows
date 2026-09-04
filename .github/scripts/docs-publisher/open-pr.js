'use strict';

const { openPr } = require('../shared/verified-commit.js');

module.exports = async ({ github, context, core }) => {
  const checkout = process.env.PUBLISHER_CHECKOUT;
  const previous = process.cwd();
  if (checkout) process.chdir(checkout);
  try {
    await openPr({
      github,
      context,
      core,
      branch: process.env.PR_BRANCH,
      title: process.env.PR_TITLE,
      body: process.env.PR_BODY || '',
      baseBranch: process.env.BASE_BRANCH || 'main',
      repoWithOwner: process.env.TARGET_REPOSITORY || undefined,
      draft: process.env.PR_DRAFT === 'true',
    });
  } finally {
    process.chdir(previous);
  }
};
