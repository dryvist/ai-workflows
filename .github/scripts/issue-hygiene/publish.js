const fs = require('fs');

const SHAPES = {
  duplicate: ['kind', 'issue_number', 'related_issue_number'],
  merged_pr: ['kind', 'issue_number', 'pr_number', 'pr_title'],
  wontfix: ['kind', 'issue_number', 'age_days'],
  combine: ['kind', 'issue_number', 'related_issue_number'],
};

function exactKeys(value, expected, where) {
  const keys = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(keys) !== JSON.stringify(wanted)) {
    throw new Error(`${where} must contain exactly: ${wanted.join(', ')}`);
  }
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
}

function parse(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  exactKeys(value, ['actions'], 'result');
  if (!Array.isArray(value.actions) || value.actions.length > 100) {
    throw new Error('actions must be an array with at most 100 entries');
  }
  const seen = new Set();
  for (const [index, action] of value.actions.entries()) {
    if (!action || !SHAPES[action.kind]) throw new Error(`actions[${index}].kind is invalid`);
    exactKeys(action, SHAPES[action.kind], `actions[${index}]`);
    positiveInteger(action.issue_number, `actions[${index}].issue_number`);
    if (action.kind === 'duplicate' || action.kind === 'combine') {
      positiveInteger(action.related_issue_number, `actions[${index}].related_issue_number`);
      if (action.related_issue_number === action.issue_number) {
        throw new Error(`actions[${index}] cannot reference the same issue`);
      }
    }
    if (action.kind === 'merged_pr') {
      positiveInteger(action.pr_number, `actions[${index}].pr_number`);
      if (typeof action.pr_title !== 'string' || action.pr_title.trim() !== action.pr_title ||
          action.pr_title.length === 0 || action.pr_title.length > 256 || /[\r\n]/.test(action.pr_title)) {
        throw new Error(`actions[${index}].pr_title is invalid`);
      }
    }
    if (action.kind === 'wontfix' &&
        (!Number.isInteger(action.age_days) || action.age_days < 90 || action.age_days > 10000)) {
      throw new Error(`actions[${index}].age_days must be between 90 and 10000`);
    }
    const key = `${action.kind}:${action.issue_number}:${action.related_issue_number || action.pr_number || ''}`;
    if (seen.has(key)) throw new Error(`actions[${index}] duplicates an earlier action`);
    seen.add(key);
  }
  return value;
}

function body(action) {
  switch (action.kind) {
    case 'duplicate':
      return `Possible duplicate of #${action.related_issue_number}. These issues appear to describe the same work. Consider closing one in favor of the other.`;
    case 'merged_pr':
      return `PR #${action.pr_number} (${action.pr_title}) was merged and references this issue but did not auto-close it. If this issue is resolved, it can be closed manually.`;
    case 'wontfix':
      return `This issue has been open for ${action.age_days} days with no linked work. Consider whether this is still in scope, or if it should be closed as wontfix.`;
    case 'combine':
      return `This issue and #${action.related_issue_number} could potentially be addressed together as a single effort.`;
  }
}

module.exports = async ({ github, context, core }) => {
  const file = process.env.RESULT_FILE || '.issue-hygiene.json';
  try {
    const result = parse(file);
    for (const action of result.actions) {
      await github.rest.issues.createComment({
        ...context.repo,
        issue_number: action.issue_number,
        body: body(action),
      });
    }
    core.info(`Published ${result.actions.length} issue hygiene comment(s)`);
  } catch (error) {
    core.setFailed(`Invalid issue hygiene result: ${error.message}`);
  }
};

module.exports.parse = parse;
module.exports.body = body;
