const { expect, test } = require('bun:test');
const { readFileSync } = require('fs');
const { join } = require('path');
const {
  REGENERATE,
  computeCeilings,
  differences,
  formatFailure,
} = require('../.github/scripts/permission-ceiling/ceiling.js');

// Each reusable workflow's permission ceiling is pinned in the fixture. A change to
// a ceiling, or a reusable added or removed, fails here until the fixture is
// regenerated. An increase also needs a breaking PR title; see the PR check in test.yml.
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'reusable-permission-ceiling.json'), 'utf8'));
const computed = computeCeilings();
const names = [...new Set([...Object.keys(fixture), ...Object.keys(computed)])].sort();

test('finds the reusable workflows that consumers call', () => {
  expect(Object.keys(computed)).toContain('cc-ci-fix.yml');
});

for (const name of names) {
  test(`${name} permission ceiling matches the fixture`, () => {
    if (!Object.hasOwn(computed, name)) {
      throw new Error(`${name} is in the fixture but is no longer a reusable workflow\n${REGENERATE}`);
    }
    if (!Object.hasOwn(fixture, name)) {
      throw new Error(`${name} is a reusable workflow missing from the fixture\n${REGENERATE}`);
    }
    const entries = differences(fixture[name], computed[name]).map((d) => ({ workflow: name, ...d }));
    if (entries.length > 0) throw new Error(formatFailure(entries));
  });
}
