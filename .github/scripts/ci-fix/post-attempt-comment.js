module.exports = async ({ github, context, core }) => {
  const prNumber = parseInt(process.env.PR_NUMBER, 10);
  if (isNaN(prNumber)) {
    core.setFailed('PR_NUMBER is not a valid number');
    return;
  }
  const attempt = process.env.ATTEMPT || '?';
  const dryRun = process.env.DRY_RUN === 'true';
  await github.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: prNumber,
    body: [
      '<!-- claude-ci-fix-attempt -->',
      `### CI Auto-Fix Attempt ${attempt}/2`,
      '',
      'The AI agent is analyzing the CI failure and preparing a proposed fix...',
      ...(dryRun ? ['Dry run: no patch was published.'] : [])
    ].join('\n')
  });
};
