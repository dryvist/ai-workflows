// Commit Claude's working-tree changes to the PR branch via the GitHub
// `createCommitOnBranch` GraphQL mutation. The octokit passed in is authed with
// the JacobPEvans-claude App installation token, so the resulting commit is
// GitHub-VERIFIED (satisfies `required_signatures` rulesets), attributed to the
// bot, and re-triggers CI on the PR.
//
// This is the workflow_run-compatible replacement for claude-code-action's own
// `use_commit_signing`: that path can only target a branch when the trigger
// event carries PR context (pull_request/issue_comment), which workflow_run does
// not. Here we supply the branch (the failing PR's head) explicitly.
const { execFileSync } = require('child_process');
const fs = require('fs');

module.exports = async ({ github, context, core }) => {
  const branch = process.env.HEAD_BRANCH;
  const message = process.env.COMMIT_MESSAGE;
  if (!branch) {
    core.setFailed('HEAD_BRANCH env var is required');
    return;
  }

  const git = (args) => execFileSync('git', args, { encoding: 'utf8' });

  // Stage everything except the ai-workflows checkout that lives in the
  // consumer workspace (it must never be committed into the consumer repo).
  git(['add', '-A', '--', ':(exclude).ai-workflows']);

  const status = git(['diff', '--cached', '--name-status']).trim();
  if (!status) {
    core.info('Claude made no file changes — nothing to commit.');
    core.setOutput('committed', 'false');
    return;
  }

  const additions = [];
  const deletions = [];
  const stage = (p) => additions.push({ path: p, contents: fs.readFileSync(p).toString('base64') });
  // ponytail: --name-status quotes paths with spaces/special chars; the tab-split
  // below assumes plain paths. Switch to `-z` parsing if a consumer hits that.
  for (const line of status.split('\n')) {
    const parts = line.split('\t');
    const code = parts[0][0];
    if (code === 'D') {
      deletions.push({ path: parts[1] });
    } else if (code === 'R' || code === 'C') {
      if (code === 'R') deletions.push({ path: parts[1] });
      stage(parts[2]);
    } else {
      stage(parts[1]); // A (added) or M (modified)
    }
  }

  const expectedHeadOid = git(['rev-parse', 'HEAD']).trim();
  const { owner, repo } = context.repo;
  const result = await github.graphql(
    `mutation ($input: CreateCommitOnBranchInput!) {
       createCommitOnBranch(input: $input) { commit { oid url } }
     }`,
    {
      input: {
        branch: { repositoryNameWithOwner: `${owner}/${repo}`, branchName: branch },
        message: { headline: message },
        expectedHeadOid,
        fileChanges: { additions, deletions },
      },
    },
  );

  const commit = result.createCommitOnBranch.commit;
  core.info(`Committed ${additions.length} change(s), ${deletions.length} deletion(s) to ${branch}: ${commit.url}`);
  core.setOutput('committed', 'true');
  core.setOutput('commit_oid', commit.oid);
};
