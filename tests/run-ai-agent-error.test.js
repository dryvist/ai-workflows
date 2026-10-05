const { describe, it, expect } = require('bun:test');
const { buildErrorLine } = require('../.github/actions/run-ai-agent/report-error.js');

describe('run-ai-agent error reporting', () => {
  it('prints only a sanitized result message, subtype, and exit code', () => {
    const line = buildErrorLine({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'API Error at https://router.example.internal/v1: Bearer test-bearer token=router-secret runner.private.local 10.1.2.3 fd00::1\n::warning::hidden',
    }, 'failure', ['router-secret'], ['runner.private.local']);

    expect(line).toContain('subtype=success');
    expect(line).toContain('exit_code=1');
    expect(line).toContain('[URL]');
    expect(line).toContain('Bearer [REDACTED]');
    expect(line).not.toContain('router-secret');
    expect(line).not.toContain('test-bearer');
    expect(line).not.toContain('example.internal');
    expect(line).not.toContain('runner.private.local');
    expect(line).not.toContain('10.1.2.3');
    expect(line).not.toContain('fd00::1');
    expect(line).not.toContain('\n');
  });

  it('does not log successful results', () => {
    expect(buildErrorLine({ type: 'result', subtype: 'success', is_error: false, result: 'complete' }, 'success')).toBeUndefined();
  });
});
