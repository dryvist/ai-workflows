const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const run = require('../.github/scripts/ci-fail-issue/create-failure-issue.js');

// Lightweight mock factory that avoids require('bun:test') at test-file scope.
// Calling require('bun:test') at the top level of a .test.js file prevents
// bun from injecting describe/it/expect globals in bun v1.3.3.
function makeMock() {
  const calls = [];
  const queue = [];
  const fn = async (...args) => {
    calls.push(args);
    if (queue.length > 0) {
      const next = queue.shift();
      if (next.reject) throw next.reject;
      return next.resolve;
    }
    return undefined;
  };
  fn.mock = { calls };
  fn.mockResolvedValueOnce = (val) => { queue.push({ resolve: val }); return fn; };
  fn.mockRejectedValueOnce = (err) => { queue.push({ reject: err }); return fn; };
  return fn;
}

describe('ci-fail-issue/create-failure-issue', () => {
  let core, context, github;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext({
      payload: { workflow_run: { id: 999 } }
    });
    github = createMockGithub();
    // Add methods not yet present in the shared helper
    github.rest.issues.create = makeMock();
    github.rest.issues.addAssignees = makeMock();

    process.env.COMMIT_SHA = 'abc123def456abc123def456abc123def456abc1';
    process.env.RUN_URL = 'https://github.com/test-owner/test-repo/actions/runs/999';
    process.env.WORKFLOW_NAME = 'CI Gate';
  });

  afterEach(() => {
    delete process.env.COMMIT_SHA;
    delete process.env.RUN_URL;
    delete process.env.WORKFLOW_NAME;
  });

  it('happy path: creates issue with logs and assigns to copilot', async () => {
    github.paginate.mockResolvedValueOnce([
      { id: 101, name: 'build', conclusion: 'failure' }
    ]);
    github.rest.actions.downloadJobLogsForWorkflowRun.mockResolvedValueOnce({
      data: 'line1\nline2\nline3'
    });
    github.rest.issues.create.mockResolvedValueOnce({
      data: { number: 42, html_url: 'https://github.com/test-owner/test-repo/issues/42' }
    });
    github.rest.issues.addAssignees.mockResolvedValueOnce({});

    await run({ github, context, core });

    const createCall = github.rest.issues.create.mock.calls[0][0];
    expect(createCall.title).toContain('CI failure on main');
    expect(createCall.title).toContain('CI Gate');
    expect(createCall.title).toContain('abc123d');
    expect(createCall.body).toContain('<!-- ci-fail-issue -->');
    expect(createCall.body).toContain('CI Gate');
    expect(createCall.body).toContain('abc123def456abc123def456abc123def456abc1');
    expect(createCall.body).toContain('https://github.com/test-owner/test-repo/actions/runs/999');
    expect(createCall.body).toContain('FAILED JOB: build');
    expect(createCall.labels).toContain('ai:created');
    expect(createCall.labels).toContain('type:ci');
    expect(createCall.labels).toContain('priority:high');

    const assignCall = github.rest.issues.addAssignees.mock.calls[0][0];
    expect(assignCall.assignees).toEqual(['copilot[bot]']);
    expect(assignCall.issue_number).toBe(42);

    expect(core.getOutput('issue_number')).toBe('42');
    expect(core.getOutput('issue_url')).toBe('https://github.com/test-owner/test-repo/issues/42');
  });

  it('no failed jobs: creates issue with (no logs available)', async () => {
    github.paginate.mockResolvedValueOnce([
      { id: 201, name: 'build', conclusion: 'success' }
    ]);
    github.rest.issues.create.mockResolvedValueOnce({
      data: { number: 43, html_url: 'https://github.com/test-owner/test-repo/issues/43' }
    });
    github.rest.issues.addAssignees.mockResolvedValueOnce({});

    await run({ github, context, core });

    expect(github.rest.actions.downloadJobLogsForWorkflowRun.mock.calls.length).toBe(0);

    const createCall = github.rest.issues.create.mock.calls[0][0];
    expect(createCall.body).toContain('(no logs available)');

    expect(core.getOutput('issue_number')).toBe('43');
  });

  it('log download fails: creates issue with error message in body', async () => {
    github.paginate.mockResolvedValueOnce([
      { id: 301, name: 'test', conclusion: 'failure' }
    ]);
    github.rest.actions.downloadJobLogsForWorkflowRun.mockRejectedValueOnce(
      new Error('403 Forbidden')
    );
    github.rest.issues.create.mockResolvedValueOnce({
      data: { number: 44, html_url: 'https://github.com/test-owner/test-repo/issues/44' }
    });
    github.rest.issues.addAssignees.mockResolvedValueOnce({});

    await run({ github, context, core });

    const createCall = github.rest.issues.create.mock.calls[0][0];
    expect(createCall.body).toContain('Could not download logs');
    expect(createCall.body).toContain('403 Forbidden');

    expect(core.getOutput('issue_number')).toBe('44');
    expect(core.getOutput('issue_url')).toBe('https://github.com/test-owner/test-repo/issues/44');
  });

  it('copilot assignment fails: issue still created and outputs still set', async () => {
    github.paginate.mockResolvedValueOnce([
      { id: 401, name: 'lint', conclusion: 'failure' }
    ]);
    github.rest.actions.downloadJobLogsForWorkflowRun.mockResolvedValueOnce({
      data: 'some log output'
    });
    github.rest.issues.create.mockResolvedValueOnce({
      data: { number: 45, html_url: 'https://github.com/test-owner/test-repo/issues/45' }
    });
    github.rest.issues.addAssignees.mockRejectedValueOnce(
      new Error('copilot[bot] is not a valid assignee')
    );

    await run({ github, context, core });

    expect(github.rest.issues.create.mock.calls.length).toBe(1);

    expect(core.getOutput('issue_number')).toBe('45');
    expect(core.getOutput('issue_url')).toBe('https://github.com/test-owner/test-repo/issues/45');
  });

  it('uses caller-supplied run ID without workflow_run event payload', async () => {
    context = createMockContext({ payload: {} });
    process.env.FAILURE_RUN_ID = '789';
    github.rest.issues.create.mockResolvedValueOnce({
      data: { number: 46, html_url: 'https://github.com/test-owner/test-repo/issues/46' }
    });
    github.rest.issues.addAssignees.mockResolvedValueOnce({});
    github.paginate.mockResolvedValueOnce([]);

    await run({ github, context, core });

    expect(github.paginate.mock.calls[0][1].run_id).toBe('789');
    expect(core.getOutput('issue_number')).toBe('46');
    delete process.env.FAILURE_RUN_ID;
  });
});
