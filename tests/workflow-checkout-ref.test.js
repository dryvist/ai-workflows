const { expect, test } = require('bun:test');
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

// Every reusable workflow that checks out this repository to run its scripts
// takes the ref from `job.workflow_sha` - the commit the called workflow was
// loaded from - never from a caller input. A caller-supplied ref would let
// the caller pick the code that runs with the job's token and secrets.
const dir = join('.github', 'workflows');
const files = readdirSync(dir).filter((f) => f.endsWith('.yml'));
const OWN_REF = '${{ job.workflow_sha }}';

test('at least one workflow checks out ai-workflows', () => {
  expect(files.some((f) => readFileSync(join(dir, f), 'utf8').includes('repository: dryvist/ai-workflows'))).toBe(true);
});

for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8');
  const doc = Bun.YAML.parse(text);
  const inputs = (doc.on ?? doc[true])?.workflow_call?.inputs ?? {};

  test(`${f} declares no caller-controlled scripts ref`, () => {
    expect(Object.keys(inputs).filter((k) => /scripts_ref|implementation_ref/.test(k))).toEqual([]);
    expect(text).not.toMatch(/inputs\.(scripts_ref|implementation_ref)/);
  });

  test(`${f} checks out ai-workflows at job.workflow_sha`, () => {
    for (const job of Object.values(doc.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (step.with?.repository !== 'dryvist/ai-workflows') continue;
        expect(step.with.ref).toBe(OWN_REF);
      }
    }
  });
}
