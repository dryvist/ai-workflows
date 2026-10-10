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
    expect(classify('litellm.Timeout: APITimeoutError - Request timed out. timeout value=90.0')).toBe('timeout');
  });

  it('matches the router wording for a model group with no fallback', () => {
    expect(
      classify("model group 'review-oss' failed with the error above and no fallback model group was found for it"),
    ).toBe('no-fallback-model');
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

  it('names the Claude bot App checks: write need when the check run is refused with 403', () => {
    const r = report({}, { mode: '403' });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain('::error::demo: the check run was refused with 403');
    expect(r.stdout).toContain('Claude bot App needs checks: write');
  });

  it('stays red and names the cause when no App token exists', () => {
    const r = report({ GITHUB_TOKEN: '', CHECK_TOKEN_CAUSE: 'GH_APP_CLAUDE_BOT_PRIVATE_KEY is not set' });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain('cannot post the check run: no Claude bot App token (GH_APP_CLAUDE_BOT_PRIVATE_KEY is not set)');
    expect(r.request).toBeUndefined();
  });

  it('fails loudly when the head SHA is missing', () => {
    const r = report({ CHECK_HEAD_SHA: '' });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain('CHECK_HEAD_SHA and GITHUB_REPOSITORY must be set');
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

  it('docs-drift is advisory: neutral, and the check run uses the App token, not a caller grant', () => {
    const job = load('docs-drift.yml').jobs.drift;
    expect(step(job, 'Report gateway unavailability').env.CONCLUSION).toBe('neutral');
    expect(step(job, 'Mint the check-run token').with['permission-checks']).toBe('write');
    expect(job.permissions).toEqual({ contents: 'read' });
  });

  it('pr-agent is required: the runner fails closed; the App-token report runs only after that failure', () => {
    const workflow = load('pr-agent.yml');
    const job = workflow.jobs['pr-agent'];
    expect(job.permissions.checks).toBeUndefined();
    const report = step(job, 'Report gateway unavailability');
    expect(report.if).toContain("hashFiles('gateway-reason.txt')");
    expect(report.env.CONCLUSION).toBe('failure');
    const runner = readFileSync(join('.github', 'scripts', 'pr-agent', 'run.sh'), 'utf8');
    expect(runner).toContain('gateway-reason.txt');
    expect(runner).toMatch(/gateway-reason\.txt\n\s+echo "::error::.*\n\s+exit 1/);
  });

  it('no callee grants checks: write; the callee GITHUB_TOKEN permissions stay as on main', () => {
    for (const file of [
      'cc-ci-fix.yml',
      'cc-code-simplifier.yml',
      'issue-backlog-sweep.yml',
      'cc-release-notes.yml',
      'docs-drift.yml',
      'pr-agent.yml',
      'policy-gate.yml',
    ]) {
      const workflow = load(file);
      expect(workflow.permissions?.checks).toBeUndefined();
      for (const job of Object.values(workflow.jobs)) {
        expect(job.permissions?.checks).toBeUndefined();
      }
    }
    expect(load('cc-ci-fix.yml').jobs.fix.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' });
  });

  it('every mint of the check-run token uses the pinned App-token action with checks: write', () => {
    const pinned = 'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1';
    const action = Bun.YAML.parse(readFileSync(join('.github', 'actions', 'run-ai-agent', 'action.yml'), 'utf8'));
    const mints = [
      step(load('policy-gate.yml').jobs.gate, 'Mint the check-run token'),
      step(load('docs-drift.yml').jobs.drift, 'Mint the check-run token'),
      step(load('pr-agent.yml').jobs['pr-agent'], 'Mint the check-run token'),
      step(load('cc-release-notes.yml').jobs.highlights, 'Mint the check-run token'),
      action.runs.steps.find((s) => s.name === 'Mint the check-run token'),
    ];
    for (const mint of mints) {
      expect(mint.uses).toBe(pinned);
      expect(mint['continue-on-error']).toBe(true);
      expect(mint.with['permission-checks']).toBe('write');
    }
  });

  it('the App key is named as the cause when it is absent', () => {
    const job = load('policy-gate.yml').jobs.gate;
    expect(step(job, 'Report gateway unavailability').env.CHECK_TOKEN_CAUSE).toContain('GH_APP_CLAUDE_BOT_PRIVATE_KEY is not set');
  });

  it('every run-ai-agent caller in the touched set passes the App ID and key', () => {
    for (const file of ['issue-backlog-sweep.yml', 'cc-ci-fix.yml', 'cc-release-notes.yml']) {
      const workflow = load(file);
      const agent = Object.values(workflow.jobs)
        .flatMap((job) => job.steps ?? [])
        .find((s) => s.uses === './.ai-workflows/.github/actions/run-ai-agent');
      expect(agent.with.claude_bot_app_id).toBe('${{ vars.GH_APP_CLAUDE_BOT_ID }}');
      expect(agent.with.claude_bot_private_key).toBe('${{ secrets.GH_APP_CLAUDE_BOT_PRIVATE_KEY }}');
    }
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
