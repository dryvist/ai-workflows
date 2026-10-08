const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const run = require('../.github/scripts/ci-fix/post-attempt-comment.js');

const MARKER = '<!-- claude-ci-fix-attempt -->';

describe('post-attempt-comment', () => {
  let core, context, github;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext();
    github = createMockGithub();
    process.env.PR_NUMBER = '10';
    process.env.ATTEMPT = '1';
    delete process.env.DRY_RUN;
    github.rest.issues.createComment.mockResolvedValue({});
  });

  it('posts comment with marker and attempt number', async () => {
    await run({ github, context, core });
    expect(github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 10,
        body: expect.stringContaining(MARKER),
      })
    );
    const body = github.rest.issues.createComment.mock.calls[0][0].body;
    expect(body).toContain('Attempt 1/2');
  });

  it('labels dry-run attempts while retaining the per-PR tracking marker', async () => {
    process.env.DRY_RUN = 'true';
    await run({ github, context, core });

    const body = github.rest.issues.createComment.mock.calls[0][0].body;
    expect(body).toContain(MARKER);
    expect(body).toContain('Dry run: no patch was published.');
  });

  it('falls back to ? when ATTEMPT env is missing (bug fix)', async () => {
    delete process.env.ATTEMPT;
    await run({ github, context, core });
    const body = github.rest.issues.createComment.mock.calls[0][0].body;
    expect(body).toContain('?/2');
  });

  it('calls setFailed when PR_NUMBER is invalid', async () => {
    process.env.PR_NUMBER = 'invalid';
    await run({ github, context, core });
    expect(core.setFailed).toHaveBeenCalled();
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });
});
