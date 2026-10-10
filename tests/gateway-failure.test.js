const { describe, expect, it } = require('bun:test');
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const script = join('.github', 'scripts', 'shared', 'gateway-failure.sh');

function classify(text) {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-failure-'));
  const file = join(dir, 'input.txt');
  writeFileSync(file, text);
  const result = Bun.spawnSync(['bash', script, 'classify', file]);
  expect(result.exitCode).toBe(0);
  return result.stdout.toString().trim();
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

  it('writes the summary line and skips the ops alert without NTFY_BASE_URL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gateway-failure-'));
    const summary = join(dir, 'summary.md');
    const result = Bun.spawnSync(['bash', script, 'report', 'demo', 'rate-limited'], {
      env: { PATH: process.env.PATH, GITHUB_STEP_SUMMARY: summary },
    });
    expect(result.exitCode).toBe(0);
    expect(readFileSync(summary, 'utf8')).toBe('AI review not performed: gateway unavailable (rate-limited)\n');
    expect(result.stdout.toString()).toContain('NTFY_BASE_URL not configured; skipping the ops alert.');
  });
});
