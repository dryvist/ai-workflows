const { spawnSync } = require('child_process');
const { expect, test } = require('bun:test');
const { join } = require('path');

const parser = join('.github', 'scripts', 'docs-drift', 'parse-response.py');
const response = { items: [], summary: 'No drift.' };

function parse(text) {
  return spawnSync('python3', [parser], { input: text, encoding: 'utf8' });
}

test('parses an unfenced docs-drift JSON response', () => {
  const result = parse(JSON.stringify(response));

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(response);
});

test('parses docs-drift JSON after prose and code fences', () => {
  const text = `Let me analyze the diff first.\n\n\`\`\`json\n${JSON.stringify(response)}\n\`\`\``;
  const result = parse(text);

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(response);
});

test('rejects a response without a valid docs-drift JSON object', () => {
  const result = parse('The model response contains no JSON object.');

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('No valid docs-drift JSON object found');
});

test('rejects an items-only object without the required summary', () => {
  const result = parse('{"items":[]}');

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('No valid docs-drift JSON object found');
});
