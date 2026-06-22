const { mock, describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { createMockCore, createMockContext } = require('./helpers.js');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = require('../.github/scripts/shared/pr-from-file.js');

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prfile-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@example.com']);
  git(dir, ['config', 'user.name', 'tester']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'init']);
  return dir;
}

function makeGithub() {
  return {
    graphql: mock(async () => ({ createCommitOnBranch: { commit: { oid: 'oid' } } })),
    rest: {
      git: { createRef: mock(async () => ({})) },
      pulls: { create: mock(async () => ({ data: { number: 55, html_url: 'https://x/pull/55' } })) },
    },
  };
}

async function runIn(dir, deps) {
  const prev = process.cwd();
  process.chdir(dir);
  try { await run(deps); } finally { process.chdir(prev); }
}

describe('pr-from-file', () => {
  let core, context, dir, github;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext();
    dir = initRepo();
    github = makeGithub();
    process.env.PR_BRANCH = 'claude/code-simplifier-123';
    process.env.BASE_BRANCH = 'main';
    delete process.env.PR_FILE;
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('opens a PR using the title/body Claude wrote, excluding the PR file', async () => {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\n'); // Claude's edit
    fs.writeFileSync(path.join(dir, '.claude-pr.md'), 'refactor: simplify a.txt\n\nCollapsed duplicate lines.');

    await runIn(dir, { github, context, core });

    const pr = github.rest.pulls.create.mock.calls[0][0];
    expect(pr.title).toBe('refactor: simplify a.txt');
    expect(pr.head).toBe('claude/code-simplifier-123');
    expect(pr.body).toContain('Collapsed duplicate lines.');
    expect(pr.body).toContain('AI Provenance');
    // the PR-description file must NOT be committed
    const committedPaths = github.graphql.mock.calls[0][1].input.fileChanges.additions.map((a) => a.path);
    expect(committedPaths).toContain('a.txt');
    expect(committedPaths).not.toContain('.claude-pr.md');
    expect(core.getOutput('opened')).toBe('true');
  });

  it('opens no PR when Claude wrote no description file (declined)', async () => {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\n');
    await runIn(dir, { github, context, core });
    expect(github.rest.pulls.create).not.toHaveBeenCalled();
    expect(core.getOutput('opened')).toBe('false');
  });
});
