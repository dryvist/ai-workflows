# Release Notes

Write human-readable release highlights for release-please PR #${PR_NUMBER}
in this repository.

Steps:

1. Read the pending changelog: `gh pr view ${PR_NUMBER} --json title,body` and
   `gh pr diff ${PR_NUMBER}` (the CHANGELOG.md delta lists every change).
2. For anything unclear from the changelog entry alone, inspect the underlying
   changes: `git log <last-tag>..HEAD --oneline` and `git diff <last-tag>..HEAD
   -- <path>` (find the last tag with `git tag --sort=-creatordate`).
3. Write the highlights to a file named `.claude-release-notes.md` (Write
   tool) with exactly this structure:

   ```markdown
   ## Release Highlights (AI)

   - 3-6 bullets, each describing USER-VISIBLE impact (what someone consuming
     this repo gains, loses, or must do), not a restated commit list
   - Lead with the most impactful change; call out anything breaking or
     requiring migration with **Breaking:** or **Action needed:**
   ```

Rules:

- Do NOT edit CHANGELOG.md, the PR body, or any repository file other than
  `.claude-release-notes.md`. Do NOT post comments yourself — a workflow step
  posts the file for you.
- Skip pure-noise entries (version bumps of internal dev deps, CI plumbing)
  unless they change consumer behavior.
- If the release is trivial (e.g. one dependency bump), one or two honest
  bullets beat six padded ones.
