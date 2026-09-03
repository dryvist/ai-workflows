const { afterEach, describe, expect, it, mock } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createMockContext, createMockCore } = require('./helpers.js');

const openPublisherPr = require('../.github/scripts/docs-publisher/open-pr.js');

describe('docs publisher open-pr', () => {
  let directory;
  afterEach(() => {
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
    for (const name of ['PUBLISHER_CHECKOUT', 'TARGET_REPOSITORY', 'BASE_BRANCH', 'PR_BRANCH', 'PR_TITLE', 'PR_BODY']) delete process.env[name];
  });

  it('opens a verified PR against an explicit cross-repository target', async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-open-pr-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: directory });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: directory });
    execFileSync('git', ['config', 'user.name', 'tester'], { cwd: directory });
    fs.writeFileSync(path.join(directory, 'docs.json'), '{}\n');
    execFileSync('git', ['add', '-A'], { cwd: directory }); execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'initial'], { cwd: directory });
    fs.writeFileSync(path.join(directory, 'docs.json'), '{"name":"Public"}\n');
    const github = { graphql: mock(async () => ({ createCommitOnBranch: { commit: { oid: 'oid', url: 'https://example/commit' } } })), rest: { git: { createRef: mock(async () => ({})) }, pulls: { create: mock(async () => ({ data: { number: 7, html_url: 'https://example/pr/7' } })) } } };
    const core = createMockCore(); const context = createMockContext();
    Object.assign(process.env, { PUBLISHER_CHECKOUT: directory, TARGET_REPOSITORY: 'dryvist/docs', BASE_BRANCH: 'main', PR_BRANCH: 'docs-publisher/public-1', PR_TITLE: 'docs: publish generated documentation', PR_BODY: 'Generated projection.' });

    await openPublisherPr({ github, context, core });

    expect(github.graphql.mock.calls[0][1].input.branch.repositoryNameWithOwner).toBe('dryvist/docs');
    expect(github.rest.pulls.create.mock.calls[0][0]).toMatchObject({ owner: 'dryvist', repo: 'docs', head: 'docs-publisher/public-1' });
  });
});
