// Apply triage labels from Claude's backlog-sweep verdict file.
//
// Claude judged the oldest untriaged issues read-only and wrote `.backlog-sweep.json`
// (see prompts/issue-backlog-sweep.md). This step applies the labels using the
// App-token `github` client passed by the workflow. Applying `ai:ready` via an App
// token fires `issues: labeled`, which the consumer's issue-auto-resolve.yml resolves
// through its full gate stack. addLabels only ADDS — existing labels are untouched.
//
// Labels are whitelisted to type:/size:/priority: (plus ai:ready when ai_ready is
// true): Claude's verdict is untrusted input, so it cannot apply arbitrary labels.
const fs = require('fs');

const ALLOWED_PREFIXES = ['type:', 'size:', 'priority:'];
const MARKER = '<!-- claude-backlog-sweep -->';

module.exports = async ({ github, context, core }) => {
  const file = process.env.BACKLOG_FILE || '.backlog-sweep.json';
  if (!fs.existsSync(file)) {
    core.info(`No ${file} — Claude found no untriaged backlog issues.`);
    core.setOutput('labeled_count', '0');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    core.setFailed(`Could not parse ${file}: ${e.message}`);
    return;
  }

  const entries = Array.isArray(parsed?.issues) ? parsed.issues : [];
  if (entries.length === 0) {
    core.info('Verdict file lists no issues — nothing to label.');
    core.setOutput('labeled_count', '0');
    return;
  }

  const maxIssues = parseInt(process.env.MAX_ISSUES || '5', 10);
  const runUrl = process.env.RUN_URL || '';
  let labeledCount = 0;
  let aiReadyCount = 0;

  for (const entry of entries.slice(0, maxIssues)) {
    const number = Number(entry?.number);
    if (!Number.isInteger(number) || number <= 0) {
      core.info(`Skipping entry with invalid issue number: ${JSON.stringify(entry?.number)}`);
      continue;
    }

    // Whitelist: keep only type:/size:/priority: labels; drop anything else.
    const rawLabels = Array.isArray(entry?.labels) ? entry.labels : [];
    const labels = rawLabels
      .filter(l => typeof l === 'string')
      .map(l => l.trim().toLowerCase())
      .filter(l => ALLOWED_PREFIXES.some(p => l.startsWith(p)));

    if (entry?.ai_ready === true) {
      labels.push('ai:ready');
    }

    if (labels.length === 0) {
      core.info(`Issue #${number}: no valid labels in verdict — skipping.`);
      continue;
    }

    const unique = [...new Set(labels)];
    try {
      await github.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: number,
        labels: unique,
      });
    } catch (e) {
      core.info(`Issue #${number}: addLabels failed (${e.message}) — skipping comment.`);
      continue;
    }

    labeledCount += 1;
    if (unique.includes('ai:ready')) aiReadyCount += 1;

    const reason = typeof entry?.reason === 'string' ? entry.reason.slice(0, 300) : '';
    const body = [
      `${MARKER}`,
      `**Backlog sweep triage.** Applied: ${unique.map(l => `\`${l}\``).join(', ')}.`,
      reason ? `\n${reason}` : '',
      unique.includes('ai:ready')
        ? `\n\n\`ai:ready\` applied — autonomous resolution will be attempted.`
        : '',
      runUrl ? `\n\n> [Sweep run](${runUrl})` : '',
    ].join('');
    try {
      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: number,
        body,
      });
    } catch (e) {
      core.info(`Issue #${number}: comment failed (${e.message}) — labels still applied.`);
    }

    core.info(`Issue #${number}: applied ${unique.join(', ')}`);
  }

  core.info(`Backlog sweep: labeled ${labeledCount} issue(s), ${aiReadyCount} marked ai:ready.`);
  core.setOutput('labeled_count', String(labeledCount));
  core.setOutput('ai_ready_count', String(aiReadyCount));
};
