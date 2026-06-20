const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const run = require('../.github/scripts/shared/check-daily-limit.js');

describe('check-daily-limit', () => {
  let core, context, github;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext();
    github = createMockGithub();
    delete process.env.DAILY_RUN_LIMIT;
    delete process.env.WORKFLOW_FILE;
  });

  it('sets should_run=true when under the daily limit', async () => {
    process.env.WORKFLOW_FILE = 'dryvist/ai-workflows/.github/workflows/cc-code-simplifier.yml@refs/heads/main';
    process.env.DAILY_RUN_LIMIT = '5';

    const now = new Date();
    const recentRun = { created_at: new Date(now - 60 * 60 * 1000).toISOString() }; // 1 hour ago
    github.rest.actions.listWorkflowRuns.mockResolvedValue({
      data: { workflow_runs: [recentRun, recentRun] }, // 2 runs
    });

    await run({ github, context, core });

    expect(core.getOutput('should_run')).toBe('true');
    expect(core.failures).toHaveLength(0);
  });

  it('calls setFailed when daily limit is reached', async () => {
    process.env.WORKFLOW_FILE = 'dryvist/ai-workflows/.github/workflows/cc-code-simplifier.yml@refs/heads/main';
    process.env.DAILY_RUN_LIMIT = '3';

    const now = new Date();
    const recentRun = { created_at: new Date(now - 60 * 60 * 1000).toISOString() }; // 1 hour ago
    github.rest.actions.listWorkflowRuns.mockResolvedValue({
      data: { workflow_runs: [recentRun, recentRun, recentRun] }, // 3 runs = limit
    });

    await run({ github, context, core });

    expect(core.failures).toHaveLength(1);
    expect(core.failures[0]).toMatch(/Daily limit reached \(3\/3/);
    expect(core.getOutput('should_run')).toBeUndefined();
  });

  it('excludes runs older than 24 hours from count', async () => {
    process.env.WORKFLOW_FILE = 'owner/repo/.github/workflows/test.yml@refs/heads/main';
    process.env.DAILY_RUN_LIMIT = '5';

    const now = new Date();
    const recentRun = { created_at: new Date(now - 60 * 60 * 1000).toISOString() }; // 1 hour ago
    const oldRun = { created_at: new Date(now - 25 * 60 * 60 * 1000).toISOString() }; // 25 hours ago
    github.rest.actions.listWorkflowRuns.mockResolvedValue({
      data: { workflow_runs: [recentRun, oldRun, oldRun, oldRun, oldRun] }, // 1 recent + 4 old
    });

    await run({ github, context, core });

    expect(core.getOutput('should_run')).toBe('true');
    expect(core.failures).toHaveLength(0);
  });

  it('disables limit when DAILY_RUN_LIMIT=0', async () => {
    process.env.DAILY_RUN_LIMIT = '0';
    process.env.WORKFLOW_FILE = 'owner/repo/.github/workflows/test.yml@refs/heads/main';

    await run({ github, context, core });

    expect(core.getOutput('should_run')).toBe('true');
    expect(github.rest.actions.listWorkflowRuns.mock.calls).toHaveLength(0);
  });

  it('extracts workflow file name from workflow_ref', async () => {
    process.env.WORKFLOW_FILE = 'dryvist/ai-workflows/.github/workflows/best-practices.yml@refs/heads/main';
    process.env.DAILY_RUN_LIMIT = '5';

    github.rest.actions.listWorkflowRuns.mockResolvedValue({
      data: { workflow_runs: [] },
    });

    await run({ github, context, core });

    const call = github.rest.actions.listWorkflowRuns.mock.calls[0][0];
    expect(call.workflow_id).toBe('best-practices.yml');
  });

  it('defaults to limit of 5 when DAILY_RUN_LIMIT is not set', async () => {
    process.env.WORKFLOW_FILE = 'owner/repo/.github/workflows/test.yml@refs/heads/main';

    github.rest.actions.listWorkflowRuns.mockResolvedValue({
      data: { workflow_runs: [] },
    });

    await run({ github, context, core });

    expect(core.getOutput('should_run')).toBe('true');
  });

  // --- Edge case / failure-mode tests ---

  it('fails when DAILY_RUN_LIMIT is non-numeric', async () => {
    process.env.DAILY_RUN_LIMIT = 'abc';
    process.env.WORKFLOW_FILE = 'owner/repo/.github/workflows/test.yml@refs/heads/main';

    await run({ github, context, core });

    expect(core.failures).toHaveLength(1);
    expect(core.failures[0]).toMatch(/Invalid DAILY_RUN_LIMIT.*"abc"/);
    expect(github.rest.actions.listWorkflowRuns.mock.calls).toHaveLength(0);
  });

  it('fails when DAILY_RUN_LIMIT is negative', async () => {
    process.env.DAILY_RUN_LIMIT = '-1';
    process.env.WORKFLOW_FILE = 'owner/repo/.github/workflows/test.yml@refs/heads/main';

    await run({ github, context, core });

    expect(core.failures).toHaveLength(1);
    expect(core.failures[0]).toMatch(/Invalid DAILY_RUN_LIMIT.*"-1"/);
    expect(github.rest.actions.listWorkflowRuns.mock.calls).toHaveLength(0);
  });

  it('fails when DAILY_RUN_LIMIT is an empty string', async () => {
    process.env.DAILY_RUN_LIMIT = '';
    process.env.WORKFLOW_FILE = 'owner/repo/.github/workflows/test.yml@refs/heads/main';

    // Empty string falls through to default '5', so this should succeed
    github.rest.actions.listWorkflowRuns.mockResolvedValue({
      data: { workflow_runs: [] },
    });

    await run({ github, context, core });

    // Empty string is falsy, so || '5' kicks in — should behave like default
    expect(core.getOutput('should_run')).toBe('true');
    expect(core.failures).toHaveLength(0);
  });

  it('fails when WORKFLOW_FILE is not set', async () => {
    process.env.DAILY_RUN_LIMIT = '5';
    // WORKFLOW_FILE intentionally not set

    await run({ github, context, core });

    expect(core.failures).toHaveLength(1);
    expect(core.failures[0]).toMatch(/WORKFLOW_FILE environment variable is required/);
    expect(github.rest.actions.listWorkflowRuns.mock.calls).toHaveLength(0);
  });

  it('fails when DAILY_RUN_LIMIT is a float', async () => {
    process.env.DAILY_RUN_LIMIT = '3.7';
    process.env.WORKFLOW_FILE = 'owner/repo/.github/workflows/test.yml@refs/heads/main';

    // parseInt('3.7', 10) => 3 which is valid, so this should work
    github.rest.actions.listWorkflowRuns.mockResolvedValue({
      data: { workflow_runs: [] },
    });

    await run({ github, context, core });

    expect(core.getOutput('should_run')).toBe('true');
    expect(core.failures).toHaveLength(0);
  });

  it('paginates when first page is full of recent runs', async () => {
    process.env.WORKFLOW_FILE = 'owner/repo/.github/workflows/test.yml@refs/heads/main';
    process.env.DAILY_RUN_LIMIT = '150';

    const now = new Date();
    const recentRun = { created_at: new Date(now - 60 * 60 * 1000).toISOString() };
    const oldRun = { created_at: new Date(now - 25 * 60 * 60 * 1000).toISOString() };

    // First page: 100 recent runs
    const page1Runs = Array(100).fill(recentRun);
    // Second page: 20 recent + 1 old (triggers stop)
    const page2Runs = [...Array(20).fill(recentRun), oldRun];

    let callCount = 0;
    github.rest.actions.listWorkflowRuns.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ data: { workflow_runs: page1Runs } });
      }
      return Promise.resolve({ data: { workflow_runs: page2Runs } });
    });

    await run({ github, context, core });

    expect(github.rest.actions.listWorkflowRuns.mock.calls).toHaveLength(2);
    expect(core.getOutput('should_run')).toBe('true');
    expect(core.failures).toHaveLength(0);
  });

  it('stops paginating once daily limit is reached', async () => {
    process.env.WORKFLOW_FILE = 'owner/repo/.github/workflows/test.yml@refs/heads/main';
    process.env.DAILY_RUN_LIMIT = '5';

    const now = new Date();
    const recentRun = { created_at: new Date(now - 60 * 60 * 1000).toISOString() };

    // 100 recent runs on first page — should stop after counting 5
    github.rest.actions.listWorkflowRuns.mockResolvedValue({
      data: { workflow_runs: Array(100).fill(recentRun) },
    });

    await run({ github, context, core });

    // Should only fetch one page since limit is hit within first page
    expect(github.rest.actions.listWorkflowRuns.mock.calls).toHaveLength(1);
    expect(core.failures).toHaveLength(1);
    expect(core.failures[0]).toMatch(/Daily limit reached \(5\/5/);
  });
});
