const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const publish = require('../.github/scripts/issue-sweeper/publish.js');

describe('issue-sweeper publisher', () => {
  let dir, file, github, context, core;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-sweeper-'));
    file = path.join(dir, 'result.json');
    process.env.RESULT_FILE = file;
    github = createMockGithub();
    github.rest.issues.update = mock();
    context = createMockContext();
    core = createMockCore();
  });

  afterEach(() => {
    delete process.env.RESULT_FILE;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('closes only a resolved issue after posting its fixed comment', async () => {
    fs.writeFileSync(file, JSON.stringify({ actions: [
      { kind: 'resolved', issue_number: 10, pr_number: 50 },
      { kind: 'in_progress_branch', issue_number: 12, branch_name: 'feat/issue-12' },
      { kind: 'stale', issue_number: 13 },
    ] }));
    await publish({ github, context, core });
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(3);
    expect(github.rest.issues.update).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.update.mock.calls[0][0]).toMatchObject({
      issue_number: 10, state: 'closed', state_reason: 'completed',
    });
    expect(core.failures).toHaveLength(0);
  });

  it('rejects multiple actions for one issue before any write', async () => {
    fs.writeFileSync(file, JSON.stringify({ actions: [
      { kind: 'stale', issue_number: 13 },
      { kind: 'in_progress_pr', issue_number: 13, pr_number: 3 },
    ] }));
    await publish({ github, context, core });
    expect(core.failures).toHaveLength(1);
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
    expect(github.rest.issues.update).not.toHaveBeenCalled();
  });
});
