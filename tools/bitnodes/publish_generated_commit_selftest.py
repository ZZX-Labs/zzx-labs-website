#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import os
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "publish_generated_commit.py"


def run(args, cwd, *, check=True):
    return subprocess.run(args, cwd=cwd, check=check, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)


def git(cwd, *args):
    return run(["git", *args], cwd).stdout.strip()


def write(root: Path, rel: str, text: str) -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="zzx-publish-overlay-") as td:
        td = Path(td)
        remote = td / "remote.git"
        seed = td / "seed"
        runner = td / "runner"
        racer = td / "racer"

        run(["git", "init", "--bare", str(remote)], td)
        run(["git", "clone", str(remote), str(seed)], td)
        git(seed, "config", "user.name", "selftest")
        git(seed, "config", "user.email", "selftest@example.invalid")
        write(seed, "bitcoin/bitnodes/api/snapshots/latest.json", '{"generation":0}\n')
        write(seed, "bitcoin/bitnodes/api/index.json", '{"generation":0}\n')
        write(seed, "README.md", "base\n")
        git(seed, "add", "-A")
        git(seed, "commit", "-m", "base")
        git(seed, "branch", "-M", "main")
        git(seed, "push", "-u", "origin", "main")
        run(["git", "--git-dir", str(remote), "symbolic-ref", "HEAD", "refs/heads/main"], td)

        run(["git", "clone", str(remote), str(runner)], td)
        git(runner, "config", "user.name", "selftest")
        git(runner, "config", "user.email", "selftest@example.invalid")
        write(runner, "bitcoin/bitnodes/api/snapshots/latest.json", '{"generation":1}\n')
        write(runner, "bitcoin/bitnodes/api/index.json", '{"generation":1}\n')
        git(runner, "add", "bitcoin/bitnodes/api")
        git(runner, "commit", "-m", "payload")
        payload = git(runner, "rev-parse", "HEAD")

        # Simulate an unrelated concurrent main update after the crawler generated its payload.
        run(["git", "clone", str(remote), str(racer)], td)
        git(racer, "config", "user.name", "selftest")
        git(racer, "config", "user.email", "selftest@example.invalid")
        write(racer, "README.md", "concurrent update\n")
        # Deliberately touch the exact generated snapshot too.  A normal rebase of the
        # payload would conflict here; the publisher must honor crawler ownership instead.
        write(racer, "bitcoin/bitnodes/api/snapshots/latest.json", '{"generation":99}\n')
        git(racer, "add", "README.md", "bitcoin/bitnodes/api/snapshots/latest.json")
        git(racer, "commit", "-m", "concurrent conflicting update")
        git(racer, "push", "origin", "main")

        cp = run([
            sys.executable,
            str(SCRIPT),
            "--payload-commit", payload,
            "--remote", "origin",
            "--branch", "main",
            "--message", "publish generated",
            "--attempts", "2",
            "--sleep-seconds", "0",
            "--allowed-prefix", "bitcoin/bitnodes/api",
            "--forbidden-prefix", "bitcoin/bitnodes/maps",
            "--forbidden-prefix", "bitcoin/bitnodes/live-map",
            "--clean",
        ], runner)

        git(runner, "fetch", "origin", "main")
        snap = git(runner, "show", "origin/main:bitcoin/bitnodes/api/snapshots/latest.json")
        idx = git(runner, "show", "origin/main:bitcoin/bitnodes/api/index.json")
        readme = git(runner, "show", "origin/main:README.md")
        if '"generation":1' not in snap or '"generation":1' not in idx:
            raise AssertionError("generated payload was not published")
        if "concurrent update" not in readme:
            raise AssertionError("concurrent unrelated main change was lost")
        if "ownership collision" not in cp.stdout:
            raise AssertionError("same-path ownership collision was not diagnosed")

        # Re-running with the same payload must be idempotent.
        cp2 = run([
            sys.executable,
            str(SCRIPT),
            "--payload-commit", payload,
            "--remote", "origin",
            "--branch", "main",
            "--message", "publish generated",
            "--attempts", "1",
            "--sleep-seconds", "0",
            "--allowed-prefix", "bitcoin/bitnodes/api",
            "--clean",
        ], runner)
        if "remote already contains" not in cp2.stdout:
            raise AssertionError("idempotent replay was not detected")

        print("publish_generated_commit_selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
