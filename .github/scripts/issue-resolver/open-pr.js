// Open a PR resolving an issue from Claude's working-tree edits.
//
// Claude (run with use_commit_signing: false) only edits files — it has no
// reliable, signature-satisfying way to land a branch + PR itself from an
// `issues` event. This step does it deterministically: create a new branch, commit
// the working-tree diff via the GitHub `createCommitOnBranch` GraphQL mutation
// (App-token → GitHub-VERIFIED, satisfies `required_signatures`), open the PR, and
// comment the link on the issue. Same verified-commit mechanism as
// ci-fix/commit-fix.js.
const { execFileSync } = require('child_process');
const fs = require('fs');

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
  const baseBranch = process.env.BASE_BRANCH || context.payload.repository?.default_branch || 'main';

  if (!issueNumber) {
    core.setFailed('ISSUE_NUMBER env var is required');
    return;
  }

  const git = (args) => execFileSync('git', args, { encoding: 'utf8' });
  git(['add', '-A', '--', ':(exclude).ai-workflows']);
  const status = git(['diff', '--cached', '--name-status']).trim();

  const comment = (body) =>
    github.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body: `<!-- claude-issue-resolver-attempt -->\n${body}` });

  if (!status) {
    core.info('Claude produced no file changes — no PR to open.');
    await comment('Auto-resolution produced no code changes — this issue needs manual attention.');
    core.setOutput('opened', 'false');
    return;
  }

  const additions = [];
  const deletions = [];
  const stage = (p) => additions.push({ path: p, contents: fs.readFileSync(p).toString('base64') });
  // ponytail: --name-status quotes paths with spaces; tab-split assumes plain paths.
  for (const line of status.split('\n')) {
    const parts = line.split('\t');
    const code = parts[0][0];
    if (code === 'D') deletions.push({ path: parts[1] });
    else if (code === 'R' || code === 'C') { if (code === 'R') deletions.push({ path: parts[1] }); stage(parts[2]); }
    else stage(parts[1]);
  }

  // Conventional title: "<type>: <desc> (#N)". Strip an existing "word:" prefix
  // from the issue title so we don't double up.
  const typeLabel = labels.find((l) => l.startsWith('type:'));
  const prefix = TYPE_PREFIX[typeLabel] || 'fix';
  const desc = issueTitle.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '').trim();
  const title = `${prefix}: ${desc} (#${issueNumber})`;
  const branch = `${prefix}/issue-${issueNumber}`;

  const provenance = `> **AI Provenance** | Workflow: \`${process.env.WORKFLOW_NAME || ''}\` | [Run](${process.env.RUN_URL || ''}) | Event: \`${process.env.EVENT_NAME || ''}\` | Actor: \`${process.env.TRIGGER_ACTOR || ''}\``;
  const prBody = `Closes #${issueNumber}\n\n## Summary\n\nAutomated resolution of issue #${issueNumber}: ${desc}.\n\n${provenance}`;

  // Branch off the base tip (the checked-out HEAD == default branch).
  const baseOid = git(['rev-parse', 'HEAD']).trim();
  try {
    await github.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseOid });
  } catch (e) {
    if (e.status === 422) core.info(`Branch ${branch} already exists — reusing.`);
    else throw e;
  }

  await github.graphql(
    `mutation ($input: CreateCommitOnBranchInput!) {
       createCommitOnBranch(input: $input) { commit { oid } }
     }`,
    {
      input: {
        branch: { repositoryNameWithOwner: `${owner}/${repo}`, branchName: branch },
        message: { headline: title },
        expectedHeadOid: baseOid,
        fileChanges: { additions, deletions },
      },
    },
  );

  const { data: pr } = await github.rest.pulls.create({ owner, repo, head: branch, base: baseBranch, title, body: prBody });
  await comment(`Opened PR #${pr.number} to resolve this issue: ${pr.html_url}`);

  core.info(`Opened PR #${pr.number} (${additions.length} change(s)) from ${branch}: ${pr.html_url}`);
  core.setOutput('opened', 'true');
  core.setOutput('pr_number', String(pr.number));
};
