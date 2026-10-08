const { get24hWindowStart } = require('./utils');

module.exports = async ({ github, context, core }) => {
  const rawLimit = process.env.DAILY_RUN_LIMIT || '5';
  const dailyRunLimit = Number(rawLimit);
  if (!Number.isSafeInteger(dailyRunLimit) || dailyRunLimit < 1) {
    core.setFailed(`Invalid DAILY_RUN_LIMIT: "${rawLimit}" — must be a positive integer`);
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

  // Paginate all statuses to count queued and in-progress runs as well as
  // completed ones. Runs are returned newest-first, so stop at the cutoff.
  const perPage = 100;
  let page = 1;
  let count = 0;
  let hasMore = true;

  try {
    while (hasMore && count < dailyRunLimit) {
      const { data } = await github.rest.actions.listWorkflowRuns({
        owner: context.repo.owner,
        repo: context.repo.repo,
        workflow_id: workflowId,
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
  } catch (err) {
    // Listing runs needs `actions: read`. If the API cannot prove the run is
    // under budget, stop instead of silently bypassing the cap.
    core.setFailed(`Could not read workflow runs; refusing to bypass the daily limit (${err.message}).`);
    return;
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
