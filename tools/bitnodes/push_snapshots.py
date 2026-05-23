#!/usr/bin/env python3
"""
ZZX-Labs Bitnodes snapshot committer.

Stages, commits, and optionally pushes generated Bitnodes static API files.

Designed for GitHub Actions, but also usable locally.

Examples:

    python tools/bitnodes/push_snapshots.py

    python tools/bitnodes/push_snapshots.py \
        --paths bitcoin/bitnodes/api bitcoin/bitnodes/archive \
        --message "Update Bitnodes API snapshots"

    python tools/bitnodes/push_snapshots.py --no-push
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


DEFAULT_PATHS = [
    "bitcoin/bitnodes/api",
    "bitcoin/bitnodes/archive"
]


def run(
    command: list[str],
    cwd: Path | None = None,
    check: bool = True
) -> subprocess.CompletedProcess[str]:

    return subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=check
    )


def git_available() -> bool:
    try:
        run(["git", "--version"])
        return True
    except Exception:
        return False


def inside_git_repo() -> bool:
    try:
        result = run(
            ["git", "rev-parse", "--is-inside-work-tree"]
        )

        return result.stdout.strip() == "true"
    except Exception:
        return False


def git_root() -> Path:
    result = run(
        ["git", "rev-parse", "--show-toplevel"]
    )

    return Path(result.stdout.strip()).resolve()


def configure_git(
    name: str,
    email: str
) -> None:

    run(["git", "config", "user.name", name])
    run(["git", "config", "user.email", email])


def current_branch() -> str:
    result = run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"]
    )

    return result.stdout.strip()


def has_remote(remote: str) -> bool:
    result = run(
        ["git", "remote"],
        check=False
    )

    remotes = {
        line.strip()
        for line in result.stdout.splitlines()
        if line.strip()
    }

    return remote in remotes


def stage_paths(paths: list[str]) -> None:
    existing = []

    for item in paths:
        path = Path(item)

        if path.exists():
            existing.append(item)

    if not existing:
        print(
            "No configured Bitnodes output paths exist; nothing to stage.",
            file=sys.stderr
        )

        return

    run(["git", "add", *existing])


def has_staged_changes() -> bool:
    result = run(
        ["git", "diff", "--cached", "--quiet"],
        check=False
    )

    return result.returncode != 0


def has_worktree_changes(paths: list[str]) -> bool:
    result = run(
        ["git", "status", "--porcelain", "--", *paths],
        check=False
    )

    return bool(result.stdout.strip())


def commit_changes(message: str) -> bool:
    if not has_staged_changes():
        return False

    run(["git", "commit", "-m", message])
    return True


def push_changes(remote: str, branch: str) -> None:
    run(["git", "push", remote, branch])


def print_git_status(paths: list[str]) -> None:
    result = run(
        ["git", "status", "--short", "--", *paths],
        check=False
    )

    if result.stdout.strip():
        print(result.stdout.rstrip())
    else:
        print("No Bitnodes changes detected.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Commit and optionally push generated Bitnodes static API snapshots."
    )

    parser.add_argument(
        "--paths",
        nargs="+",
        default=DEFAULT_PATHS,
        help="Paths to stage."
    )

    parser.add_argument(
        "--message",
        default="Update Bitnodes static API snapshots",
        help="Commit message."
    )

    parser.add_argument(
        "--git-name",
        default=os.environ.get(
            "GIT_AUTHOR_NAME",
            "zzx-labs-bitnodes-bot"
        ),
        help="Git commit author name."
    )

    parser.add_argument(
        "--git-email",
        default=os.environ.get(
            "GIT_AUTHOR_EMAIL",
            "actions@github.com"
        ),
        help="Git commit author email."
    )

    parser.add_argument(
        "--remote",
        default="origin",
        help="Git remote."
    )

    parser.add_argument(
        "--branch",
        default=None,
        help="Branch to push. Defaults to current branch."
    )

    parser.add_argument(
        "--no-push",
        action="store_true",
        help="Commit but do not push."
    )

    parser.add_argument(
        "--status-only",
        action="store_true",
        help="Only print git status for target paths."
    )

    args = parser.parse_args()

    if not git_available():
        print("git is not available.", file=sys.stderr)
        return 2

    if not inside_git_repo():
        print("Current directory is not inside a git repository.", file=sys.stderr)
        return 2

    root = git_root()
    os.chdir(root)

    paths = args.paths

    if args.status_only:
        print_git_status(paths)
        return 0

    configure_git(
        name=args.git_name,
        email=args.git_email
    )

    if not has_worktree_changes(paths):
        print("No Bitnodes snapshot changes to commit.")
        return 0

    stage_paths(paths)

    if not commit_changes(args.message):
        print("No staged Bitnodes changes to commit.")
        return 0

    branch = args.branch or current_branch()

    if args.no_push:
        print(f"Committed Bitnodes snapshot changes on branch {branch}; push skipped.")
        return 0

    if not has_remote(args.remote):
        print(f"Remote does not exist: {args.remote}", file=sys.stderr)
        return 2

    push_changes(args.remote, branch)

    print(f"Pushed Bitnodes snapshot changes to {args.remote}/{branch}.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
