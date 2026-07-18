const fs = require('fs');

const SHAPES = {
  resolved: ['kind', 'issue_number', 'pr_number'],
  in_progress_pr: ['kind', 'issue_number', 'pr_number'],
  in_progress_branch: ['kind', 'issue_number', 'branch_name'],
  stale: ['kind', 'issue_number'],
};

function exactKeys(value, expected, where) {
  const keys = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(keys) !== JSON.stringify(wanted)) {
    throw new Error(`${where} must contain exactly: ${wanted.join(', ')}`);
  }
}

function parse(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  exactKeys(value, ['actions'], 'result');
  if (!Array.isArray(value.actions) || value.actions.length > 100) {
    throw new Error('actions must be an array with at most 100 entries');
  }
  const issues = new Set();
  for (const [index, action] of value.actions.entries()) {
    if (!action || !SHAPES[action.kind]) throw new Error(`actions[${index}].kind is invalid`);
    exactKeys(action, SHAPES[action.kind], `actions[${index}]`);
    if (!Number.isInteger(action.issue_number) || action.issue_number <= 0) {
      throw new Error(`actions[${index}].issue_number must be a positive integer`);
    }
    if (issues.has(action.issue_number)) throw new Error(`issue #${action.issue_number} has multiple actions`);
    issues.add(action.issue_number);
    if ('pr_number' in action && (!Number.isInteger(action.pr_number) || action.pr_number <= 0)) {
      throw new Error(`actions[${index}].pr_number must be a positive integer`);
    }
    if ('branch_name' in action && (typeof action.branch_name !== 'string' ||
        !/^[A-Za-z0-9._/-]{1,255}$/.test(action.branch_name) || action.branch_name.includes('..'))) {
      throw new Error(`actions[${index}].branch_name is invalid`);
    }
  }
  return value;
}

function body(action) {
  switch (action.kind) {
    case 'resolved': return `Resolved by #${action.pr_number}. Closing automatically.`;
    case 'in_progress_pr': return `In progress: PR #${action.pr_number} is open.`;
    case 'in_progress_branch': return `In progress: branch ${action.branch_name} exists.`;
    case 'stale': return 'This issue has had no activity for 30+ days. Is this still relevant?';
  }
}

module.exports = async ({ github, context, core }) => {
  const file = process.env.RESULT_FILE || '.issue-sweeper.json';
  try {
    const result = parse(file);
    for (const action of result.actions) {
      await github.rest.issues.createComment({
        ...context.repo,
        issue_number: action.issue_number,
        body: body(action),
      });
      if (action.kind === 'resolved') {
        await github.rest.issues.update({
          ...context.repo,
          issue_number: action.issue_number,
          state: 'closed',
          state_reason: 'completed',
        });
      }
    }
    core.info(`Published ${result.actions.length} issue sweep action(s)`);
  } catch (error) {
    core.setFailed(`Invalid issue sweeper result: ${error.message}`);
  }
};

module.exports.parse = parse;
module.exports.body = body;
