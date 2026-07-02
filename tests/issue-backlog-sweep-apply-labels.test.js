const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = require('../.github/scripts/issue-backlog-sweep/apply-labels.js');

function writeVerdict(dir, verdict) {
  fs.writeFileSync(path.join(dir, '.backlog-sweep.json'), JSON.stringify(verdict));
}

async function runIn(dir, deps) {
  const prev = process.cwd();
  process.chdir(dir);
  try { await run(deps); } finally { process.chdir(prev); }
}

describe('issue-backlog-sweep apply-labels', () => {
  let core, context, github, dir;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext();
    github = createMockGithub();
    github.rest.issues.addLabels.mockResolvedValue({});
    github.rest.issues.createComment.mockResolvedValue({});
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-sweep-'));
    delete process.env.BACKLOG_FILE;
    process.env.MAX_ISSUES = '5';
    process.env.RUN_URL = 'https://x/run/1';
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('applies labels and adds ai:ready only when ai_ready is true', async () => {
    writeVerdict(dir, {
      issues: [
        { number: 42, labels: ['type:bug', 'size:s', 'priority:medium'], ai_ready: true, reason: 'concrete fix' },
        { number: 7, labels: ['type:feature', 'size:l', 'priority:low'], ai_ready: false, reason: 'needs design' },
      ],
    });

    await runIn(dir, { github, context, core });

    expect(github.rest.issues.addLabels).toHaveBeenCalledTimes(2);
    const first = github.rest.issues.addLabels.mock.calls[0][0];
    expect(first.issue_number).toBe(42);
    expect(first.labels).toEqual(['type:bug', 'size:s', 'priority:medium', 'ai:ready']);
    const second = github.rest.issues.addLabels.mock.calls[1][0];
    expect(second.issue_number).toBe(7);
    expect(second.labels).not.toContain('ai:ready');
    expect(core.getOutput('labeled_count')).toBe('2');
    expect(core.getOutput('ai_ready_count')).toBe('1');
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(2);
  });

  it('drops labels outside the type:/size:/priority: whitelist', async () => {
    writeVerdict(dir, {
      issues: [
        { number: 1, labels: ['type:chore', 'size:xs', 'priority:medium', 'ai:ready', 'wontfix', 'random'], ai_ready: false },
      ],
    });

    await runIn(dir, { github, context, core });

    const call = github.rest.issues.addLabels.mock.calls[0][0];
    // 'ai:ready' from labels[] is dropped (only the ai_ready boolean adds it); here false.
    expect(call.labels).toEqual(['type:chore', 'size:xs', 'priority:medium']);
    expect(call.labels).not.toContain('wontfix');
    expect(call.labels).not.toContain('random');
    expect(call.labels).not.toContain('ai:ready');
  });

  it('does nothing when the verdict file is missing', async () => {
    await runIn(dir, { github, context, core });
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled();
    expect(core.getOutput('labeled_count')).toBe('0');
  });

  it('does nothing for an empty issues array', async () => {
    writeVerdict(dir, { issues: [] });
    await runIn(dir, { github, context, core });
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled();
    expect(core.getOutput('labeled_count')).toBe('0');
  });

  it('caps processing at MAX_ISSUES', async () => {
    process.env.MAX_ISSUES = '2';
    writeVerdict(dir, {
      issues: [1, 2, 3, 4].map(n => ({ number: n, labels: ['type:chore', 'size:xs', 'priority:low'], ai_ready: false })),
    });
    await runIn(dir, { github, context, core });
    expect(github.rest.issues.addLabels).toHaveBeenCalledTimes(2);
  });

  it('falls back to a cap of 5 when MAX_ISSUES is negative or invalid', async () => {
    process.env.MAX_ISSUES = '-1';
    writeVerdict(dir, {
      issues: [1, 2, 3, 4, 5, 6].map(n => ({ number: n, labels: ['type:chore', 'size:xs', 'priority:low'], ai_ready: false })),
    });
    await runIn(dir, { github, context, core });
    expect(github.rest.issues.addLabels).toHaveBeenCalledTimes(5);
  });

  it('keeps at most one label per type:/size:/priority: prefix', async () => {
    writeVerdict(dir, {
      issues: [
        { number: 3, labels: ['type:bug', 'type:chore', 'size:s', 'size:m', 'priority:low'], ai_ready: false },
      ],
    });
    await runIn(dir, { github, context, core });
    const call = github.rest.issues.addLabels.mock.calls[0][0];
    expect(call.labels).toEqual(['type:bug', 'size:s', 'priority:low']);
  });

  it('skips entries with an invalid issue number', async () => {
    writeVerdict(dir, {
      issues: [
        { number: 0, labels: ['type:bug', 'size:s'], ai_ready: true },
        { number: 'x', labels: ['type:bug', 'size:s'], ai_ready: true },
        { number: 9, labels: ['type:bug', 'size:s'], ai_ready: false },
      ],
    });
    await runIn(dir, { github, context, core });
    expect(github.rest.issues.addLabels).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.addLabels.mock.calls[0][0].issue_number).toBe(9);
  });

  it('continues past an addLabels failure without counting it', async () => {
    github.rest.issues.addLabels.mockRejectedValueOnce(new Error('403'));
    writeVerdict(dir, {
      issues: [
        { number: 5, labels: ['type:bug', 'size:s', 'priority:medium'], ai_ready: false },
        { number: 6, labels: ['type:chore', 'size:xs', 'priority:low'], ai_ready: false },
      ],
    });
    await runIn(dir, { github, context, core });
    expect(core.getOutput('labeled_count')).toBe('1');
    // failed issue gets no comment; successful one does
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(1);
  });

  it('fails cleanly on malformed JSON', async () => {
    fs.writeFileSync(path.join(dir, '.backlog-sweep.json'), '{ not json');
    await runIn(dir, { github, context, core });
    expect(core.failures.length).toBe(1);
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled();
  });
});
