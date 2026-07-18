const fs = require('fs');

function exactKeys(value, expected, where) {
  const keys = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(keys) !== JSON.stringify(wanted)) {
    throw new Error(`${where} must contain exactly: ${wanted.join(', ')}`);
  }
}

function parse(file, owner, targets) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  exactKeys(value, ['repositories'], 'result');
  if (!Array.isArray(value.repositories) || value.repositories.length > 200) {
    throw new Error('repositories must be an array with at most 200 entries');
  }
  const allowAll = targets.trim().toLowerCase() === 'all';
  const allowed = new Set(targets.split(',').map(item => item.trim()).filter(Boolean));
  const seenRepos = new Set();
  for (const [repoIndex, repository] of value.repositories.entries()) {
    exactKeys(repository, ['name', 'labels'], `repositories[${repoIndex}]`);
    if (typeof repository.name !== 'string' ||
        !new RegExp(`^${owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[A-Za-z0-9_.-]+$`, 'i').test(repository.name)) {
      throw new Error(`repositories[${repoIndex}].name must belong to ${owner}`);
    }
    if (!allowAll && !allowed.has(repository.name)) {
      throw new Error(`repository ${repository.name} is not an allowed target`);
    }
    if (seenRepos.has(repository.name.toLowerCase())) throw new Error(`repository ${repository.name} is duplicated`);
    seenRepos.add(repository.name.toLowerCase());
    if (!Array.isArray(repository.labels) || repository.labels.length > 100) {
      throw new Error(`repositories[${repoIndex}].labels must contain at most 100 entries`);
    }
    const seenLabels = new Set();
    for (const [labelIndex, label] of repository.labels.entries()) {
      exactKeys(label, ['name', 'color', 'description'], `repositories[${repoIndex}].labels[${labelIndex}]`);
      if (typeof label.name !== 'string' || label.name.trim() !== label.name ||
          label.name.length === 0 || label.name.length > 50 || /[\r\n]/.test(label.name)) {
        throw new Error(`repositories[${repoIndex}].labels[${labelIndex}].name is invalid`);
      }
      if (typeof label.color !== 'string' || !/^[0-9a-fA-F]{6}$/.test(label.color)) {
        throw new Error(`repositories[${repoIndex}].labels[${labelIndex}].color is invalid`);
      }
      if (typeof label.description !== 'string' || label.description.length > 100 || /[\r\n]/.test(label.description)) {
        throw new Error(`repositories[${repoIndex}].labels[${labelIndex}].description is invalid`);
      }
      if (seenLabels.has(label.name.toLowerCase())) throw new Error(`label ${label.name} is duplicated`);
      seenLabels.add(label.name.toLowerCase());
    }
  }
  return value;
}

function parseCanonical(contents) {
  const labels = new Map();
  let current = null;
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const nameMatch = line.match(/^- name: ("(?:[^"\\]|\\.)*")$/);
    if (nameMatch) {
      if (current) throw new Error('canonical label is missing color or description');
      current = { name: JSON.parse(nameMatch[1]) };
      continue;
    }
    const fieldMatch = line.match(/^(color|description): ("(?:[^"\\]|\\.)*")$/);
    if (!current || !fieldMatch) throw new Error(`unsupported canonical labels.yml line: ${line}`);
    current[fieldMatch[1]] = JSON.parse(fieldMatch[2]);
    if ('color' in current && 'description' in current) {
      if (typeof current.name !== 'string' || current.name.length === 0 || current.name.length > 50 ||
          !/^[0-9a-fA-F]{6}$/.test(current.color) || typeof current.description !== 'string' ||
          current.description.length > 100) {
        throw new Error(`invalid canonical label: ${current.name}`);
      }
      labels.set(current.name.toLowerCase(), current);
      current = null;
    }
  }
  if (current || labels.size === 0) throw new Error('canonical labels.yml is incomplete or empty');
  return labels;
}

module.exports = async ({ github, context, core }) => {
  const file = process.env.RESULT_FILE || '.label-sync.json';
  const targets = process.env.TARGET_REPOSITORIES || `${context.repo.owner}/${context.repo.repo}`;
  try {
    const result = parse(file, context.repo.owner, targets);
    const response = await github.rest.repos.getContent({
      owner: context.repo.owner,
      repo: '.github',
      path: '.github/labels.yml',
    });
    if (Array.isArray(response.data) || response.data.type !== 'file' || response.data.encoding !== 'base64') {
      throw new Error('canonical labels.yml response is not a base64 file');
    }
    const canonical = parseCanonical(Buffer.from(response.data.content, 'base64').toString('utf8'));
    for (const repository of result.repositories) {
      for (const label of repository.labels) {
        const expected = canonical.get(label.name.toLowerCase());
        if (!expected || expected.name !== label.name ||
            expected.color.toLowerCase() !== label.color.toLowerCase() ||
            expected.description !== label.description) {
          throw new Error(`label ${label.name} does not exactly match the canonical definition`);
        }
      }
    }
    let created = 0;
    let updated = 0;
    for (const repository of result.repositories) {
      const [owner, repo] = repository.name.split('/');
      for (const label of repository.labels) {
        try {
          const { data: existing } = await github.rest.issues.getLabel({ owner, repo, name: label.name });
          if (existing.color.toLowerCase() !== label.color.toLowerCase() ||
              (existing.description || '') !== label.description) {
            await github.rest.issues.updateLabel({ owner, repo, name: label.name, ...label });
            updated += 1;
          }
        } catch (error) {
          if (error.status !== 404) throw error;
          await github.rest.issues.createLabel({ owner, repo, ...label });
          created += 1;
        }
      }
    }
    core.info(`Label sync created ${created} and updated ${updated} label(s)`);
  } catch (error) {
    core.setFailed(`Invalid label sync result: ${error.message}`);
  }
};

module.exports.parse = parse;
module.exports.parseCanonical = parseCanonical;
