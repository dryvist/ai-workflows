const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const run = require('../.github/scripts/ci-fix/find-pr.js');

describe('find-pr', () => {
  let core, context, github;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext({
      payload: { workflow_run: { head_branch: 'feat/my-feature' } },
    });
    github = createMockGithub();
  });

  it('sets pr_number when open PR found for branch', async () => {
    github.rest.pulls.list.mockResolvedValue({ data: [{ number: 42 }] });
    await run({ github, context, core });
    expect(core.getOutput('pr_number')).toBe('42');
  });

  it('sets empty pr_number when no PR found', async () => {
    github.rest.pulls.list.mockResolvedValue({ data: [] });
    await run({ github, context, core });
    expect(core.getOutput('pr_number')).toBe('');
  });

  it('uses caller-supplied failed branch metadata', async () => {
    context = createMockContext({ payload: {} });
    process.env.FAILURE_HEAD_BRANCH = 'feat/caller-context';
    github.rest.pulls.list.mockResolvedValue({ data: [{ number: 43 }] });

    await run({ github, context, core });

    expect(github.rest.pulls.list.mock.calls[0][0].head).toBe('test-owner:feat/caller-context');
    expect(core.getOutput('pr_number')).toBe('43');
    delete process.env.FAILURE_HEAD_BRANCH;
  });
});
