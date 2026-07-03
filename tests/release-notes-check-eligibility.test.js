const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { createMockCore, createMockContext, createMockGithub } = require('./helpers.js');
const run = require('../.github/scripts/release-notes/check-eligibility.js');

const ENV_KEYS = ['RELEASE_BOT', 'BRANCH_PREFIX'];
const BOT = 'jacobpevans-release-please[bot]';

function makePayload({ login = BOT, ref = 'release-please--branches--main', sha = 'abc123', number = 12 } = {}) {
  return { pull_request: { number, user: { login, type: 'Bot' }, head: { ref, sha } } };
}

describe('release-notes/check-eligibility', () => {
  let core, context, github;

  beforeEach(() => {
    core = createMockCore();
    context = createMockContext({ payload: makePayload() });
    github = createMockGithub();
    github.paginate.mockResolvedValue([]);
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('happy path: release-please PR with no prior comment runs', async () => {
    await run({ github, context, core });
    expect(core.getOutput('should_run')).toBe('true');
    expect(core.getOutput('pr_number')).toBe('12');
    expect(core.getOutput('head_sha')).toBe('abc123');
    expect(core.getOutput('release_bot_bare')).toBe('jacobpevans-release-please');
  });

  it('skip: wrong author', async () => {
    context.payload = makePayload({ login: 'renovate[bot]' });
    await run({ github, context, core });
    expect(core.getOutput('should_run')).toBe('false');
  });

  it('skip: wrong branch prefix', async () => {
    context.payload = makePayload({ ref: 'feat/something' });
    await run({ github, context, core });
    expect(core.getOutput('should_run')).toBe('false');
  });

  it('skip: highlights already posted for this head SHA', async () => {
    github.paginate.mockResolvedValue([{ body: '<!-- cc-release-notes sha:abc123 -->\nhighlights' }]);
    await run({ github, context, core });
    expect(core.getOutput('should_run')).toBe('false');
  });

  it('runs again when the head SHA moved past the posted comment', async () => {
    github.paginate.mockResolvedValue([{ body: '<!-- cc-release-notes sha:old999 -->\nstale highlights' }]);
    await run({ github, context, core });
    expect(core.getOutput('should_run')).toBe('true');
  });

  it('honors custom RELEASE_BOT and BRANCH_PREFIX', async () => {
    process.env.RELEASE_BOT = 'custom-releaser[bot]';
    process.env.BRANCH_PREFIX = 'rel/';
    context.payload = makePayload({ login: 'custom-releaser[bot]', ref: 'rel/main' });
    await run({ github, context, core });
    expect(core.getOutput('should_run')).toBe('true');
    expect(core.getOutput('release_bot_bare')).toBe('custom-releaser');
  });

  it('skip: no pull_request payload', async () => {
    context.payload = {};
    await run({ github, context, core });
    expect(core.getOutput('should_run')).toBe('false');
  });
});
