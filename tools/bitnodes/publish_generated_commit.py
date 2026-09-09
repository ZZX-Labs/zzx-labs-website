#!/usr/bin/env python3
"""Publish a generated artifact commit by replaying its exact paths on current origin/main.

This intentionally avoids `git rebase` for machine-generated artifacts.  A generated
commit is treated as an immutable payload.  On every push attempt we reset to the
latest remote branch, overlay only the paths carried by that payload (including
payload deletions), create a fresh commit, and perform a normal fast-forward push.
If the remote advances before the push, the process repeats against the new head.

No force push is used and no content merge of generated JSON/database artifacts is
attempted.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys
import time


def run(args: list[str], *, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        check=check,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )


def output(args: list[str]) -> str:
    cp = run(args, capture=True)
    return cp.stdout.strip()


def git(*args: str, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return run(["git", *args], check=check, capture=capture)


def git_output(*args: str) -> str:
    return output(["git", *args])


def payload_paths(parent: str, payload: str) -> list[str]:
    cp = subprocess.run(
        ["git", "diff", "--name-only", "-z", parent, payload],
        check=True,
        stdout=subprocess.PIPE,
    )
    return [p.decode("utf-8", "surrogateescape") for p in cp.stdout.split(b"\0") if p]


def path_in_prefix(path: str, prefix: str) -> bool:
    prefix = prefix.rstrip("/")
    return path == prefix or path.startswith(prefix + "/")


def validate_paths(paths: list[str], allowed: list[str], forbidden: list[str]) -> None:
    if not paths:
        raise RuntimeError("generated payload commit contains no changed paths")

    bad_forbidden = [p for p in paths if any(path_in_prefix(p, x) for x in forbidden)]
    if bad_forbidden:
        raise RuntimeError(
            "generated payload overlaps forbidden paths: " + ", ".join(bad_forbidden[:20])
        )

    if allowed:
        bad_allowed = [p for p in paths if not any(path_in_prefix(p, x) for x in allowed)]
        if bad_allowed:
            raise RuntimeError(
                "generated payload contains paths outside publication ownership: "
                + ", ".join(bad_allowed[:20])
            )


def blob_exists(commit: str, path: str) -> bool:
    cp = git("cat-file", "-e", f"{commit}:{path}", check=False, capture=True)
    return cp.returncode == 0


def overlay_payload(payload: str, paths: list[str]) -> None:
    for path in paths:
        if blob_exists(payload, path):
            git("checkout", payload, "--", path)
        else:
            git("rm", "-f", "--ignore-unmatch", "--", path)


def current_staged_paths() -> list[str]:
    cp = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "-z"],
        check=True,
        stdout=subprocess.PIPE,
    )
    return [p.decode("utf-8", "surrogateescape") for p in cp.stdout.split(b"\0") if p]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--payload-commit", required=True)
    ap.add_argument("--remote", default="origin")
    ap.add_argument("--branch", default="main")
    ap.add_argument("--message", required=True)
    ap.add_argument("--attempts", type=int, default=5)
    ap.add_argument("--sleep-seconds", type=float, default=10.0)
    ap.add_argument("--allowed-prefix", action="append", default=[])
    ap.add_argument("--forbidden-prefix", action="append", default=[])
    ap.add_argument("--clean", action="store_true")
    args = ap.parse_args()

    if args.attempts < 1:
        raise SystemExit("--attempts must be >= 1")

    payload = git_output("rev-parse", args.payload_commit)
    parent = git_output("rev-parse", f"{payload}^")
    paths = payload_paths(parent, payload)
    validate_paths(paths, args.allowed_prefix, args.forbidden_prefix)

    print(
        f"generated publication payload: commit={payload[:12]} parent={parent[:12]} "
        f"paths={len(paths)} remote={args.remote}/{args.branch}",
        flush=True,
    )
    for path in paths:
        print(f"payload path: {path}", flush=True)

    for attempt in range(1, args.attempts + 1):
        print(f"publication attempt {attempt}/{args.attempts}: refreshing remote", flush=True)
        git("fetch", args.remote, args.branch)
        remote_ref = f"{args.remote}/{args.branch}"
        remote_head = git_output("rev-parse", remote_ref)
        print(f"publication base: {remote_ref}={remote_head[:12]}", flush=True)

        # Diagnose ownership collisions instead of asking Git to merge generated files.
        # The crawler concurrency group prevents two production crawler jobs from running
        # simultaneously, so overlap here normally means a manual/legacy writer touched
        # a crawler-owned artifact while this run was generating.  Crawler ownership wins.
        remote_changed = set(payload_paths(parent, remote_head)) if remote_head != parent else set()
        overlap = sorted(set(paths) & remote_changed)
        if overlap:
            print(
                f"generated-path ownership collision on {len(overlap)} path(s); "
                "replaying crawler-owned payload instead of content-merging:",
                flush=True,
            )
            for path in overlap:
                print(f"ownership collision: {path}", flush=True)

        git("reset", "--hard", remote_ref)
        if args.clean:
            git("clean", "-fdx")

        overlay_payload(payload, paths)
        staged = current_staged_paths()
        validate_paths(staged, args.allowed_prefix, args.forbidden_prefix) if staged else None

        unexpected = sorted(set(staged) - set(paths))
        if unexpected:
            raise RuntimeError(
                "overlay staged unexpected paths: " + ", ".join(unexpected[:20])
            )

        if not staged:
            print("remote already contains the generated artifact payload; publication complete", flush=True)
            return 0

        print(f"overlay staged paths={len(staged)} on remote head {remote_head[:12]}", flush=True)
        git("commit", "-m", args.message)
        candidate = git_output("rev-parse", "HEAD")
        print(f"publication candidate: {candidate[:12]}", flush=True)

        cp = git("push", args.remote, f"HEAD:{args.branch}", check=False)
        if cp.returncode == 0:
            print(
                f"generated artifacts published by fast-forward push: {candidate[:12]} -> {args.remote}/{args.branch}",
                flush=True,
            )
            return 0

        print(
            "push raced with another main update; rebuilding the generated overlay on the newest remote head",
            flush=True,
        )
        if attempt < args.attempts:
            time.sleep(args.sleep_seconds)

    print(
        "failed to publish generated artifacts after all fast-forward overlay attempts; main was not rewritten",
        file=sys.stderr,
        flush=True,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
