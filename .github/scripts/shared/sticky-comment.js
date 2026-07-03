// Upsert a single marker-keyed comment on a PR/issue from a file Claude wrote.
//
// MARKER_MATCH identifies an existing comment (a stable prefix like
// "<!-- cc-dep-review"); MARKER_WRITE (default: MARKER_MATCH) is what gets
// embedded in the new body, letting callers carry state in the marker (e.g. a
// head SHA) while still matching on the stable prefix. No body file → Claude
// declined → clean no-op, mirroring pr-from-file.js semantics.
const fs = require('fs');

module.exports = async ({ github, context, core }) => {
  const bodyFile = process.env.BODY_FILE;
  const markerMatch = process.env.MARKER_MATCH;
  const markerWrite = process.env.MARKER_WRITE || markerMatch;
  if (!bodyFile || !markerMatch) {
    core.setFailed('BODY_FILE and MARKER_MATCH env vars are required');
    return;
  }
  const issueNumber = Number(
    process.env.PR_NUMBER || (context.payload.pull_request && context.payload.pull_request.number)
  );
  if (!issueNumber) {
    core.setFailed('PR_NUMBER env var or pull_request payload is required');
    return;
  }
  if (!fs.existsSync(bodyFile)) {
    core.info(`Claude wrote no ${bodyFile} — nothing to post.`);
    core.setOutput('posted', 'false');
    return;
  }
  const content = fs.readFileSync(bodyFile, 'utf8').trim();
  if (!content) {
    core.info(`${bodyFile} is empty — nothing to post.`);
    core.setOutput('posted', 'false');
    return;
  }

  const provenance = process.env.RUN_URL
    ? `\n\n> **AI Provenance** | Workflow: \`${process.env.WORKFLOW_NAME || ''}\` | ` +
      `[Run](${process.env.RUN_URL}) | Event: \`${process.env.EVENT_NAME || ''}\` | ` +
      `Actor: \`${process.env.TRIGGER_ACTOR || ''}\``
    : '';
  const body = `${markerWrite}\n${content}${provenance}`;

  const { owner, repo } = context.repo;
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const existing = comments.find((c) => c.body && c.body.includes(markerMatch));
  if (existing) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    core.info(`Updated existing comment ${existing.id} on #${issueNumber}`);
  } else {
    await github.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
    core.info(`Created comment on #${issueNumber}`);
  }
  core.setOutput('posted', 'true');
};
