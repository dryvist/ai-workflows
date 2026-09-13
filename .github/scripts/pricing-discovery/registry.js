// Load ansible-proxmox-ai's model registry (llm-models.d/*.yml) into one flat
// array of entries. Each `_llm_registry_*` top-level key in every file is a
// list of model entries; the filename each entry came from is kept so
// apply-edits.js can write back to the right file.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

function loadRegistry(dir) {
  const entries = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.yml')) continue;
    const filePath = path.join(dir, name);
    const doc = YAML.parse(fs.readFileSync(filePath, 'utf8'));
    if (!doc || typeof doc !== 'object') continue;
    for (const [key, value] of Object.entries(doc)) {
      if (!key.startsWith('_llm_registry_') || !Array.isArray(value)) continue;
      for (const entry of value) {
        if (entry && entry.client_model_id) entries.push({ ...entry, file: filePath });
      }
    }
  }
  return entries;
}

module.exports = { loadRegistry };
