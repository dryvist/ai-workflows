// Gate for cc-release-notes: run Claude once per release-please PR head SHA.
// release-please refreshes its PR body on every push to main (a `synchronize`
// storm), but the highlights only change when the head actually moves — the
// SHA embedded in our sticky comment's marker makes every same-SHA re-run a
// free skip.
const MARKER_PREFIX = '<!-- cc-release-notes';

module.exports = async ({ github, context, core }) => {
  const skip = (message) => {
    core.setOutput('should_run', 'false');
    core.info(message);
  };

  const pr = context.payload.pull_request;
  if (!pr) return skip('No pull_request payload — skipping');

  const releaseBot = process.env.RELEASE_BOT || 'jacobpevans-release-please[bot]';
  const login = pr.user && pr.user.login;
  if (login !== releaseBot) return skip(`PR author "${login}" is not ${releaseBot} — skipping`);

  const branchPrefix = process.env.BRANCH_PREFIX || 'release-please--';
  const headRef = (pr.head && pr.head.ref) || '';
  if (!headRef.startsWith(branchPrefix)) {
    return skip(`Head branch "${headRef}" lacks prefix "${branchPrefix}" — skipping`);
  }

  const headSha = pr.head && pr.head.sha;
  const { owner, repo } = context.repo;
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pr.number,
    per_page: 100,
  });
  const existing = comments.find((c) => c.body && c.body.includes(MARKER_PREFIX));
  if (existing && headSha && existing.body.includes(`sha:${headSha}`)) {
    return skip(`Highlights already posted for head ${headSha} — skipping`);
  }

  core.setOutput('should_run', 'true');
  core.setOutput('pr_number', String(pr.number));
  core.setOutput('head_sha', headSha || '');
  // The claude-code-action allowed_bots list wants the bare login, no [bot].
  core.setOutput('release_bot_bare', releaseBot.replace(/\[bot\]$/, ''));
  core.info(`Release PR #${pr.number} eligible — head=${headSha}`);
};
