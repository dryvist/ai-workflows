const { expect, test } = require('bun:test');
const { mkdtempSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const script = join(process.cwd(), '.github/scripts/shared/router-chat.sh');

// Bun.spawn, not spawnSync: a synchronous child would block this process's
// event loop, and the stub server that the child is calling lives in it.
async function run(port) {
  const dir = mkdtempSync(join(tmpdir(), 'router-chat-'));
  writeFileSync(join(dir, 'user.txt'), 'DIFF:\nnothing');
  const child = Bun.spawn(['bash', script], {
    cwd: dir,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      BASE_URL: `http://127.0.0.1:${port}/v1`,
      API_KEY: 'test-key',
      MODEL: 'cheap',
      SYSTEM_PROMPT: 'test',
      USER_FILE: 'user.txt',
      OUT: 'out.json',
      REQUIRED_KEY: 'items',
      BACKOFF_START: '0',
    },
  });
  return { dir, status: await child.exited };
}

test('retries a 503 until the router answers, then writes the parsed output', async () => {
  let hits = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      hits += 1;
      if (hits < 3) return new Response('down', { status: 503 });
      return Response.json({
        choices: [{ message: { content: '```json\n{"items":[]}\n```' } }],
      });
    },
  });
  const { dir, status } = await run(server.port);
  server.stop(true);

  expect(status).toBe(0);
  expect(hits).toBe(3);
  expect(JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8'))).toEqual({ items: [] });
});

test('fails immediately on a 401 instead of waiting out the job timeout', async () => {
  let hits = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      hits += 1;
      return new Response('no', { status: 401 });
    },
  });
  const { status } = await run(server.port);
  server.stop(true);

  expect(status).toBe(1);
  expect(hits).toBe(1);
});

test('fails when the model output lacks the required key', async () => {
  const server = Bun.serve({
    port: 0,
    fetch() {
      return Response.json({ choices: [{ message: { content: '{"other":1}' } }] });
    },
  });
  const { status } = await run(server.port);
  server.stop(true);

  expect(status).toBe(1);
});

test('fails once the retry budget passes instead of holding the runner', async () => {
  let hits = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      hits += 1;
      return new Response('down', { status: 503 });
    },
  });
  const started = Date.now();
  const child = Bun.spawn(['bash', script], {
    cwd: mkdtempSync(join(tmpdir(), 'router-chat-')),
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      BASE_URL: `http://127.0.0.1:${server.port}/v1`,
      API_KEY: 'test-key',
      MODEL: 'cheap',
      SYSTEM_PROMPT: 'test',
      USER_FILE: '/dev/null',
      OUT: 'out.json',
      BACKOFF_START: '1',
      RETRY_MAX: '2',
    },
  });
  const status = await child.exited;
  const stderr = await new Response(child.stderr).text();
  const elapsed = Date.now() - started;
  server.stop(true);

  expect(status).toBe(1);
  expect(stderr).toContain('past the 2s retry budget');
  expect(elapsed).toBeLessThan(10_000);
  expect(hits).toBeGreaterThan(1);
});

test('walks the fallback ladder when the first model exhausts its budget', async () => {
  const models = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const body = await req.json();
      models.push(body.model);
      if (body.model === 'primary') return new Response('down', { status: 503 });
      return Response.json({
        choices: [{ message: { content: '{"items":["ok"]}' } }],
      });
    },
  });
  const dir = mkdtempSync(join(tmpdir(), 'router-chat-'));
  writeFileSync(join(dir, 'user.txt'), 'DIFF:\nnothing');
  const child = Bun.spawn(['bash', script], {
    cwd: dir,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      BASE_URL: `http://127.0.0.1:${server.port}/v1`,
      API_KEY: 'test-key',
      MODEL: 'primary',
      FALLBACK_MODELS: 'second, third',
      SYSTEM_PROMPT: 'test',
      USER_FILE: 'user.txt',
      OUT: 'out.json',
      REQUIRED_KEY: 'items',
      BACKOFF_START: '1',
      RETRY_MAX: '2',
    },
  });
  const status = await child.exited;
  server.stop(true);

  expect(status).toBe(0);
  expect(models.filter((m) => m === 'primary').length).toBeGreaterThan(1);
  expect(models[models.length - 1]).toBe('second');
  expect(JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8')).model).toBe('second');
  expect(JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8'))).toEqual({ items: ['ok'] });
});
