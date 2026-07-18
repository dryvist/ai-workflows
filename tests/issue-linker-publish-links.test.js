const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMockCore, createMockContext } = require('./helpers.js');
const run = require('../.github/scripts/issue-linker/publish-links.js');

describe('issue-linker publisher', () => {
  let dir, core, context, github;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-linker-publish-'));
    process.env.RESULT_FILE = path.join(dir, 'result.json');
    process.env.MODE = 'opened';
    process.env.PR_NUMBER = '8';
    core = createMockCore();
    context = createMockContext();
    github = {
      paginate: mock(async () => []),
      rest: {
        pulls: { get: mock(async () => ({ data: { body: 'Existing body', state: 'open' } })), update: mock(async () => ({})), listReviews: mock(), createReview: mock(async () => ({})) },
        issues: { listComments: mock(), createComment: mock(async () => ({})), get: mock(async () => ({ data: { state: 'open' } })), update: mock() },
      },
    };
  });
  afterEach(() => { delete process.env.RESULT_FILE; delete process.env.MODE; delete process.env.PR_NUMBER; fs.rmSync(dir, { recursive: true, force: true }); });

  it('appends a fixed closing link and idempotent issue comment', async () => {
    fs.writeFileSync(process.env.RESULT_FILE, JSON.stringify({ mode: 'opened', pr_number: 8, issues: [{ number: 42, classification: 'resolved' }] }));
    await run({ github, context, core });
    expect(github.rest.pulls.update.mock.calls[0][0].body).toContain('Closes #42');
    expect(github.rest.issues.createComment.mock.calls[0][0].body).toContain('issue-linker-opened');
  });

  it('rejects an artifact for a different PR', async () => {
    fs.writeFileSync(process.env.RESULT_FILE, JSON.stringify({ mode: 'opened', pr_number: 9, issues: [] }));
    await run({ github, context, core });
    expect(core.failures).toHaveLength(1);
    expect(github.rest.pulls.get).not.toHaveBeenCalled();
  });
});
