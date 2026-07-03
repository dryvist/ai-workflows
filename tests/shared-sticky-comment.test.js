const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const run = require('../.github/scripts/shared/sticky-comment.js');

const ENV_KEYS = ['BODY_FILE', 'MARKER_MATCH', 'MARKER_WRITE', 'PR_NUMBER', 'WORKFLOW_NAME', 'RUN_URL', 'EVENT_NAME', 'TRIGGER_ACTOR'];

describe('shared/sticky-comment', () => {
  let core, context, github, tmpDir;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext({ payload: { pull_request: { number: 5 } } });
    github = createMockGithub();
    github.rest.issues.updateComment = mock();
    github.paginate.mockResolvedValue([]);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-'));
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.MARKER_MATCH = '<!-- cc-dep-review -->';
    process.env.BODY_FILE = path.join(tmpDir, 'body.md');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('creates a comment when none matches the marker', async () => {
    fs.writeFileSync(process.env.BODY_FILE, '## Dependency Review (AI)\nAll clear.');
    await run({ github, context, core });

    expect(core.getOutput('posted')).toBe('true');
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(1);
    const call = github.rest.issues.createComment.mock.calls[0][0];
    expect(call.issue_number).toBe(5);
    expect(call.body.startsWith('<!-- cc-dep-review -->')).toBe(true);
  });

  it('updates the existing marker comment instead of duplicating', async () => {
    fs.writeFileSync(process.env.BODY_FILE, 'updated content');
    github.paginate.mockResolvedValue([
      { id: 11, body: 'unrelated' },
      { id: 22, body: '<!-- cc-dep-review -->\nold content' },
    ]);

    await run({ github, context, core });

    expect(github.rest.issues.updateComment).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.updateComment.mock.calls[0][0].comment_id).toBe(22);
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('matches on MARKER_MATCH prefix but writes MARKER_WRITE', async () => {
    process.env.MARKER_MATCH = '<!-- cc-release-notes';
    process.env.MARKER_WRITE = '<!-- cc-release-notes sha:abc123 -->';
    fs.writeFileSync(process.env.BODY_FILE, 'highlights');
    github.paginate.mockResolvedValue([{ id: 7, body: '<!-- cc-release-notes sha:old456 -->\nstale' }]);

    await run({ github, context, core });

    const body = github.rest.issues.updateComment.mock.calls[0][0].body;
    expect(body.startsWith('<!-- cc-release-notes sha:abc123 -->')).toBe(true);
  });

  it('is a clean no-op when the body file does not exist', async () => {
    await run({ github, context, core });
    expect(core.getOutput('posted')).toBe('false');
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('appends the AI provenance footer when RUN_URL is set', async () => {
    fs.writeFileSync(process.env.BODY_FILE, 'content');
    process.env.RUN_URL = 'https://example.test/run/1';
    process.env.WORKFLOW_NAME = 'CC Dep Review';

    await run({ github, context, core });

    const body = github.rest.issues.createComment.mock.calls[0][0].body;
    expect(body).toContain('AI Provenance');
    expect(body).toContain('https://example.test/run/1');
  });

  it('fails when required env vars are missing', async () => {
    delete process.env.MARKER_MATCH;
    await run({ github, context, core });
    expect(core.failures.length).toBe(1);
  });

  it('takes PR number from env when payload lacks it', async () => {
    context.payload = {};
    process.env.PR_NUMBER = '31';
    fs.writeFileSync(process.env.BODY_FILE, 'content');

    await run({ github, context, core });

    expect(github.rest.issues.createComment.mock.calls[0][0].issue_number).toBe(31);
  });
});
