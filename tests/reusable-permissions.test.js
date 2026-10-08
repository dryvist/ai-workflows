const { expect, test } = require('bun:test');
const { readdirSync, readFileSync } = require('fs');
const { join } = require('path');

// A reusable workflow cannot request a permission its caller does not grant, and
// the run then fails at startup. Consumer callers grant the standard set, so no
// reusable workflow may request id-token.
const dir = join('.github', 'workflows');

function isReusable(workflow) {
  const on = workflow.on ?? workflow[true];
  return on === 'workflow_call' || (on !== null && typeof on === 'object' && 'workflow_call' in on);
}

const reusables = readdirSync(dir)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => [name, Bun.YAML.parse(readFileSync(join(dir, name), 'utf8'))])
  .filter(([, workflow]) => isReusable(workflow));

test('finds the reusable workflows that consumers call', () => {
  expect(reusables.map(([name]) => name)).toContain('cc-ci-fix.yml');
});

for (const [name, workflow] of reusables) {
  test(`${name} requests no id-token permission`, () => {
    expect(workflow.permissions?.['id-token']).toBeUndefined();
    for (const [job, definition] of Object.entries(workflow.jobs ?? {})) {
      expect(definition.permissions?.['id-token'], `job ${job}`).toBeUndefined();
    }
  });
}
