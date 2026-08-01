// Open a PR from Claude's working-tree edits + a Claude-authored PR description.
//
// For write-workflows that aren't issue-driven (code-simplifier, next-steps,
// post-merge-*): Claude edits files and writes its PR title (first line) + body
// (rest) to a file (default `.claude-pr.md`). This step opens the PR via the
// shared verified-commit helper (App-token createCommitOnBranch → GitHub-VERIFIED)
// and excludes the PR-description file from the commit. No file → Claude declined,
// so no PR.
const fs = require('fs');
const { openPr } = require('./verified-commit.js');

module.exports = async ({ github, context, core }) => {
  const prFile = process.env.PR_FILE || '.claude-pr.md';
  const branch = process.env.PR_BRANCH;
  if (!branch) {
    core.setFailed('PR_BRANCH env var is required');
    return;
  }
  if (!fs.existsSync(prFile)) {
    core.info(`Claude wrote no ${prFile} — declined to open a PR.`);
    core.setOutput('opened', 'false');
    return;
  }

  const content = fs.readFileSync(prFile, 'utf8').trim();
  const nl = content.indexOf('\n');
  const title = (nl === -1 ? content : content.slice(0, nl)).trim();
  const body = nl === -1 ? '' : content.slice(nl + 1).trim();
  if (!title) {
    core.info(`${prFile} has no title line — declined to open a PR.`);
    core.setOutput('opened', 'false');
    return;
  }

  const provenance = `> **AI Provenance** | Workflow: \`${process.env.WORKFLOW_NAME || ''}\` | [Run](${process.env.RUN_URL || ''}) | Event: \`${process.env.EVENT_NAME || ''}\` | Actor: \`${process.env.TRIGGER_ACTOR || ''}\``;
  await openPr({
    github,
    context,
    core,
    branch,
    title,
    body: `${body}\n\n${provenance}`,
    extraExcludes: [prFile],
    draft: process.env.PR_DRAFT === 'true',
  });
};
