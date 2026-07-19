const { afterEach, expect, test } = require('bun:test');
const { createHash } = require('crypto');
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const catalogRoot = process.env.AI_LLM_PROMPTS_DIR || '.ai-llm-prompts';
const temporaryDirectories = [];

const prompts = {
  'best-practices': 'f04a9e6b3b33c74fbad4eb06ac9e4d79619f4b0dfd58f0305f69dff73fad7adb',
  'ci-fix': '6855c4cf96f7f2d5278f917e4fd4ef281e0075f90f04ff4bd91dc89c3b14ef09',
  'code-simplifier': '1214b5db8e6be7ec8d5e6ea2faadcabf769d9ba368545518305c034b0ca74308',
  'dep-review': 'ca0ee1327fd8d883dc741e7ea808eb8d0f424e8f9c374e4f7ab2511123caee82',
  'issue-resolver': '7fc9ca6e74d471ccedb710bb3fc2dfe6fcd47d44890e0f962f87441b807dc54c',
  'next-steps': '78735a0f182ef1a67e3da626be643eccaaf3591deca880dc768f2fec0f412e3e',
  'post-merge-docs-review': '36fdc2249f1a8950378aaac42ab3eefc626b4f3aa959c57e1b94be40458aa4cd',
  'post-merge-tests': '054251d040e837c3dee17f39d1b01b62a68c94b4c3ce610f0db56f8629d2dc89',
  'pr-review-responder': '04a7ef3c92553b20b7ac217a752d6100a8841fa2e0c330b1bad4e16917859eeb',
  'release-notes': '92f8cc933dda53b12b049484063ffbb78cf16089b7e2d7b3ffba26b7aca3ac4e',
  'issue-backlog-sweep': '2f9591df7033a51c7c6c865b72f3cb1293a8778fd417fbcd4a7a75257be4fd3e',
  'issue-hygiene': 'f6a82b2f6a257f3d51f0890bd51c5f8b18aec0c6f12f63a7972534c5acbcacc1',
  'issue-linker': 'c2c1538ee7589205792d6656a9309b2d933b317f93dff226186600683c4d56eb',
  'issue-sweeper': 'acaac1c7a73bb628db85c9f4dfc7322b50cc9625a0d4a16eebb76fdee663e574',
  'issue-triage': '4cc1472a88e0320c15688584ddbb96d50f1d9e5c9da57adcbba3bbe17aaf5187',
  'label-sync': '535a66019a35c091cfc64422bafe38673c0fd39e4897ef87bb2faf1014a2daab',
  'repo-orchestrator': '2c387aaa07070637b17a8b5833b601e207d93b7bf7fa740143e1a3c8abb0ef97',
};

function promptBody(markdown) {
  const closing = markdown.indexOf('\n---\n', 4);
  if (!markdown.startsWith('---\n') || closing === -1) {
    throw new Error('prompt is missing OKF frontmatter');
  }
  return markdown.slice(closing + 5);
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

for (const [name, expectedHash] of Object.entries(prompts)) {
  test(`catalog prompt body matches the ${name} golden`, () => {
    const path = join(
      catalogRoot,
      'automation',
      `ai-workflows-${name}.md`,
    );
    const body = promptBody(readFileSync(path, 'utf8'));
    const actualHash = createHash('sha256').update(body).digest('hex');
    expect(actualHash).toBe(expectedHash);
  });
}

test('renderer strips OKF frontmatter before substituting variables', () => {
  const directory = mkdtempSync(join(tmpdir(), 'render-prompt-'));
  temporaryDirectories.push(directory);
  const prompt = join(directory, 'prompt.md');
  const output = join(directory, 'github-output');
  writeFileSync(
    prompt,
    '---\ntype: LLM Prompt\ntitle: Test\n---\nHello ${NAME}\n',
  );

  const result = Bun.spawnSync(
    ['bash', '.github/scripts/render-prompt.sh', prompt, 'NAME'],
    {
      env: {
        ...process.env,
        GITHUB_OUTPUT: output,
        NAME: 'world',
      },
    },
  );

  expect(result.exitCode).toBe(0);
  const rendered = readFileSync(output, 'utf8');
  expect(rendered).toContain('Hello world');
  expect(rendered).not.toContain('type: LLM Prompt');
});
