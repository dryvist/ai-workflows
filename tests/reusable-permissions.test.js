const { expect, test } = require('bun:test');
const { readdirSync, readFileSync } = require('fs');
const { join } = require('path');

// A reusable workflow cannot request a permission its caller does not grant, and
// the run then fails at startup. Consumer callers grant the standard set, so no
// reusable workflow may request id-token.
//
// The daily-run-limit check lists workflow runs through the Actions API, which
// needs `actions: read`. That grant is not in the standard set. A job either
// requests it, so its callers must grant it, or lists with a Claude bot App token
// minted with permission-actions: read, which needs no grant from the caller.
const dir = join('.github', 'workflows');
const ACTIONS_API_CHECK = 'check-daily-limit.js';

function isReusable(workflow) {
  const on = workflow.on ?? workflow[true];
  return on === 'workflow_call' || (on !== null && typeof on === 'object' && 'workflow_call' in on);
}

// A job-level `permissions` block replaces the workflow-level one; it does not merge.
function effectivePermissions(workflow, job) {
  return job.permissions ?? workflow.permissions;
}

function callsActionsApi(job) {
  return (job.steps ?? []).some((step) => String(step.with?.script ?? '').includes(ACTIONS_API_CHECK));
}

function mintsActionsReadToken(step) {
  return (
    String(step.uses ?? '').startsWith('actions/create-github-app-token@') &&
    step.with?.['permission-actions'] === 'read'
  );
}

const reusables = readdirSync(dir)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => [name, Bun.YAML.parse(readFileSync(join(dir, name), 'utf8'))])
  .filter(([, workflow]) => isReusable(workflow));

test('finds the reusable workflows that consumers call', () => {
  expect(reusables.map(([name]) => name)).toContain('cc-ci-fix.yml');
});

test('finds the reusable workflows whose daily-limit check lists workflow runs', () => {
  const names = reusables
    .filter(([, workflow]) => Object.values(workflow.jobs ?? {}).some(callsActionsApi))
    .map(([name]) => name);
  expect(names).toContain('cc-next-steps.yml');
  expect(names).toContain('cc-code-simplifier.yml');
  expect(names).toContain('best-practices.yml');
});

for (const [name, workflow] of reusables) {
  test(`${name} requests no id-token permission`, () => {
    expect(workflow.permissions?.['id-token']).toBeUndefined();
    for (const [job, definition] of Object.entries(workflow.jobs ?? {})) {
      expect(definition.permissions?.['id-token'], `job ${job}`).toBeUndefined();
    }
  });

  test(`${name} jobs that list workflow runs request actions: read or list with a minted read token`, () => {
    for (const [job, definition] of Object.entries(workflow.jobs ?? {})) {
      if (!callsActionsApi(definition)) continue;
      const mint = (definition.steps ?? []).find(mintsActionsReadToken);
      if (!mint) {
        expect(effectivePermissions(workflow, definition)?.actions, `job ${job}`).toBe('read');
        continue;
      }
      const listing = definition.steps.find((step) => String(step.with?.script ?? '').includes(ACTIONS_API_CHECK));
      expect(listing.with?.['github-token'], `job ${job}`).toContain(`steps.${mint.id}.outputs.token`);
    }
  });
}

test('cc-code-simplifier.yml requests no actions grant, so callers need none', () => {
  const [, workflow] = reusables.find(([name]) => name === 'cc-code-simplifier.yml');
  expect(workflow.permissions?.actions).toBeUndefined();
  expect(workflow.jobs['check-daily-limit'].permissions).toBeUndefined();
});
