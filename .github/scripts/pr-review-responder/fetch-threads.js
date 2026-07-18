const fs = require('fs');

const QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id isResolved isOutdated path line
            comments(last: 20) { nodes { body author { login } } }
          }
        }
      }
    }
  }
`;

async function fetchThreads(github, owner, repo, number) {
  const threads = [];
  let cursor = null;
  do {
    const result = await github.graphql(QUERY, { owner, repo, number, cursor });
    const connection = result.repository.pullRequest.reviewThreads;
    threads.push(...connection.nodes);
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);
  return threads;
}

module.exports = async ({ github, context, core }) => {
  const number = Number(process.env.PR_NUMBER);
  if (!Number.isInteger(number) || number <= 0) {
    core.setFailed('PR_NUMBER must be a positive integer');
    return;
  }
  const threads = await fetchThreads(github, context.repo.owner, context.repo.repo, number);
  fs.writeFileSync('.review-threads.json', JSON.stringify({ threads }, null, 2));
  core.info(`Prepared ${threads.length} review thread(s) for analysis.`);
};

module.exports.fetchThreads = fetchThreads;
