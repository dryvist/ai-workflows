const { expect, test } = require('bun:test');
const { readFileSync } = require('fs');

const workflow = Bun.YAML.parse(readFileSync('.github/workflows/cc-release-notes.yml', 'utf8'));
const highlights = workflow.jobs.highlights;

test('release highlights route trusted events to the self-hosted runner and skip fork PRs', () => {
  expect(highlights.if).toContain("github.event_name != 'pull_request'");
  expect(highlights.if).toContain('github.event.pull_request.head.repo.full_name == github.repository');
  expect(highlights['runs-on']).toContain("github.event_name != 'pull_request'");
  expect(highlights['runs-on']).toContain('github.event.pull_request.head.repo.full_name == github.repository');
  expect(highlights['runs-on']).toContain("inputs.runner_label || 'self-hosted'");
  expect(highlights['runs-on']).toContain("'ubuntu-latest'");
});

test('fork PR skips emit a clear notice before the agent job is evaluated', () => {
  const notice = workflow.jobs['check-eligibility'].steps.find(
    (step) => step.name === 'Explain fork pull request skip',
  );

  expect(notice).toBeDefined();
  expect(notice.if).toContain("github.event_name == 'pull_request'");
  expect(notice.if).toContain('github.event.pull_request.head.repo.full_name != github.repository');
  expect(notice.run).toContain('Release highlights are skipped for pull requests from forks.');
});
