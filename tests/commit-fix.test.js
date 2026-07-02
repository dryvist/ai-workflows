const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const { createMockCore, createMockContext } = require('./helpers.js');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = require('../.github/scripts/ci-fix/commit-fix.js');

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commitfix-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@example.com']);
  git(dir, ['config', 'user.name', 'tester']);
  fs.writeFileSync(path.join(dir, 'main.tf'), 'orig\n');
  fs.writeFileSync(path.join(dir, 'old.tf'), 'gone\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'init']);
  return dir;
}

function makeGithub(commit = { oid: 'newoid', url: 'https://x/commit/newoid' }) {
  return { graphql: mock(async () => ({ createCommitOnBranch: { commit } })) };
}

// Run the script with cwd pointed at the temp repo, restoring cwd afterwards.
async function runIn(dir, deps) {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    await run(deps);
  } finally {
    process.chdir(prev);
  }
}

describe('commit-fix', () => {
  let core, context, dir;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext();
    dir = initRepo();
    process.env.HEAD_BRANCH = 'feat/x';
    process.env.COMMIT_MESSAGE = 'fix: resolve CI failure (auto-fix attempt 1)';
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('commits modified + added files via createCommitOnBranch', async () => {
    fs.writeFileSync(path.join(dir, 'main.tf'), 'fixed\n'); // modify
    fs.writeFileSync(path.join(dir, 'vars.tf'), 'new\n'); // add
    const github = makeGithub();

    await runIn(dir, { github, context, core });

    expect(github.graphql).toHaveBeenCalledTimes(1);
    const input = github.graphql.mock.calls[0][1].input;
    expect(input.branch).toEqual({ repositoryNameWithOwner: 'test-owner/test-repo', branchName: 'feat/x' });
    expect(input.expectedHeadOid).toBe(git(dir, ['rev-parse', 'HEAD']).trim());
    const adds = Object.fromEntries(input.fileChanges.additions.map((a) => [a.path, a.contents]));
    expect(Object.keys(adds).sort()).toEqual(['main.tf', 'vars.tf']);
    expect(adds['main.tf']).toBe(Buffer.from('fixed\n').toString('base64'));
    expect(input.fileChanges.deletions).toEqual([]);
    expect(core.getOutput('committed')).toBe('true');
    expect(core.getOutput('commit_oid')).toBe('newoid');
  });

  it('handles deletions and renames', async () => {
    fs.rmSync(path.join(dir, 'old.tf')); // delete
    fs.renameSync(path.join(dir, 'main.tf'), path.join(dir, 'renamed.tf')); // rename (content identical → R100)
    const github = makeGithub();

    await runIn(dir, { github, context, core });

    const input = github.graphql.mock.calls[0][1].input;
    expect(input.fileChanges.deletions.map((d) => d.path).sort()).toEqual(['main.tf', 'old.tf']);
    expect(input.fileChanges.additions.map((a) => a.path)).toEqual(['renamed.tf']);
  });

  it('never stages the .ai-workflows checkout', async () => {
    fs.writeFileSync(path.join(dir, 'main.tf'), 'fixed\n');
    fs.mkdirSync(path.join(dir, '.ai-workflows', 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.ai-workflows', 'scripts', 'x.js'), 'leak\n');
    const github = makeGithub();

    await runIn(dir, { github, context, core });

    const paths = github.graphql.mock.calls[0][1].input.fileChanges.additions.map((a) => a.path);
    expect(paths).toEqual(['main.tf']);
  });

  it('no-ops when Claude made no changes', async () => {
    const github = makeGithub();

    await runIn(dir, { github, context, core });

    expect(github.graphql).not.toHaveBeenCalled();
    expect(core.getOutput('committed')).toBe('false');
  });

  it('clears a stale .git/index.lock so staging succeeds', async () => {
    fs.writeFileSync(path.join(dir, 'main.tf'), 'fixed\n');
    fs.writeFileSync(path.join(dir, '.git', 'index.lock'), ''); // leftover from claude-code-action
    const github = makeGithub();

    await runIn(dir, { github, context, core });

    expect(github.graphql).toHaveBeenCalledTimes(1);
    const paths = github.graphql.mock.calls[0][1].input.fileChanges.additions.map((a) => a.path);
    expect(paths).toEqual(['main.tf']);
    expect(fs.existsSync(path.join(dir, '.git', 'index.lock'))).toBe(false);
  });

  it('surfaces git stderr (not just "Command failed") when a git call fails', async () => {
    fs.writeFileSync(path.join(dir, 'main.tf'), 'fixed\n');
    // Corrupt the index so `git add` exits non-zero with a real diagnostic.
    fs.writeFileSync(path.join(dir, '.git', 'index'), 'not a valid index\n');
    const github = makeGithub();

    let err;
    await runIn(dir, { github, context, core }).catch((e) => { err = e; });

    expect(err).toBeDefined();
    expect(github.graphql).not.toHaveBeenCalled();
    // The thrown message must carry git's own diagnostics, not an opaque command echo.
    expect(err.message).toMatch(/git add .* failed \(exit/);
    expect(err.message).not.toBe('Command failed: git add -A -- :(exclude).ai-workflows');
  });

  it('fails when HEAD_BRANCH is missing', async () => {
    delete process.env.HEAD_BRANCH;
    const github = makeGithub();

    await runIn(dir, { github, context, core });

    expect(core.failures.length).toBe(1);
    expect(github.graphql).not.toHaveBeenCalled();
  });
});
