// Permission ceiling of each reusable workflow: for every scope, the highest level
// (write > read > none) that any of its jobs can request. A caller must grant at
// least the ceiling, so a higher ceiling breaks every caller that does not grant it.
//
// Run from the repository root with bun:
//   bun .github/scripts/permission-ceiling/ceiling.js generate > tests/fixtures/reusable-permission-ceiling.json
//   BASE_SHA=<sha> PR_TITLE=<title> bun .github/scripts/permission-ceiling/ceiling.js check
const { execFileSync } = require('child_process');
const { readdirSync, readFileSync } = require('fs');
const { join, resolve } = require('path');

const REPO_ROOT = resolve(__dirname, '../../..');
const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows');
const FIXTURE_FILE = 'tests/fixtures/reusable-permission-ceiling.json';
const LEVEL_RANK = { none: 0, read: 1, write: 2 };
const BREAKING_TITLE = /^[A-Za-z]+(\([^()\n]*\))?!:\s*\S/;
const INCREASE_SENTENCE =
  'A permission increase breaks every caller that does not grant it; update the fixture and mark the PR title breaking (`!`).';
const REGENERATE = `regenerate the fixture: bun .github/scripts/permission-ceiling/ceiling.js generate > ${FIXTURE_FILE}`;

function isReusable(workflow) {
  const on = workflow.on ?? workflow[true];
  return on === 'workflow_call' || (on !== null && typeof on === 'object' && 'workflow_call' in on);
}

// A job-level `permissions` block replaces the workflow-level one; it does not merge.
function effectivePermissions(workflow, job) {
  return job.permissions ?? workflow.permissions;
}

// Highest level per scope across the jobs of one workflow. A job with no effective
// block requests nothing explicit. `none` equals an absent scope, so it is omitted.
function ceilingOf(name, workflow) {
  const ceiling = {};
  for (const [job, definition] of Object.entries(workflow.jobs ?? {})) {
    const permissions = effectivePermissions(workflow, definition);
    if (permissions === undefined) continue;
    if (typeof permissions !== 'object') {
      throw new Error(`${name} job ${job}: shorthand permissions "${permissions}" must list explicit scopes`);
    }
    for (const [scope, level] of Object.entries(permissions)) {
      if (!Object.hasOwn(LEVEL_RANK, level)) throw new Error(`${name} job ${job}: ${scope} has unknown level "${level}"`);
      if (level === 'none') continue;
      if (LEVEL_RANK[level] > LEVEL_RANK[ceiling[scope] ?? 'none']) ceiling[scope] = level;
    }
  }
  return Object.fromEntries(Object.entries(ceiling).sort(([a], [b]) => a.localeCompare(b)));
}

function computeCeilings(dir = WORKFLOWS_DIR) {
  const ceilings = {};
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.yml')).sort()) {
    const workflow = Bun.YAML.parse(readFileSync(join(dir, name), 'utf8'));
    if (isReusable(workflow)) ceilings[name] = ceilingOf(name, workflow);
  }
  return ceilings;
}

// Scopes whose level differs between two ceilings, sorted by scope.
function differences(expected, actual) {
  const scopes = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  return scopes
    .map((scope) => ({ scope, from: expected[scope] ?? 'none', to: actual[scope] ?? 'none' }))
    .filter((d) => d.from !== d.to);
}

function isIncrease(d) {
  return LEVEL_RANK[d.to] > LEVEL_RANK[d.from];
}

// Entries are {workflow, scope, from, to}. Any increase adds the caller-impact sentence.
function describeChange(e) {
  return `${e.workflow} ${e.scope}: ${e.from} -> ${e.to}`;
}

function formatFailure(entries) {
  const lines = entries.map(describeChange);
  if (entries.some(isIncrease)) lines.push(INCREASE_SENTENCE);
  lines.push(REGENERATE);
  return lines.join('\n');
}

// The fixture as committed at `sha`. An unknown commit throws, so a missing base fails
// the check rather than passing it. A commit that predates the fixture yields {}.
function fixtureAtCommit(sha) {
  const opts = { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' };
  execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], opts);
  if (execFileSync('git', ['ls-tree', '--name-only', sha, '--', FIXTURE_FILE], opts).trim() === '') return {};
  return JSON.parse(execFileSync('git', ['show', `${sha}:${FIXTURE_FILE}`], opts));
}

// Increases of existing reusables only. A reusable absent from the base has no caller
// that can be broken by its permissions, so it is not counted as an increase.
function increasesOverBase(base, head) {
  return Object.entries(head).flatMap(([workflow, ceiling]) => {
    if (!Object.hasOwn(base, workflow)) return [];
    return differences(base[workflow], ceiling)
      .filter(isIncrease)
      .map((d) => ({ workflow, ...d }));
  });
}

function breakingMarkerPresent(title) {
  return BREAKING_TITLE.test(title);
}

function check(env) {
  if (!env.BASE_SHA) throw new Error('BASE_SHA is required');
  const base = fixtureAtCommit(env.BASE_SHA);
  const head = JSON.parse(readFileSync(join(REPO_ROOT, FIXTURE_FILE), 'utf8'));
  const increases = increasesOverBase(base, head);
  if (increases.length === 0) {
    console.log('Permission ceiling: no increase over the PR base.');
    return 0;
  }
  if (breakingMarkerPresent(env.PR_TITLE ?? '')) {
    console.log(`Permission ceiling: PR title carries the breaking marker for ${increases.length} increase(s):`);
    for (const e of increases) console.log(describeChange(e));
    return 0;
  }
  console.error(formatFailure(increases));
  return 1;
}

if (require.main === module) {
  const command = process.argv[2];
  if (command === 'generate') {
    process.stdout.write(`${JSON.stringify(computeCeilings(), null, 2)}\n`);
  } else if (command === 'check') {
    process.exitCode = check(process.env);
  } else {
    console.error('usage: ceiling.js generate | check');
    process.exitCode = 2;
  }
}

module.exports = {
  REGENERATE,
  breakingMarkerPresent,
  ceilingOf,
  computeCeilings,
  differences,
  effectivePermissions,
  fixtureAtCommit,
  formatFailure,
  increasesOverBase,
  isReusable,
};
