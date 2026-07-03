// Apply Claude's review-thread verdict with the App-token `github` client passed
// by the workflow: post replies and resolve threads Claude judged addressed.
//
// Claude wrote `.review-responses.json` read-only (it holds no write token while
// reading untrusted reviewer text). Security: we re-fetch the PR's live unresolved
// thread IDs and act ONLY on IDs in that set, so the untrusted verdict cannot reply
// to or resolve arbitrary threads. Never merges.
const fs = require('fs');
const { fetchUnresolvedThreads } = require('./threads');

const REPLY = `mutation ($id: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $id, body: $body }) { comment { id } }
}`;
const RESOLVE = `mutation ($id: ID!) {
  resolveReviewThread(input: { threadId: $id }) { thread { isResolved } }
}`;

module.exports = async ({ github, context, core }) => {
  const number = parseInt(process.env.PR_NUMBER, 10);
  if (!Number.isFinite(number) || number <= 0) { core.setFailed('PR_NUMBER is not a valid number'); return; }
  const { owner, repo } = context.repo;
  const file = process.env.RESPONSES_FILE || '.review-responses.json';

  if (!fs.existsSync(file)) { core.info(`No ${file} — nothing to apply.`); core.setOutput('applied_count', '0'); return; }
  let responses;
  try {
    responses = JSON.parse(fs.readFileSync(file, 'utf8'))?.responses;
  } catch (e) {
    core.setFailed(`Could not parse ${file}: ${e.message}`);
    return;
  }
  if (!Array.isArray(responses) || responses.length === 0) { core.info('Verdict lists no responses.'); core.setOutput('applied_count', '0'); return; }

  // Only threads that truly belong to this PR and are still unresolved may be touched.
  const valid = new Set((await fetchUnresolvedThreads({ github, owner, repo, number })).map((t) => t.threadId));

  let replied = 0;
  let resolved = 0;
  const processed = new Set(); // a duplicate threadId in the verdict must not double-reply/resolve
  for (const r of responses) {
    const threadId = typeof r?.threadId === 'string' ? r.threadId : null;
    if (!threadId || !valid.has(threadId)) { core.info(`Skipping unknown/foreign threadId: ${threadId}`); continue; }
    if (processed.has(threadId)) { core.info(`Skipping duplicate threadId: ${threadId}`); continue; }
    processed.add(threadId);

    const reply = typeof r?.reply === 'string' ? r.reply.trim() : '';
    if (reply) {
      try { await github.graphql(REPLY, { id: threadId, body: reply }); replied += 1; }
      catch (e) { core.info(`Reply failed on ${threadId}: ${e.message}`); }
    }
    if (r?.resolve === true) {
      try { await github.graphql(RESOLVE, { id: threadId }); resolved += 1; }
      catch (e) { core.info(`Resolve failed on ${threadId}: ${e.message}`); }
    }
  }

  core.info(`Review responder: ${replied} repl(y/ies), ${resolved} thread(s) resolved.`);
  core.setOutput('applied_count', String(replied + resolved));
};
