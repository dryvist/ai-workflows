const { expect, test } = require('bun:test');
const { readFileSync } = require('fs');

const suite = Bun.YAML.parse(readFileSync('.github/workflows/suite-ci.yml', 'utf8'));
const events = suite.on ?? suite[true];
const inputs = events.workflow_call.inputs;
const jobs = suite.jobs;

test('suite-ci accepts run metadata from a caller and retains workflow_run fallback', () => {
  for (const name of [
    'failure_conclusion',
    'failure_run_id',
    'failure_run_url',
    'failure_head_branch',
    'failure_head_sha',
    'failure_head_repository',
    'failure_actor',
  ]) {
    expect(inputs[name]).toBeDefined();
  }

  expect(jobs['ci-fix'].if).toContain('inputs.failure_head_repository');
  expect(jobs['ci-fix'].if).toContain('github.event.workflow_run.head_repository.full_name');
  expect(jobs['ci-fix'].with.failure_run_id).toContain('inputs.failure_run_id');
  expect(jobs['ci-fail-issue'].with.failure_head_sha).toContain('inputs.failure_head_sha');
});
