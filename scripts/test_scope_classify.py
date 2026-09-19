#!/usr/bin/env python3
"""Unit tests for scope_classify.py. stdlib unittest only, no dependency
on a live typesafe-sdk installation - the SDK client is mocked.

    python3 -m unittest scripts/test_scope_classify.py
"""
import os
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import scope_classify as sc


def _answer(choice: str, confidence: float = 0.9):
    return types.SimpleNamespace(choice=choice, confidence=confidence)


class CheckOverridesTests(unittest.TestCase):
    def test_pull_request_is_not_overridden(self):
        matched, reason = sc.check_overrides("pull_request")
        self.assertFalse(matched)
        self.assertEqual(reason, "")

    def test_push_event_forces_full(self):
        matched, reason = sc.check_overrides("push")
        self.assertTrue(matched)
        self.assertIn("event is push", reason)


class ClassifyTests(unittest.TestCase):
    """Mocks the typesafe_sdk client so no network call happens."""

    def setUp(self):
        # Choice() only builds the request payload; its content doesn't
        # matter to these tests, and typesafe-sdk need not be installed
        # to run them.
        patcher = mock.patch.object(sc, "Choice", new=lambda **kwargs: kwargs)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _base_env(self, **overrides):
        env = {
            "EVENT_NAME": "pull_request",
            "BASE_REF": "develop",
            "HEAD_REF": "feature/x",
            "REPO": "dryvist/example",
            "REPO_PRIVATE": "false",
            "GITHUB_TOKEN": "gh-token",
            "TYPESAFE_API_KEY": "ts-key",
            "PR_NUMBER": "1",
            "PR_TITLE": "docs: fix typo",
            "PR_BODY": "fixes a typo",
            "PR_LABELS_JSON": "[]",
        }
        env.update(overrides)
        return env

    @mock.patch.object(sc, "fetch_default_branch", return_value="main")
    @mock.patch.object(sc, "fetch_diff", return_value="diff --git a b")
    @mock.patch.object(sc, "fetch_changed_files", return_value=[{"path": "README.md", "additions": 1, "deletions": 1}])
    @mock.patch.object(sc, "read_rubric", return_value="# rubric")
    def test_success_returns_jev_source(self, _read_rubric, _fetch_files, _fetch_diff, _fetch_default_branch):
        mock_client = mock.MagicMock()
        mock_client.__enter__.return_value.system_one.return_value = types.SimpleNamespace(
            answers={
                "ci": _answer("lint_only"),
                "molecule": _answer("none"),
                "ai_review": _answer("no"),
                "release_notes": _answer("no"),
                "e2e": _answer("no"),
            }
        )
        with mock.patch.object(sc, "TypeSafeClient", return_value=mock_client):
            decision, reason, source = sc.run(self._base_env())
        self.assertEqual(source, "jev")
        self.assertEqual(decision["ci"], "lint-only")
        self.assertEqual(decision["molecule"], "none")
        self.assertIn("confidence", reason)

    @mock.patch.object(sc, "fetch_default_branch", return_value="main")
    @mock.patch.object(sc, "fetch_diff", return_value="")
    @mock.patch.object(sc, "fetch_changed_files", return_value=[{"path": "README.md", "additions": 1, "deletions": 1}])
    @mock.patch.object(sc, "read_rubric", return_value="# rubric")
    def test_api_error_falls_back_to_full(self, _read_rubric, _fetch_files, _fetch_diff, _fetch_default_branch):
        mock_client = mock.MagicMock()
        mock_client.__enter__.return_value.system_one.side_effect = RuntimeError("422 Unprocessable Entity")
        with mock.patch.object(sc, "TypeSafeClient", return_value=mock_client):
            decision, reason, source = sc.run(self._base_env())
        self.assertEqual(source, "fallback")
        self.assertEqual(decision, sc.FULL_DECISION)
        self.assertIn("422", reason)

    @mock.patch.object(sc, "fetch_default_branch", return_value="main")
    @mock.patch.object(sc, "fetch_diff", return_value="")
    @mock.patch.object(sc, "fetch_changed_files", return_value=[{"path": "README.md", "additions": 1, "deletions": 1}])
    @mock.patch.object(sc, "read_rubric", return_value="# rubric")
    def test_timeout_falls_back_to_full(self, _read_rubric, _fetch_files, _fetch_diff, _fetch_default_branch):
        # The SDK's own exception type for a deadline isn't documented
        # publicly; classify() catches broadly, so any exception (a
        # built-in TimeoutError stands in for whatever the SDK raises)
        # must still resolve to the same full/fallback decision.
        mock_client = mock.MagicMock()
        mock_client.__enter__.return_value.system_one.side_effect = TimeoutError("deadline exceeded")
        with mock.patch.object(sc, "TypeSafeClient", return_value=mock_client):
            decision, reason, source = sc.run(self._base_env())
        self.assertEqual(source, "fallback")
        self.assertEqual(decision, sc.FULL_DECISION)
        self.assertIn("TimeoutError", reason)

    @mock.patch.object(sc, "fetch_default_branch", return_value="main")
    @mock.patch.object(sc, "fetch_diff", return_value="")
    @mock.patch.object(sc, "fetch_changed_files", return_value=[{"path": "README.md", "additions": 1, "deletions": 1}])
    @mock.patch.object(sc, "read_rubric", return_value="# rubric")
    def test_trunk_repo_feature_pr_into_main_reaches_the_classifier(
        self, _read_rubric, _fetch_files, _fetch_diff, _fetch_default_branch
    ):
        # Regression test: a trunk repo's feature PRs all target `main`.
        # Only a develop -> main promotion should force full; this PR
        # (head "feature/x", base "main") must reach the real call.
        mock_client = mock.MagicMock()
        mock_client.__enter__.return_value.system_one.return_value = types.SimpleNamespace(
            answers={
                "ci": _answer("lint_only"),
                "molecule": _answer("none"),
                "ai_review": _answer("no"),
                "release_notes": _answer("no"),
                "e2e": _answer("no"),
            }
        )
        env = self._base_env(BASE_REF="main", HEAD_REF="feature/x")
        with mock.patch.object(sc, "TypeSafeClient", return_value=mock_client) as client_cls:
            decision, _reason, source = sc.run(env)
        client_cls.assert_called_once()
        self.assertEqual(source, "jev")
        self.assertEqual(decision["ci"], "lint-only")

    @mock.patch.object(sc, "fetch_default_branch", return_value="main")
    @mock.patch.object(sc, "fetch_diff", return_value="")
    @mock.patch.object(sc, "fetch_changed_files", return_value=[])
    @mock.patch.object(sc, "read_rubric", return_value="# rubric")
    def test_promotion_refs_reach_the_classifier(self, _read_rubric, _fetch_files, _fetch_diff, _fetch_default_branch):
        # The promotion rule is the rubric's to judge, so the classifier
        # must be handed the refs it needs to judge it.
        env = self._base_env(BASE_REF="main", HEAD_REF="develop")
        with mock.patch.object(
            sc, "classify", return_value=(dict(sc.FULL_DECISION), "jev choice, avg confidence 0.90")
        ) as classify_call:
            _decision, _reason, source = sc.run(env)
        self.assertEqual(source, "jev")
        _rubric, state, _api_key = classify_call.call_args[0]
        self.assertEqual((state["base_ref"], state["head_ref"], state["default_branch"]), ("main", "develop", "main"))

    def test_override_skips_the_api_call_entirely(self):
        env = self._base_env(EVENT_NAME="push", BASE_REF="")
        with mock.patch.object(sc, "TypeSafeClient") as client_cls:
            decision, reason, source = sc.run(env)
        client_cls.assert_not_called()
        self.assertEqual(source, "fallback")
        self.assertEqual(decision, sc.FULL_DECISION)
        self.assertIn("event is push", reason)

    @mock.patch.object(sc, "fetch_default_branch", return_value="main")
    @mock.patch.object(
        sc,
        "fetch_changed_files",
        return_value=[
            {"path": "roles/app/renamed.yml", "previous_path": "roles/openbao/old.yml", "status": "renamed", "additions": 1, "deletions": 1},
            {"path": ".github/workflows/commit-review.yml", "previous_path": None, "status": "removed", "additions": 0, "deletions": 40},
        ],
    )
    @mock.patch.object(sc, "read_rubric", return_value="# rubric")
    def test_rename_origin_and_deletion_status_reach_the_classifier(self, _read_rubric, _fetch_files, _fetch_default_branch):
        # A path-based rule is the rubric's to apply; the script's job is
        # to hand over what the rubric needs: the old name of a rename and
        # the status that says a file is gone.
        with mock.patch.object(sc, "fetch_diff", return_value=""), mock.patch.object(
            sc, "classify", return_value=(dict(sc.FULL_DECISION), "jev choice, avg confidence 0.90")
        ) as classify_call:
            sc.run(self._base_env())
        _rubric, state, _api_key = classify_call.call_args[0]
        self.assertEqual(state["files"][0]["previous_path"], "roles/openbao/old.yml")
        self.assertEqual(state["files"][1]["status"], "removed")

    @mock.patch.object(sc, "fetch_default_branch", return_value="main")
    @mock.patch.object(sc, "fetch_changed_files", return_value=[{"path": "README.md", "additions": 1, "deletions": 1}])
    @mock.patch.object(sc, "read_rubric", return_value="# rubric")
    def test_private_repo_sends_no_diff_body_or_labels(self, _read_rubric, _fetch_files, _fetch_default_branch):
        env = self._base_env(REPO_PRIVATE="true", PR_BODY="secret internal detail", PR_LABELS_JSON='["internal"]')
        with mock.patch.object(sc, "fetch_diff") as fetch_diff, mock.patch.object(
            sc, "classify", return_value=(dict(sc.FULL_DECISION), "jev choice, avg confidence 0.90")
        ) as classify_call:
            sc.run(env)
        fetch_diff.assert_not_called()
        _rubric, state, _api_key = classify_call.call_args[0]
        self.assertNotIn("diff", state)
        self.assertNotIn("body", state)
        self.assertNotIn("labels", state)
        self.assertIn("files", state)

    @mock.patch.object(sc, "fetch_default_branch", return_value="main")
    @mock.patch.object(sc, "fetch_diff", return_value="")
    @mock.patch.object(sc, "fetch_changed_files", return_value=[{"path": "README.md", "additions": 1, "deletions": 1}])
    @mock.patch.object(sc, "read_rubric", return_value="# rubric")
    def test_out_of_enum_answer_falls_back_to_full(self, _read_rubric, _fetch_files, _fetch_diff, _fetch_default_branch):
        mock_client = mock.MagicMock()
        mock_client.__enter__.return_value.system_one.return_value = types.SimpleNamespace(
            answers={
                "ci": _answer("YOLO"),  # not in VALID_CHOICES["ci"]
                "molecule": _answer("none"),
                "ai_review": _answer("no"),
                "release_notes": _answer("no"),
                "e2e": _answer("no"),
            }
        )
        with mock.patch.object(sc, "TypeSafeClient", return_value=mock_client):
            decision, reason, source = sc.run(self._base_env())
        self.assertEqual(source, "fallback")
        self.assertEqual(decision, sc.FULL_DECISION)
        self.assertIn("out-of-enum", reason)


class SanitizeTests(unittest.TestCase):
    def test_sanitize_strips_cr_and_lf(self):
        self.assertEqual(sc._sanitize("full\nci=none\r\nextra=1"), "full ci=none  extra=1")

    def test_write_outputs_strips_newlines_from_every_field(self):
        decision = dict(sc.FULL_DECISION)
        decision["ci"] = "full\nfake_output=injected"
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "github_output")
            open(path, "w", encoding="utf-8").close()
            sc.write_outputs(path, decision, "reason\nwith\nnewlines", "fallback")
            with open(path, encoding="utf-8") as handle:
                content = handle.read()
        self.assertNotIn("\n\n", content)
        for line in content.splitlines():
            self.assertIn("=", line)  # every line is still a clean key=value


if __name__ == "__main__":
    unittest.main()
