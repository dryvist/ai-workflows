// Dump one PR's UNRESOLVED review threads to a JSON file for the responder prompt.
// Claude reads this file (read-only) so it never needs a write-capable gh token
// while reading untrusted reviewer text — same "judge read-only, privileged step
// mutates" split as issue-backlog-sweep.
const fs = require('fs');
const { fetchUnresolvedThreads } = require('./threads');

module.exports = async ({ github, context, core }) => {
  const number = parseInt(process.env.PR_NUMBER, 10);
  if (!Number.isFinite(number) || number <= 0) { core.setFailed('PR_NUMBER is not a valid number'); return; }
  const { owner, repo } = context.repo;
  const threads = await fetchUnresolvedThreads({ github, owner, repo, number });
  const file = process.env.THREADS_FILE || '.review-threads.json';
  fs.writeFileSync(file, JSON.stringify({ pr: number, threads }, null, 2));
  core.info(`Wrote ${threads.length} unresolved thread(s) for PR #${number} to ${file}`);
  core.setOutput('thread_count', String(threads.length));
};
