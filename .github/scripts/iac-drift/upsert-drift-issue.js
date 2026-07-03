// Upsert (or close) the drift issue for one IaC working directory.
//
// Deterministic drift reporting for the _iac-drift reusable workflow. The plan
// step captured `tofu`/`terragrunt plan -detailed-exitcode`:
//   exit 0 -> in sync   (close any open drift issue for this workdir)
//   exit 2 -> drift      (open, or refresh, the drift issue)
//   exit 1 -> plan error (open, or refresh, a PLAN FAILURE issue)
//
// Dedupe key is a hidden marker `<!-- iac-drift:<workdir> -->` carried in the
// issue body, so exactly one open issue tracks each working directory. Issues
// carry the `iac-drift` label (auto-created on first use) so the lookup is a
// cheap labeled list, not a full-repo scan.
//
// Env: PLAN_EXIT_CODE, WORKDIR, PLAN_FILE, POST_PLAN_EXCERPT.
const fs = require('fs');

const LABEL = 'iac-drift';
const HEARTBEAT = '<!-- iac-drift-heartbeat -->';

module.exports = async ({ github, context, core }) => {
  const exitCode = String(process.env.PLAN_EXIT_CODE || '').trim();
  const workdir = process.env.WORKDIR || '.';
  const planFile = process.env.PLAN_FILE || '';
  const postExcerpt = String(process.env.POST_PLAN_EXCERPT || 'false').toLowerCase() === 'true';
  const { owner, repo } = context.repo;
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  const now = new Date().toISOString();
  const marker = `<!-- iac-drift:${workdir} -->`;

  // One open drift issue per workdir, found via the hidden body marker.
  const openIssues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'open', labels: LABEL, per_page: 100,
  });
  const existing = openIssues.find(
    (i) => !i.pull_request && (i.body || '').includes(marker),
  );

  // exit 0 = clean. Close the open drift issue (if any) and stop.
  if (exitCode === '0') {
    if (!existing) {
      core.info(`No drift in ${workdir}; no open issue to close.`);
      return;
    }
    await github.rest.issues.createComment({
      owner, repo, issue_number: existing.number,
      body: `Drift cleared as of ${now}. Plan is back in sync ([run](${runUrl})). Closing.`,
    });
    await github.rest.issues.update({
      owner, repo, issue_number: existing.number, state: 'closed',
    });
    core.info(`Closed drift issue #${existing.number} for ${workdir}.`);
    return;
  }

  // Non-zero: exit 2 = drift, anything else (1, etc.) = plan failure.
  const isDrift = exitCode === '2';
  const kind = isDrift ? 'drift detected' : 'PLAN FAILURE';
  const title = isDrift
    ? `IaC drift detected: ${repo} ${workdir}`
    : `IaC PLAN FAILURE: ${repo} ${workdir}`;

  let excerpt = '';
  if (postExcerpt && planFile) {
    try {
      const tail = fs.readFileSync(planFile, 'utf8').split('\n').slice(-60).join('\n');
      excerpt = `\n\n<details><summary>Plan excerpt (last 60 lines)</summary>\n\n\`\`\`\n${tail}\n\`\`\`\n\n</details>`;
    } catch (e) {
      core.info(`Could not read plan file ${planFile}: ${e.message}`);
    }
  }

  const body = [
    marker,
    `**Status:** ${kind}`,
    `**Working directory:** \`${workdir}\``,
    `**Last seen:** ${now}`,
    `**Run:** ${runUrl}`,
    '',
    isDrift
      ? 'The live infrastructure has drifted from the committed IaC. Reconcile by codifying the change into IaC, or revert it with an apply.'
      : 'The scheduled plan failed to run (exit 1). Investigate the workflow logs before trusting the drift signal.',
    excerpt,
  ].join('\n');

  if (!existing) {
    const { data } = await github.rest.issues.create({
      owner, repo, title, body, labels: [LABEL],
    });
    core.info(`Opened ${kind} issue #${data.number} for ${workdir}.`);
    return;
  }

  // Refresh in place — prefer editing the body's "Last seen" over stacking
  // comments; post at most one heartbeat comment per calendar day.
  await github.rest.issues.update({
    owner, repo, issue_number: existing.number, title, body,
  });

  const today = now.slice(0, 10);
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number: existing.number, per_page: 100,
  });
  const beatToday = comments.some(
    (c) => (c.body || '').includes(HEARTBEAT) && (c.created_at || '').slice(0, 10) === today,
  );
  if (!beatToday) {
    await github.rest.issues.createComment({
      owner, repo, issue_number: existing.number,
      body: `${HEARTBEAT}\nStill ${kind} as of ${now} ([run](${runUrl})).`,
    });
  }
  core.info(`Refreshed ${kind} issue #${existing.number} for ${workdir}.`);
};
