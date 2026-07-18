const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const publish = require('../.github/scripts/label-sync/publish.js');

describe('label-sync publisher', () => {
  let dir, file, github, context, core;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'label-sync-'));
    file = path.join(dir, 'result.json');
    process.env.RESULT_FILE = file;
    process.env.TARGET_REPOSITORIES = 'test-owner/test-repo';
    github = createMockGithub();
    github.rest.issues.getLabel = mock();
    github.rest.issues.createLabel = mock();
    github.rest.issues.updateLabel = mock();
    github.rest.repos.getContent.mockResolvedValue({
      data: {
        type: 'file',
        encoding: 'base64',
        content: Buffer.from([
          '- name: "type:bug"',
          '  color: "d73a4a"',
          '  description: "Bug"',
          '- name: "type:docs"',
          '  color: "0075ca"',
          '  description: "Docs"',
          '- name: "ai:ready"',
          '  color: "0e8a16"',
          '  description: "ready"',
        ].join('\n')).toString('base64'),
      },
    });
    context = createMockContext();
    core = createMockCore();
  });

  afterEach(() => {
    delete process.env.RESULT_FILE;
    delete process.env.TARGET_REPOSITORIES;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates missing labels and updates only drifted labels', async () => {
    github.rest.issues.getLabel
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }))
      .mockResolvedValueOnce({ data: { color: 'ffffff', description: 'old' } })
      .mockResolvedValueOnce({ data: { color: '0e8a16', description: 'ready' } });
    fs.writeFileSync(file, JSON.stringify({ repositories: [{
      name: 'test-owner/test-repo',
      labels: [
        { name: 'type:bug', color: 'd73a4a', description: 'Bug' },
        { name: 'type:docs', color: '0075ca', description: 'Docs' },
        { name: 'ai:ready', color: '0e8a16', description: 'ready' },
      ],
    }] }));
    await publish({ github, context, core });
    expect(github.rest.issues.createLabel).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.updateLabel).toHaveBeenCalledTimes(1);
    expect(core.failures).toHaveLength(0);
  });

  it('rejects repositories outside the owner and target allowlists', async () => {
    fs.writeFileSync(file, JSON.stringify({ repositories: [{
      name: 'other/repo', labels: [],
    }] }));
    await publish({ github, context, core });
    expect(core.failures).toHaveLength(1);
    expect(github.rest.issues.getLabel).not.toHaveBeenCalled();
  });

  it('rejects malformed colors before any write', async () => {
    fs.writeFileSync(file, JSON.stringify({ repositories: [{
      name: 'test-owner/test-repo',
      labels: [{ name: 'type:bug', color: '#fff', description: 'Bug' }],
    }] }));
    await publish({ github, context, core });
    expect(core.failures).toHaveLength(1);
    expect(github.rest.issues.getLabel).not.toHaveBeenCalled();
  });

  it('rejects a well-formed label that is not canonical', async () => {
    fs.writeFileSync(file, JSON.stringify({ repositories: [{
      name: 'test-owner/test-repo',
      labels: [{ name: 'custom', color: 'ffffff', description: 'Not canonical' }],
    }] }));
    await publish({ github, context, core });
    expect(core.failures[0]).toContain('canonical definition');
    expect(github.rest.issues.getLabel).not.toHaveBeenCalled();
  });
});
