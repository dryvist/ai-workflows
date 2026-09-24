const { expect, test } = require('bun:test');
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const script = (name) => join('.github', 'scripts', 'policy-gate', name);

function run(dir, name, env) {
  return Bun.spawnSync(['bash', join(process.cwd(), script(name))], {
    cwd: dir,
    env: { ...process.env, ...env },
  });
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'policy-gate-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('render.sh reports the override notice and exits 0 without calling the router', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'override.flag'), '');

    const result = run(dir, 'render.sh', {});

    expect(result.exitCode).toBe(0);
    const body = readFileSync(join(dir, 'policy-gate.md'), 'utf8');
    expect(body).toContain('policy-gate-override');
    expect(readFileSync(join(dir, 'policy-gate.exit'), 'utf8').trim()).toBe('0');
  });
});

test('render.sh renders a passing verdict and marks exit 0', () => {
  withTempDir((dir) => {
    writeFileSync(
      join(dir, 'response.json'),
      JSON.stringify({
        summary: 'No issues found.',
        findings: [
          { check: 'dry', result: 'pass', file: '', line: 0, detail: '' },
          { check: 'native_first', result: 'pass', file: '', line: 0, detail: '' },
          { check: 'disclosure', result: 'pass', file: '', line: 0, detail: '' },
          { check: 'missing_test', result: 'pass', file: '', line: 0, detail: '' },
          { check: 'token_budget', result: 'pass', file: '', line: 0, detail: '' },
        ],
      }),
    );

    const result = run(dir, 'render.sh', { MODEL: 'cheap', RESPONSE_FILE: join(dir, 'response.json') });

    expect(result.exitCode).toBe(0);
    const body = readFileSync(join(dir, 'policy-gate.md'), 'utf8');
    expect(body).toContain('No issues found.');
    expect(body).toContain('| dry | pass |');
    expect(readFileSync(join(dir, 'policy-gate.exit'), 'utf8').trim()).toBe('0');
  });
});

test('render.sh marks exit 1 when any check fails, and still renders the table', () => {
  withTempDir((dir) => {
    writeFileSync(
      join(dir, 'response.json'),
      JSON.stringify({
        summary: 'One violation.',
        findings: [
          {
            check: 'disclosure',
            result: 'fail',
            file: 'roles/foo/tasks/main.yml',
            line: 12,
            detail: 'names an internal hostname directly',
          },
          { check: 'dry', result: 'pass', file: '', line: 0, detail: '' },
          { check: 'native_first', result: 'pass', file: '', line: 0, detail: '' },
          { check: 'missing_test', result: 'pass', file: '', line: 0, detail: '' },
          { check: 'token_budget', result: 'pass', file: '', line: 0, detail: '' },
        ],
      }),
    );

    const result = run(dir, 'render.sh', { MODEL: 'cheap', RESPONSE_FILE: join(dir, 'response.json') });

    expect(result.exitCode).toBe(0); // rendering itself never fails the job
    const body = readFileSync(join(dir, 'policy-gate.md'), 'utf8');
    expect(body).toContain('| disclosure | fail | roles/foo/tasks/main.yml | 12 |');
    expect(readFileSync(join(dir, 'policy-gate.exit'), 'utf8').trim()).toBe('1');
  });
});

test('render.sh reports "unable to score" and exits 0 on a non-JSON response', () => {
  withTempDir((dir) => {
    // A truncated completion or plain-text refusal — not a JSON object.
    writeFileSync(join(dir, 'response.json'), '150ms budget exceeded, retry later');

    const result = run(dir, 'render.sh', { MODEL: 'cheap', RESPONSE_FILE: join(dir, 'response.json') });

    expect(result.exitCode).toBe(0);
    const body = readFileSync(join(dir, 'policy-gate.md'), 'utf8');
    expect(body).toContain('Unable to score');
    expect(readFileSync(join(dir, 'policy-gate.exit'), 'utf8').trim()).toBe('0');
  });
});

test('collect.sh requires BASE_SHA and HEAD_SHA', () => {
  withTempDir((dir) => {
    const result = run(dir, 'collect.sh', {});
    expect(result.exitCode).not.toBe(0);
  });
});
