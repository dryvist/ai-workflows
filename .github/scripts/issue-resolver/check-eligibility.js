const { PR_DAILY_CEILING } = require('../shared/constants');
const { get24hWindowStart } = require('../shared/utils');

module.exports = async ({ github, context, core }) => {
  // Gate 1: Issue number — from event payload or ISSUE_NUMBER env var (manual dispatch)
  const issueNumber = context.payload.issue?.number
    || (parseInt(process.env.ISSUE_NUMBER || '0', 10) || null);
  if (!issueNumber) {
    core.setOutput('should_run', 'false');
    core.info('No issue in event payload and no ISSUE_NUMBER provided');
    return;
  }

  const isManualTrigger = !context.payload.issue?.number;
  if (isManualTrigger) {
    core.info(`Manual trigger: resolving issue #${issueNumber}`);
  }

  // Gate 1b: Unified daily PR ceiling — prevent automation loops
  const prCeilingSince = get24hWindowStart();
  const botLogins = ['claude[bot]', 'github-actions[bot]'];
  let recentBotPRs = 0;
  for (const bot of botLogins) {
    try {
      const prs = await github.rest.pulls.list({
        owner: context.repo.owner,
        repo: context.repo.repo,
        state: 'all',
        per_page: 100,
      });
      recentBotPRs += prs.data.filter(
        pr => pr.user?.login === bot && new Date(pr.created_at) > prCeilingSince
      ).length;
    } catch (e) { /* ignore */ }
  }
  if (recentBotPRs >= PR_DAILY_CEILING) {
    core.setOutput('should_run', 'false');
    core.info(`Daily bot PR ceiling reached (${recentBotPRs}/${PR_DAILY_CEILING}). Skipping.`);
    return;
  }
  core.info(`Daily bot PR count: ${recentBotPRs}/${PR_DAILY_CEILING}`);

  // Fetch fresh issue data — labels may have been updated by triage after event fired
  const { data: issue } = await github.rest.issues.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issueNumber,
  });

  const labels = issue.labels.map(l => l.name.toLowerCase());

  // Gate 2: Author association — skip for manual triggers (human explicitly chose this issue)
  if (!isManualTrigger) {
    const allowedAuthors = (process.env.ALLOWED_AUTHORS || 'OWNER,MEMBER,COLLABORATOR,CONTRIBUTOR')
      .split(',').map(a => a.trim().toUpperCase()).filter(Boolean);
    if (!allowedAuthors.includes(issue.author_association)) {
      core.setOutput('should_run', 'false');
      core.info(`Issue #${issueNumber} author_association "${issue.author_association}" not in allowed list`);
      return;
    }
  }

  // Gates 3-6: Label checks — skip for manual triggers (human judged the issue appropriate)
  if (!isManualTrigger) {
    // Gate 3: Required labels present — triage must have run
    const hasTypeLabel = labels.some(l => l.startsWith('type:'));
    const hasSizeLabel = labels.some(l => l.startsWith('size:'));
    if (!hasTypeLabel || !hasSizeLabel) {
      core.setOutput('should_run', 'false');
      core.info(`Issue #${issueNumber} missing type: or size: labels — triage may not have run`);
      return;
    }

    // Gate 3b: ai:ready present — the explicit trigger for autonomous resolution.
    // Triage applies it to auto-resolvable issues; a human may apply it manually.
    // No size cap: ai:ready resolves issues of any size.
    if (!labels.includes('ai:ready')) {
      core.setOutput('should_run', 'false');
      core.info(`Issue #${issueNumber} not labeled ai:ready — skipping autonomous resolution`);
      return;
    }

    // Gate 4: Exclusion labels — block list from input
    const excludedLabels = (process.env.EXCLUDED_LABELS || '')
      .split(',')
      .map(l => l.trim().toLowerCase())
      .filter(Boolean);
    const blockedLabel = labels.find(l => excludedLabels.includes(l));
    if (blockedLabel) {
      core.setOutput('should_run', 'false');
      core.info(`Issue #${issueNumber} has excluded label: ${blockedLabel}`);
      return;
    }

    // Gate 5: Triage skip labels
    const skipLabels = ['duplicate', 'invalid', 'wontfix', 'question'];
    const skipLabel = labels.find(l => skipLabels.includes(l));
    if (skipLabel) {
      core.setOutput('should_run', 'false');
      core.info(`Issue #${issueNumber} has triage skip label: ${skipLabel}`);
      return;
    }

    // Gate 6: Allowed issue types
    const allowedTypes = [
      'type:bug', 'type:chore', 'type:docs', 'type:ci',
      'type:test', 'type:refactor', 'type:perf',
    ];
    const issueType = labels.find(l => l.startsWith('type:'));
    if (!allowedTypes.includes(issueType)) {
      core.setOutput('should_run', 'false');
      core.info(`Issue #${issueNumber} type "${issueType}" not in allowed types`);
      return;
    }
    // No size gate: ai:ready (Gate 3b) authorizes resolution regardless of size:* label.
  }

  // Gate 8: No existing open PR already referencing this issue (always runs)
  const openPRs = await github.paginate(github.rest.pulls.list, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: 'open',
    per_page: 100,
  });
  const closePattern = new RegExp(
    `\\b(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\\s+#${issueNumber}\\b`,
    'i'
  );
  const existingPR = openPRs.find(pr => closePattern.test(pr.body || ''));
  if (existingPR) {
    core.setOutput('should_run', 'false');
    core.info(`PR #${existingPR.number} already references issue #${issueNumber}`);
    return;
  }

  // Marker used by Gates 9 and 10 — only count bot-authored comments to prevent spoofing
  const marker = '<!-- claude-issue-resolver-attempt -->';
  const isBotMarker = c => c.user?.type === 'Bot' && c.body && c.body.includes(marker);

  // Gate 9: Attempt limiting via comment markers (always runs)
  const maxAttempts = parseInt(process.env.MAX_ATTEMPTS || '1', 10);
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const attemptCount = comments.filter(isBotMarker).length;
  if (attemptCount >= maxAttempts) {
    core.setOutput('should_run', 'false');
    core.info(`Issue #${issueNumber} has reached max attempts (${maxAttempts})`);
    return;
  }

  // Gate 10: Daily resolve limit (applies to all triggers; set daily_limit=0 to disable)
  const dailyLimit = parseInt(process.env.DAILY_LIMIT || '5', 10);
  if (dailyLimit > 0) {
    const since = get24hWindowStart().toISOString();
    const recentComments = await github.paginate(github.rest.issues.listCommentsForRepo, {
      owner: context.repo.owner,
      repo: context.repo.repo,
      since: since,
      per_page: 100,
    });
    const todayAttempts = recentComments.filter(isBotMarker).length;
    if (todayAttempts >= dailyLimit) {
      core.setOutput('should_run', 'false');
      core.info(`Daily limit reached: ${todayAttempts}/${dailyLimit} resolver attempts in last 24h`);
      return;
    }
    core.info(`Daily resolve count: ${todayAttempts}/${dailyLimit}`);
  }

  // Content sanitization: truncate and scan for injection patterns
  let issueBody = issue.body || '';
  if (issueBody.length > 4000) {
    issueBody = issueBody.substring(0, 4000) + '\n[... truncated ...]';
  }
  const injectionPatterns = [
    /ignore\s+previous\s+instructions/i,
    /disregard\s+all\s+(previous\s+)?instructions/i,
    /you\s+are\s+now\s+a/i,
    /forget\s+everything\s+above/i,
    /system\s+prompt\s*:/i,
  ];
  if (injectionPatterns.some(p => p.test(issueBody))) {
    core.info('Potential prompt injection pattern detected in issue body — content will be sandboxed in code fences');
  }

  // All gates passed
  core.setOutput('should_run', 'true');
  core.setOutput('issue_number', String(issueNumber));
  core.setOutput('issue_title', issue.title);
  core.setOutput('issue_body', issueBody);
  core.setOutput('issue_labels', labels.join(', '));
  core.setOutput('attempt', String(attemptCount + 1));
  core.info(`Issue #${issueNumber} passed all gates — attempt ${attemptCount + 1}/${maxAttempts}`);
};
