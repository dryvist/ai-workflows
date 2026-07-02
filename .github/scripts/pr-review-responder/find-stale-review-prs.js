// Enumerate OPEN PRs whose review feedback has gone UNHANDLED for ~N minutes, so
// the responder can address them. This is the gate job: it emits a bounded JSON
// array of PR numbers (`pr_numbers`) + `has_prs` for a downstream matrix.
//
// A PR is eligible when it has at least one unresolved review thread that is
// "stale": the newest comment on the thread is (a) older than STALE_MINUTES,
// (b) NOT authored by the PR author, and (c) NOT authored by one of our own bots.
// That precisely captures "a reviewer left the last word and nobody has responded
// in N minutes". Fork PRs are skipped (fork guard). PRs already at the per-PR
// attempt cap are skipped so the responder can't loop.
//
// workflow_dispatch single-PR mode: if PR_NUMBER is set, skip the scan and emit
// just that PR (still honoring the attempt cap).
const { scanOpenPRThreads, ATTEMPT_MARKER, OUR_BOT_LOGINS } = require('./threads');

const num = (v, dflt) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : dflt; };

// Count prior responder attempts on a PR via the hidden marker comment.
async function attemptCount({ github, owner, repo, number }) {
  const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: number, per_page: 100 });
  return comments.filter((c) => c.body && c.body.includes(ATTEMPT_MARKER)).length;
}

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const staleMinutes = num(process.env.STALE_MINUTES, 10);
  const maxPRs = num(process.env.MAX_PRS, 5);
  const attemptCap = num(process.env.ATTEMPT_CAP, 2);
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);

  const emit = (numbers) => {
    core.setOutput('pr_numbers', JSON.stringify(numbers));
    core.setOutput('has_prs', numbers.length > 0 ? 'true' : 'false');
  };

  // Single-PR dispatch mode.
  const dispatchNum = parseInt(process.env.PR_NUMBER, 10);
  if (Number.isFinite(dispatchNum) && dispatchNum > 0) {
    const attempts = await attemptCount({ github, owner, repo, number: dispatchNum }).catch(() => 0);
    if (attempts >= attemptCap) { core.info(`PR #${dispatchNum} at attempt cap (${attempts}/${attemptCap}) — skipping.`); return emit([]); }
    return emit([dispatchNum]);
  }

  let prs;
  try {
    prs = await scanOpenPRThreads({ github, owner, repo });
  } catch (e) {
    // Fail closed: on a scan error do nothing rather than act on partial data.
    core.info(`Thread scan failed (${e.message}) — emitting no PRs.`);
    return emit([]);
  }

  const isStale = (t, author) =>
    !t.isResolved &&
    t.lastCommentAt && new Date(t.lastCommentAt) < cutoff &&
    t.lastCommentLogin && t.lastCommentLogin !== author &&
    !OUR_BOT_LOGINS.includes(t.lastCommentLogin);

  const candidates = prs.filter((pr) => !pr.isCrossRepository && pr.threads.some((t) => isStale(t, pr.author)));

  const eligible = [];
  for (const pr of candidates) {
    if (eligible.length >= maxPRs) break;
    const attempts = await attemptCount({ github, owner, repo, number: pr.number }).catch(() => 0);
    if (attempts >= attemptCap) { core.info(`PR #${pr.number} at attempt cap (${attempts}/${attemptCap}) — skipping.`); continue; }
    eligible.push(pr.number);
  }

  core.info(`Stale-review candidates: ${candidates.map((p) => p.number).join(', ') || 'none'}; eligible: ${eligible.join(', ') || 'none'}`);
  emit(eligible);
};
