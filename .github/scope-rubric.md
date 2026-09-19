# CI scope rubric

Read by `scripts/scope_classify.py` (`read_rubric()`) and rendered into
the prompt sent to typesafe.ai's `choice` primitive ("Jev"). Versioned
here so the rubric a caller is gated on is reviewable and diffable like
any other CI config, not embedded in the script or the workflow.

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

- **`molecule: full`** — any role, playbook, or shared inventory/variable
  file changed.
- **`molecule: changed-roles`** — only specific role directories changed
  and nothing shared.
- **`molecule: none`** — no `roles/**`, `playbooks/**`, or `molecule/**`
  path touched.

- **`ai_review: yes`** — any non-trivial source, workflow, or role change.
- **`ai_review: no`** — docs-only or lockfile/renovate-only changes.

- **`release_notes: yes`** — any user-visible behavior change or
  dependency bump worth surfacing in a changelog.
- **`release_notes: no`** — docs-only, internal-only comment changes.

- **`e2e: yes`** — the change affects a deployed service's external
  contract (API shape, ingress, auth).
- **`e2e: no`** — everything else.

## Deterministic ALWAYS-FULL overrides (not left to the model)

Applied in `scripts/scope_classify.py`'s `check_overrides()`, before the
API call — matching any of these skips the call entirely and sets every
output to `full`/`yes` with `source: fallback` and a reason naming the
matched condition. A request failure, timeout, or unparsable answer
produces the same `full`/`yes`/`source: fallback` result; `source: jev`
means the classifier itself answered:

- Any file under `.github/workflows/**`.
- Any file under `roles/openbao/**`.
- Any changed file path matching
  `*secret*|*auth*|*ssh*|*firewall*|*sudo*|*policy*` (case-insensitive).
- The pull request's base branch is `main`.
- The triggering event is `push`.

These conditions are the one guaranteed full sweep this rubric cannot
narrow — the same "narrow at the consumer, force full at the promotion
boundary" policy the org's existing `dorny/paths-filter` gates already
follow.
