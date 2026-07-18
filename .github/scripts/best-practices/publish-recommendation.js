const fs = require('fs');

const AREAS = new Set(['CI/CD Patterns', 'Security Practices', 'Documentation Standards', 'Code Organization', 'Dependency Management']);
const IMPACTS = new Set(['Low', 'Medium', 'High']);

function exactKeys(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    throw new Error(`${name} must contain exactly: ${expected.join(', ')}`);
  }
}

function text(value, name, max) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) throw new Error(`${name} must be 1-${max} characters`);
  return value.trim();
}

module.exports = async ({ github, context, core }) => {
  const file = process.env.RESULT_FILE || '.ai-output/best-practices.json';
  try {
    const result = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (result?.action === 'none') {
      exactKeys(result, ['action'], 'result');
      core.info('No recommendation issue requested.');
      core.setOutput('created', 'false');
      return;
    }

    exactKeys(result, ['action', 'date', 'recommendations'], 'result');
    if (result.action !== 'create_issue') throw new Error('action must be none or create_issue');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result.date)) throw new Error('date must use YYYY-MM-DD');
    if (!Array.isArray(result.recommendations) || result.recommendations.length < 3 || result.recommendations.length > 5) {
      throw new Error('recommendations must contain 3-5 entries');
    }

    const recommendations = result.recommendations.map((item, index) => {
      exactKeys(item, ['area', 'finding', 'recommendation', 'impact'], `recommendations[${index}]`);
      if (!AREAS.has(item.area)) throw new Error(`recommendations[${index}].area is not allowed`);
      if (!IMPACTS.has(item.impact)) throw new Error(`recommendations[${index}].impact is not allowed`);
      return {
        area: item.area,
        finding: text(item.finding, `recommendations[${index}].finding`, 2000),
        recommendation: text(item.recommendation, `recommendations[${index}].recommendation`, 2000),
        impact: item.impact,
      };
    });

    const title = `chore: best practices recommendations — ${result.date}`;
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: openIssues } = await github.rest.issues.listForRepo({
      ...context.repo, state: 'open', since, per_page: 100,
    });
    if (openIssues.some(issue => !issue.pull_request && /best practices recommendations/i.test(issue.title))) {
      core.info('A recent open best-practices issue already exists.');
      core.setOutput('created', 'false');
      return;
    }

    const body = recommendations.map((item, index) => [
      `## ${index + 1}. ${item.area}`,
      '',
      `- **Finding:** ${item.finding}`,
      `- **Recommendation:** ${item.recommendation}`,
      `- **Impact:** ${item.impact}`,
    ].join('\n')).join('\n\n');
    const { data: issue } = await github.rest.issues.create({
      ...context.repo, title, body, labels: ['type:chore'],
    });
    core.info(`Created best-practices issue #${issue.number}.`);
    core.setOutput('created', 'true');
    core.setOutput('issue_number', String(issue.number));
  } catch (error) {
    core.setFailed(`Invalid best-practices result: ${error.message}`);
  }
};
