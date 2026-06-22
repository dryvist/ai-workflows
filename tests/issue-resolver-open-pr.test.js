const { mock, describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { createMockCore, createMockContext } = require('./helpers.js');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = require('../.github/scripts/issue-resolver/open-pr.js');

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpr-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@example.com']);
  git(dir, ['config', 'user.name', 'tester']);
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'init']);
  return dir;
}

function makeGithub() {
  return {
    graphql: mock(async () => ({ createCommitOnBranch: { commit: { oid: 'newoid' } } })),
    rest: {
      git: { createRef: mock(async () => ({})) },
      pulls: { create: mock(async () => ({ data: { number: 42, html_url: 'https://x/pull/42' } })) },
      issues: { createComment: mock(async () => ({})) },
    },
  };
}

async function runIn(dir, deps) {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    await run(deps);
  } finally {
    process.chdir(prev);
  }
}

describe('open-pr', () => {
  let core, context, dir;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext();
    dir = initRepo();
    process.env.ISSUE_NUMBER = '7';
    process.env.ISSUE_TITLE = 'broken thing needs fixing';
    process.env.ISSUE_LABELS = 'type:bug, size:s, ai:ready';
    process.env.BASE_BRANCH = 'main';
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates branch + verified commit + PR + issue comment from Claude edits', async () => {
    fs.writeFileSync(path.join(dir, 'README.md'), '# repo\nfixed\n');
    const github = makeGithub();

    await runIn(dir, { github, context, core });

    // branch named by type prefix + issue number
    expect(github.rest.git.createRef.mock.calls[0][0].ref).toBe('refs/heads/fix/issue-7');
    // verified commit via createCommitOnBranch on that branch
    const input = github.graphql.mock.calls[0][1].input;
    expect(input.branch.branchName).toBe('fix/issue-7');
    expect(input.fileChanges.additions.map((a) => a.path)).toEqual(['README.md']);
    // conventional PR title + Closes link
    const pr = github.rest.pulls.create.mock.calls[0][0];
    expect(pr.title).toBe('fix: broken thing needs fixing (#7)');
    expect(pr.head).toBe('fix/issue-7');
    expect(pr.base).toBe('main');
    expect(pr.body).toContain('Closes #7');
    // issue comment links the PR
    expect(github.rest.issues.createComment.mock.calls[0][0].body).toContain('#42');
    expect(core.getOutput('opened')).toBe('true');
    expect(core.getOutput('pr_number')).toBe('42');
  });

  it('derives the type prefix from the label (docs)', async () => {
    process.env.ISSUE_LABELS = 'type:docs, size:xs, ai:ready';
    fs.writeFileSync(path.join(dir, 'README.md'), '# repo\ndocs\n');
    const github = makeGithub();

    await runIn(dir, { github, context, core });

    expect(github.rest.git.createRef.mock.calls[0][0].ref).toBe('refs/heads/docs/issue-7');
    expect(github.rest.pulls.create.mock.calls[0][0].title).toBe('docs: broken thing needs fixing (#7)');
  });

  it('opens no PR and comments when Claude made no edits', async () => {
    const github = makeGithub();

    await runIn(dir, { github, context, core });

    expect(github.rest.pulls.create).not.toHaveBeenCalled();
    expect(github.graphql).not.toHaveBeenCalled();
    expect(github.rest.issues.createComment.mock.calls[0][0].body).toContain('no code changes');
    expect(core.getOutput('opened')).toBe('false');
  });
});
