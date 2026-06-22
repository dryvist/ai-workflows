// Verified Commit & PR helper — the ONE way every write-workflow lands changes.
//
// Why this exists: claude-code-action's native commit path (`use_commit_signing`)
// only targets a branch when the TRIGGER event carries PR context
// (pull_request / issue_comment). Our write-workflows fire on workflow_run,
// issues, schedule, and workflow_dispatch — none of which give it a branch — and
// dryvist's org-wide `required_signatures` ruleset rejects unsigned pushes. So
// Claude only EDITS files (use_commit_signing: false), and these helpers commit
// the working-tree diff through the GitHub `createCommitOnBranch` GraphQL mutation
// using the JacobPEvans-claude App token. Those commits are GitHub-VERIFIED
// (satisfy required_signatures), attributed to the bot, and re-trigger CI.
//
// Two shapes:
//   commitToBranch — commit the diff onto an EXISTING branch (e.g. cc-ci-fix).
//   openPr         — create a NEW branch, commit the diff, open a PR (resolver,
//                    code-simplifier, next-steps, post-merge-*).
const { execFileSync } = require('child_process');
const fs = require('fs');

const git = (args) => execFileSync('git', args, { encoding: 'utf8' });

// Stage all working-tree changes except the ai-workflows checkout (and any extra
// excludes, e.g. a Claude-authored PR-body file) and return GraphQL fileChanges,
// or null when there is nothing to commit.
// ponytail: --name-status quotes paths with spaces; tab-split assumes plain paths.
function stageChanges(extraExcludes = []) {
  const excludes = ['.ai-workflows', ...extraExcludes].map((p) => `:(exclude)${p}`);
  git(['add', '-A', '--', ...excludes]);
  const status = git(['diff', '--cached', '--name-status']).trim();
  if (!status) return null;

  const additions = [];
  const deletions = [];
  const stage = (p) => additions.push({ path: p, contents: fs.readFileSync(p).toString('base64') });
  for (const line of status.split('\n')) {
    const parts = line.split('\t');
    const code = parts[0][0];
    if (code === 'D') deletions.push({ path: parts[1] });
    else if (code === 'R' || code === 'C') { if (code === 'R') deletions.push({ path: parts[1] }); stage(parts[2]); }
    else stage(parts[1]); // A or M
  }
  return { additions, deletions };
}

async function createCommitOnBranch(github, repoWithOwner, branch, headline, expectedHeadOid, fileChanges) {
  const res = await github.graphql(
    `mutation ($input: CreateCommitOnBranchInput!) {
       createCommitOnBranch(input: $input) { commit { oid url } }
     }`,
    { input: { branch: { repositoryNameWithOwner: repoWithOwner, branchName: branch }, message: { headline }, expectedHeadOid, fileChanges } },
  );
  return res.createCommitOnBranch.commit;
}

// Shape 1: commit the working-tree diff onto an existing branch.
async function commitToBranch({ github, context, core, branch, message, extraExcludes }) {
  if (!branch) { core.setFailed('commitToBranch: branch is required'); return { committed: false }; }
  const changes = stageChanges(extraExcludes);
  if (!changes) { core.info('No file changes — nothing to commit.'); core.setOutput('committed', 'false'); return { committed: false }; }
  const { owner, repo } = context.repo;
  const commit = await createCommitOnBranch(github, `${owner}/${repo}`, branch, message, git(['rev-parse', 'HEAD']).trim(), changes);
  core.info(`Committed ${changes.additions.length} change(s), ${changes.deletions.length} deletion(s) to ${branch}: ${commit.url}`);
  core.setOutput('committed', 'true');
  core.setOutput('commit_oid', commit.oid);
  return { committed: true, commit };
}

// Shape 2: create a new branch off the checked-out HEAD, verified-commit the diff,
// and open a PR. Returns { opened, pr } (opened: false when there were no changes).
async function openPr({ github, context, core, branch, title, body, baseBranch, extraExcludes }) {
  if (!branch || !title) { core.setFailed('openPr: branch and title are required'); return { opened: false }; }
  const { owner, repo } = context.repo;
  const base = baseBranch || context.payload.repository?.default_branch || 'main';
  const changes = stageChanges(extraExcludes);
  if (!changes) { core.info('No file changes — no PR to open.'); core.setOutput('opened', 'false'); return { opened: false }; }

  const baseOid = git(['rev-parse', 'HEAD']).trim();
  try {
    await github.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseOid });
  } catch (e) {
    if (e.status === 422) core.info(`Branch ${branch} already exists — reusing.`);
    else throw e;
  }
  await createCommitOnBranch(github, `${owner}/${repo}`, branch, title, baseOid, changes);
  const { data: pr } = await github.rest.pulls.create({ owner, repo, head: branch, base, title, body });
  core.info(`Opened PR #${pr.number} (${changes.additions.length} change(s)) from ${branch}: ${pr.html_url}`);
  core.setOutput('opened', 'true');
  core.setOutput('pr_number', String(pr.number));
  return { opened: true, pr };
}

module.exports = { stageChanges, commitToBranch, openPr };
