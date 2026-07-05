const { get24hWindowStart } = require('./utils');

module.exports = async ({ github, context, core }) => {
  const rawLimit = process.env.DAILY_RUN_LIMIT || '5';
  const dailyRunLimit = parseInt(rawLimit, 10);
  if (!Number.isFinite(dailyRunLimit) || dailyRunLimit < 0) {
    core.setFailed(`Invalid DAILY_RUN_LIMIT: "${rawLimit}" — must be a non-negative integer`);
    return;
  }

  if (dailyRunLimit === 0) {
    core.setOutput('should_run', 'true');
    core.info('Daily run limit disabled');
    return;
  }

  const workflowFile = process.env.WORKFLOW_FILE;
  if (!workflowFile) {
    core.setFailed('WORKFLOW_FILE environment variable is required');
    return;
  }

  // Extract workflow file name from workflow_ref
  // Format: "owner/repo/.github/workflows/name.yml@refs/heads/main"
  const match = workflowFile.match(/\/([^/]+\.yml)@/);
  const workflowId = match ? match[1] : workflowFile;

  if (!workflowId) {
    core.setFailed(`Could not extract workflow ID from WORKFLOW_FILE: "${workflowFile}"`);
    return;
  }

  const since = get24hWindowStart();

  // Paginate to count all runs within the 24h window.
  // Runs are returned newest-first, so we stop once we hit one older than the cutoff.
  const perPage = 100;
  let page = 1;
  let count = 0;
  let hasMore = true;

  while (hasMore && count < dailyRunLimit) {
    const { data } = await github.rest.actions.listWorkflowRuns({
      owner: context.repo.owner,
      repo: context.repo.repo,
      workflow_id: workflowId,
      status: 'completed',
      per_page: perPage,
      page,
    });

    const runs = data.workflow_runs || [];

    if (runs.length === 0) {
      break;
    }

    for (const run of runs) {
      if (new Date(run.created_at) <= since) {
        hasMore = false;
        break;
      }
      count += 1;
      if (count >= dailyRunLimit) {
        break;
      }
    }

    if (runs.length < perPage) {
      hasMore = false;
    } else if (hasMore && count < dailyRunLimit) {
      page += 1;
    }
  }

  if (count >= dailyRunLimit) {
    // Cap reached: skip the run cleanly via the should_run output the downstream
    // jobs gate on. Do NOT setFailed — the daily cap is by-design cost control,
    // not an error, and a red run would be false-alarm noise.
    core.setOutput('should_run', 'false');
    core.info(`Daily limit reached (${count}/${dailyRunLimit} runs in last 24h) — skipping`);
    return;
  }

  core.setOutput('should_run', 'true');
  core.info(`Daily run count: ${count}/${dailyRunLimit}`);
};
