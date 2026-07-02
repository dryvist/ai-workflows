// Apply triage labels from Claude's backlog-sweep verdict file.
//
// Claude judged the oldest untriaged issues read-only and wrote `.backlog-sweep.json`
// (see prompts/issue-backlog-sweep.md). This step applies the labels with the App-token
// `github` client passed by the workflow: an App-token label fires `issues: labeled`,
// which the consumer's issue-auto-resolve.yml resolves through its full gate stack.
// Claude never labels directly — its GITHUB_TOKEN wouldn't fire the event, and it must
// not hold a write token while reading untrusted issue text. Labels are whitelisted to
// one type:/size:/priority: each (+ai:ready), so the untrusted verdict can't apply
// arbitrary labels. No audit comment: the issue timeline already records label changes.
const fs = require('fs');

const ALLOWED_PREFIXES = ['type:', 'size:', 'priority:'];

module.exports = async ({ github, context, core }) => {
  const file = process.env.BACKLOG_FILE || '.backlog-sweep.json';
  if (!fs.existsSync(file)) {
    core.info(`No ${file} — Claude found no untriaged backlog issues.`);
    core.setOutput('labeled_count', '0');
    return;
  }

  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(file, 'utf8'))?.issues;
  } catch (e) {
    core.setFailed(`Could not parse ${file}: ${e.message}`);
    return;
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    core.info('Verdict file lists no issues — nothing to label.');
    core.setOutput('labeled_count', '0');
    return;
  }

  // Robust cap: a negative MAX_ISSUES would make slice(0, n) count from the end
  // (bypassing the cap), and a non-numeric value yields NaN — fall back to 5.
  const parsedMax = parseInt(process.env.MAX_ISSUES, 10);
  const maxIssues = Number.isInteger(parsedMax) && parsedMax >= 0 ? parsedMax : 5;
  let labeledCount = 0;

  for (const entry of entries.slice(0, maxIssues)) {
    const number = Number(entry?.number);
    if (!Number.isInteger(number) || number <= 0) continue;

    // Whitelist: at most one type:/size:/priority: label (first wins), +ai:ready.
    const byPrefix = new Map();
    for (const raw of (Array.isArray(entry?.labels) ? entry.labels : [])) {
      if (typeof raw !== 'string') continue;
      const l = raw.trim().toLowerCase();
      const prefix = ALLOWED_PREFIXES.find(p => l.startsWith(p));
      if (prefix && !byPrefix.has(prefix)) byPrefix.set(prefix, l);
    }
    const labels = [...byPrefix.values()];
    if (entry?.ai_ready === true) labels.push('ai:ready');
    if (labels.length === 0) continue;

    try {
      await github.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: number,
        labels,
      });
      labeledCount += 1;
      core.info(`Issue #${number}: applied ${labels.join(', ')}`);
    } catch (e) {
      core.info(`Issue #${number}: addLabels failed (${e.message})`);
    }
  }

  core.info(`Backlog sweep: labeled ${labeledCount} issue(s).`);
  core.setOutput('labeled_count', String(labeledCount));
};
