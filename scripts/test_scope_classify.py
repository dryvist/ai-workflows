#!/usr/bin/env python3
"""Unit tests for scope_classify.py. stdlib unittest only, no dependency
on a live typesafe-sdk installation - the SDK client is mocked.

    python3 -m unittest scripts/test_scope_classify.py
"""
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import scope_classify as sc


def _answer(choice: str, confidence: float = 0.9):
    return types.SimpleNamespace(choice=choice, confidence=confidence)


class CheckOverridesTests(unittest.TestCase):
    def test_pull_request_with_no_matching_path_does_not_override(self):
        matched, reason = sc.check_overrides("pull_request", "develop", ["README.md"])
        self.assertFalse(matched)
        self.assertIsNone(reason)

    def test_workflow_path_forces_full(self):
        matched, reason = sc.check_overrides("pull_request", "develop", [".github/workflows/ci.yml"])
        self.assertTrue(matched)
        self.assertIn(".github/workflows/ci.yml", reason)

    def test_push_event_forces_full(self):
        matched, reason = sc.check_overrides("push", "main", [])
        self.assertTrue(matched)
        self.assertIn("event is push", reason)

    def test_base_main_forces_full(self):
        matched, reason = sc.check_overrides("pull_request", "main", [])
        self.assertTrue(matched)
        self.assertIn("base branch is main", reason)

    def test_secret_like_path_forces_full(self):
        matched, reason = sc.check_overrides("pull_request", "develop", ["roles/app/tasks/auth.yml"])
        self.assertTrue(matched)
        self.assertIn("auth", reason)


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

    @mock.patch.object(sc, "fetch_diff", return_value="diff --git a b")
    @mock.patch.object(sc, "fetch_changed_files", return_value=[{"path": "README.md", "additions": 1, "deletions": 1}])
    @mock.patch.object(sc, "read_rubric", return_value="# rubric")
    def test_success_returns_jev_source(self, _read_rubric, _fetch_files, _fetch_diff):
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

    @mock.patch.object(sc, "fetch_diff", return_value="")
    @mock.patch.object(sc, "fetch_changed_files", return_value=[{"path": "README.md", "additions": 1, "deletions": 1}])
    @mock.patch.object(sc, "read_rubric", return_value="# rubric")
    def test_api_error_falls_back_to_full(self, _read_rubric, _fetch_files, _fetch_diff):
        mock_client = mock.MagicMock()
        mock_client.__enter__.return_value.system_one.side_effect = RuntimeError("422 Unprocessable Entity")
        with mock.patch.object(sc, "TypeSafeClient", return_value=mock_client):
            decision, reason, source = sc.run(self._base_env())
        self.assertEqual(source, "fallback")
        self.assertEqual(decision, sc.FULL_DECISION)
        self.assertIn("422", reason)

    @mock.patch.object(sc, "fetch_diff", return_value="")
    @mock.patch.object(sc, "fetch_changed_files", return_value=[{"path": "README.md", "additions": 1, "deletions": 1}])
    @mock.patch.object(sc, "read_rubric", return_value="# rubric")
    def test_timeout_falls_back_to_full(self, _read_rubric, _fetch_files, _fetch_diff):
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

    def test_override_skips_the_api_call_entirely(self):
        env = self._base_env(EVENT_NAME="push", BASE_REF="")
        with mock.patch.object(sc, "TypeSafeClient") as client_cls:
            decision, reason, source = sc.run(env)
        client_cls.assert_not_called()
        self.assertEqual(source, "fallback")
        self.assertEqual(decision, sc.FULL_DECISION)
        self.assertIn("event is push", reason)


if __name__ == "__main__":
    unittest.main()
