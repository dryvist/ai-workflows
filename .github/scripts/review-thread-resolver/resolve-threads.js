// Resolves review threads left by bot reviewers when the thread is outdated
// or the bot reported a failed review run. A thread containing even one
// non-bot comment is never touched, so substantive human discussion always
// survives. Runs in two modes: single PR (event / dispatch) or org sweep
// (SWEEP_REPOS csv — every open PR in each repo).
//
// resolveReviewThread requires a token with contents read-write; the default
// GITHUB_TOKEN is often rejected for bot-authored threads in non-interactive
// runs, so the workflow prefers a GitHub App installation token.

const THREAD_QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            isResolved
            isOutdated
            path
            comments(first: 100) {
              pageInfo { hasNextPage }
              nodes { body author { login __typename } }
            }
          }
        }
      }
    }
  }
`;

const RESOLVE_MUTATION = `
  mutation ($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) { thread { id } }
  }
`;

const DEFAULT_BOT_REVIEWERS = 'gemini-code-assist,copilot-pull-request-reviewer';
const DEFAULT_FAILURE_PATTERNS =
  'startup[_ ]?failure|encountered an error|unable to (process|generate|review)|try again by commenting';

function parseConfig(env) {
  const csv = (value) => (value || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    botReviewers: csv(env.BOT_REVIEWERS || DEFAULT_BOT_REVIEWERS),
    resolveOutdated: (env.RESOLVE_OUTDATED || 'true') === 'true',
    resolveBotFailures: (env.RESOLVE_BOT_FAILURES || 'true') === 'true',
    failureRegex: new RegExp(env.FAILURE_PATTERNS || DEFAULT_FAILURE_PATTERNS, 'i'),
    prNumber: env.PR_NUMBER ? Number(env.PR_NUMBER) : null,
    sweepRepos: csv(env.SWEEP_REPOS),
  };
}

// Returns a resolution reason ('outdated' | 'bot-failure') or null.
function decideThread(thread, config) {
  const comments = (thread.comments && thread.comments.nodes) || [];
  if (comments.length === 0) return null;
  // A truncated comment list could hide a human reply — leave the thread alone.
  if (thread.comments.pageInfo && thread.comments.pageInfo.hasNextPage) return null;
  const fromAllowedBot = (comment) =>
    comment.author &&
    comment.author.__typename === 'Bot' &&
    config.botReviewers.includes(comment.author.login.replace(/\[bot\]$/, ''));
  if (!comments.every(fromAllowedBot)) return null;
  if (config.resolveBotFailures && comments.some((c) => config.failureRegex.test(c.body || ''))) {
    return 'bot-failure';
  }
  if (config.resolveOutdated && thread.isOutdated) return 'outdated';
  return null;
}

async function fetchThreads(github, owner, repo, number) {
  const threads = [];
  let cursor = null;
  do {
    const result = await github.graphql(THREAD_QUERY, { owner, repo, number, cursor });
    const connection = result.repository.pullRequest.reviewThreads;
    threads.push(...connection.nodes);
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);
  return threads;
}

module.exports = async ({ github, context, core }) => {
  const config = parseConfig(process.env);
  const owner = context.repo.owner;

  const targets = [];
  if (config.sweepRepos.length > 0) {
    for (const repo of config.sweepRepos) {
      try {
        const prs = await github.paginate(github.rest.pulls.list, {
          owner,
          repo,
          state: 'open',
          per_page: 100,
        });
        for (const pr of prs) targets.push({ repo, number: pr.number });
      } catch (error) {
        core.warning(`Could not list open PRs for ${owner}/${repo}: ${error.message}`);
      }
    }
  } else {
    const number =
      config.prNumber || (context.payload.pull_request && context.payload.pull_request.number);
    if (!number) {
      core.info('No PR number and no sweep_repos — nothing to do');
      core.setOutput('resolved_count', '0');
      return;
    }
    targets.push({ repo: context.repo.repo, number });
  }

  let resolved = 0;
  for (const target of targets) {
    let threads;
    try {
      threads = await fetchThreads(github, owner, target.repo, target.number);
    } catch (error) {
      core.warning(
        `Could not fetch review threads for ${owner}/${target.repo}#${target.number}: ${error.message}`
      );
      continue;
    }
    for (const thread of threads) {
      if (thread.isResolved) continue;
      const reason = decideThread(thread, config);
      if (!reason) continue;
      try {
        await github.graphql(RESOLVE_MUTATION, { threadId: thread.id });
        resolved += 1;
        core.info(`Resolved ${reason} thread on ${owner}/${target.repo}#${target.number} (${thread.path})`);
      } catch (error) {
        core.warning(
          `Could not resolve thread on ${owner}/${target.repo}#${target.number} (${thread.path}): ` +
            `${error.message} — resolveReviewThread needs contents read-write; ` +
            'configure GH_APP_CLAUDE_BOT_ID / GH_APP_CLAUDE_BOT_PRIVATE_KEY'
        );
      }
    }
  }
  core.setOutput('resolved_count', String(resolved));
  core.info(`Resolved ${resolved} thread(s) across ${targets.length} PR(s)`);
};

module.exports.parseConfig = parseConfig;
module.exports.decideThread = decideThread;
