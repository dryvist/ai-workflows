const { expect, test } = require('bun:test');
const { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const script = join(process.cwd(), '.github', 'scripts', 'ai-merge-gate', 'check.sh');

// check.sh with a stand-in `curl` first on PATH that prints `checkRuns` as
// the check-runs API would. Returns the exit code and the job summary.
function runWithCheckRuns(checkRuns) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-merge-gate-'));
  try {
    const curl = join(dir, 'curl');
    writeFileSync(curl, `#!/usr/bin/env bash\ncat <<'JSON'\n${JSON.stringify({ check_runs: checkRuns })}\nJSON\n`);
    chmodSync(curl, 0o755);
    const summary = join(dir, 'summary.md');
    const result = Bun.spawnSync(['bash', script], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        GH_TOKEN: 't',
        REPO: 'o/r',
        HEAD_SHA: 'abcdef0123456789',
        GITHUB_STEP_SUMMARY: summary,
      },
    });
    let summaryText = '';
    try {
      summaryText = readFileSync(summary, 'utf8');
    } catch {}
    return { exitCode: result.exitCode, summary: summaryText, stdout: result.stdout.toString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const copilot = (name, conclusion) => ({
  name,
  conclusion,
  html_url: `https://example.invalid/${name}`,
  app: { slug: 'copilot-pull-request-reviewer' },
});

test('check.sh fails and lists the failed Copilot check-run', () => {
  const result = runWithCheckRuns([copilot('Copilot review', 'failure'), copilot('Copilot fix', 'success')]);
  expect(result.exitCode).toBe(1);
  expect(result.summary).toContain('failed or timed out: 1');
  expect(result.summary).toContain('| [Copilot review](https://example.invalid/Copilot review) | failure |');
  expect(result.stdout).toContain('::error::1 Copilot agent check(s) failed');
});

test('check.sh passes when no Copilot check-run failed, ignoring other apps', () => {
  const result = runWithCheckRuns([
    copilot('Copilot review', 'success'),
    copilot('Copilot fix', null),
    { name: 'CI', conclusion: 'failure', html_url: 'https://example.invalid/ci', app: { slug: 'github-actions' } },
  ]);
  expect(result.exitCode).toBe(0);
  expect(result.summary).toContain('failed or timed out: 0');
  expect(result.summary).toContain('| [Copilot fix](https://example.invalid/Copilot fix) | in progress |');
  expect(result.summary).not.toContain('| [CI]');
});
