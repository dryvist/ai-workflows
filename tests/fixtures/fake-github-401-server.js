// Test fixture: a standalone HTTP server that always answers 401 with the
// same JSON shape a real GitHub 401 carries. Run as a separate `bun` process
// (not Bun.serve() inside the test runner's own process) so the CLI
// subprocess under test talks to it exactly the way it would talk to the
// real GitHub API — no shared-process fetch/event-loop assumptions.
// The assigned port is written to the file named in argv[2] (a plain-file
// handoff rather than a piped-stdout read, which needs the parent to pump
// its own event loop while it's mid-synchronous execFileSync elsewhere).
const portFile = process.argv[2];
const server = Bun.serve({
  port: 0,
  fetch: () => Response.json({ message: 'Bad credentials' }, { status: 401 }),
});
require('fs').writeFileSync(portFile, String(server.port));
