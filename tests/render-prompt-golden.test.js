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
  'code-simplifier': 'f1362a8665af9adf1e3d1fbfb9b3a22cfec07f8cd9feba2fb424c11d09505030',
  'dep-review': 'fba25cae768282a745594d25c7f15ec04d8f5849a0eb225e152286f0eb3b36ba',
  'issue-resolver': '7fc9ca6e74d471ccedb710bb3fc2dfe6fcd47d44890e0f962f87441b807dc54c',
  'next-steps': '78735a0f182ef1a67e3da626be643eccaaf3591deca880dc768f2fec0f412e3e',
  'post-merge-docs-review': '28b1d70e8f0ec0b2e64dcbfa6d5410bf50f67acf7fa2c32cf6c417d844e759af',
  'post-merge-tests': 'ad6f784cb564feb385e8adf2bdae7f0b046a527897ec4f205ea58d645fb11aab',
  'pr-review-responder': '374a7361e136fb2ff31546cfce8cb829f346042460d10c00bcd7f9d657aa7f4c',
  'release-notes': 'd6cc1b32304e8dfdc191931177d2ea043f65c69f96bda27119d4ef5658b919ab',
  'issue-backlog-sweep': '2f9591df7033a51c7c6c865b72f3cb1293a8778fd417fbcd4a7a75257be4fd3e',
  'issue-hygiene': 'f6a82b2f6a257f3d51f0890bd51c5f8b18aec0c6f12f63a7972534c5acbcacc1',
  'issue-linker': 'c2c1538ee7589205792d6656a9309b2d933b317f93dff226186600683c4d56eb',
  'issue-sweeper': 'acaac1c7a73bb628db85c9f4dfc7322b50cc9625a0d4a16eebb76fdee663e574',
  'issue-triage': '4cc1472a88e0320c15688584ddbb96d50f1d9e5c9da57adcbba3bbe17aaf5187',
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
