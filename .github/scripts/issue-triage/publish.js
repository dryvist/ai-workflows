const fs = require('fs');

const TYPES = new Set([
  'type:bug', 'type:feature', 'type:docs', 'type:chore', 'type:ci',
  'type:test', 'type:refactor', 'type:perf', 'type:breaking',
]);
const SIZES = new Set(['size:xs', 'size:s', 'size:m', 'size:l', 'size:xl']);
const PRIORITIES = new Set([
  'priority:critical', 'priority:high', 'priority:medium', 'priority:low',
]);
const OPTIONAL = new Set(['duplicate', 'ai:ready']);
const AI_READY_TYPES = new Set([
  'type:bug', 'type:docs', 'type:chore', 'type:ci', 'type:test',
  'type:refactor', 'type:perf',
]);

function exactKeys(value, expected, where) {
  const keys = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(keys) !== JSON.stringify(wanted)) {
    throw new Error(`${where} must contain exactly: ${wanted.join(', ')}`);
  }
}

function parse(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  exactKeys(value, ['issue_number', 'labels', 'comment'], 'result');

  if (!Number.isInteger(value.issue_number) || value.issue_number <= 0) {
    throw new Error('issue_number must be a positive integer');
  }
  const expected = Number(process.env.EXPECTED_ISSUE_NUMBER || 0);
  if (expected > 0 && value.issue_number !== expected) {
    throw new Error(`issue_number must equal requested issue #${expected}`);
  }
  if (!Array.isArray(value.labels) || new Set(value.labels).size !== value.labels.length) {
    throw new Error('labels must be a duplicate-free array');
  }
  if (value.labels.some(label => typeof label !== 'string' ||
      !(TYPES.has(label) || SIZES.has(label) || PRIORITIES.has(label) || OPTIONAL.has(label)))) {
    throw new Error('labels contains a value outside the triage allowlist');
  }
  const typeLabels = value.labels.filter(label => TYPES.has(label));
  if (typeLabels.length !== 1 || value.labels.filter(label => SIZES.has(label)).length !== 1 ||
      value.labels.filter(label => PRIORITIES.has(label)).length !== 1) {
    throw new Error('labels must contain exactly one type, size, and priority');
  }
  if (value.labels.includes('ai:ready') &&
      (!AI_READY_TYPES.has(typeLabels[0]) || value.labels.includes('duplicate'))) {
    throw new Error('ai:ready is not allowed for this type or a duplicate');
  }
  if (typeof value.comment !== 'string') {
    throw new Error('comment must be a string');
  }
  value.comment = value.comment.trim();
  if (value.comment.length === 0 || value.comment.length > 1200 ||
      value.comment.split(/\s+/).length > 200) {
    throw new Error('comment must be a non-empty response of at most 200 words');
  }
  return value;
}

module.exports = async ({ github, context, core }) => {
  const file = process.env.RESULT_FILE || '.issue-triage.json';
  try {
    const result = parse(file);
    await github.rest.issues.addLabels({
      ...context.repo,
      issue_number: result.issue_number,
      labels: result.labels,
    });
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: result.issue_number,
      body: result.comment,
    });
    core.info(`Published triage for issue #${result.issue_number}`);
  } catch (error) {
    core.setFailed(`Invalid issue triage result: ${error.message}`);
  }
};

module.exports.parse = parse;
