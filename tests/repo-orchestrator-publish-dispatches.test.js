const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMockCore, createMockContext } = require('./helpers.js');
const run = require('../.github/scripts/repo-orchestrator/publish-dispatches.js');

describe('repository-orchestrator publisher', () => {
  let dir, core, context, github;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-publish-'));
    process.env.RESULT_FILE = path.join(dir, 'result.json');
    process.env.TARGET_REPOS = 'alpha,beta';
    process.env.WORKFLOW_FILE = 'deploy.yml';
    process.env.TARGET_REF = 'main';
    process.env.GITHUB_RUN_ID = '77';
    core = createMockCore();
    context = createMockContext({ runId: 77 });
    github = { rest: {
      repos: { get: mock(async () => ({ data: { archived: false } })) },
      actions: { getWorkflow: mock(async () => ({})), createWorkflowDispatch: mock(async () => ({})) },
    } };
  });
  afterEach(() => {
    for (const key of ['RESULT_FILE', 'TARGET_REPOS', 'WORKFLOW_FILE', 'TARGET_REF', 'GITHUB_RUN_ID']) delete process.env[key];
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('dispatches only validated repository names with a fixed correlation id', async () => {
    fs.writeFileSync(process.env.RESULT_FILE, JSON.stringify({ action: 'dispatch', repositories: ['alpha', 'beta'] }));
    await run({ github, context, core });
    expect(github.rest.actions.createWorkflowDispatch).toHaveBeenCalledTimes(2);
    expect(github.rest.actions.createWorkflowDispatch.mock.calls[0][0].inputs).toEqual({ correlation_id: 'orchestrator-77' });
    expect(core.getOutput('dispatched_count')).toBe('2');
  });

  it('rejects repositories outside the requested scope', async () => {
    fs.writeFileSync(process.env.RESULT_FILE, JSON.stringify({ action: 'dispatch', repositories: ['gamma'] }));
    await run({ github, context, core });
    expect(core.failures).toHaveLength(1);
    expect(github.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled();
  });
});
