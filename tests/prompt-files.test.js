const { expect, test } = require('bun:test');
const { readFileSync, readdirSync, statSync } = require('fs');
const { join } = require('path');

// Every .prompt.yml under .github/scripts is what actions/ai-inference loads:
// a messages array, a JSON schema when it asks for one, and no model (the
// workflow's `model` input, a router role alias, supplies it). Each {{var}}
// must be one the calling workflow maps in `file_input`.
const scripts = join('.github', 'scripts');
const prompts = readdirSync(scripts)
  .filter((d) => statSync(join(scripts, d)).isDirectory())
  .flatMap((d) => readdirSync(join(scripts, d)).filter((f) => f.endsWith('.prompt.yml')).map((f) => join(scripts, d, f)));

const workflows = readdirSync(join('.github', 'workflows'))
  .map((f) => readFileSync(join('.github', 'workflows', f), 'utf8'))
  .join('\n');

test('at least one prompt file exists', () => {
  expect(prompts.length).toBeGreaterThan(0);
});

for (const file of prompts) {
  test(`${file} is a valid ai-inference prompt whose variables the workflow supplies`, () => {
    const text = readFileSync(file, 'utf8');
    const config = Bun.YAML.parse(text);
    expect(Array.isArray(config.messages)).toBe(true);
    expect(config.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(config.model).toBeUndefined();
    if (config.responseFormat) {
      expect(config.responseFormat).toBe('json_schema');
      expect(JSON.parse(config.jsonSchema).schema.type).toBe('object');
    }
    const use = workflows.slice(workflows.indexOf(`prompt-file: .ai-workflows/${file}`));
    expect(use.length).toBeGreaterThan(0);
    const mapped = use.slice(0, use.indexOf('custom-headers')).match(/^\s+([a-z]+): [^\n]+$/gm).map((l) => l.trim().split(':')[0]);
    for (const [, name] of text.matchAll(/\{\{([\w.-]+)\}\}/g)) {
      expect(mapped).toContain(name);
    }
  });
}
