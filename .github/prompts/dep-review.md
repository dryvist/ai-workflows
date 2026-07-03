Review dependency update PR #${PR_NUMBER} in this repository. Renovate opened
it; the highest version-bump type is: ${UPDATE_TYPE}.

Steps:

1. Read the PR: `gh pr view ${PR_NUMBER} --json title,body` (the body embeds
   Renovate's release notes and compare links) and `gh pr diff ${PR_NUMBER}`.
2. For each updated dependency, identify breaking changes and required
   migrations. Use the release notes in the body first; if they are truncated
   or missing, fetch the changelog/compare links with WebFetch or
   `gh api repos/...` (releases, compare).
3. Check how this repository actually uses each dependency (Grep/Read) so the
   assessment reflects real impact, not a generic changelog summary.
4. Write your assessment to a file named `.claude-dep-review.md` (Write tool)
   with exactly this structure:

   ```markdown
   ## Dependency Review (AI)

   **Verdict:** Merge | Merge with care | Hold — one-line reason

   ### Breaking changes
   - ... (or "None found")

   ### Required migrations in this repo
   - concrete file/config changes needed here, or "None"

   ### Repo impact
   - where/how this dependency is used in this repo

   **Confidence:** high | medium | low — one-line reason
   ```

Rules:

- Do NOT post any comment yourself and do NOT run any write commands — a
  workflow step posts `.claude-dep-review.md` for you.
- Keep it concise: this is a risk assessment, not a changelog reprint. Skip
  changes that cannot affect this repository.
- For grouped PRs (multiple dependencies), cover each dependency under the
  same headings.
- If you cannot determine impact (e.g. changelog unavailable), say so and set
  confidence low rather than guessing.
