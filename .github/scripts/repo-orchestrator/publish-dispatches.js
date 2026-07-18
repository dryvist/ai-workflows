const fs = require('fs');

function exactKeys(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) throw new Error(`${name} must contain exactly: ${expected.join(', ')}`);
}

module.exports = async ({ github, context, core }) => {
  const file = process.env.RESULT_FILE || '.ai-output/repo-orchestrator.json';
  try {
    const result = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (result?.action === 'none') {
      exactKeys(result, ['action'], 'result');
      core.info('No repository dispatch requested.');
      core.setOutput('dispatched_count', '0');
      return;
    }
    exactKeys(result, ['action', 'repositories'], 'result');
    if (result.action !== 'dispatch') throw new Error('action must be none or dispatch');
    if (!Array.isArray(result.repositories) || result.repositories.length < 1 || result.repositories.length > 25) throw new Error('repositories must contain 1-25 names');
    const repositories = [...new Set(result.repositories)];
    if (repositories.length !== result.repositories.length || repositories.some(repo => typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(repo))) {
      throw new Error('repositories must be unique repository names');
    }
    const requested = process.env.TARGET_REPOS || '';
    if (requested !== 'all') {
      const allowed = new Set(requested.split(',').map(value => value.trim()).filter(Boolean));
      if (allowed.size === 0 || repositories.some(repo => !allowed.has(repo))) throw new Error('result contains a repository outside target_repos');
    }
    const workflow = process.env.WORKFLOW_FILE;
    const ref = process.env.TARGET_REF || 'main';
    if (!/^[A-Za-z0-9_.\/-]+\.(?:yml|yaml)$/.test(workflow || '')) throw new Error('workflow_file is invalid');
    if (!/^[A-Za-z0-9_./-]+$/.test(ref)) throw new Error('ref is invalid');
    const owner = context.repo.owner;
    const correlationId = `orchestrator-${context.runId || process.env.GITHUB_RUN_ID}`;
    let count = 0;
    for (const repo of repositories) {
      try {
        const { data: metadata } = await github.rest.repos.get({ owner, repo });
        if (metadata.archived) {
          core.warning(`Skipped archived repository ${owner}/${repo}.`);
          continue;
        }
        await github.rest.actions.getWorkflow({ owner, repo, workflow_id: workflow });
        await github.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id: workflow, ref, inputs: { correlation_id: correlationId } });
        count += 1;
        core.info(`Dispatched ${workflow} to ${owner}/${repo}@${ref} (${correlationId}).`);
      } catch (error) {
        core.warning(`Failed to dispatch ${owner}/${repo}: ${error.message}`);
      }
    }
    core.setOutput('dispatched_count', String(count));
    core.setOutput('correlation_id', correlationId);
  } catch (error) {
    core.setFailed(`Invalid repository-orchestrator result: ${error.message}`);
  }
};
