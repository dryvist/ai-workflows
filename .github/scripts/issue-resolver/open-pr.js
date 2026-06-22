// Open a PR resolving an issue from Claude's working-tree edits. Composes a
// conventional title/branch from the issue's type label, then delegates to the
// shared verified-commit helper (App-token createCommitOnBranch → GitHub-VERIFIED,
// satisfies required_signatures) and comments the PR link on the issue.
// See shared/verified-commit.js and docs/PATTERNS.md "Verified Commit & PR Pattern".
const { openPr } = require('../shared/verified-commit.js');

const TYPE_PREFIX = {
  'type:bug': 'fix',
  'type:chore': 'chore',
  'type:docs': 'docs',
  'type:ci': 'ci',
  'type:test': 'test',
  'type:refactor': 'refactor',
  'type:perf': 'perf',
};

module.exports = async ({ github, context, core }) => {
  const issueNumber = parseInt(process.env.ISSUE_NUMBER || '0', 10);
  const issueTitle = process.env.ISSUE_TITLE || `issue ${issueNumber}`;
  const labels = (process.env.ISSUE_LABELS || '').split(',').map((l) => l.trim());
  const { owner, repo } = context.repo;
  if (!issueNumber) {
    core.setFailed('ISSUE_NUMBER env var is required');
    return;
  }

  const comment = (body) =>
    github.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body: `<!-- claude-issue-resolver-attempt -->\n${body}` });

  // Conventional title "<type>: <desc> (#N)" — strip any existing "word:" prefix.
  const prefix = TYPE_PREFIX[labels.find((l) => l.startsWith('type:'))] || 'fix';
  const desc = issueTitle.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '').trim();
  const title = `${prefix}: ${desc} (#${issueNumber})`;
  const branch = `${prefix}/issue-${issueNumber}`;
  const provenance = `> **AI Provenance** | Workflow: \`${process.env.WORKFLOW_NAME || ''}\` | [Run](${process.env.RUN_URL || ''}) | Event: \`${process.env.EVENT_NAME || ''}\` | Actor: \`${process.env.TRIGGER_ACTOR || ''}\``;
  const body = `Closes #${issueNumber}\n\n## Summary\n\nAutomated resolution of issue #${issueNumber}: ${desc}.\n\n${provenance}`;

  const { opened, pr } = await openPr({
    github,
    context,
    core,
    branch,
    title,
    body,
    baseBranch: process.env.BASE_BRANCH,
  });

  await comment(
    opened
      ? `Opened PR #${pr.number} to resolve this issue: ${pr.html_url}`
      : 'Auto-resolution produced no code changes — this issue needs manual attention.',
  );
};
