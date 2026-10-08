const { expect, test } = require('bun:test');
const { readdirSync, readFileSync } = require('fs');
const { join } = require('path');

// Composite action metadata (.github/actions/**/action.yml) is not parsed by
// any lint step, so a syntax error there only surfaces when a consumer runs it.
// Every YAML file under .github must parse.
const files = readdirSync('.github', { recursive: true })
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => join('.github', name));

test('scans composite action metadata alongside workflows', () => {
  expect(files).toContain('.github/actions/run-ai-agent/action.yml');
  expect(files).toContain('.github/workflows/test.yml');
});

for (const file of files) {
  test(`${file} parses as YAML`, () => {
    expect(() => Bun.YAML.parse(readFileSync(file, 'utf8'))).not.toThrow();
  });
}
