const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const run = require('../.github/scripts/pr-review-responder/find-stale-review-prs.js');

// Minutes-ago ISO timestamp helper.
const ago = (min) => new Date(Date.now() - min * 60 * 1000).toISOString();

// Build one PR node in the shape scanOpenPRThreads reads from github.graphql.
function prNode({ number, author = 'alice', isCrossRepository = false, threads = [] }) {
  return {
    number,
    isCrossRepository,
    author: { login: author },
    reviewThreads: {
      nodes: threads.map((t) => ({
        isResolved: t.resolved || false,
        comments: { nodes: [{ author: { login: t.by }, createdAt: t.at }] },
      })),
    },
  };
}

function mockScan(github, nodes) {
  github.graphql.mockResolvedValue({
    repository: { pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } },
  });
}

describe('find-stale-review-prs', () => {
  let core, context, github;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext();
    github = createMockGithub();
    github.paginate.mockResolvedValue([]); // no attempt markers by default
    delete process.env.PR_NUMBER;
    delete process.env.STALE_MINUTES;
    delete process.env.MAX_PRS;
    delete process.env.ATTEMPT_CAP;
  });

  it('flags a PR whose reviewer left the last word >10 min ago', async () => {
    mockScan(github, [prNode({ number: 42, threads: [{ by: 'gemini-code-assist', at: ago(20) }] })]);
    await run({ github, context, core });
    expect(core.getOutput('has_prs')).toBe('true');
    expect(JSON.parse(core.getOutput('pr_numbers'))).toEqual([42]);
  });

  it('ignores a thread whose newest comment is under the stale window', async () => {
    mockScan(github, [prNode({ number: 42, threads: [{ by: 'gemini-code-assist', at: ago(5) }] })]);
    await run({ github, context, core });
    expect(core.getOutput('has_prs')).toBe('false');
    expect(JSON.parse(core.getOutput('pr_numbers'))).toEqual([]);
  });

  it('ignores a thread where the PR author replied last', async () => {
    mockScan(github, [prNode({ number: 42, author: 'alice', threads: [{ by: 'alice', at: ago(30) }] })]);
    await run({ github, context, core });
    expect(core.getOutput('has_prs')).toBe('false');
  });

  it('ignores a thread where our bot replied last (no self-loop)', async () => {
    mockScan(github, [prNode({ number: 42, threads: [{ by: 'jacobpevans-claude[bot]', at: ago(30) }] })]);
    await run({ github, context, core });
    expect(core.getOutput('has_prs')).toBe('false');
  });

  it('skips fork PRs (fork guard)', async () => {
    mockScan(github, [prNode({ number: 42, isCrossRepository: true, threads: [{ by: 'gemini-code-assist', at: ago(30) }] })]);
    await run({ github, context, core });
    expect(core.getOutput('has_prs')).toBe('false');
  });

  it('ignores resolved threads', async () => {
    mockScan(github, [prNode({ number: 42, threads: [{ by: 'gemini-code-assist', at: ago(30), resolved: true }] })]);
    await run({ github, context, core });
    expect(core.getOutput('has_prs')).toBe('false');
  });

  it('skips a candidate that has hit the attempt cap', async () => {
    mockScan(github, [prNode({ number: 42, threads: [{ by: 'gemini-code-assist', at: ago(30) }] })]);
    github.paginate.mockResolvedValue([
      { body: '<!-- claude-review-responder-attempt -->\nattempt 1' },
      { body: '<!-- claude-review-responder-attempt -->\nattempt 2' },
    ]);
    await run({ github, context, core });
    expect(core.getOutput('has_prs')).toBe('false');
    expect(core.infos.some((m) => m.includes('attempt cap'))).toBe(true);
  });

  it('caps eligible PRs to MAX_PRS', async () => {
    process.env.MAX_PRS = '2';
    mockScan(github, [
      prNode({ number: 1, threads: [{ by: 'gemini-code-assist', at: ago(30) }] }),
      prNode({ number: 2, threads: [{ by: 'gemini-code-assist', at: ago(30) }] }),
      prNode({ number: 3, threads: [{ by: 'gemini-code-assist', at: ago(30) }] }),
    ]);
    await run({ github, context, core });
    expect(JSON.parse(core.getOutput('pr_numbers'))).toEqual([1, 2]);
  });

  it('single-PR dispatch mode emits just that PR', async () => {
    process.env.PR_NUMBER = '327';
    await run({ github, context, core });
    expect(JSON.parse(core.getOutput('pr_numbers'))).toEqual([327]);
    expect(github.graphql).not.toHaveBeenCalled(); // skips the scan
  });

  it('single-PR dispatch mode still honors the attempt cap', async () => {
    process.env.PR_NUMBER = '327';
    github.paginate.mockResolvedValue([
      { body: '<!-- claude-review-responder-attempt -->' },
      { body: '<!-- claude-review-responder-attempt -->' },
    ]);
    await run({ github, context, core });
    expect(JSON.parse(core.getOutput('pr_numbers'))).toEqual([]);
  });

  it('fails closed (no PRs) when the thread scan errors', async () => {
    github.graphql.mockRejectedValue(new Error('API down'));
    await run({ github, context, core });
    expect(core.getOutput('has_prs')).toBe('false');
    expect(core.infos.some((m) => m.includes('scan failed'))).toBe(true);
  });

  it('emits no PRs when GraphQL returns a null repository (no read access)', async () => {
    github.graphql.mockResolvedValue({ repository: null });
    await run({ github, context, core });
    expect(core.getOutput('has_prs')).toBe('false');
    expect(JSON.parse(core.getOutput('pr_numbers'))).toEqual([]);
  });
});
