const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const run = require('../.github/scripts/ci-fail-issue/check-eligibility.js');

const FULL_SHA = 'abc123def456abc123def456abc123def456abc1';
const SHORT_SHA = FULL_SHA.slice(0, 7);
const RUN_URL = 'https://github.com/test-owner/test-repo/actions/runs/999';
const MARKER = '<!-- ci-fail-issue -->';

function makeContext(conclusionOverride = 'failure') {
  return createMockContext({
    payload: {
      workflow_run: {
        conclusion: conclusionOverride,
        id: 999,
        head_sha: FULL_SHA,
        html_url: RUN_URL,
      },
    },
  });
}

describe('ci-fail-issue/check-eligibility', () => {
  let core, context, github;

  beforeEach(() => {
    core = createMockCore();
    context = makeContext();
    github = createMockGithub();

    // Default: getCommit returns a human author
    github.rest.repos.getCommit.mockResolvedValue({
      data: { author: { login: 'some-human' } },
    });

    // Default: no recent issues (covers both Gate 4 dedup and Gate 5 daily limit)
    github.paginate.mockResolvedValue([]);
  });

  it('Gate 1: sets eligible=false when conclusion is not failure', async () => {
    context = makeContext('success');

    await run({ github, context, core });

    expect(core.getOutput('eligible')).toBe('false');
    expect(core.getOutput('skip_reason')).toContain('conclusion');
    expect(core.getOutput('skip_reason')).toContain('success');
  });

  it('Gate 2: sets eligible=false when commit authored by copilot[bot]', async () => {
    github.rest.repos.getCommit.mockResolvedValue({
      data: { author: { login: 'copilot[bot]' } },
    });

    await run({ github, context, core });

    expect(core.getOutput('eligible')).toBe('false');
    expect(core.getOutput('skip_reason')).toContain('copilot[bot]');
  });

  it('Gate 3: sets eligible=false when commit authored by github-actions[bot]', async () => {
    github.rest.repos.getCommit.mockResolvedValue({
      data: { author: { login: 'github-actions[bot]' } },
    });

    await run({ github, context, core });

    expect(core.getOutput('eligible')).toBe('false');
    expect(core.getOutput('skip_reason')).toContain('github-actions[bot]');
  });

  it('Gate 4: sets eligible=false when an existing issue matches SHA and marker', async () => {
    github.paginate.mockResolvedValue([
      {
        number: 42,
        body: `Some issue body\n${FULL_SHA}\n${MARKER}`,
      },
    ]);

    await run({ github, context, core });

    expect(core.getOutput('eligible')).toBe('false');
    expect(core.getOutput('skip_reason')).toContain('duplicate');
    expect(core.getOutput('skip_reason')).toContain('42');
  });

  it('Gate 4: does not skip when recent issue lacks marker', async () => {
    github.paginate.mockResolvedValue([
      {
        number: 99,
        body: `Some issue body containing ${FULL_SHA} but no marker`,
      },
    ]);

    await run({ github, context, core });

    // Issue has SHA but no marker — not a ci-fail issue, should proceed past Gate 4
    expect(core.getOutput('eligible')).toBe('true');
  });

  it('Gate 5: sets eligible=false when daily limit of 3 is reached', async () => {
    github.paginate.mockResolvedValue([
      { body: `Issue one\n${MARKER}` },
      { body: `Issue two\n${MARKER}` },
      { body: `Issue three\n${MARKER}` },
    ]);

    await run({ github, context, core });

    expect(core.getOutput('eligible')).toBe('false');
    expect(core.getOutput('skip_reason')).toContain('daily limit');
    expect(core.getOutput('skip_reason')).toContain('3/3');
  });

  it('Gate 5: does not skip when recent issues lack marker', async () => {
    github.paginate.mockResolvedValue([
      { body: 'Issue one, no marker' },
      { body: 'Issue two, no marker' },
      { body: 'Issue three, no marker' },
    ]);

    await run({ github, context, core });

    expect(core.getOutput('eligible')).toBe('true');
  });

  it('happy path: sets eligible=true and all outputs when all gates pass', async () => {
    await run({ github, context, core });

    expect(core.getOutput('eligible')).toBe('true');
    expect(core.getOutput('skip_reason')).toBe('');
    expect(core.getOutput('commit_sha')).toBe(FULL_SHA);
    expect(core.getOutput('run_url')).toBe(RUN_URL);
  });

  it('bonus: proceeds when getCommit throws, treating authorLogin as empty', async () => {
    github.rest.repos.getCommit.mockRejectedValue(new Error('API timeout'));

    await run({ github, context, core });

    // authorLogin defaults to '' which is not in botAuthors — should proceed
    expect(core.getOutput('eligible')).toBe('true');
    // Warning should be logged
    expect(core.infos.some(msg => msg.includes('Could not get commit author'))).toBe(true);
  });

  it('uses caller-supplied failed run metadata', async () => {
    context = createMockContext({ payload: {} });
    process.env.FAILURE_CONCLUSION = 'failure';
    process.env.FAILURE_HEAD_SHA = FULL_SHA;
    process.env.FAILURE_RUN_ID = '999';
    process.env.FAILURE_RUN_URL = RUN_URL;

    await run({ github, context, core });

    expect(core.getOutput('eligible')).toBe('true');
    expect(core.getOutput('commit_sha')).toBe(FULL_SHA);
    expect(core.getOutput('run_url')).toBe(RUN_URL);
    delete process.env.FAILURE_CONCLUSION;
    delete process.env.FAILURE_HEAD_SHA;
    delete process.env.FAILURE_RUN_ID;
    delete process.env.FAILURE_RUN_URL;
  });
});
