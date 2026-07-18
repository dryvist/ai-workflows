const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMockCore, createMockContext } = require('./helpers.js');
const run = require('../.github/scripts/best-practices/publish-recommendation.js');

describe('best-practices publisher', () => {
  let dir, core, context, github;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-practices-publish-'));
    process.env.RESULT_FILE = path.join(dir, 'result.json');
    core = createMockCore();
    context = createMockContext();
    github = { rest: { issues: { listForRepo: mock(async () => ({ data: [] })), create: mock(async () => ({ data: { number: 12 } })) } } };
  });
  afterEach(() => { delete process.env.RESULT_FILE; fs.rmSync(dir, { recursive: true, force: true }); });

  it('builds one fixed-label issue from structured recommendations', async () => {
    fs.writeFileSync(process.env.RESULT_FILE, JSON.stringify({
      action: 'create_issue', date: '2026-07-18', recommendations: [
        { area: 'CI/CD Patterns', finding: 'No cache', recommendation: 'Add cache', impact: 'Medium' },
        { area: 'Security Practices', finding: 'Broad token', recommendation: 'Narrow it', impact: 'High' },
        { area: 'Documentation Standards', finding: 'Missing guide', recommendation: 'Write guide', impact: 'Low' },
      ],
    }));
    await run({ github, context, core });
    const issue = github.rest.issues.create.mock.calls[0][0];
    expect(issue.labels).toEqual(['type:chore']);
    expect(issue.title).toBe('chore: best practices recommendations — 2026-07-18');
    expect(issue.body).toContain('Add cache');
    expect(core.getOutput('created')).toBe('true');
  });

  it('rejects extra keys instead of publishing them', async () => {
    fs.writeFileSync(process.env.RESULT_FILE, JSON.stringify({ action: 'none', command: 'gh issue create' }));
    await run({ github, context, core });
    expect(core.failures).toHaveLength(1);
    expect(github.rest.issues.create).not.toHaveBeenCalled();
  });
});
