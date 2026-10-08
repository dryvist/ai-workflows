const { expect, test } = require('bun:test');
const { readFileSync } = require('fs');

const suite = Bun.YAML.parse(readFileSync('.github/workflows/suite-ci.yml', 'utf8'));
const ciFix = Bun.YAML.parse(readFileSync('.github/workflows/cc-ci-fix.yml', 'utf8'));
const events = suite.on ?? suite[true];
const inputs = events.workflow_call.inputs;
const secrets = events.workflow_call.secrets;
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

test('cc-ci-fix uses caller conclusion before workflow_run fallback', () => {
  expect(ciFix.jobs['should-fix'].if).toContain(
    "(inputs.failure_conclusion || github.event.workflow_run.conclusion) == 'failure'"
  );
});

test('suite-ci declares only the credentials passed by caller workflows', () => {
  expect(secrets).toEqual({
    LLM_ROUTER_BASE_URL: { required: true },
    LLM_ROUTER_API_KEY: { required: true },
    GH_APP_CLAUDE_BOT_PRIVATE_KEY: { required: false },
  });
});
