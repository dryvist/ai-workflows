// tests/helpers.js — shared mock factories for github, context, core
// Uses bun:test mock (built-in, no external dependencies)
const { mock } = require('bun:test');

function createMockCore() {
  const outputs = new Map();
  const infos = [];
  const failures = [];
  return {
    setOutput: mock((key, value) => outputs.set(key, value)),
    setFailed: mock((msg) => failures.push(msg)),
    info: mock((msg) => infos.push(msg)),
    getOutput: (key) => outputs.get(key),
    outputs,
    infos,
    failures,
  };
}

function createMockContext(overrides = {}) {
  return {
    repo: { owner: 'test-owner', repo: 'test-repo' },
    payload: {},
    sha: 'abc123sha',
    ...overrides,
  };
}

function createMockGithub() {
  const paginate = mock();
  paginate.iterator = mock();
  return {
    rest: {
      issues: {
        get: mock(),
        listComments: mock(),
        listCommentsForRepo: mock(),
        listForRepo: mock(),
        createComment: mock(),
        addLabels: mock(),
      },
      pulls: {
        get: mock(),
        list: mock(),
        listReviews: mock(),
      },
      checks: {
        listForRef: mock(),
      },
      repos: {
        getContent: mock(),
        getCommit: mock(),
        listCommits: mock(),
      },
      search: {
        issuesAndPullRequests: mock(),
      },
      actions: {
        listJobsForWorkflowRun: mock(),
        downloadJobLogsForWorkflowRun: mock(),
        listWorkflowRuns: mock(),
      },
    },
    paginate,
  };
}

module.exports = { createMockCore, createMockContext, createMockGithub };
