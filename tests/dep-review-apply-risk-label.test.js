const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = require('../.github/scripts/dep-review/apply-risk-label.js');

describe('dep-review apply-risk-label', () => {
  let core, context, github, dir, previous;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext();
    github = createMockGithub();
    github.rest.issues.removeLabel = require('bun:test').mock();
    github.rest.issues.get.mockResolvedValue({ data: { labels: [{ name: 'risk:medium' }] } });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-risk-'));
    previous = process.cwd();
    process.chdir(dir);
    process.env.PR_NUMBER = '42';
  });

  afterEach(() => {
    process.chdir(previous);
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.PR_NUMBER;
  });

  it('replaces another allowed risk label', async () => {
    fs.writeFileSync('.dep-review-risk.json', JSON.stringify({ risk: 'high' }));
    await run({ github, context, core });
    expect(github.rest.issues.removeLabel).toHaveBeenCalledWith(expect.objectContaining({ name: 'risk:medium' }));
    expect(github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({ labels: ['risk:high'] }));
    expect(core.getOutput('risk')).toBe('high');
  });

  it('rejects extra fields and unknown risk values', async () => {
    fs.writeFileSync('.dep-review-risk.json', JSON.stringify({ risk: 'critical', command: 'merge' }));
    await run({ github, context, core });
    expect(core.failures).toHaveLength(1);
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled();
  });

  it('rejects an invalid PR number', async () => {
    process.env.PR_NUMBER = '../1';
    fs.writeFileSync('.dep-review-risk.json', JSON.stringify({ risk: 'low' }));
    await run({ github, context, core });
    expect(core.failures).toHaveLength(1);
  });
});
