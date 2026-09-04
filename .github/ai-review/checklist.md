# Review checklist — ai-workflows

- id: pinned-actions
  Is every `uses:` third-party action pinned to a full commit SHA with a version comment?
- id: checkout-credentials
  Does every `actions/checkout` set `persist-credentials: false`?
- id: fork-guard
  Do workflows that read secrets run only for same-repo PR heads, and avoid `pull_request_target`?
- id: permissions
  Are job `permissions:` the minimum the job needs, and set explicitly?
- id: secrets
  Does the diff add a credential, token, private hostname, or address literal?
- id: reuse
  Does new logic duplicate an existing helper under `.github/scripts/shared/`?
- id: docs
  Does changed behaviour update `README.md` and the workflow's own doc page?
