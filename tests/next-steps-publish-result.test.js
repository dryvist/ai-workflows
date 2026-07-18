const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMockCore, createMockContext } = require('./helpers.js');
const run = require('../.github/scripts/next-steps/publish-result.js');

describe('next-steps publisher', () => {
  let dir, core, context, github;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-steps-publish-'));
    process.env.RESULT_FILE = path.join(dir, 'result.json');
    core = createMockCore();
    context = createMockContext();
    github = { rest: { issues: { create: mock(async () => ({ data: { number: 21 } })) } } };
  });
  afterEach(() => { delete process.env.RESULT_FILE; fs.rmSync(dir, { recursive: true, force: true }); });

  it('creates only the typed issue with ai:created added by the publisher', async () => {
    fs.writeFileSync(process.env.RESULT_FILE, JSON.stringify({
      action: 'issue', title: 'chore: add missing coverage', context: 'Recent parser work', gap: 'No regression test',
      approach: 'Add one focused test', labels: ['type:chore', 'size:xs', 'priority:medium'],
    }));
    await run({ github, context, core });
    const issue = github.rest.issues.create.mock.calls[0][0];
    expect(issue.labels).toEqual(['ai:created', 'type:chore', 'size:xs', 'priority:medium']);
    expect(issue.body).toContain('## Suggested approach');
  });

  it('rejects arbitrary or mismatched labels', async () => {
    fs.writeFileSync(process.env.RESULT_FILE, JSON.stringify({
      action: 'issue', title: 'bug: x', context: 'x', gap: 'x', approach: 'x',
      labels: ['type:chore', 'size:xs', 'admin'],
    }));
    await run({ github, context, core });
    expect(core.failures).toHaveLength(1);
    expect(github.rest.issues.create).not.toHaveBeenCalled();
  });
});
