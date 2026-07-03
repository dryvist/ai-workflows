const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = require('../.github/scripts/iac-drift/upsert-drift-issue.js');

const WORKDIR = 'infra/stack';
const MARKER = `<!-- iac-drift:${WORKDIR} -->`;

function ctx() {
  return createMockContext({ serverUrl: 'https://github.com', runId: 4242 });
}

describe('iac-drift upsert-drift-issue', () => {
  let core, context, github;

  beforeEach(() => {
    core = createMockCore();
    context = ctx();
    github = createMockGithub();
    github.rest.issues.create.mockResolvedValue({ data: { number: 100 } });
    github.rest.issues.update.mockResolvedValue({});
    github.rest.issues.createComment.mockResolvedValue({});
    process.env.WORKDIR = WORKDIR;
    process.env.PLAN_FILE = '';
    process.env.POST_PLAN_EXCERPT = 'false';
  });

  afterEach(() => {
    delete process.env.PLAN_EXIT_CODE;
    delete process.env.WORKDIR;
    delete process.env.PLAN_FILE;
    delete process.env.POST_PLAN_EXCERPT;
  });

  it('creates a drift issue on exit 2 when none exists', async () => {
    process.env.PLAN_EXIT_CODE = '2';
    github.paginate.mockResolvedValueOnce([]); // no open drift issues

    await run({ github, context, core });

    expect(github.rest.issues.create).toHaveBeenCalledTimes(1);
    const arg = github.rest.issues.create.mock.calls[0][0];
    expect(arg.title).toBe(`IaC drift detected: test-repo ${WORKDIR}`);
    expect(arg.body).toContain(MARKER);
    expect(arg.labels).toEqual(['iac-drift']);
    expect(github.rest.issues.update).not.toHaveBeenCalled();
  });

  it('updates in place (no duplicate) when a drift issue already exists', async () => {
    process.env.PLAN_EXIT_CODE = '2';
    github.paginate
      .mockResolvedValueOnce([{ number: 55, body: `intro\n${MARKER}\n`, pull_request: undefined }])
      .mockResolvedValueOnce([]); // no comments yet today

    await run({ github, context, core });

    expect(github.rest.issues.create).not.toHaveBeenCalled();
    expect(github.rest.issues.update).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.update.mock.calls[0][0].issue_number).toBe(55);
    // First heartbeat of the day is posted.
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.createComment.mock.calls[0][0].body).toContain('iac-drift-heartbeat');
  });

  it('does not stack a second heartbeat comment on the same day', async () => {
    process.env.PLAN_EXIT_CODE = '2';
    const today = new Date().toISOString().slice(0, 10);
    github.paginate
      .mockResolvedValueOnce([{ number: 55, body: MARKER }])
      .mockResolvedValueOnce([{ body: '<!-- iac-drift-heartbeat -->\nStill', created_at: `${today}T01:00:00Z` }]);

    await run({ github, context, core });

    expect(github.rest.issues.update).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('comments and closes the open issue on exit 0 (clean)', async () => {
    process.env.PLAN_EXIT_CODE = '0';
    github.paginate.mockResolvedValueOnce([{ number: 77, body: MARKER }]);

    await run({ github, context, core });

    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.createComment.mock.calls[0][0].body).toContain('Drift cleared');
    expect(github.rest.issues.update).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.update.mock.calls[0][0].state).toBe('closed');
  });

  it('does nothing on exit 0 when there is no open drift issue', async () => {
    process.env.PLAN_EXIT_CODE = '0';
    github.paginate.mockResolvedValueOnce([]);

    await run({ github, context, core });

    expect(github.rest.issues.create).not.toHaveBeenCalled();
    expect(github.rest.issues.update).not.toHaveBeenCalled();
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('opens a PLAN FAILURE issue on exit 1', async () => {
    process.env.PLAN_EXIT_CODE = '1';
    github.paginate.mockResolvedValueOnce([]);

    await run({ github, context, core });

    const arg = github.rest.issues.create.mock.calls[0][0];
    expect(arg.title).toBe(`IaC PLAN FAILURE: test-repo ${WORKDIR}`);
    expect(arg.body).toContain('PLAN FAILURE');
  });

  it('suppresses the plan excerpt by default even when a plan file exists', async () => {
    process.env.PLAN_EXIT_CODE = '2';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-drift-'));
    const planPath = path.join(dir, 'plan.txt');
    fs.writeFileSync(planPath, 'secret-bucket-name-should-not-leak\n');
    process.env.PLAN_FILE = planPath;
    process.env.POST_PLAN_EXCERPT = 'false';
    github.paginate.mockResolvedValueOnce([]);

    await run({ github, context, core });

    const arg = github.rest.issues.create.mock.calls[0][0];
    expect(arg.body).not.toContain('secret-bucket-name-should-not-leak');
    expect(arg.body).not.toContain('Plan excerpt');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('includes the plan excerpt when POST_PLAN_EXCERPT is true', async () => {
    process.env.PLAN_EXIT_CODE = '2';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-drift-'));
    const planPath = path.join(dir, 'plan.txt');
    fs.writeFileSync(planPath, 'Plan: 1 to add, 0 to change, 0 to destroy.\n');
    process.env.PLAN_FILE = planPath;
    process.env.POST_PLAN_EXCERPT = 'true';
    github.paginate.mockResolvedValueOnce([]);

    await run({ github, context, core });

    const arg = github.rest.issues.create.mock.calls[0][0];
    expect(arg.body).toContain('Plan excerpt');
    expect(arg.body).toContain('1 to add');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
