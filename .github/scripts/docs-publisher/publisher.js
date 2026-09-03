#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MANIFEST_KEYS = new Set(['version', 'files', 'assets', 'navigation']);
const FILE_KEYS = new Set(['source', 'destination']);
const ASSET_KEYS = new Set(['source', 'destination']);
const FRONTMATTER_KEYS = new Set(['title', 'description', 'icon', 'sidebar', 'keywords']);
const MINTLIFY_COMPONENTS = new Set([
  'Accordion', 'AccordionGroup', 'Badge', 'Card', 'CardGroup', 'CodeGroup', 'Frame',
  'Icon', 'Info', 'Note', 'ResponseField', 'Step', 'Steps', 'Tab', 'Tabs', 'Tip', 'Warning',
]);
const COMPONENT_MAP = new Map([['LinkCard', 'Card'], ['CardGrid', 'CardGroup']]);
const BUILTIN_SECRET_PATTERNS = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
  ['GitHub token', /\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['assigned credential', /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s"'{}<>]{8,}/i],
  ['private IPv4 address', /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3})\b/],
  ['internal-only marker', /\b(?:internal only|private documentation|do not publish)\b/i],
];

function fail(message) { throw new Error(message); }
function readJson(file, label = file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`${label} must be JSON-compatible YAML: ${error.message}`); }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function assertKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label} contains unknown key: ${key}`);
}
function safeRelative(value, label) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.includes('\\')) fail(`${label} must be a non-empty POSIX relative path`);
  const normalized = path.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../') || normalized !== value) fail(`${label} escapes or is not normalized: ${value}`);
  return normalized;
}
function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function loadManifest(file) {
  let manifest;
  try { manifest = require('yaml').parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`publisher manifest must be valid YAML: ${error.message}`); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('publisher manifest must be an object');
  assertKeys(manifest, MANIFEST_KEYS, 'publisher manifest');
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) fail('publisher manifest requires version 1 and files[]');
  const seenSources = new Set(); const seenDestinations = new Set();
  for (const [index, entry] of manifest.files.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`manifest files[${index}] must be an object`);
    assertKeys(entry, FILE_KEYS, `manifest files[${index}]`);
    entry.source = safeRelative(entry.source, `manifest files[${index}].source`);
    entry.destination = safeRelative(entry.destination, `manifest files[${index}].destination`);
    if (!/\.mdx?$/.test(entry.source) || !/\.mdx?$/.test(entry.destination)) fail(`manifest files[${index}] must map Markdown or MDX`);
    if (seenSources.has(entry.source) || seenDestinations.has(entry.destination)) fail(`manifest files[${index}] duplicates a source or destination`);
    seenSources.add(entry.source); seenDestinations.add(entry.destination);
  }
  if (manifest.assets === undefined) manifest.assets = [];
  if (!Array.isArray(manifest.assets)) fail('publisher manifest assets must be an array');
  for (const [index, entry] of manifest.assets.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`manifest assets[${index}] must be an object`);
    assertKeys(entry, ASSET_KEYS, `manifest assets[${index}]`);
    entry.source = safeRelative(entry.source, `manifest assets[${index}].source`);
    entry.destination = safeRelative(entry.destination, `manifest assets[${index}].destination`);
  }
  if (manifest.navigation !== undefined && (typeof manifest.navigation !== 'object' || !manifest.navigation)) fail('manifest navigation must be an object');
  return manifest;
}
function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
function frontmatterFromTree(tree, YAML) {
  const node = tree.children.find((child) => child.type === 'yaml');
  if (!node) fail('document is missing YAML frontmatter');
  const data = YAML.parse(node.value);
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('frontmatter must be an object');
  assertKeys(data, FRONTMATTER_KEYS, 'frontmatter');
  if (typeof data.title !== 'string' || !data.title.trim()) fail('frontmatter title is required');
  const result = { title: data.title };
  for (const key of ['description', 'icon', 'keywords']) if (data[key] !== undefined) result[key] = data[key];
  if (data.sidebar !== undefined) {
    if (!data.sidebar || typeof data.sidebar !== 'object' || Array.isArray(data.sidebar)) fail('frontmatter sidebar must be an object');
    assertKeys(data.sidebar, new Set(['label']), 'frontmatter sidebar');
    if (data.sidebar.label !== undefined) result.sidebarTitle = data.sidebar.label;
  }
  node.value = YAML.stringify(result, { lineWidth: 0 }).trimEnd();
}
function literalAttribute(node, name) {
  return node.attributes?.find((attribute) => attribute.type === 'mdxJsxAttribute' && attribute.name === name);
}
function validateAndMapComponents(tree, visit) {
  visit(tree, 'html', () => fail('raw HTML is not allowed in public projection'));
  visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], (node) => {
    if (!node.name) fail('MDX fragments are not allowed in public projection');
    if (node.name === 'Aside') {
      const type = literalAttribute(node, 'type');
      if (type && typeof type.value !== 'string') fail('Aside type must be a literal');
      const map = { caution: 'Warning', danger: 'Warning', note: 'Note', tip: 'Tip' };
      node.name = map[type?.value || 'note'];
      if (!node.name) fail(`unsupported Aside type: ${type.value}`);
      node.attributes = (node.attributes || []).filter((attribute) => attribute !== type);
    } else {
      node.name = COMPONENT_MAP.get(node.name) || node.name;
      if (!MINTLIFY_COMPONENTS.has(node.name)) fail(`unsupported MDX component: ${node.name}`);
    }
    for (const attribute of node.attributes || []) {
      if (attribute.type !== 'mdxJsxAttribute') fail(`spread attributes are not allowed on ${node.name}`);
      if (attribute.value && typeof attribute.value === 'object') fail(`expression attributes are not allowed on ${node.name}.${attribute.name}`);
    }
  });
  visit(tree, 'mdxjsEsm', (node, index, parent) => {
    const value = node.value.trim();
    if (!/^import\s+.+\s+from\s+['"]@astrojs\/starlight\/components['"];?$/.test(value)) fail('only Starlight component imports are allowed');
    parent.children.splice(index, 1);
    return index;
  });
  visit(tree, ['mdxFlowExpression', 'mdxTextExpression'], () => fail('MDX expressions are not allowed in public projection'));
}
function localTarget(url) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|mailto:|tel:)/i.test(url);
}
function splitTarget(url) { return url.split(/[?#]/, 1)[0]; }
function rewriteAndValidateLinks(tree, visit, sourceFile, sourceRoot, destination, destinationMap, assets) {
  visit(tree, ['link', 'image'], (node) => {
    if (!localTarget(node.url)) return;
    const bare = splitTarget(node.url);
    if (!bare) return;
    const sourceTarget = bare.startsWith('/d/public/')
      ? path.resolve(sourceRoot, bare.slice('/d/public/'.length))
      : path.resolve(path.dirname(sourceFile), bare);
    if (!isWithin(sourceRoot, sourceTarget)) fail(`relative reference escapes projection root: ${node.url}`);
    if (node.type === 'image') {
      if (!fs.existsSync(sourceTarget) || !fs.statSync(sourceTarget).isFile()) fail(`missing image asset: ${node.url}`);
      const assetRelative = path.relative(sourceRoot, sourceTarget).split(path.sep).join('/');
      assets.set(assetRelative, sourceTarget);
      return;
    }
    const candidates = [sourceTarget, `${sourceTarget}.md`, `${sourceTarget}.mdx`, path.join(sourceTarget, 'index.md'), path.join(sourceTarget, 'index.mdx')];
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    if (!existing) fail(`broken relative link: ${node.url}`);
    const sourceRelative = path.relative(sourceRoot, existing).split(path.sep).join('/');
    const mapped = destinationMap.get(sourceRelative);
    if (!mapped) fail(`relative link targets an unpublished page: ${node.url}`);
    let relative = path.posix.relative(path.posix.dirname(destination), mapped).replace(/\.mdx?$/, '');
    if (!relative.startsWith('.')) relative = `./${relative}`;
    node.url = node.url.replace(bare, relative);
  });
}
async function mdxTools() {
  const [{ unified }, remarkParse, remarkMdx, remarkFrontmatter, remarkStringify, { visit }, YAML] = await Promise.all([
    import('unified'), import('remark-parse'), import('remark-mdx'), import('remark-frontmatter'), import('remark-stringify'), import('unist-util-visit'), import('yaml'),
  ]);
  return { unified, remarkParse: remarkParse.default, remarkMdx: remarkMdx.default, remarkFrontmatter: remarkFrontmatter.default, remarkStringify: remarkStringify.default, visit, YAML };
}
async function convertProjection({ repositoryRoot = '.', sourceRoot, manifestFile, siteTemplateFile, outputRoot }) {
  const manifest = loadManifest(manifestFile);
  const template = readJson(siteTemplateFile, 'site template');
  if (!template || typeof template !== 'object' || Array.isArray(template)) fail('site template must be a JSON object');
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  const tools = await mdxTools();
  const destinationMap = new Map(manifest.files.map((entry) => [entry.source, entry.destination]));
  const publishedPages = new Set(manifest.files.map((entry) => entry.destination.replace(/\.mdx?$/, '')));
  function validateNavigation(value, inPages = false) {
    if (Array.isArray(value)) { for (const item of value) validateNavigation(item, inPages); return; }
    if (!value || typeof value !== 'object') {
      if (inPages && typeof value === 'string' && localTarget(value) && !publishedPages.has(value.replace(/^\//, '').replace(/\.mdx?$/, ''))) fail(`navigation references an unpublished page: ${value}`);
      return;
    }
    for (const [key, child] of Object.entries(value)) validateNavigation(child, key === 'pages');
  }
  if (manifest.navigation) validateNavigation(manifest.navigation);
  const assets = new Map();
  for (const entry of manifest.files) {
    const sourceFile = path.join(sourceRoot, entry.source);
    if (!isWithin(sourceRoot, sourceFile) || !fs.existsSync(sourceFile)) fail(`manifest source does not exist: ${entry.source}`);
    const processor = tools.unified().use(tools.remarkParse).use(tools.remarkMdx).use(tools.remarkFrontmatter, ['yaml']).use(tools.remarkStringify, { bullet: '-', fences: true });
    const tree = processor.parse(fs.readFileSync(sourceFile, 'utf8'));
    frontmatterFromTree(tree, tools.YAML);
    validateAndMapComponents(tree, tools.visit);
    rewriteAndValidateLinks(tree, tools.visit, sourceFile, sourceRoot, entry.destination, destinationMap, assets);
    const outputFile = path.join(outputRoot, entry.destination);
    if (!isWithin(outputRoot, outputFile)) fail(`manifest destination escapes output root: ${entry.destination}`);
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, String(processor.stringify(tree)));
  }
  for (const [relative, source] of assets) {
    const target = path.join(outputRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  for (const entry of manifest.assets) {
    const source = path.join(repositoryRoot, entry.source);
    const target = path.join(outputRoot, entry.destination);
    if (!isWithin(repositoryRoot, source) || !fs.existsSync(source) || !fs.statSync(source).isFile()) fail(`manifest asset does not exist: ${entry.source}`);
    if (!isWithin(outputRoot, target)) fail(`manifest asset destination escapes output root: ${entry.destination}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  writeJson(path.join(outputRoot, 'docs.json'), { ...template, navigation: manifest.navigation || template.navigation });
  return { pages: manifest.files.length, assets: assets.size + manifest.assets.length };
}
function loadDenylist(file) {
  if (!file) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}
function scanDirectory(root, denylistFile) {
  const violations = [];
  const denylist = loadDenylist(denylistFile);
  for (const file of walk(root)) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (!/\.(?:mdx?|json|txt|ya?ml|svg)$/i.test(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const [name, pattern] of BUILTIN_SECRET_PATTERNS) if (pattern.test(content)) violations.push(`${relative}: ${name}`);
    for (const literal of denylist) if (`${relative}\n${content}`.toLowerCase().includes(literal.toLowerCase())) violations.push(`${relative}: private denylist match`);
  }
  if (violations.length) fail(`public-output scan failed (${violations.length} violation(s)):\n${violations.join('\n')}`);
  return { files: walk(root).length };
}
function changedMarkdown(sourceRoot, projectionRoot, baseSha) {
  let names;
  if (baseSha) names = execFileSync('git', ['diff', '--name-only', `${baseSha}..HEAD`, '--', sourceRoot], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  else names = walk(sourceRoot).map((file) => path.relative(process.cwd(), file).split(path.sep).join('/'));
  const projectionPrefix = `${projectionRoot.replace(/\/$/, '')}/`;
  return names.filter((name) => /\.mdx?$/.test(name) && !name.startsWith(projectionPrefix) && fs.existsSync(name));
}
function assertEndpoint(endpoint, allowedHosts) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail('local AI endpoint must use HTTP(S)');
  const allowed = new Set(allowedHosts.split(',').map((host) => host.trim()).filter(Boolean));
  if (!allowed.has(url.hostname)) fail(`local AI endpoint host is not allowlisted: ${url.hostname}`);
  return url;
}
function parseModelJson(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') fail('local model returned no message content');
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { fail('local model returned invalid JSON'); }
}
async function curate({ sourceRoot, projectionRoot, manifestFile, baseSha, endpoint, allowedHosts, model, apiKey }) {
  const manifest = loadManifest(manifestFile);
  const changed = changedMarkdown(sourceRoot, projectionRoot, baseSha);
  const endpointUrl = assertEndpoint(endpoint, allowedHosts);
  let published = 0; let skipped = 0;
  for (const source of changed) {
    const prompt = `Decide whether this internal documentation has a safe public version. Never reproduce credentials, private network details, hostnames, identities, incident details, or implementation-level secret-management procedures. Return JSON only: {"action":"skip"} or {"action":"publish","destination":"normalized/path.mdx","content":"complete safe MDX"}. The content may use only Mintlify-compatible markdown plus Aside, Steps, Step, LinkCard, CardGrid, Tabs, and Tab. Source path: ${source}\n\n${fs.readFileSync(source, 'utf8')}`;
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, temperature: 0, tools: [], messages: [{ role: 'system', content: 'You are a one-way public documentation curator. You have no tools. Return only the requested JSON.' }, { role: 'user', content: prompt }] }),
    });
    if (!response.ok) fail(`local model request failed with HTTP ${response.status}`);
    const result = parseModelJson(await response.json());
    assertKeys(result, new Set(['action', 'destination', 'content']), 'local model response');
    if (result.action === 'skip') { if (result.destination !== undefined || result.content !== undefined) fail('skip response must not contain destination or content'); skipped += 1; continue; }
    if (result.action !== 'publish' || typeof result.content !== 'string') fail('local model action must be skip or publish with content');
    const destination = safeRelative(result.destination, 'local model destination');
    if (!/\.mdx?$/.test(destination)) fail('local model destination must be Markdown or MDX');
    const projectionFile = path.join(projectionRoot, destination);
    if (!isWithin(projectionRoot, projectionFile)) fail('local model destination escapes projection root');
    fs.mkdirSync(path.dirname(projectionFile), { recursive: true });
    fs.writeFileSync(projectionFile, result.content.endsWith('\n') ? result.content : `${result.content}\n`);
    const relativeProjection = path.relative(projectionRoot, projectionFile).split(path.sep).join('/');
    const existing = manifest.files.find((entry) => entry.destination === destination);
    if (existing) existing.source = relativeProjection;
    else manifest.files.push({ source: relativeProjection, destination });
    published += 1;
  }
  manifest.files.sort((a, b) => a.destination.localeCompare(b.destination));
  writeJson(manifestFile, manifest);
  return { considered: changed.length, published, skipped };
}
function syncOutput(generatedRoot, checkoutRoot) {
  if (!fs.existsSync(path.join(generatedRoot, 'docs.json'))) fail('generated output missing docs.json');
  const controlPlane = new Set(['.editorconfig', '.github', '.gitignore', 'AGENTS.md', 'CONTRIBUTING.md', 'LICENSE', 'README.md', 'SECURITY.md', 'flake.lock', 'flake.nix', 'scripts']);
  for (const entry of fs.readdirSync(checkoutRoot)) {
    if (!controlPlane.has(entry)) fs.rmSync(path.join(checkoutRoot, entry), { recursive: true, force: true });
  }
  for (const entry of fs.readdirSync(generatedRoot)) {
    const source = path.join(generatedRoot, entry);
    const target = path.join(checkoutRoot, entry);
    fs.cpSync(source, target, { recursive: true, force: true });
  }
}
function args(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) result._.push(value);
    else { const next = argv[index + 1]; if (!next || next.startsWith('--')) fail(`missing value for ${value}`); result[value.slice(2)] = next; index += 1; }
  }
  return result;
}
async function main(argv = process.argv.slice(2)) {
  const options = args(argv); const command = options._[0]; let result;
  if (command === 'convert') result = await convertProjection({ repositoryRoot: options.repository || '.', sourceRoot: options.source, manifestFile: options.manifest, siteTemplateFile: options.template, outputRoot: options.output });
  else if (command === 'scan') result = scanDirectory(options.source, options.denylist);
  else if (command === 'curate') result = await curate({ sourceRoot: options.source, projectionRoot: options.projection, manifestFile: options.manifest, baseSha: options.base || process.env.DOCS_BASE_SHA || '', endpoint: options.endpoint, allowedHosts: options['allowed-hosts'] || 'localhost,127.0.0.1,::1', model: options.model, apiKey: process.env.DOCS_LOCAL_AI_API_KEY });
  else if (command === 'sync') result = syncOutput(options.source, options.checkout);
  else fail(`unknown command: ${command || '(none)'}`);
  process.stdout.write(`${command} completed: ${JSON.stringify(result || {})}\n`);
  return result;
}
if (require.main === module) main().catch((error) => { process.stderr.write(`docs publisher failed: ${error.message}\n`); process.exitCode = 1; });

module.exports = { loadManifest, convertProjection, scanDirectory, curate, syncOutput, parseModelJson, main };
