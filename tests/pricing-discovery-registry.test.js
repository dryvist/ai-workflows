const { describe, it, expect, afterEach } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadRegistry } = require('../.github/scripts/pricing-discovery/registry.js');

let dir;
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe('loadRegistry', () => {
  it('flattens every _llm_registry_* list across files, tagging each with its source file', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-'));
    fs.writeFileSync(path.join(dir, '10-a.yml'), '_llm_registry_a:\n  - client_model_id: x\n    provider: openrouter\n');
    fs.writeFileSync(path.join(dir, '20-b.yml'), '_llm_registry_b:\n  - client_model_id: y\n    provider: openrouter\n');
    const entries = loadRegistry(dir);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.client_model_id).sort()).toEqual(['x', 'y']);
    expect(entries[0].file).toContain('10-a.yml');
  });

  it('ignores an entry with no client_model_id and a non-array top-level key', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-'));
    fs.writeFileSync(
      path.join(dir, '10-a.yml'),
      '_llm_registry_a:\n  - provider: openrouter\nnot_a_registry_key: openrouter\n',
    );
    expect(loadRegistry(dir)).toHaveLength(0);
  });
});
