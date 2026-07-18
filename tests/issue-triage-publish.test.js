const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const publish = require('../.github/scripts/issue-triage/publish.js');

describe('issue-triage publisher', () => {
  let dir, file, github, context, core;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-triage-'));
    file = path.join(dir, 'result.json');
    process.env.RESULT_FILE = file;
    delete process.env.EXPECTED_ISSUE_NUMBER;
    github = createMockGithub();
    context = createMockContext();
    core = createMockCore();
  });

  afterEach(() => {
    delete process.env.RESULT_FILE;
    delete process.env.EXPECTED_ISSUE_NUMBER;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('publishes only validated labels and the bounded comment', async () => {
    fs.writeFileSync(file, JSON.stringify({
      issue_number: 42,
      labels: ['type:bug', 'size:s', 'priority:medium', 'ai:ready'],
      comment: 'Applied bug, small, and medium-priority triage. This is ready for AI resolution.',
    }));
    await publish({ github, context, core });
    expect(github.rest.issues.addLabels).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.addLabels.mock.calls[0][0].labels).toEqual([
      'type:bug', 'size:s', 'priority:medium', 'ai:ready',
    ]);
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(core.failures).toHaveLength(0);
  });

  it('rejects labels outside the allowlist before any write', async () => {
    fs.writeFileSync(file, JSON.stringify({
      issue_number: 42,
      labels: ['type:bug', 'size:s', 'priority:medium', 'admin'],
      comment: 'Triage result.',
    }));
    await publish({ github, context, core });
    expect(core.failures).toHaveLength(1);
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled();
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('enforces a specifically dispatched issue number', async () => {
    process.env.EXPECTED_ISSUE_NUMBER = '7';
    fs.writeFileSync(file, JSON.stringify({
      issue_number: 8,
      labels: ['type:docs', 'size:xs', 'priority:low'],
      comment: 'Triage result.',
    }));
    await publish({ github, context, core });
    expect(core.failures[0]).toContain('requested issue #7');
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled();
  });
});
