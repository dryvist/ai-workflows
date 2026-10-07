const { ISSUE_DAILY_CEILING } = require('../shared/constants');
const { get24hWindowStart } = require('../shared/utils');

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const eventRun = context.payload.workflow_run;
  const run = {
    conclusion: process.env.FAILURE_CONCLUSION || eventRun?.conclusion,
    head_sha: process.env.FAILURE_HEAD_SHA || eventRun?.head_sha,
    id: process.env.FAILURE_RUN_ID || eventRun?.id,
    html_url: process.env.FAILURE_RUN_URL || eventRun?.html_url,
  };
  const marker = '<!-- ci-fail-issue -->';

  // Gate 0: Unified daily issue ceiling — prevent automation loops
  const issueCeilingSince = get24hWindowStart();
  const botLogins = ['claude[bot]', 'github-actions[bot]'];
  let recentBotIssues = 0;
  for (const bot of botLogins) {
    try {
      const issues = await github.rest.issues.listForRepo({
        owner, repo,
        creator: bot,
        since: issueCeilingSince.toISOString(),
        state: 'all',
        per_page: 100,
      });
      recentBotIssues += issues.data.filter(
        i => !i.pull_request && new Date(i.created_at) > issueCeilingSince
      ).length;
    } catch (e) { /* ignore */ }
  }
  if (recentBotIssues >= ISSUE_DAILY_CEILING) {
    core.info(`Daily bot issue ceiling reached (${recentBotIssues}/${ISSUE_DAILY_CEILING}). Skipping.`);
    core.setOutput('eligible', 'false');
    core.setOutput('skip_reason', `Daily bot activity limit reached (${recentBotIssues} issues in 24h)`);
    return;
  }
  core.info(`Daily bot issue count: ${recentBotIssues}/${ISSUE_DAILY_CEILING}`);

  // Gate 1: conclusion must be 'failure'
  if (run.conclusion !== 'failure') {
    core.info(`Gate 1: conclusion is ${run.conclusion}, not failure — skipping`);
    core.setOutput('eligible', 'false');
    core.setOutput('skip_reason', `conclusion is ${run.conclusion}`);
    return;
  }
  core.info('Gate 1: conclusion is failure — pass');

  if (!run.head_sha || !run.id || !run.html_url) {
    core.setFailed('Failure run metadata is incomplete');
    core.setOutput('eligible', 'false');
    core.setOutput('skip_reason', 'failure run metadata is incomplete');
    return;
  }
  const sha = run.head_sha;
  const shortSha = sha.slice(0, 7);

  // Gate 2 & 3: skip if commit authored by a bot
  let authorLogin = '';
  try {
    const commitData = await github.rest.repos.getCommit({ owner, repo, ref: sha });
    authorLogin = commitData.data.author?.login || '';
  } catch (e) {
    core.info(`Could not get commit author: ${e.message}`);
  }

  const botAuthors = ['copilot[bot]', 'github-actions[bot]', 'renovate[bot]', 'dependabot[bot]'];
  if (botAuthors.includes(authorLogin)) {
    core.info(`Gate 2/3: commit authored by ${authorLogin} — skipping to prevent loop`);
    core.setOutput('eligible', 'false');
    core.setOutput('skip_reason', `commit authored by ${authorLogin}`);
    return;
  }
  core.info(`Gate 2/3: author is ${authorLogin || '(unknown)'} — pass`);

  // Gate 4 & 5: check for duplicates and daily limit
  const since = get24hWindowStart().toISOString();
  const recentIssues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'open', since, per_page: 100
  });
  const recentCiFailIssues = recentIssues.filter(i => i.body && i.body.includes(marker));

  // Gate 4: check for duplicate issue for this commit SHA
  const existingIssue = recentCiFailIssues.find(i => i.body.includes(sha));
  if (existingIssue) {
    core.info(`Gate 4: issue already exists for ${shortSha} (#${existingIssue.number}) — skipping`);
    core.setOutput('eligible', 'false');
    core.setOutput('skip_reason', `duplicate issue #${existingIssue.number}`);
    return;
  }
  core.info('Gate 4: no duplicate issue found in last 24h — pass');

  // Gate 5: daily limit (max 3 issues per 24h)
  if (recentCiFailIssues.length >= 3) {
    core.info(`Gate 5: daily limit reached (${recentCiFailIssues.length}/3 in last 24h) — skipping`);
    core.setOutput('eligible', 'false');
    core.setOutput('skip_reason', `daily limit reached (${recentCiFailIssues.length}/3)`);
    return;
  }
  core.info(`Gate 5: ${recentCiFailIssues.length}/3 issues in last 24h — pass`);

  core.info('All gates passed — eligible to create issue');
  core.setOutput('eligible', 'true');
  core.setOutput('skip_reason', '');
  core.setOutput('commit_sha', sha);
  core.setOutput('run_url', run.html_url);
};
