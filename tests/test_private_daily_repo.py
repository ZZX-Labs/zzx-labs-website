#!/usr/bin/env python3
"""Run directly: python tests/test_private_daily_repo.py"""
from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

FILE = Path(__file__).resolve().parents[1] / "tools/worldfactbook/ensure_private_daily_repo.py"
spec = importlib.util.spec_from_file_location("ensure_private_daily_repo", FILE)
repo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repo)


class PrivateDailyRepoTests(unittest.TestCase):
    def test_missing_token_stops_before_any_network_request(self):
        def no_network(*_args):
            self.fail("no network request expected")
        with self.assertRaisesRegex(repo.RepositoryError, "missing"):
            repo.ensure("ZZX-Labs/daily-part-0001", "", request=no_network)

    def test_existing_private_repo_uses_actual_default_branch(self):
        calls = []
        def request(method, path, token, body=None):
            calls.append((method, path))
            return 200, {"full_name": "ZZX-Labs/daily-part-0001", "private": True,
                         "default_branch": "trunk"}
        result = repo.ensure("ZZX-Labs/daily-part-0001", "secret", request=request)
        self.assertEqual(result["default_branch"], "trunk")
        self.assertFalse(result["created"])
        self.assertEqual(calls, [("GET", "/repos/ZZX-Labs/daily-part-0001")])

    def test_public_repo_is_never_selected(self):
        def request(*_args):
            return 200, {"full_name": "ZZX-Labs/daily-part-0001", "private": False,
                         "default_branch": "main"}
        with self.assertRaisesRegex(repo.RepositoryError, "public"):
            repo.ensure("ZZX-Labs/daily-part-0001", "secret", request=request)

    def test_read_only_private_token_fails_before_clone(self):
        def request(*_args):
            return 200, {"full_name": "ZZX-Labs/daily-part-0001", "private": True,
                         "default_branch": "main", "permissions": {"pull": True, "push": False}}
        with self.assertRaisesRegex(repo.RepositoryError, "cannot push"):
            repo.ensure("ZZX-Labs/daily-part-0001", "secret", request=request)

    def test_public_checkout_header_is_not_sent_to_private_repo(self):
        workflow = (FILE.parents[2] / ".github/workflows/zzx-worldfactbook-daily-recovery.yml").read_text()
        self.assertIn('"http.https://github.com/${GITHUB_REPOSITORY}.git.extraheader"', workflow)
        self.assertIn('git -C "${RUNNER_TEMP}" -c', workflow)
        self.assertNotIn('git config --local http.https://github.com/.extraheader ', workflow)
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run(["git", "init", "-q", directory], check=True)
            subprocess.run(["git", "-C", directory, "config", "--local",
                            "http.https://github.com/ZZX-Labs/zzx-labs-website.git.extraheader",
                            "AUTHORIZATION: basic PUBLIC"], check=True)
            public = subprocess.run(["git", "-C", directory, "config", "--get-urlmatch",
                                     "http.extraheader", "https://github.com/ZZX-Labs/zzx-labs-website.git"],
                                    text=True, capture_output=True, check=True)
            private = subprocess.run(["git", "-C", directory, "config", "--get-urlmatch",
                                      "http.extraheader", "https://github.com/ZZX-Labs/zzx-worldfactbook-daily-part-0001.git"],
                                     text=True, capture_output=True)
            self.assertEqual(public.stdout.strip(), "AUTHORIZATION: basic PUBLIC")
            self.assertEqual(private.stdout.strip(), "")

    def test_missing_org_repo_is_created_private_and_rechecked(self):
        calls = []
        responses = [
            (404, {"message": "Not Found"}),
            (200, {"type": "Organization"}),
            (201, {"full_name": "ZZX-Labs/daily-part-0001", "private": True}),
            (200, {"full_name": "ZZX-Labs/daily-part-0001", "private": True,
                   "default_branch": "main"}),
        ]
        def request(method, path, token, body=None):
            calls.append((method, path, body))
            return responses.pop(0)
        result = repo.ensure("ZZX-Labs/daily-part-0001", "secret", request=request, pause=lambda _: None)
        self.assertTrue(result["created"])
        self.assertEqual(result["default_branch"], "main")
        self.assertEqual(calls[2][1], "/orgs/ZZX-Labs/repos")
        self.assertIs(calls[2][2]["private"], True)
        self.assertIs(calls[2][2]["auto_init"], True)
        self.assertEqual(responses, [])

    def test_wrong_permission_is_explicit_and_never_clones(self):
        responses = iter([(404, {}), (200, {"type": "Organization"}),
                          (403, {"message": "Resource not accessible by integration"})])
        with self.assertRaisesRegex(repo.RepositoryError, "HTTP 403"):
            repo.ensure("ZZX-Labs/daily-part-0001", "secret",
                        request=lambda *_args: next(responses))

    def test_invalid_slug_is_rejected_before_network(self):
        with self.assertRaisesRegex(repo.RepositoryError, "owner/name"):
            repo.ensure("ZZX-Labs/daily\ncreated=true", "secret", request=lambda *_: self.fail("network"))


if __name__ == "__main__":
    unittest.main()
