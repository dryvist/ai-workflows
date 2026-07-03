const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const run = require('../.github/scripts/review-thread-resolver/resolve-threads.js');
const { parseConfig, decideThread } = run;

const ENV_KEYS = [
  'BOT_REVIEWERS',
  'RESOLVE_OUTDATED',
  'RESOLVE_BOT_FAILURES',
  'FAILURE_PATTERNS',
  'PR_NUMBER',
  'SWEEP_REPOS',
];

function botComment(login, body = 'looks fine') {
  return { body, author: { login, __typename: 'Bot' } };
}

function humanComment(login = 'some-user', body = 'thanks') {
  return { body, author: { login, __typename: 'User' } };
}

function makeThread({ id = 'T_1', isResolved = false, isOutdated = false, comments = [], hasMoreComments = false } = {}) {
  return {
    id,
    isResolved,
    isOutdated,
    path: 'src/example.js',
    comments: { pageInfo: { hasNextPage: hasMoreComments }, nodes: comments },
  };
}

function threadPage(threads, { hasNextPage = false, endCursor = null } = {}) {
  return {
    repository: {
      pullRequest: {
        reviewThreads: { pageInfo: { hasNextPage, endCursor }, nodes: threads },
      },
    },
  };
}

describe('review-thread-resolver/decideThread', () => {
  const config = parseConfig({});

  it('resolves an outdated all-bot thread', () => {
    const thread = makeThread({ isOutdated: true, comments: [botComment('gemini-code-assist')] });
    expect(decideThread(thread, config)).toBe('outdated');
  });

  it('does not resolve outdated threads when resolve_outdated is false', () => {
    const cfg = parseConfig({ RESOLVE_OUTDATED: 'false' });
    const thread = makeThread({ isOutdated: true, comments: [botComment('gemini-code-assist')] });
    expect(decideThread(thread, cfg)).toBe(null);
  });

  it('resolves a failure-notice thread even when not outdated', () => {
    const thread = makeThread({
      comments: [botComment('gemini-code-assist', 'The review run hit a startup_failure, try again by commenting')],
    });
    expect(decideThread(thread, config)).toBe('bot-failure');
  });

  it('never resolves a thread containing a human comment', () => {
    const thread = makeThread({
      isOutdated: true,
      comments: [botComment('gemini-code-assist', 'startup_failure'), humanComment()],
    });
    expect(decideThread(thread, config)).toBe(null);
  });

  it('never resolves threads from bots outside bot_reviewers', () => {
    const thread = makeThread({ isOutdated: true, comments: [botComment('some-other-bot')] });
    expect(decideThread(thread, config)).toBe(null);
  });

  it('strips a [bot] suffix before matching the login', () => {
    const thread = makeThread({ isOutdated: true, comments: [botComment('gemini-code-assist[bot]')] });
    expect(decideThread(thread, config)).toBe('outdated');
  });

  it('leaves threads with a truncated comment list alone', () => {
    const thread = makeThread({
      isOutdated: true,
      comments: [botComment('gemini-code-assist')],
      hasMoreComments: true,
    });
    expect(decideThread(thread, config)).toBe(null);
  });

  it('leaves empty threads alone', () => {
    expect(decideThread(makeThread({ isOutdated: true }), config)).toBe(null);
  });
});

describe('review-thread-resolver/run', () => {
  let core, context, github;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext({ payload: { pull_request: { number: 7 } } });
    github = createMockGithub();
    github.graphql = mock();
    core.warning = mock();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('no PR context and no sweep_repos is a clean no-op', async () => {
    context.payload = {};
    await run({ github, context, core });
    expect(core.getOutput('resolved_count')).toBe('0');
    expect(github.graphql).not.toHaveBeenCalled();
  });

  it('resolves matching threads and skips resolved/human ones', async () => {
    github.graphql.mockImplementation((query, vars) => {
      if (query.includes('resolveReviewThread')) return Promise.resolve({});
      return Promise.resolve(
        threadPage([
          makeThread({ id: 'T_out', isOutdated: true, comments: [botComment('gemini-code-assist')] }),
          makeThread({ id: 'T_done', isResolved: true, isOutdated: true, comments: [botComment('gemini-code-assist')] }),
          makeThread({ id: 'T_human', isOutdated: true, comments: [botComment('gemini-code-assist'), humanComment()] }),
        ])
      );
    });

    await run({ github, context, core });

    expect(core.getOutput('resolved_count')).toBe('1');
    const mutationCalls = github.graphql.mock.calls.filter(([q]) => q.includes('resolveReviewThread'));
    expect(mutationCalls.length).toBe(1);
    expect(mutationCalls[0][1]).toEqual({ threadId: 'T_out' });
  });

  it('warns and continues when a mutation is rejected', async () => {
    let failedOnce = false;
    github.graphql.mockImplementation((query, vars) => {
      if (query.includes('resolveReviewThread')) {
        if (!failedOnce) {
          failedOnce = true;
          return Promise.reject(new Error('Resource not accessible by integration'));
        }
        return Promise.resolve({});
      }
      return Promise.resolve(
        threadPage([
          makeThread({ id: 'T_1', isOutdated: true, comments: [botComment('gemini-code-assist')] }),
          makeThread({ id: 'T_2', isOutdated: true, comments: [botComment('gemini-code-assist')] }),
        ])
      );
    });

    await run({ github, context, core });

    expect(core.getOutput('resolved_count')).toBe('1');
    expect(core.warning).toHaveBeenCalled();
  });

  it('paginates across review-thread pages', async () => {
    let queryCount = 0;
    github.graphql.mockImplementation((query) => {
      if (query.includes('resolveReviewThread')) return Promise.resolve({});
      queryCount += 1;
      if (queryCount === 1) {
        return Promise.resolve(
          threadPage([makeThread({ id: 'T_p1', isOutdated: true, comments: [botComment('gemini-code-assist')] })], {
            hasNextPage: true,
            endCursor: 'CUR',
          })
        );
      }
      return Promise.resolve(
        threadPage([makeThread({ id: 'T_p2', isOutdated: true, comments: [botComment('gemini-code-assist')] })])
      );
    });

    await run({ github, context, core });

    expect(core.getOutput('resolved_count')).toBe('2');
    expect(queryCount).toBe(2);
  });

  it('sweep mode processes every open PR in every listed repo and survives a bad repo', async () => {
    process.env.SWEEP_REPOS = 'repo-a,repo-b';
    context.payload = {};
    github.paginate.mockImplementation((fn, opts) => {
      if (opts.repo === 'repo-a') return Promise.resolve([{ number: 1 }, { number: 2 }]);
      return Promise.reject(new Error('Not Found'));
    });
    github.graphql.mockImplementation((query) => {
      if (query.includes('resolveReviewThread')) return Promise.resolve({});
      return Promise.resolve(
        threadPage([makeThread({ id: 'T_s', isOutdated: true, comments: [botComment('gemini-code-assist')] })])
      );
    });

    await run({ github, context, core });

    expect(core.getOutput('resolved_count')).toBe('2');
    expect(core.warning).toHaveBeenCalledTimes(1);
  });

  it('honors a custom bot_reviewers list from env', async () => {
    process.env.BOT_REVIEWERS = 'custom-reviewer';
    github.graphql.mockImplementation((query) => {
      if (query.includes('resolveReviewThread')) return Promise.resolve({});
      return Promise.resolve(
        threadPage([
          makeThread({ id: 'T_custom', isOutdated: true, comments: [botComment('custom-reviewer')] }),
          makeThread({ id: 'T_gemini', isOutdated: true, comments: [botComment('gemini-code-assist')] }),
        ])
      );
    });

    await run({ github, context, core });

    const mutationCalls = github.graphql.mock.calls.filter(([q]) => q.includes('resolveReviewThread'));
    expect(mutationCalls.length).toBe(1);
    expect(mutationCalls[0][1]).toEqual({ threadId: 'T_custom' });
  });
});
