const { execFileSync } = require('child_process');
const fs = require('fs');
const { openPr } = require('../shared/verified-commit.js');

const TYPES = new Set(['bug', 'chore', 'docs', 'ci', 'test', 'refactor', 'perf']);
const SIZES = new Set(['size:xs', 'size:s']);
const PRIORITIES = new Set(['priority:critical', 'priority:high', 'priority:medium', 'priority:low']);

function exactKeys(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) throw new Error(`${name} must contain exactly: ${expected.join(', ')}`);
}

function text(value, name, max) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) throw new Error(`${name} must be 1-${max} characters`);
  return value.trim();
}

module.exports = async ({ github, context, core }) => {
  const resultFile = process.env.RESULT_FILE || '.ai-output/next-steps.json';
  try {
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    if (result?.action === 'none') {
      exactKeys(result, ['action'], 'result');
      core.info('No next-step action requested.');
      core.setOutput('published', 'false');
      return;
    }

    if (result?.action === 'issue') {
      exactKeys(result, ['action', 'title', 'context', 'gap', 'approach', 'labels'], 'result');
      const title = text(result.title, 'title', 200);
      const type = title.match(/^([a-z]+): /)?.[1];
      if (!TYPES.has(type)) throw new Error('issue title must begin with an allowed type');
      if (!Array.isArray(result.labels) || result.labels.length !== 3) throw new Error('labels must contain exactly type, size, and priority labels');
      const labels = new Set(result.labels);
      if (!labels.has(`type:${type}`) || ![...labels].some(label => SIZES.has(label)) || ![...labels].some(label => PRIORITIES.has(label))) {
        throw new Error('labels must match the title type and allowed size/priority values');
      }
      if ([...labels].some(label => !label.startsWith('type:') && !SIZES.has(label) && !PRIORITIES.has(label))) throw new Error('labels contain an unsupported value');
      const body = [
        '## Context', text(result.context, 'context', 4000), '',
        '## Gap', text(result.gap, 'gap', 4000), '',
        '## Suggested approach', text(result.approach, 'approach', 4000),
      ].join('\n');
      const { data: issue } = await github.rest.issues.create({ ...context.repo, title, body, labels: ['ai:created', ...labels] });
      core.info(`Created next-step issue #${issue.number}.`);
      core.setOutput('published', 'true');
      core.setOutput('issue_number', String(issue.number));
      return;
    }

    exactKeys(result, ['action'], 'result');
    if (result.action !== 'pr') throw new Error('action must be none, issue, or pr');
    const patchFile = process.env.PATCH_FILE || '.ai-output/changes.patch';
    const prFile = process.env.PR_FILE || '.ai-output/next-steps-pr.md';
    if (!fs.existsSync(patchFile) || !fs.existsSync(prFile)) throw new Error('PR output requires changes.patch and next-steps-pr.md');
    if (fs.statSync(patchFile).size > 512 * 1024) throw new Error('changes.patch exceeds 512 KiB');
    execFileSync('git', ['apply', '--check', patchFile], { encoding: 'utf8' });
    execFileSync('git', ['apply', patchFile], { encoding: 'utf8' });
    const stats = execFileSync('git', ['diff', '--numstat'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    const lines = stats.reduce((sum, line) => sum + line.split('\t').slice(0, 2).reduce((n, value) => n + (Number(value) || 0), 0), 0);
    if (stats.length === 0 || stats.length > 6 || lines > 150) throw new Error('PR patch must change 1-6 files and at most 150 lines');
    const description = text(fs.readFileSync(prFile, 'utf8'), 'PR description', 12000);
    fs.writeFileSync('.claude-pr.md', description);
    await openPr({
      github, context, core,
      branch: process.env.PR_BRANCH,
      title: description.split('\n')[0].trim(),
      body: `${description.split('\n').slice(1).join('\n').trim()}\n\n> **AI Provenance** | Workflow: \`${process.env.WORKFLOW_NAME || ''}\` | [Run](${process.env.RUN_URL || ''}) | Event: \`${process.env.EVENT_NAME || ''}\` | Actor: \`${process.env.TRIGGER_ACTOR || ''}\``,
      extraExcludes: ['.ai-output', '.claude-pr.md'],
    });
    core.setOutput('published', 'true');
  } catch (error) {
    core.setFailed(`Invalid next-steps result: ${error.message}`);
  }
};
