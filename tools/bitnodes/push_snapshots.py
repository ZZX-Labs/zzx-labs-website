#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path


DEFAULT_PATHS = [
    "bitcoin/bitnodes/api",
    "bitcoin/bitnodes/archive",
    "bitcoin/bitnodes/data",
    "bitcoin/bitnodes/maps",
    "bitcoin/bitnodes/live-map",
]


def run(command: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=check,
    )


def git_available() -> bool:
    return run(["git", "--version"], check=False).returncode == 0


def inside_git_repo() -> bool:
    result = run(["git", "rev-parse", "--is-inside-work-tree"], check=False)
    return result.returncode == 0 and result.stdout.strip() == "true"


def git_root() -> Path:
    result = run(["git", "rev-parse", "--show-toplevel"])
    return Path(result.stdout.strip()).resolve()


def configure_git(name: str, email: str) -> None:
    run(["git", "config", "user.name", name])
    run(["git", "config", "user.email", email])


def current_branch() -> str:
    result = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    return result.stdout.strip()


def has_remote(remote: str) -> bool:
    result = run(["git", "remote"], check=False)
    return remote in {line.strip() for line in result.stdout.splitlines() if line.strip()}


def existing_paths(paths: list[str]) -> list[str]:
    return [item for item in paths if Path(item).exists()]


def print_git_status(paths: list[str]) -> None:
    targets = existing_paths(paths) or paths
    result = run(["git", "status", "--short", "--", *targets], check=False)

    print(result.stdout.rstrip() if result.stdout.strip() else "No Bitnodes changes detected.")


def has_worktree_changes(paths: list[str]) -> bool:
    targets = existing_paths(paths)

    if not targets:
        return False

    result = run(["git", "status", "--porcelain", "--", *targets], check=False)
    return bool(result.stdout.strip())


def stage_paths(paths: list[str]) -> bool:
    targets = existing_paths(paths)

    if not targets:
        print("No configured Bitnodes output paths exist; nothing to stage.", file=sys.stderr)
        return False

    run(["git", "add", *targets])
    return True


def has_staged_changes() -> bool:
    return run(["git", "diff", "--cached", "--quiet"], check=False).returncode != 0


def commit_changes(message: str) -> bool:
    if not has_staged_changes():
        return False

    run(["git", "commit", "-m", message])
    return True


def sync_branch(remote: str, branch: str, *, rebase: bool = True) -> None:
    run(["git", "fetch", remote, branch], check=False)

    if rebase:
        run(["git", "pull", "--rebase", remote, branch], check=False)
    else:
        run(["git", "pull", remote, branch], check=False)


def push_changes(remote: str, branch: str, retries: int = 5, delay: int = 10) -> int:
    for attempt in range(1, retries + 1):
        result = run(["git", "push", remote, branch], check=False)

        if result.returncode == 0:
            print(f"Pushed Bitnodes snapshot changes to {remote}/{branch}.")
            return 0

        print(f"Push attempt {attempt} failed.", file=sys.stderr)

        if result.stderr.strip():
            print(result.stderr.rstrip(), file=sys.stderr)

        if attempt < retries:
            time.sleep(delay)
            run(["git", "pull", "--rebase", remote, branch], check=False)

    return 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Commit and optionally push generated Bitnodes snapshots, API outputs, map data, and archive files."
    )

    parser.add_argument("--paths", nargs="+", default=DEFAULT_PATHS)
    parser.add_argument("--message", default="Update Bitnodes static API snapshots")
    parser.add_argument("--git-name", default=os.environ.get("GIT_AUTHOR_NAME", "zzx-labs-bitnodes-bot"))
    parser.add_argument("--git-email", default=os.environ.get("GIT_AUTHOR_EMAIL", "actions@github.com"))
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--branch", default=None)
    parser.add_argument("--no-push", action="store_true")
    parser.add_argument("--status-only", action="store_true")
    parser.add_argument("--no-sync", action="store_true")
    parser.add_argument("--no-rebase", action="store_true")
    parser.add_argument("--retries", type=int, default=5)
    parser.add_argument("--retry-delay", type=int, default=10)

    args = parser.parse_args()

    if not git_available():
        print("git is not available.", file=sys.stderr)
        return 2

    if not inside_git_repo():
        print("Current directory is not inside a git repository.", file=sys.stderr)
        return 2

    root = git_root()
    os.chdir(root)

    if args.status_only:
        print_git_status(args.paths)
        return 0

    configure_git(args.git_name, args.git_email)

    branch = args.branch or current_branch()

    if not has_worktree_changes(args.paths):
        print("No Bitnodes snapshot changes to commit.")
        return 0

    if not args.no_push:
        if not has_remote(args.remote):
            print(f"Remote does not exist: {args.remote}", file=sys.stderr)
            return 2

        if not args.no_sync:
            sync_branch(args.remote, branch, rebase=not args.no_rebase)

    if not stage_paths(args.paths):
        return 0

    if not commit_changes(args.message):
        print("No staged Bitnodes changes to commit.")
        return 0

    if args.no_push:
        print(f"Committed Bitnodes snapshot changes on branch {branch}; push skipped.")
        return 0

    return push_changes(
        args.remote,
        branch,
        retries=max(1, args.retries),
        delay=max(1, args.retry_delay),
    )


if __name__ == "__main__":
    raise SystemExit(main())
