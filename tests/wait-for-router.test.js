const { expect, test } = require('bun:test');
const { join } = require('path');

const script = join(process.cwd(), '.github/scripts/shared/wait-for-router.sh');

// Bun.spawn, not spawnSync: a synchronous child would block this process's
// event loop, and the stub server that the child is calling lives in it.
async function run(port, extraEnv = {}) {
  const child = Bun.spawn(['bash', script], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      BASE_URL: `http://127.0.0.1:${port}/v1`,
      API_KEY: 'test-key',
      BACKOFF_START: '1',
      ...extraEnv,
    },
  });
  const status = await child.exited;
  const stderr = await new Response(child.stderr).text();
  return { status, stderr };
}

test('waits through a 503 and succeeds once the endpoint answers', async () => {
  let hits = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      hits += 1;
      if (hits < 3) return new Response('down', { status: 503 });
      return Response.json({ data: [] });
    },
  });
  const { status } = await run(server.port);
  server.stop(true);

  expect(status).toBe(0);
  expect(hits).toBe(3);
});

test('fails once the wait bound passes instead of holding the runner', async () => {
  let hits = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      hits += 1;
      return new Response('down', { status: 503 });
    },
  });
  const started = Date.now();
  const { status, stderr } = await run(server.port, { WAIT_MAX: '2' });
  const elapsed = Date.now() - started;
  server.stop(true);

  expect(status).toBe(1);
  expect(stderr).toContain('past the 2s budget');
  expect(elapsed).toBeLessThan(10_000);
  expect(hits).toBeGreaterThan(1);
});

test('fails immediately on a 401 without waiting', async () => {
  let hits = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      hits += 1;
      return new Response('no', { status: 401 });
    },
  });
  const { status, stderr } = await run(server.port, { WAIT_MAX: '30' });
  server.stop(true);

  expect(status).toBe(1);
  expect(hits).toBe(1);
  expect(stderr).toContain('HTTP 401');
});
