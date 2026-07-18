const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const publish = require('../.github/scripts/issue-hygiene/publish.js');

describe('issue-hygiene publisher', () => {
  let dir, file, github, context, core;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-hygiene-'));
    file = path.join(dir, 'result.json');
    process.env.RESULT_FILE = file;
    github = createMockGithub();
    context = createMockContext();
    core = createMockCore();
  });

  afterEach(() => {
    delete process.env.RESULT_FILE;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('constructs fixed comments from typed actions', async () => {
    fs.writeFileSync(file, JSON.stringify({ actions: [
      { kind: 'duplicate', issue_number: 20, related_issue_number: 10 },
      { kind: 'merged_pr', issue_number: 21, pr_number: 44, pr_title: 'Fix widget' },
      { kind: 'wontfix', issue_number: 22, age_days: 120 },
      { kind: 'combine', issue_number: 23, related_issue_number: 24 },
    ] }));
    await publish({ github, context, core });
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(4);
    expect(github.rest.issues.createComment.mock.calls[0][0].body).toContain('#10');
    expect(github.rest.issues.createComment.mock.calls[1][0].body).toContain('PR #44');
    expect(core.failures).toHaveLength(0);
  });

  it('rejects extra fields and performs no writes', async () => {
    fs.writeFileSync(file, JSON.stringify({ actions: [
      { kind: 'duplicate', issue_number: 20, related_issue_number: 10, body: 'arbitrary' },
    ] }));
    await publish({ github, context, core });
    expect(core.failures).toHaveLength(1);
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('normalizes and bounds PR titles before constructing comments', async () => {
    fs.writeFileSync(file, JSON.stringify({ actions: [
      { kind: 'merged_pr', issue_number: 21, pr_number: 44, pr_title: `  ${'x'.repeat(260)}\nnext  ` },
    ] }));
    await publish({ github, context, core });
    const comment = github.rest.issues.createComment.mock.calls[0][0].body;
    expect(comment).not.toContain('\n');
    expect(comment).toContain(`${'x'.repeat(253)}...`);
    expect(core.failures).toHaveLength(0);
  });
});
