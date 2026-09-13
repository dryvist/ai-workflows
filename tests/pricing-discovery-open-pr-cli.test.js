// open-pr-cli.js wires GITHUB_TOKEN + bun's fetch into the same
// {github, context, core} shape open-pr.js expects from actions/github-script.
// It runs and calls process.exit() on failure, so exercise it as a
// subprocess against a fake GitHub API rather than requiring it in-process.
const { describe, it, expect, afterEach } = require('bun:test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function initRepoWithChange() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-discovery-cli-'));
  git(dir, ['init', '-q', '-b', 'develop']);
  git(dir, ['config', 'user.email', 't@example.com']);
  git(dir, ['config', 'user.name', 'tester']);
  fs.mkdirSync(path.join(dir, 'llm-models.d'));
  fs.writeFileSync(path.join(dir, 'llm-models.d', '50-openrouter.yml'), 'x: 1\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'init']);
  fs.writeFileSync(path.join(dir, 'llm-models.d', '50-openrouter.yml'), 'x: 2\n');
  fs.writeFileSync(path.join(dir, 'pr-body.md'), 'the pr body');
  return dir;
}

describe('pricing-discovery open-pr-cli', () => {
  let dir;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('exits non-zero and prints a message when GITHUB_TOKEN is unset', () => {
    dir = initRepoWithChange();
    let threw = false;
    try {
      execFileSync('bun', [path.join(__dirname, '..', '.github/scripts/pricing-discovery/open-pr-cli.js')], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_TOKEN: '' },
      });
    } catch (e) {
      threw = true;
      expect(e.status).not.toBe(0);
      expect(e.stderr).toContain('GITHUB_TOKEN not set');
    }
    expect(threw).toBe(true);
  });

  it('does nothing (exits 0, no HTTP calls) when there is no pr-body.md', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-discovery-cli-empty-'));
    git(dir, ['init', '-q', '-b', 'develop']);
    const out = execFileSync('bun', [path.join(__dirname, '..', '.github/scripts/pricing-discovery/open-pr-cli.js')], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: 'fake-token' },
    });
    expect(out).toContain('nothing to open');
  });
});
