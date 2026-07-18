const fs = require('fs');

const RISK_LABELS = ['risk:low', 'risk:medium', 'risk:high'];

module.exports = async ({ github, context, core }) => {
  const file = process.env.RISK_FILE || '.dep-review-risk.json';
  const prNumber = Number(process.env.PR_NUMBER);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    core.setFailed('PR_NUMBER must be a positive integer');
    return;
  }

  let verdict;
  try {
    verdict = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    core.setFailed(`Could not parse ${file}: ${error.message}`);
    return;
  }
  if (!verdict || Object.keys(verdict).length !== 1 || !['low', 'medium', 'high'].includes(verdict.risk)) {
    core.setFailed(`${file} must contain only a risk field set to low, medium, or high`);
    return;
  }

  const { owner, repo } = context.repo;
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: prNumber });
  const current = new Set((issue.labels || []).map((label) => typeof label === 'string' ? label : label.name));
  const selected = `risk:${verdict.risk}`;
  for (const label of RISK_LABELS) {
    if (label !== selected && current.has(label)) {
      await github.rest.issues.removeLabel({ owner, repo, issue_number: prNumber, name: label });
    }
  }
  if (!current.has(selected)) {
    await github.rest.issues.addLabels({ owner, repo, issue_number: prNumber, labels: [selected] });
  }
  core.setOutput('risk', verdict.risk);
};
