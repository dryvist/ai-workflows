const { describe, expect, it } = require('bun:test');
const { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const script = join('.github', 'scripts', 'shared', 'gateway-failure.sh');

// A stand-in for gh: records the request body and answers the check-run POST.
// FAKE_GH_MODE=403 reproduces a job that lacks the checks: write grant.
const fakeGh = `#!/usr/bin/env bash
cat > "$FAKE_GH_RECORD"
if [ "\${FAKE_GH_MODE:-ok}" = "403" ]; then
  echo "gh: Resource not accessible by integration (HTTP 403)" >&2
  exit 1
fi
echo '{"id":1}'
`;

function workdir() {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-failure-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), fakeGh);
  chmodSync(join(bin, 'gh'), 0o755);
  return { dir, bin, summary: join(dir, 'summary.md'), record: join(dir, 'request.json') };
}

function classify(text) {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-failure-'));
  const file = join(dir, 'input.txt');
  writeFileSync(file, text);
  const result = Bun.spawnSync(['bash', script, 'classify', file]);
  expect(result.exitCode).toBe(0);
  return result.stdout.toString().trim();
}

function report(env, { mode = 'ok', job = 'demo', reason = 'rate-limited' } = {}) {
  const w = workdir();
  const result = Bun.spawnSync(['bash', script, 'report', job, reason], {
    env: {
      PATH: `${w.bin}:${process.env.PATH}`,
      GITHUB_STEP_SUMMARY: w.summary,
      FAKE_GH_RECORD: w.record,
      FAKE_GH_MODE: mode,
      GITHUB_REPOSITORY: 'dryvist/example',
      GITHUB_TOKEN: 'token-for-test',
      CHECK_HEAD_SHA: 'abc123',
      ...env,
    },
  });
  const request = (() => {
    try {
      return JSON.parse(readFileSync(w.record, 'utf8'));
    } catch {
      return undefined;
    }
  })();
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    summary: readFileSync(w.summary, 'utf8'),
    request,
  };
}

describe('gateway failure classification', () => {
  it('names the budget, fallback, rate and connection classes', () => {
    expect(classify('Error: Budget has been exceeded for this key')).toBe('budget-exceeded');
    expect(classify('No fallback model group found for role review-private')).toBe('no-fallback-model');
    expect(classify('API Error: 429 Too Many Requests')).toBe('rate-limited');
    expect(classify('connect ECONNREFUSED 10.0.0.1:4000')).toBe('connection');
  });

  it('leaves a real request error unclassified so the job still fails', () => {
    expect(classify('400 Bad Request: prompt is malformed')).toBe('');
  });

  it('does not match 429 inside a longer number', () => {
    expect(classify('finished in 1429ms')).toBe('');
  });
});

describe('gateway failure report', () => {
  it('advisory: posts a neutral check run on the head commit and exits 0', () => {
    const r = report({});
    expect(r.exitCode).toBe(0);
    expect(r.summary).toBe('AI review not performed: gateway unavailable (rate-limited)\n');
    expect(r.stdout).toContain('::warning::demo: AI review not performed');
    expect(r.request.name).toBe('demo: AI review not performed');
    expect(r.request.head_sha).toBe('abc123');
    expect(r.request.conclusion).toBe('neutral');
    expect(r.request.status).toBe('completed');
    expect(r.request.output.summary).toBe('gateway unavailable (rate-limited)');
  });

  it('blocking or required: CONCLUSION=failure posts a failure check run and exits 1', () => {
    const r = report({ CONCLUSION: 'failure' });
    expect(r.exitCode).toBe(1);
    expect(r.request.conclusion).toBe('failure');
    expect(r.stdout).toContain('::error::demo: AI review not performed');
    expect(r.stdout).toContain('failing closed on a gateway failure');
  });

  it('names the missing checks: write grant when the check run is refused with 403', () => {
    const r = report({}, { mode: '403' });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain('::error::demo: the check run was refused with 403');
    expect(r.stdout).toContain('checks: write');
  });

  it('fails loudly when no token or head SHA is available', () => {
    const r = report({ GITHUB_TOKEN: '', CHECK_HEAD_SHA: '' });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain('cannot create the check run');
    expect(r.request).toBeUndefined();
  });

  it('skips the ops alert without NTFY_BASE_URL and still writes the summary', () => {
    const r = report({});
    expect(r.stdout).toContain('NTFY_BASE_URL not configured; skipping the ops alert.');
  });
});

// Pins the fail-closed and permission wiring, so a later edit cannot quietly
// turn a blocking or required gate green again.
describe('gateway wiring in the workflows', () => {
  const load = (path) => Bun.YAML.parse(readFileSync(join('.github', 'workflows', path), 'utf8'));
  const step = (job, name) => job.steps.find((s) => s.name === name);

  it('policy-gate: blocking maps to a failure conclusion, and the sticky notice still posts', () => {
    const job = load('policy-gate.yml').jobs.gate;
    const gateway = step(job, 'Report gateway unavailability');
    expect(gateway.env.CONCLUSION).toContain("inputs.blocking && 'failure'");
    expect(gateway.env.CONCLUSION).toContain("'neutral'");
    expect(gateway.run).toContain('gateway-failure.sh report policy-gate');
    expect(step(job, 'Post sticky comment').if).toContain("steps.gateway.outcome == 'failure'");
    expect(job.permissions).toBeUndefined();
  });

  it('docs-drift is advisory: neutral, and its drift job requests checks: write', () => {
    const job = load('docs-drift.yml').jobs.drift;
    expect(step(job, 'Report gateway unavailability').env.CONCLUSION).toBe('neutral');
    expect(job.permissions.checks).toBe('write');
  });

  it('pr-agent is required: its runner fails closed, and its job requests checks: write', () => {
    const workflow = load('pr-agent.yml');
    expect(workflow.jobs['pr-agent'].permissions.checks).toBe('write');
    const runner = readFileSync(join('.github', 'scripts', 'pr-agent', 'run.sh'), 'utf8');
    expect(runner).toContain('CONCLUSION=failure');
    expect(runner).toMatch(/report pr-agent "\$reason"\n\s+exit 1/);
  });

  it('every job that posts the check run requests checks: write', () => {
    expect(load('cc-ci-fix.yml').jobs.fix.permissions.checks).toBe('write');
    expect(load('cc-code-simplifier.yml').jobs.simplify.permissions.checks).toBe('write');
    expect(load('issue-backlog-sweep.yml').jobs.sweep.permissions.checks).toBe('write');
    expect(load('cc-release-notes.yml').jobs.highlights.permissions.checks).toBe('write');
  });

  it('release notes end neutral on an unavailable agent, and only the deadline is reported there', () => {
    const script = readFileSync(
      join('.github', 'scripts', 'release-notes', 'agent-unavailable.sh'),
      'utf8',
    );
    expect(script).toContain('report "$JOB_NAME" deadline-exceeded');
    expect(script).not.toMatch(/report "\$JOB_NAME" "\$GATEWAY_CLASS"/);
  });
});
