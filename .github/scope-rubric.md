# CI scope rubric

Read by `scripts/scope_classify.py` (`read_rubric()`) and rendered into
the prompt sent to typesafe.ai's `choice` primitive ("Jev"). Versioned
here so the rubric a caller is gated on is reviewable and diffable like
any other CI config, not embedded in the script or the workflow.

Editing this file to add a new answer option? Also update
`VALID_CHOICES` in `scripts/scope_classify.py` - an answer the rubric
describes but the script doesn't recognize is rejected as out-of-enum
and falls back to `full`/`yes`, `source: fallback`.

## Job classes and measured cost

Costs are p50 / p95 execution minutes from the 7-day org CI duration audit
(`ci-duration-audit`, dryvist org, all repos):

| job class | p50 | p95 | notes |
| --- | --- | --- | --- |
| lint / markdown / format checks | < 1 | < 2 | fast, deterministic, cheap to always run |
| Molecule (per scenario) | 8.8 | 20.7 | self-hosted; up to 13.9/17.6 on larger scenario sets |
| AI review (`pr-agent`) | 1.6–2.0 | 18.6–27.2 | hosted, LLM-latency-bound |
| release notes | 0.0 | 20.0 | hosted, LLM-latency-bound |
| e2e / data-contract | not in the 7-day top offenders | — | self-hosted, gated on `E2E_RUNNERS_ENABLED`; treat as full-cost when it runs |

## When each output is required

- **`ci: full`** — the change touches application/infra behavior: source
  code, roles, playbooks, workflow logic, or anything the deterministic
  overrides below already force to full.
- **`ci: lint-only`** — the change is docs-only or a dependency/lockfile
  bump with no source/role/workflow changes.
- **`ci: none`** — the change touches nothing that any check depends on
  (e.g. a comment-only README typo across files no other filter watches).

- **`molecule: full`** — any role, playbook, shared inventory/variable
  file, or Molecule-executed test fixture changed. A test whose job is to
  render or exercise a role/playbook through Molecule (for example
  `tests/template_render/**`, `tests/molecule/**`, or any other test
  directory a repo's own Molecule workflow renders from or runs) is part
  of the surface Molecule verifies — a change there is exactly the case
  Molecule exists to catch, never a reason to skip it. This applies even
  when the PR title or body frames the change as "just a test fix."
- **`molecule: changed-roles`** — only specific role directories changed
  and nothing shared, and no Molecule-executed test fixture changed either.
- **`molecule: none`** — no `roles/**`, `playbooks/**`, `molecule/**`, or
  Molecule-executed test path touched.

- **`ai_review: yes`** — any non-trivial source, workflow, or role change.
- **`ai_review: no`** — docs-only or lockfile/renovate-only changes.

- **`release_notes: yes`** — any user-visible behavior change or
  dependency bump worth surfacing in a changelog.
- **`release_notes: no`** — docs-only, internal-only comment changes.

- **`e2e: yes`** — the change affects a deployed service's external
  contract (API shape, ingress, auth).
- **`e2e: no`** — everything else.

## Changes that are always full (judged from the rubric, not a script)

Answer `full`/`yes` on every output for any of these, whatever the diff
otherwise looks like:

- A change to a workflow that still exists after the pull request: any
  added or modified file under `.github/workflows/**`. A workflow the
  pull request **deletes** cannot run again, so its removal alone widens
  nothing — classify the rest of the change on its own merits.
- Any added or modified `_molecule.yml`, or any file under a
  `molecule/resources/**` directory: this sets `molecule: full`
  specifically (not just `ci: full`) — the job under test is the change.
- Any file under `roles/openbao/**`.
- Any changed path (including a rename's previous path) whose name
  contains `secret`, `auth`, `ssh`, `firewall`, `sudo` or `policy`,
  case-insensitively.
- The pull request promotes `develop` into the repository's default
  branch (`head_ref` is `develop` and `base_ref` equals
  `default_branch`) — git-flow's release promotion. A feature PR that
  merely *targets* the default branch, which on a trunk repo is every
  PR, is not a promotion.

`scripts/scope_classify.py` keeps exactly one rule of its own: with no
pull request to classify (any event but `pull_request`), every output is
`full`/`yes` with `source: fallback`. A request failure, timeout, or
unparsable answer produces the same result; `source: jev` means the
classifier itself answered.

## When in doubt

Choose `full`/`yes`. A wrongly-full decision costs CI minutes; a
wrongly-narrow one costs a real check silently skipping. An ambiguous
change, a diff that doesn't clearly match one category, or genuine
uncertainty about which rule applies is not a reason to guess narrow.
