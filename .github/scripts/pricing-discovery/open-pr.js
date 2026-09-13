// Opens the pricing PR via the shared Verified Commit & PR helper, using the
// ansible-proxmox-ai-scoped token the workflow minted (passed as this step's
// own github-token, not the caller's ambient one). No pr-body.md means run.js
// found nothing to change — a no-op, not a failure.
const fs = require('fs');
const { openPr } = require('../shared/verified-commit.js');

module.exports = async ({ github, context, core }) => {
  if (!fs.existsSync('pr-body.md')) {
    core.info('No pr-body.md — nothing to open.');
    return;
  }
  await openPr({
    github,
    context,
    core,
    repoWithOwner: 'dryvist/ansible-proxmox-ai',
    baseBranch: process.env.REGISTRY_REF || 'develop',
    branch: `pricing-discovery/${new Date().toISOString().slice(0, 10)}`,
    title: 'chore(llm-models): weekly OpenRouter pricing/context sync',
    body: fs.readFileSync('pr-body.md', 'utf8'),
    extraExcludes: ['pr-body.md', 'vikunja-body.md'],
  });
};
