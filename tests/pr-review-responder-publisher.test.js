const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const publish = require('../.github/scripts/pr-review-responder/publish-actions.js');

describe('pr-review-responder publisher', () => {
  let core, context, github, dir, previous;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext();
    github = createMockGithub();
    github.graphql = mock((query) => {
      if (query.includes('reviewThreads')) return Promise.resolve({ repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [{ id: 'PRT_1', isResolved: false }] } } } });
      return Promise.resolve({});
    });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-publish-'));
    previous = process.cwd();
    process.chdir(dir);
    process.env.PR_NUMBER = '7';
  });

  afterEach(() => {
    process.chdir(previous);
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.PR_NUMBER;
  });

  it('replies and resolves a current unresolved thread', async () => {
    fs.writeFileSync('.review-actions.json', JSON.stringify({ actions: [{ thread_id: 'PRT_1', reply: 'Fixed the null guard.', resolve: true }] }));
    await publish({ github, context, core });
    expect(github.graphql.mock.calls.filter(([query]) => query.includes('addPullRequestReviewThreadReply'))).toHaveLength(1);
    expect(github.graphql.mock.calls.filter(([query]) => query.includes('resolveReviewThread'))).toHaveLength(1);
  });

  it('rejects unknown thread IDs before mutating', async () => {
    fs.writeFileSync('.review-actions.json', JSON.stringify({ actions: [{ thread_id: 'PRT_OTHER', reply: 'No.', resolve: true }] }));
    await publish({ github, context, core });
    expect(core.failures).toHaveLength(1);
    expect(github.graphql.mock.calls).toHaveLength(1);
  });

  it('rejects extra fields and oversized replies', async () => {
    fs.writeFileSync('.review-actions.json', JSON.stringify({ actions: [{ thread_id: 'PRT_1', reply: 'x'.repeat(1501), resolve: false, command: 'merge' }] }));
    await publish({ github, context, core });
    expect(core.failures).toHaveLength(1);
  });
});
