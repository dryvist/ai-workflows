// Shared GraphQL helpers for reading PR review threads.
//
// Two shapes:
//   scanOpenPRThreads    — paginate all OPEN PRs with a light view of their
//                          unresolved threads (for the staleness enumerator).
//   fetchUnresolvedThreads — full detail for ONE PR (for the prompt file and the
//                          reply/resolve step; also the source of truth for which
//                          thread IDs may be mutated, so an untrusted verdict can't
//                          resolve arbitrary threads).

// Logins whose comment means "already handled by us" — the responder must not
// treat its own replies as fresh reviewer feedback (that would loop forever).
const OUR_BOT_LOGINS = ['jacobpevans-claude[bot]', 'claude[bot]', 'github-actions[bot]'];

// Hidden marker comment used to count/limit responder attempts per PR.
const ATTEMPT_MARKER = '<!-- claude-review-responder-attempt -->';

// Newest comment on a thread; null when the thread has no comments.
function lastComment(thread) {
  const nodes = thread?.comments?.nodes || [];
  return nodes.length ? nodes[nodes.length - 1] : null;
}

// Enumerate OPEN PRs (newest-updated first) with a light view of each unresolved
// thread's last comment. Returns [{ number, isCrossRepository, author, threads:
// [{ isResolved, lastCommentLogin, lastCommentAt }] }].
async function scanOpenPRThreads({ github, owner, repo }) {
  const query = `
    query ($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequests(states: OPEN, first: 50, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
          pageInfo { hasNextPage endCursor }
          nodes {
            number
            isCrossRepository
            author { login }
            reviewThreads(first: 100) {
              nodes {
                isResolved
                comments(last: 1) { nodes { author { login } createdAt } }
              }
            }
          }
        }
      }
    }`;
  const prs = [];
  let cursor = null;
  do {
    const res = await github.graphql(query, { owner, repo, cursor });
    const page = res.repository.pullRequests;
    for (const pr of page.nodes) {
      prs.push({
        number: pr.number,
        isCrossRepository: pr.isCrossRepository,
        author: pr.author?.login || null,
        threads: (pr.reviewThreads?.nodes || []).map((t) => {
          const c = lastComment(t);
          return { isResolved: t.isResolved, lastCommentLogin: c?.author?.login || null, lastCommentAt: c?.createdAt || null };
        }),
      });
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return prs;
}

// Full unresolved-thread detail for one PR. Returns [{ threadId, path, line,
// comments: [{ author, body, createdAt }] }].
async function fetchUnresolvedThreads({ github, owner, repo, number }) {
  const query = `
    query ($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 50, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              isResolved
              path
              line
              comments(first: 20) { nodes { author { login } body createdAt } }
            }
          }
        }
      }
    }`;
  const threads = [];
  let cursor = null;
  do {
    const res = await github.graphql(query, { owner, repo, number, cursor });
    const page = res.repository.pullRequest.reviewThreads;
    for (const t of page.nodes) {
      if (t.isResolved) continue;
      threads.push({
        threadId: t.id,
        path: t.path,
        line: t.line,
        comments: (t.comments?.nodes || []).map((c) => ({ author: c.author?.login || null, body: c.body, createdAt: c.createdAt })),
      });
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return threads;
}

module.exports = { OUR_BOT_LOGINS, ATTEMPT_MARKER, lastComment, scanOpenPRThreads, fetchUnresolvedThreads };
