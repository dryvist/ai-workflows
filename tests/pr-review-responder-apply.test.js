const fs = require('fs');
const path = require('path');
const os = require('os');
const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const run = require('../.github/scripts/pr-review-responder/apply-thread-responses.js');

// Route github.graphql by operation: the thread fetch returns `validIds`, the
// reply/resolve mutations record their calls so tests can assert them.
function wireGraphql(github, validIds, { failResolve = false } = {}) {
  const calls = { reply: [], resolve: [] };
  github.graphql.mockImplementation(async (query, vars) => {
    if (query.includes('reviewThreads')) {
      return {
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: validIds.map((id) => ({ id, isResolved: false, path: 'a.js', line: 1, comments: { nodes: [] } })),
            },
          },
        },
      };
    }
    if (query.includes('addPullRequestReviewThreadReply')) { calls.reply.push(vars); return {}; }
    if (query.includes('resolveReviewThread')) {
      calls.resolve.push(vars);
      if (failResolve) throw new Error('resolve boom');
      return {};
    }
    throw new Error(`unexpected query: ${query}`);
  });
  return calls;
}

describe('apply-thread-responses', () => {
  let core, context, github, file;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext();
    github = createMockGithub();
    process.env.PR_NUMBER = '327';
    file = path.join(os.tmpdir(), `review-responses-${process.pid}-${core.infos.length}.json`);
    process.env.RESPONSES_FILE = file;
  });

  afterEach(() => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });

  const writeVerdict = (responses) => fs.writeFileSync(file, JSON.stringify({ responses }));

  it('posts a reply and resolves a valid thread', async () => {
    writeVerdict([{ threadId: 'T1', reply: 'Fixed in this commit.', resolve: true }]);
    const calls = wireGraphql(github, ['T1']);
    await run({ github, context, core });
    expect(calls.reply).toHaveLength(1);
    expect(calls.reply[0]).toMatchObject({ id: 'T1', body: 'Fixed in this commit.' });
    expect(calls.resolve).toHaveLength(1);
    expect(calls.resolve[0]).toMatchObject({ id: 'T1' });
    expect(core.getOutput('applied_count')).toBe('2');
  });

  it('replies without resolving when resolve is false', async () => {
    writeVerdict([{ threadId: 'T1', reply: 'I disagree because X.', resolve: false }]);
    const calls = wireGraphql(github, ['T1']);
    await run({ github, context, core });
    expect(calls.reply).toHaveLength(1);
    expect(calls.resolve).toHaveLength(0);
    expect(core.getOutput('applied_count')).toBe('1');
  });

  it('ignores a threadId that does not belong to this PR (untrusted verdict guard)', async () => {
    writeVerdict([{ threadId: 'FOREIGN', reply: 'nope', resolve: true }]);
    const calls = wireGraphql(github, ['T1']);
    await run({ github, context, core });
    expect(calls.reply).toHaveLength(0);
    expect(calls.resolve).toHaveLength(0);
    expect(core.getOutput('applied_count')).toBe('0');
    expect(core.infos.some((m) => m.includes('foreign'))).toBe(true);
  });

  it('reports applied_count 0 when the verdict file is missing', async () => {
    await run({ github, context, core });
    expect(core.getOutput('applied_count')).toBe('0');
  });

  it('reports applied_count 0 for an empty responses list', async () => {
    writeVerdict([]);
    await run({ github, context, core });
    expect(core.getOutput('applied_count')).toBe('0');
  });

  it('fails the step on malformed JSON', async () => {
    fs.writeFileSync(file, '{ not json');
    await run({ github, context, core });
    expect(core.failures.length).toBe(1);
  });

  it('deduplicates a repeated threadId in the verdict', async () => {
    writeVerdict([
      { threadId: 'T1', reply: 'first', resolve: true },
      { threadId: 'T1', reply: 'again', resolve: true },
    ]);
    const calls = wireGraphql(github, ['T1']);
    await run({ github, context, core });
    expect(calls.reply).toHaveLength(1);
    expect(calls.resolve).toHaveLength(1);
    expect(core.infos.some((m) => m.includes('duplicate'))).toBe(true);
  });

  it('counts the reply even when the resolve mutation throws', async () => {
    writeVerdict([{ threadId: 'T1', reply: 'done', resolve: true }]);
    wireGraphql(github, ['T1'], { failResolve: true });
    await run({ github, context, core });
    expect(core.getOutput('applied_count')).toBe('1'); // reply counted, resolve failed
    expect(core.infos.some((m) => m.includes('Resolve failed'))).toBe(true);
  });
});
