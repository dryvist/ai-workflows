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

  it(
    'on a failed GitHub auth: exits non-zero, reports the status and body, never the token',
    () => {
    dir = initRepoWithChange();
    const secretToken = 'SECRET_TOKEN_VALUE_DO_NOT_LEAK';
    const serverScript = path.join(__dirname, 'fixtures', 'fake-github-401-server.js');
    const portFile = path.join(dir, '..', `port-${process.pid}-${Date.now()}.txt`);
    const server = require('child_process').spawn('bun', [serverScript, portFile], { stdio: 'ignore' });
    try {
      const deadline = Date.now() + 5000;
      while (!fs.existsSync(portFile) && Date.now() < deadline) {
        execFileSync('sleep', ['0.05']);
      }
      if (!fs.existsSync(portFile)) throw new Error('fake server never wrote its port file');
      const apiBase = `http://localhost:${fs.readFileSync(portFile, 'utf8').trim()}`;

      let threw = false;
      let combined = '';
      try {
        execFileSync('bun', [path.join(__dirname, '..', '.github/scripts/pricing-discovery/open-pr-cli.js')], {
          cwd: dir,
          encoding: 'utf8',
          env: { ...process.env, GITHUB_TOKEN: secretToken, GITHUB_API_BASE_URL: apiBase },
        });
      } catch (e) {
        threw = true;
        expect(e.status).not.toBe(0);
        combined = `${e.stdout || ''}${e.stderr || ''}`;
      }
      expect(threw).toBe(true);
      expect(combined).toContain('401');
      expect(combined).toContain('Bad credentials');
      expect(combined).not.toContain(secretToken);
    } finally {
      server.kill();
      fs.rmSync(portFile, { force: true });
    }
    },
    10000,
  );
});
