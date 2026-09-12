// Apply price/context field edits to llm-models.d/*.yml IN PLACE, by line —
// never by reparsing and re-serializing the YAML. These files carry extensive
// hand-written comments a generic YAML dumper would reorder or drop; a
// mechanical registry deserves a mechanical, comment-preserving edit: find the
// entry's own block by its client_model_id, then replace only the one field
// line inside it.
const fs = require('fs');

function findEntryBlock(lines, clientModelId) {
  const startRe = new RegExp(`^(\\s*)-\\s+client_model_id:\\s*['"]?${escapeRe(clientModelId)}['"]?\\s*$`);
  let start = -1;
  let indent = '';
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(startRe);
    if (m) {
      start = i;
      indent = m[1];
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const lineIndent = line.match(/^(\s*)/)[1];
    if (lineIndent.length <= indent.length) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A per-token cost is a small float (typically 1e-8..1e-3). Plain
// `String(n)` renders anything below 1e-6 in scientific notation
// (`2e-7`), which YAML/JSON parse fine but which no existing line in these
// files uses — write the same plain-decimal style a human would.
function formatValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(15).replace(/0+$/, '').replace(/\.$/, '.0');
}

// Applies every {entry, field, newValue} change grouped by file. Returns the
// list of files actually written (skips a change whose entry block or field
// line cannot be found, logging why, rather than writing a wrong line).
function applyEdits(changes, log = () => {}) {
  const byFile = new Map();
  for (const change of changes) {
    const list = byFile.get(change.entry.file) || [];
    list.push(change);
    byFile.set(change.entry.file, list);
  }

  const written = [];
  for (const [file, fileChanges] of byFile) {
    let text = fs.readFileSync(file, 'utf8');
    let lines = text.split('\n');
    let touched = false;
    for (const change of fileChanges) {
      const block = findEntryBlock(lines, change.entry.client_model_id);
      if (!block) {
        log(`${file}: could not find entry block for ${change.entry.client_model_id} — skipped`);
        continue;
      }
      const fieldRe = new RegExp(`^(\\s*)${change.field}:\\s*.*$`);
      let fieldLine = -1;
      for (let i = block.start; i < block.end; i++) {
        if (fieldRe.test(lines[i])) {
          fieldLine = i;
          break;
        }
      }
      if (fieldLine === -1) {
        log(`${file}: ${change.entry.client_model_id} has no ${change.field} line — skipped`);
        continue;
      }
      const indent = lines[fieldLine].match(fieldRe)[1];
      lines[fieldLine] = `${indent}${change.field}: ${formatValue(change.newValue)}`;
      touched = true;
    }
    if (touched) {
      fs.writeFileSync(file, lines.join('\n'));
      written.push(file);
    }
  }
  return written;
}

module.exports = { applyEdits, findEntryBlock, formatValue };
