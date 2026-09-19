const { expect, test } = require('bun:test');
const { mkdtempSync, rmSync, writeFileSync, chmodSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const script = join(process.cwd(), '.github', 'scripts', 'pr-agent', 'run.sh');

// run.sh with a stand-in `docker` first on PATH that prints `output` and
// exits 0, which is what PR-Agent 0.45.0 does whether or not it reviewed.
function runWithDockerPrinting(output) {
  const dir = mkdtempSync(join(tmpdir(), 'pr-agent-run-'));
  try {
    const docker = join(dir, 'docker');
    writeFileSync(docker, `#!/usr/bin/env bash\nprintf '%s\\n' ${JSON.stringify(output)}\n`);
    chmodSync(docker, 0o755);
    return Bun.spawnSync(['bash', script], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        BASE_URL: 'https://router.invalid/v1',
        API_KEY: 'k',
        JOB_TOKEN: 't',
        MODEL: 'review-private',
        PR_URL: 'https://github.com/o/r/pull/1',
        RUN_REVIEW: 'true',
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('run.sh fails when PR-Agent logs a failed request', () => {
  const result = runWithDockerPrinting(
    '2026-09-19 20:07:54.285 | ERROR | pr_agent.agent.pr_agent:_handle_request:184 - Failed to process the command.',
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toContain('::error::pr-agent review failed');
});

test('run.sh passes when PR-Agent reviewed', () => {
  const result = runWithDockerPrinting('INFO | pr_agent.tools.pr_reviewer:run:203 - Reviewing PR: done');
  expect(result.exitCode).toBe(0);
});
