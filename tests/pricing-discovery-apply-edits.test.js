const { describe, it, expect, afterEach } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applyEdits, findEntryBlock } = require('../.github/scripts/pricing-discovery/apply-edits.js');

const FIXTURE = `---
_llm_registry_openrouter:
  # A comment that must survive the edit untouched.
  - client_model_id: deepseek/deepseek-v4-flash
    upstream_model_id: deepseek/deepseek-v4-flash
    provider: openrouter
    enabled: true
    input_cost_per_token: 0.0000001
    output_cost_per_token: 0.0000004
    hints:
      speed: fast

  - client_model_id: other/model
    provider: openrouter
    enabled: true
    input_cost_per_token: 0.000001
    output_cost_per_token: 0.000002
`;

let tmpFile;
afterEach(() => {
  if (tmpFile && fs.existsSync(tmpFile)) fs.rmSync(tmpFile);
});

function writeFixture() {
  tmpFile = path.join(os.tmpdir(), `registry-${Date.now()}-${Math.random()}.yml`);
  fs.writeFileSync(tmpFile, FIXTURE);
  return tmpFile;
}

describe('findEntryBlock', () => {
  it('finds the block bounds for a given client_model_id', () => {
    const file = writeFixture();
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const block = findEntryBlock(lines, 'deepseek/deepseek-v4-flash');
    expect(block).not.toBeNull();
    expect(lines[block.start]).toContain('deepseek/deepseek-v4-flash');
    expect(lines.slice(block.start, block.end).join('\n')).not.toContain('other/model');
  });

  it('returns null for an id that does not exist', () => {
    const lines = FIXTURE.split('\n');
    expect(findEntryBlock(lines, 'nope/nope')).toBeNull();
  });
});

describe('applyEdits', () => {
  it('replaces only the named field on the named entry, preserving comments and siblings', () => {
    const file = writeFixture();
    const entry = { client_model_id: 'deepseek/deepseek-v4-flash', file };
    applyEdits([{ entry, field: 'input_cost_per_token', newValue: 0.0000002 }]);
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toContain('input_cost_per_token: 0.0000002');
    expect(text).toContain('output_cost_per_token: 0.0000004'); // untouched sibling field
    expect(text).toContain('# A comment that must survive the edit untouched.');
    expect(text).toContain('input_cost_per_token: 0.000001\n'); // other/model's own field, untouched
  });

  it('skips (and logs) an edit whose entry cannot be found, without touching the file', () => {
    const file = writeFixture();
    const before = fs.readFileSync(file, 'utf8');
    const messages = [];
    const entry = { client_model_id: 'ghost/model', file };
    const written = applyEdits([{ entry, field: 'input_cost_per_token', newValue: 1 }], (m) => messages.push(m));
    expect(written).toHaveLength(0);
    expect(messages[0]).toContain('ghost/model');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });
});
