const { execFileSync, spawnSync } = require('node:child_process');
const {
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { basename, join, resolve } = require('node:path');
const { describe, expect, it } = require('bun:test');

const helperPath = resolve(__dirname, '../.github/scripts/shared/verified-commit.js');
const runner = `
  const { stageChanges } = require(${JSON.stringify(helperPath)});
  try {
    process.stdout.write(JSON.stringify(stageChanges()));
  } catch (error) {
    process.stderr.write(error.message);
    process.exit(1);
  }
`;

function withRepo(run) {
  const repo = mkdtempSync(join(tmpdir(), 'aiwf-verified-commit-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  try {
    run(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

function stageChanges(repo) {
  return spawnSync(process.execPath, ['-e', runner], { cwd: repo, encoding: 'utf8' });
}

describe('verified commit staging', () => {
  it('preserves regular file bytes from the staged Git blob', () => {
    withRepo((repo) => {
      const bytes = Buffer.from([0, 255, 1, 128]);
      writeFileSync(join(repo, 'binary.bin'), bytes);

      const result = stageChanges(repo);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        additions: [{ path: 'binary.bin', contents: bytes.toString('base64') }],
        deletions: [],
      });
    });
  });

  it('rejects symlinks without reading their targets', () => {
    withRepo((repo) => {
      const secret = 'publisher-only-fixture-content';
      const target = join(tmpdir(), `${basename(repo)}-outside`);
      writeFileSync(target, secret);
      symlinkSync(target, join(repo, 'agent-link'));

      try {
        const result = stageChanges(repo);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Cannot publish non-regular staged file "agent-link"');
        expect(result.stderr).not.toContain(secret);
      } finally {
        rmSync(target, { force: true });
      }
    });
  });
});
