const { mock, describe, it, expect, afterEach } = require('bun:test');
const { createMockCore, createMockContext } = require('./helpers.js');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = require('../.github/scripts/pricing-discovery/open-pr.js');

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-discovery-'));
  git(dir, ['init', '-q', '-b', 'develop']);
  git(dir, ['config', 'user.email', 't@example.com']);
  git(dir, ['config', 'user.name', 'tester']);
  fs.mkdirSync(path.join(dir, 'llm-models.d'));
  fs.writeFileSync(path.join(dir, 'llm-models.d', '50-openrouter.yml'), 'x: 1\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'init']);
  return dir;
}

function makeGithub() {
  return {
    graphql: mock(async () => ({ createCommitOnBranch: { commit: { oid: 'oid' } } })),
    rest: {
      git: { createRef: mock(async () => ({})) },
      pulls: { create: mock(async () => ({ data: { number: 7, html_url: 'https://x/pull/7' } })) },
    },
  };
}

describe('pricing-discovery open-pr', () => {
  let dir;
  afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); delete process.env.REGISTRY_REF; });

  it('does nothing when run.js left no pr-body.md', async () => {
    dir = initRepo();
    const core = createMockCore();
    const prev = process.cwd();
    process.chdir(dir);
    try {
      await run({ github: makeGithub(), context: createMockContext(), core });
    } finally {
      process.chdir(prev);
    }
    expect(core.infos.some((m) => m.includes('nothing to open'))).toBe(true);
  });

  it('opens a PR against the configured base branch, excluding the body files', async () => {
    dir = initRepo();
    fs.writeFileSync(path.join(dir, 'llm-models.d', '50-openrouter.yml'), 'x: 2\n');
    fs.writeFileSync(path.join(dir, 'pr-body.md'), 'the pr body');
    fs.writeFileSync(path.join(dir, 'vikunja-body.md'), 'unrelated');
    process.env.REGISTRY_REF = 'develop';
    const github = makeGithub();
    const core = createMockCore();
    const prev = process.cwd();
    process.chdir(dir);
    try {
      await run({ github, context: createMockContext(), core });
    } finally {
      process.chdir(prev);
    }
    const pr = github.rest.pulls.create.mock.calls[0][0];
    expect(pr.base).toBe('develop');
    expect(pr.body).toBe('the pr body');
    const committed = github.graphql.mock.calls[0][1].input.fileChanges.additions.map((a) => a.path);
    expect(committed).toContain('llm-models.d/50-openrouter.yml');
    expect(committed).not.toContain('pr-body.md');
    expect(committed).not.toContain('vikunja-body.md');
  });
});
