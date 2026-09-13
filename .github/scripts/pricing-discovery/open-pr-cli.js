// Plain-bun entry point for open-pr.js — NOT run via actions/github-script.
// The workflow mints an ansible-proxmox-ai-scoped App token with
// `eval "$(openbao-github-creds claim ...)"` in the same shell that invokes
// this file, so GITHUB_TOKEN lives only in that one step's process: never
// written to $GITHUB_ENV, never a step output. This module builds the same
// {github, context, core} shape actions/github-script would have injected,
// using bun's native fetch instead of an Octokit dependency.
const fs = require('fs');
const run = require('./open-pr.js');

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('open-pr-cli: GITHUB_TOKEN not set — run after `eval "$(openbao-github-creds claim <owner>/<repo>)"`.');
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`GitHub API ${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const github = {
  async graphql(query, variables) {
    const { data, errors } = await api('POST', '/graphql', { query, variables });
    if (errors?.length) throw new Error(`GraphQL error: ${JSON.stringify(errors)}`);
    return data;
  },
  rest: {
    git: {
      createRef: ({ owner, repo, ref, sha }) => api('POST', `/repos/${owner}/${repo}/git/refs`, { ref, sha }),
    },
    pulls: {
      create: async ({ owner, repo, head, base, title, body, draft }) => ({
        data: await api('POST', `/repos/${owner}/${repo}/pulls`, { head, base, title, body, draft: !!draft }),
      }),
    },
  },
};

const core = {
  info: (msg) => console.log(msg),
  setFailed: (msg) => {
    console.error(msg);
    process.exitCode = 1;
  },
  setOutput: (name, value) => {
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  },
};

run({ github, context: { repo: {}, payload: {} }, core }).catch((e) => {
  console.error(e);
  process.exit(1);
});
