const { describe, it, expect } = require('bun:test');
const { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const prepareScript = join(import.meta.dir, '../.github/actions/run-ai-agent/prepare.sh');
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

function runValidate(sudoExitStatus) {
  const tempDir = mkdtempSync(join(tmpdir(), 'run-ai-agent-prepare-'));
  const binDir = join(tempDir, 'bin');
  const outputPath = join(tempDir, 'github-output');
  mkdirSync(binDir);
  const sudoStub = join(binDir, 'sudo');
  writeFileSync(sudoStub, `#!/bin/sh\nexit ${sudoExitStatus}\n`);
  chmodSync(sudoStub, 0o755);

  try {
    const result = spawnSync('bash', [prepareScript, 'validate'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        AGENT: 'codex',
        PERMISSION_PROFILE: 'read-only',
        BASE_URL: 'https://router.example.invalid/v1',
        API_KEY: 'dummy-api-key',
        CLAUDE_ARGS: '',
        ALLOWED_TOOLS: '',
        CLAUDE_MODEL: '',
        GITHUB_OUTPUT: outputPath,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    });
    return { ...result, output: readFileSync(outputPath, 'utf8') };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('run-ai-agent prepare validation', () => {
  (isRoot ? it.skip : it)('selects Claude and warns when non-root Codex cannot use passwordless sudo', () => {
    const result = runValidate(1);

    expect(result.status).toBe(0);
    expect(result.output).toContain('effective-agent=claude');
    expect(result.stdout).toContain('::warning::Codex needs passwordless sudo on this runner; Claude will run instead');
  });

  it('keeps Codex selected when passwordless sudo succeeds', () => {
    const result = runValidate(0);

    expect(result.status).toBe(0);
    expect(result.output).toContain('effective-agent=codex');
  });
});
