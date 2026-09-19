#!/usr/bin/env python3
"""Scope Classify: gates a pull request's CI scope via typesafe.ai's Jev
`choice` primitive, with deterministic ALWAYS-FULL overrides that never
depend on the model.

Invoked as a single step from scope-classify.yml with the PR/event
context passed in as environment variables. Writes its decision to
$GITHUB_OUTPUT and $GITHUB_STEP_SUMMARY. main() never lets an exception
skip writing the audit trail: any failure anywhere resolves to the same
full/yes fallback an ALWAYS-FULL override produces.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

try:
    from typesafe_sdk import Choice, TypeSafeClient
except ImportError:  # pragma: no cover - exercised via mocking in tests
    Choice = None
    TypeSafeClient = None

FULL_DECISION = {
    "ci": "full",
    "molecule": "full",
    "ai_review": "yes",
    "release_notes": "yes",
    "e2e": "yes",
}

# The only values each question may answer. Validated after the SDK
# response comes back (post underscore-to-hyphen translation) - an
# out-of-enum answer, however it got there, is treated the same as a
# request failure: full/yes, source=fallback. Never trust model output
# to already be one of these.
VALID_CHOICES = {
    "ci": {"full", "lint-only", "none"},
    "molecule": {"full", "changed-roles", "none"},
    "ai_review": {"yes", "no"},
    "release_notes": {"yes", "no"},
    "e2e": {"yes", "no"},
}

# Paths that always force a full run, regardless of what the classifier
# would say. Evaluated here, in the script, never left to the model.
# Case-insensitive, same as the keyword match below - a path's casing is
# not something a change author should be able to use to dodge either.
ALWAYS_FULL_PATH_PREFIXES = (".github/workflows/", "roles/openbao/")
ALWAYS_FULL_PATH_KEYWORDS = ("secret", "auth", "ssh", "firewall", "sudo", "policy")

CLASSIFY_TIMEOUT_SECONDS = 10.0
RUBRIC_PATH = ".github/scope-rubric.md"


def check_overrides(
    event_name: str, base_ref: str, head_ref: str, default_branch: str, changed_paths: list[str]
) -> tuple[bool, str]:
    """Pure decision function -> (matched, reason). reason is "" when
    matched is False, never None, so callers never have to narrow an
    Optional they only read on the matched branch.

    The promotion override is git-flow's develop -> default-branch merge,
    not "any PR targeting the default branch" - a trunk repo (ai-workflows
    included) runs every feature PR straight into its default branch, and
    forcing those full would make the classifier a permanent no-op there.
    """
    reasons = []
    if event_name != "pull_request":
        reasons.append(f"event is {event_name}")
    elif base_ref == default_branch and head_ref == "develop":
        reasons.append(f"promotion into {default_branch} from develop")
    lowered = [p.lower() for p in changed_paths]
    for original, path in zip(changed_paths, lowered):
        if any(path.startswith(prefix) for prefix in ALWAYS_FULL_PATH_PREFIXES):
            reasons.append(f"{original} matches an always-full path")
            break
    for original, path in zip(changed_paths, lowered):
        if any(keyword in path for keyword in ALWAYS_FULL_PATH_KEYWORDS):
            reasons.append(f"{original} matches secret/auth/ssh/firewall/sudo/policy")
            break
    if reasons:
        return True, "always-full override: " + "; ".join(reasons)
    return False, ""


def _github_api(path: str, token: str, accept: str = "application/vnd.github+json") -> bytes:
    request = urllib.request.Request(
        f"https://api.github.com{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": accept},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.read()


def fetch_default_branch(repo: str, token: str) -> str:
    raw = _github_api(f"/repos/{repo}", token)
    return json.loads(raw)["default_branch"]


def fetch_changed_files(repo: str, pr_number: str, token: str) -> list[dict]:
    """Each item carries `previous_path` (the old path, for a rename) so a
    rename OUT of an always-full path/keyword can still be caught by
    check_overrides() - only reading the new filename would let a rename
    evade the override entirely."""
    files: list[dict] = []
    page = 1
    while True:
        raw = _github_api(f"/repos/{repo}/pulls/{pr_number}/files?per_page=100&page={page}", token)
        batch = json.loads(raw)
        if not batch:
            break
        files.extend(
            {
                "path": item["filename"],
                "previous_path": item.get("previous_filename"),
                "additions": item["additions"],
                "deletions": item["deletions"],
            }
            for item in batch
        )
        if len(batch) < 100:
            break
        page += 1
    return files


def fetch_diff(repo: str, pr_number: str, token: str, cap_bytes: int = 61440) -> str:
    raw = _github_api(f"/repos/{repo}/pulls/{pr_number}", token, accept="application/vnd.github.v3.diff")
    text = raw.decode("utf-8", "ignore")
    if len(raw) > cap_bytes:
        text = raw[:cap_bytes].decode("utf-8", "ignore") + "\n[... diff truncated at 60 KiB ...]"
    return text


def build_state(repo: str, title: str, body: str, labels: list[str], files: list[dict], diff: str, private: bool) -> dict:
    """Metadata-only for private repos; adds body/labels/diff for public ones."""
    state = {"repo": repo, "title": title, "files": files}
    if not private:
        state["body"] = (body or "")[:500]
        state["labels"] = labels
        state["diff"] = diff
    return state


def read_rubric(path: str = RUBRIC_PATH) -> str:
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def classify(rubric: str, state: dict, api_key: str):
    """Calls typesafe.ai's Choice API via the official SDK. Never raises:
    returns (decision: dict, reason: str) on success or
    (None, reason: str) describing the failure otherwise."""
    if TypeSafeClient is None:
        return None, "typesafe-sdk is not installed"

    questions = {
        "ci": Choice(
            instructions="How much CI does this PR need per the rubric in state['rubric']?",
            criteria={"full": "runs the whole CI suite", "lint_only": "runs lint/format checks only", "none": "no CI needed"},
        ),
        "molecule": Choice(
            instructions="How much Molecule testing does this PR need per the rubric?",
            criteria={"full": "run every scenario", "changed_roles": "run only scenarios for changed roles", "none": "no Molecule testing needed"},
        ),
        "ai_review": Choice(
            instructions="Does this PR need an AI code review pass per the rubric?",
            criteria={"yes": "run AI review", "no": "skip AI review"},
        ),
        "release_notes": Choice(
            instructions="Does this PR need release notes per the rubric?",
            criteria={"yes": "generate release notes", "no": "skip release notes"},
        ),
        "e2e": Choice(
            instructions="Does this PR need e2e testing per the rubric?",
            criteria={"yes": "run e2e", "no": "skip e2e"},
        ),
    }
    full_state = {"rubric": rubric, **state}

    try:
        with TypeSafeClient(api_key=api_key, timeout=CLASSIFY_TIMEOUT_SECONDS) as client:
            response = client.system_one(state=full_state, questions=questions)
    except Exception as exc:  # the SDK's exception hierarchy isn't documented publicly; catch broadly
        return None, f"request failed: {type(exc).__name__}: {exc}"

    try:
        answers = response.answers
        decision = {
            "ci": answers["ci"].choice.replace("_", "-"),
            "molecule": answers["molecule"].choice.replace("_", "-"),
            "ai_review": answers["ai_review"].choice,
            "release_notes": answers["release_notes"].choice,
            "e2e": answers["e2e"].choice,
        }
        confidences = [answer.confidence for answer in answers.values()]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    except Exception as exc:
        return None, f"unparseable response: {exc}"

    # Never trust the response to already be one of the declared options -
    # an out-of-enum value (a model error, or a value shaped by whatever
    # untrusted text ended up in `state`) must not reach $GITHUB_OUTPUT.
    for question, value in decision.items():
        if value not in VALID_CHOICES[question]:
            return None, f"out-of-enum answer for {question!r}: {value!r}"

    return decision, f"jev choice, avg confidence {avg_confidence:.2f}"


def _sanitize(value: str) -> str:
    """Strips CR/LF from anything headed for $GITHUB_OUTPUT, the summary,
    or a `::notice::` line. PR title/body/diff text and the override
    reason (which embeds raw file paths) are untrusted/attacker-influenced
    input; a literal newline in a `$GITHUB_OUTPUT` value can inject
    additional `key=value` lines, and one in a workflow-command line can
    forge another command. Never write an unsanitized value to any of
    those three sinks."""
    return str(value).replace("\r", " ").replace("\n", " ")


def write_outputs(output_path: str | None, decision: dict, reason: str, source: str) -> None:
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as handle:
        handle.writelines(f"{key}={_sanitize(value)}\n" for key, value in decision.items())
        handle.write(f"source={_sanitize(source)}\n")
        handle.write(f"reason={_sanitize(reason)}\n")


def write_summary(summary_path: str | None, decision: dict, reason: str, source: str) -> None:
    if not summary_path:
        return
    ci, molecule, ai_review, release_notes, e2e = (
        _sanitize(decision["ci"]),
        _sanitize(decision["molecule"]),
        _sanitize(decision["ai_review"]),
        _sanitize(decision["release_notes"]),
        _sanitize(decision["e2e"]),
    )
    with open(summary_path, "a", encoding="utf-8") as handle:
        handle.write("### Scope Classify\n\n")
        handle.write("| ci | molecule | ai_review | release_notes | e2e | source |\n")
        handle.write("| --- | --- | --- | --- | --- | --- |\n")
        handle.write(f"| {ci} | {molecule} | {ai_review} | {release_notes} | {e2e} | {_sanitize(source)} |\n\n")
        handle.write(f"reason: {_sanitize(reason)}\n")


def run(env: dict[str, str]) -> tuple[dict, str, str]:
    """Orchestrates one classification. Returns (decision, reason, source).
    Never raises - any failure resolves to FULL_DECISION/fallback."""
    try:
        event_name = env.get("EVENT_NAME", "")
        base_ref = env.get("BASE_REF", "")
        head_ref = env.get("HEAD_REF", "")
        repo = env.get("REPO", "")
        repo_private = env.get("REPO_PRIVATE", "") == "true"
        token = env.get("GITHUB_TOKEN", "")
        api_key = env.get("TYPESAFE_API_KEY", "")
        pr_number = env.get("PR_NUMBER", "")
        title = env.get("PR_TITLE", "")
        body = env.get("PR_BODY", "")
        labels = json.loads(env.get("PR_LABELS_JSON") or "[]")

        files: list[dict] = []
        diff = ""
        changed_paths: list[str] = []
        default_branch = ""
        if event_name == "pull_request" and pr_number:
            files = fetch_changed_files(repo, pr_number, token)
            changed_paths = [item["path"] for item in files]
            changed_paths += [item["previous_path"] for item in files if item.get("previous_path")]
            default_branch = fetch_default_branch(repo, token)
            if not repo_private:
                diff = fetch_diff(repo, pr_number, token)

        matched, override_reason = check_overrides(event_name, base_ref, head_ref, default_branch, changed_paths)
        if matched:
            return dict(FULL_DECISION), override_reason, "fallback"

        rubric = read_rubric()
        state = build_state(repo, title, body, labels, files, diff, repo_private)
        decision, reason = classify(rubric, state, api_key)
        if decision is None:
            return dict(FULL_DECISION), f"classifier unavailable ({reason})", "fallback"
        return decision, reason, "jev"
    except Exception as exc:  # belt and braces: the audit trail must always get written
        return dict(FULL_DECISION), f"classifier unavailable (unexpected error: {exc})", "fallback"


def main() -> None:
    decision, reason, source = run(dict(os.environ))
    write_outputs(os.environ.get("GITHUB_OUTPUT"), decision, reason, source)
    write_summary(os.environ.get("GITHUB_STEP_SUMMARY"), decision, reason, source)
    print(
        f"::notice::Scope Classify: ci={_sanitize(decision['ci'])} molecule={_sanitize(decision['molecule'])} "
        f"ai_review={_sanitize(decision['ai_review'])} release_notes={_sanitize(decision['release_notes'])} "
        f"e2e={_sanitize(decision['e2e'])} source={_sanitize(source)} reason={_sanitize(reason)}"
    )


if __name__ == "__main__":
    main()
