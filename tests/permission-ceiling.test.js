const { describe, expect, test } = require('bun:test');
const {
  breakingMarkerPresent,
  ceilingOf,
  differences,
  fixtureAtCommit,
  formatFailure,
  increasesOverBase,
  isReusable,
} = require('../.github/scripts/permission-ceiling/ceiling.js');

describe('ceilingOf', () => {
  test('keeps the highest level per scope across jobs, job blocks replacing workflow blocks', () => {
    const workflow = {
      permissions: { contents: 'read' },
      jobs: {
        a: { permissions: { issues: 'write' } },
        b: {},
        c: { permissions: { contents: 'write', actions: 'read' } },
      },
    };
    expect(ceilingOf('w.yml', workflow)).toEqual({ actions: 'read', contents: 'write', issues: 'write' });
  });

  test('a job block replaces the workflow block instead of merging with it', () => {
    const workflow = { permissions: { actions: 'write' }, jobs: { a: { permissions: { contents: 'read' } } } };
    expect(ceilingOf('w.yml', workflow)).toEqual({ contents: 'read' });
  });

  test('omits none and yields an empty ceiling when nothing is requested', () => {
    expect(ceilingOf('w.yml', { jobs: { a: {} } })).toEqual({});
    expect(ceilingOf('w.yml', { jobs: { a: { permissions: { contents: 'none' } } } })).toEqual({});
  });

  test('rejects shorthand permissions and unknown levels instead of guessing', () => {
    expect(() => ceilingOf('w.yml', { permissions: 'write-all', jobs: { a: {} } })).toThrow(/shorthand/);
    expect(() => ceilingOf('w.yml', { jobs: { a: { permissions: { contents: 'admin' } } } })).toThrow(/unknown level/);
  });
});

test('isReusable recognises workflow_call in string and mapping form only', () => {
  expect(isReusable({ on: 'workflow_call' })).toBe(true);
  expect(isReusable({ on: { workflow_call: {} } })).toBe(true);
  expect(isReusable({ on: { push: {} } })).toBe(false);
});

test('differences lists each scope whose level changed, absent scopes counting as none', () => {
  expect(differences({ contents: 'read' }, { contents: 'write', issues: 'read' })).toEqual([
    { scope: 'contents', from: 'read', to: 'write' },
    { scope: 'issues', from: 'none', to: 'read' },
  ]);
});

describe('increasesOverBase', () => {
  const base = {
    'existing.yml': { contents: 'read', issues: 'write' },
    'removed.yml': { contents: 'write' },
  };

  test('counts a raised or newly granted scope on an existing reusable', () => {
    const head = { 'existing.yml': { contents: 'write', issues: 'write', actions: 'read' } };
    expect(increasesOverBase(base, head)).toEqual([
      { workflow: 'existing.yml', scope: 'actions', from: 'none', to: 'read' },
      { workflow: 'existing.yml', scope: 'contents', from: 'read', to: 'write' },
    ]);
  });

  test('passes decreases, removals and unchanged ceilings', () => {
    expect(increasesOverBase(base, { 'existing.yml': { contents: 'read' } })).toEqual([]);
    expect(increasesOverBase(base, { 'existing.yml': { contents: 'read', issues: 'write' } })).toEqual([]);
    expect(increasesOverBase(base, {})).toEqual([]);
  });

  test('a reusable absent from the base has no caller to break, so it is not an increase', () => {
    expect(increasesOverBase(base, { 'new.yml': { contents: 'write' } })).toEqual([]);
    expect(increasesOverBase({}, { 'first.yml': { contents: 'write' } })).toEqual([]);
  });
});

describe('breakingMarkerPresent', () => {
  test('accepts a conventional breaking marker with or without a scope', () => {
    expect(breakingMarkerPresent('feat!: raise cc-x permissions')).toBe(true);
    expect(breakingMarkerPresent('fix(ci)!: raise cc-x permissions')).toBe(true);
  });

  test('rejects titles without the marker', () => {
    expect(breakingMarkerPresent('feat: raise cc-x permissions')).toBe(false);
    expect(breakingMarkerPresent('feat! raise cc-x permissions')).toBe(false);
    expect(breakingMarkerPresent('BREAKING CHANGE: raise cc-x permissions')).toBe(false);
    expect(breakingMarkerPresent('')).toBe(false);
  });
});

test('formatFailure names workflow, scope and old -> new, and states the caller impact for increases', () => {
  const message = formatFailure([{ workflow: 'cc-x.yml', scope: 'actions', from: 'read', to: 'write' }]);
  expect(message).toContain('cc-x.yml actions: read -> write');
  expect(message).toContain(
    'A permission increase breaks every caller that does not grant it; update the fixture and mark the PR title breaking (`!`).',
  );
});

test('formatFailure omits the caller-impact sentence when only decreases are reported', () => {
  const message = formatFailure([{ workflow: 'cc-x.yml', scope: 'actions', from: 'write', to: 'read' }]);
  expect(message).toContain('cc-x.yml actions: write -> read');
  expect(message).not.toContain('breaks every caller');
});

test('fixtureAtCommit fails closed on a commit it cannot find', () => {
  expect(() => fixtureAtCommit('0'.repeat(40))).toThrow();
});
