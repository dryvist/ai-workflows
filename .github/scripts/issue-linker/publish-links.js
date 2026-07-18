const fs = require('fs');

function exactKeys(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) throw new Error(`${name} must contain exactly: ${expected.join(', ')}`);
}

module.exports = async ({ github, context, core }) => {
  const file = process.env.RESULT_FILE || '.ai-output/issue-linker.json';
  try {
    const result = JSON.parse(fs.readFileSync(file, 'utf8'));
    exactKeys(result, ['mode', 'pr_number', 'issues'], 'result');
    const expectedMode = process.env.MODE;
    const expectedPr = Number(process.env.PR_NUMBER);
    if (!['opened', 'merged'].includes(result.mode) || result.mode !== expectedMode) throw new Error('mode does not match the eligible event');
    if (!Number.isInteger(result.pr_number) || result.pr_number !== expectedPr) throw new Error('pr_number does not match the eligible event');
    if (!Array.isArray(result.issues) || result.issues.length > 10) throw new Error('issues must contain at most 10 entries');
    const seen = new Set();
    const issues = result.issues.map((item, index) => {
      const keys = item?.classification === 'related' ? ['number', 'classification', 'remaining_work'] : ['number', 'classification'];
      exactKeys(item, keys, `issues[${index}]`);
      if (!Number.isInteger(item.number) || item.number <= 0 || seen.has(item.number)) throw new Error(`issues[${index}].number is invalid or duplicated`);
      seen.add(item.number);
      if (!['resolved', 'related'].includes(item.classification)) throw new Error(`issues[${index}].classification is invalid`);
      if (item.classification === 'related' && (typeof item.remaining_work !== 'string' || item.remaining_work.trim() === '' || item.remaining_work.length > 2000)) {
        throw new Error(`issues[${index}].remaining_work must be 1-2000 characters`);
      }
      return item;
    });

    const { owner, repo } = context.repo;
    const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: expectedPr });
    if (result.mode === 'opened' && pr.state !== 'open') throw new Error('opened mode requires an open PR');
    if (result.mode === 'merged' && !pr.merged_at) throw new Error('merged mode requires a merged PR');
    const issueMetadata = new Map();
    for (const item of issues) {
      const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: item.number });
      if (issue.pull_request) throw new Error(`#${item.number} is a pull request, not an issue`);
      issueMetadata.set(item.number, issue);
    }
    const resolved = issues.filter(item => item.classification === 'resolved');
    if (result.mode === 'opened' && resolved.length > 0) {
      const missing = resolved.filter(item => !new RegExp(`(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#${item.number}\\b`, 'i').test(pr.body || ''));
      if (missing.length > 0) {
        const section = `## Related Issues\n${missing.map(item => `Closes #${item.number}`).join('\n')}`;
        await github.rest.pulls.update({ owner, repo, pull_number: expectedPr, body: `${pr.body || ''}\n\n${section}`.trim() });
      }
    }

    for (const item of issues) {
      if (result.mode === 'opened' && item.classification === 'resolved') {
        const marker = '<!-- issue-linker-opened -->';
        const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: item.number, per_page: 100 });
        if (!comments.some(comment => comment.body?.includes(marker))) {
          await github.rest.issues.createComment({ owner, repo, issue_number: item.number, body: `This issue is being addressed in #${expectedPr}.\n\n${marker}` });
        }
      } else if (result.mode === 'opened') {
        const marker = `<!-- issue-linker-review #${item.number} -->`;
        const reviews = await github.paginate(github.rest.pulls.listReviews, { owner, repo, pull_number: expectedPr, per_page: 100 });
        if (!reviews.some(review => review.body?.includes(marker))) {
          await github.rest.pulls.createReview({ owner, repo, pull_number: expectedPr, event: 'REQUEST_CHANGES', body: `Issue #${item.number} is related but not fully resolved. Remaining work: ${item.remaining_work.trim()}\n\n${marker}` });
        }
      } else if (item.classification === 'resolved') {
        const issue = issueMetadata.get(item.number);
        if (issue.state !== 'closed') {
          await github.rest.issues.createComment({ owner, repo, issue_number: item.number, body: `Resolved by #${expectedPr}.` });
          await github.rest.issues.update({ owner, repo, issue_number: item.number, state: 'closed', state_reason: 'completed' });
        }
      } else {
        const marker = '<!-- issue-linker-merged -->';
        const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: item.number, per_page: 100 });
        if (!comments.some(comment => comment.body?.includes(marker))) {
          await github.rest.issues.createComment({ owner, repo, issue_number: item.number, body: `PR #${expectedPr} addressed part of this. Remaining work: ${item.remaining_work.trim()}\n\n${marker}` });
        }
      }
    }
    core.setOutput('published_count', String(issues.length));
  } catch (error) {
    core.setFailed(`Invalid issue-linker result: ${error.message}`);
  }
};
