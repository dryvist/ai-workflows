// Post the hidden attempt marker (+ a short human-visible note) on the PR. The
// marker is what find-stale-review-prs.js counts to cap responder attempts per PR.
const { ATTEMPT_MARKER } = require('./threads');

module.exports = async ({ github, context, core }) => {
  const number = parseInt(process.env.PR_NUMBER, 10);
  if (!Number.isFinite(number) || number <= 0) { core.setFailed('PR_NUMBER is not a valid number'); return; }
  const cap = process.env.ATTEMPT_CAP || '2';
  await github.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: number,
    body: [ATTEMPT_MARKER, `### AI Review Responder (cap ${cap}/PR)`, '', 'Reviewing unresolved review threads and responding…'].join('\n'),
  });
};
