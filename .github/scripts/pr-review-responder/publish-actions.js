const fs = require('fs');
const { fetchThreads } = require('./fetch-threads.js');

const REPLY = `
  mutation ($id: ID!, $body: String!) {
    addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $id, body: $body }) {
      comment { id }
    }
  }
`;
const RESOLVE = `
  mutation ($id: ID!) {
    resolveReviewThread(input: { threadId: $id }) { thread { id isResolved } }
  }
`;

module.exports = async ({ github, context, core }) => {
  const number = Number(process.env.PR_NUMBER);
  if (!Number.isInteger(number) || number <= 0) {
    core.setFailed('PR_NUMBER must be a positive integer');
    return;
  }
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync('.review-actions.json', 'utf8'));
  } catch (error) {
    core.setFailed(`Could not parse .review-actions.json: ${error.message}`);
    return;
  }
  if (!payload || Object.keys(payload).length !== 1 || !Array.isArray(payload.actions) || payload.actions.length > 100) {
    core.setFailed('.review-actions.json must contain only an actions array with at most 100 entries');
    return;
  }

  const threads = await fetchThreads(github, context.repo.owner, context.repo.repo, number);
  const unresolved = new Set(threads.filter((thread) => !thread.isResolved).map((thread) => thread.id));
  const seen = new Set();
  for (const action of payload.actions) {
    const keys = action && Object.keys(action).sort().join(',');
    if (keys !== 'reply,resolve,thread_id' || typeof action.thread_id !== 'string' ||
        typeof action.reply !== 'string' || action.reply.length < 1 || action.reply.length > 1500 ||
        typeof action.resolve !== 'boolean' || seen.has(action.thread_id) || !unresolved.has(action.thread_id)) {
      core.setFailed('Each action must target one current unresolved thread with a unique ID, a 1-1500 character reply, and a boolean resolve value');
      return;
    }
    seen.add(action.thread_id);
  }

  for (const action of payload.actions) {
    await github.graphql(REPLY, { id: action.thread_id, body: action.reply });
    if (action.resolve) await github.graphql(RESOLVE, { id: action.thread_id });
  }
  core.setOutput('published_count', String(payload.actions.length));
};
