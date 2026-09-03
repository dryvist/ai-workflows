const { afterEach, describe, expect, it, mock } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const publisher = require('../.github/scripts/docs-publisher/publisher.js');

const temporary = [];
function temp() { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-publisher-')); temporary.push(directory); return directory; }
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }

afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  mock.restore();
});

describe('docs publisher', () => {
  it('converts supported Starlight MDX, links, navigation, and declared assets', async () => {
    const root = temp();
    const projection = path.join(root, 'src/content/docs/d/public');
    const output = path.join(root, 'out');
    write(path.join(projection, 'index.mdx'), `---\ntitle: Start\nsidebar:\n  label: Begin\n---\nimport { Aside, LinkCard } from '@astrojs/starlight/components';\n\n<Aside type="caution">Keep this safe.</Aside>\n\n<LinkCard title="Next" href="./next" />\n\n[Next](./next.mdx)\n`);
    write(path.join(projection, 'next.mdx'), '---\ntitle: Next\n---\n\nDone.\n');
    write(path.join(root, 'public/assets/logo.svg'), '<svg/>\n');
    write(path.join(root, '.publisher/manifest.yml'), JSON.stringify({ version: 1, files: [{ source: 'index.mdx', destination: 'index.mdx' }, { source: 'next.mdx', destination: 'next.mdx' }], assets: [{ source: 'public/assets/logo.svg', destination: 'logo.svg' }], navigation: { pages: ['index', 'next'] } }));
    write(path.join(root, '.publisher/site-template.json'), JSON.stringify({ name: 'Docs', navigation: {} }));

    const result = await publisher.convertProjection({ repositoryRoot: root, sourceRoot: projection, manifestFile: path.join(root, '.publisher/manifest.yml'), siteTemplateFile: path.join(root, '.publisher/site-template.json'), outputRoot: output });

    const page = fs.readFileSync(path.join(output, 'index.mdx'), 'utf8');
    expect(result).toEqual({ pages: 2, assets: 1 });
    expect(page).toContain('sidebarTitle: Begin');
    expect(page).toContain('<Warning>Keep this safe.</Warning>');
    expect(page).toContain('<Card title="Next" href="./next" />');
    expect(page).toContain('[Next](./next)');
    expect(fs.readFileSync(path.join(output, 'logo.svg'), 'utf8')).toBe('<svg/>\n');
    expect(JSON.parse(fs.readFileSync(path.join(output, 'docs.json'), 'utf8')).navigation.pages).toEqual(['index', 'next']);
  });

  it('fails closed on unknown frontmatter, components, and unpublished links', async () => {
    const root = temp(); const projection = path.join(root, 'projection');
    write(path.join(root, 'template.json'), '{}');
    write(path.join(root, 'manifest.yml'), JSON.stringify({ version: 1, files: [{ source: 'bad.mdx', destination: 'bad.mdx' }] }));
    write(path.join(projection, 'bad.mdx'), '---\ntitle: Bad\nprivate: true\n---\n\n<SecretWidget />\n\n[Hidden](./hidden.mdx)\n');

    await expect(publisher.convertProjection({ repositoryRoot: root, sourceRoot: projection, manifestFile: path.join(root, 'manifest.yml'), siteTemplateFile: path.join(root, 'template.json'), outputRoot: path.join(root, 'out') })).rejects.toThrow('unknown key: private');
    write(path.join(projection, 'bad.mdx'), '---\ntitle: Bad\n---\n\n<SecretWidget />\n');
    await expect(publisher.convertProjection({ repositoryRoot: root, sourceRoot: projection, manifestFile: path.join(root, 'manifest.yml'), siteTemplateFile: path.join(root, 'template.json'), outputRoot: path.join(root, 'out') })).rejects.toThrow('unsupported MDX component');
    write(path.join(projection, 'bad.mdx'), '---\ntitle: Bad\n---\n\n[Hidden](./hidden.mdx)\n');
    await expect(publisher.convertProjection({ repositoryRoot: root, sourceRoot: projection, manifestFile: path.join(root, 'manifest.yml'), siteTemplateFile: path.join(root, 'template.json'), outputRoot: path.join(root, 'out') })).rejects.toThrow('broken relative link');
  });

  it('blocks built-in secrets and private denylist literals without echoing values', () => {
    const root = temp();
    write(path.join(root, 'page.mdx'), 'token = super-secret-value\n');
    expect(() => publisher.scanDirectory(root)).toThrow('assigned credential');
    write(path.join(root, 'page.mdx'), 'Customer codename ALBATROSS\n');
    write(path.join(root, 'denylist.txt'), 'ALBATROSS\n');
    expect(() => publisher.scanDirectory(root, path.join(root, 'denylist.txt'))).toThrow('private denylist match');
    try { publisher.scanDirectory(root, path.join(root, 'denylist.txt')); } catch (error) { expect(error.message).not.toContain('ALBATROSS'); }
  });

  it('curates changed private docs through a tool-free allowlisted local endpoint', async () => {
    const root = temp(); const previous = process.cwd();
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'tester'], { cwd: root });
    write(path.join(root, 'src/content/docs/internal.mdx'), '---\ntitle: Internal\n---\n\nPrivate facts.\n');
    write(path.join(root, '.publisher/manifest.yml'), JSON.stringify({ version: 1, files: [] }));
    const fetchMock = mock(async (_url, request) => {
      const body = JSON.parse(request.body);
      expect(body.tools).toEqual([]);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: 'publish', destination: 'guide.mdx', content: '---\ntitle: Guide\n---\n\nSafe.\n' }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const originalFetch = global.fetch; global.fetch = fetchMock; process.chdir(root);
    try {
      const result = await publisher.curate({ sourceRoot: 'src/content/docs', projectionRoot: 'src/content/docs/d/public', manifestFile: '.publisher/manifest.yml', baseSha: '', endpoint: 'http://127.0.0.1:4000/v1/chat/completions', allowedHosts: '127.0.0.1', model: 'local-model' });
      expect(result).toEqual({ considered: 1, published: 1, skipped: 0 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fs.existsSync(path.join(root, 'src/content/docs/d/public/guide.mdx'))).toBe(true);
    } finally { global.fetch = originalFetch; process.chdir(previous); }
  });

  it('synchronizes only the generated public surface', () => {
    const root = temp(); const generated = path.join(root, 'generated'); const checkout = path.join(root, 'checkout');
    write(path.join(generated, 'new.mdx'), 'new\n'); write(path.join(generated, 'docs.json'), '{}\n');
    write(path.join(checkout, 'old.mdx'), 'old\n'); write(path.join(checkout, 'README.md'), 'keep\n');
    publisher.syncOutput(generated, checkout);
    expect(fs.existsSync(path.join(checkout, 'old.mdx'))).toBe(false);
    expect(fs.readFileSync(path.join(checkout, 'new.mdx'), 'utf8')).toBe('new\n');
    expect(fs.readFileSync(path.join(checkout, 'README.md'), 'utf8')).toBe('keep\n');
  });
});
