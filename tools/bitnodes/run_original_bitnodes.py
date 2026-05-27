#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[2]

BITNODES_ROOT = APP_ROOT / "bitcoin" / "bitnodes"
SRC_DIR = BITNODES_ROOT / "src"

DATA_DIR = BITNODES_ROOT / "data"
API_DIR = BITNODES_ROOT / "api"
ARCHIVE_DIR = BITNODES_ROOT / "archive"
LOG_DIR = BITNODES_ROOT / "log"
GEOIP_DIR = DATA_DIR / "geoip"
STATE_DIR = DATA_DIR / "state"
SNAPSHOT_24H_DIR = DATA_DIR / "snapshots" / "24h"
SEEDER_DIR = DATA_DIR / "seeders"

DEFAULT_REPO = "https://github.com/ayeowch/bitnodes"
DEFAULT_BRANCH = "master"


def printf(message: str) -> None:
    print(message, flush=True)


def ensure_dirs() -> None:
    for path in (
        BITNODES_ROOT,
        SRC_DIR,
        DATA_DIR,
        API_DIR,
        ARCHIVE_DIR,
        LOG_DIR,
        GEOIP_DIR,
        STATE_DIR,
        SNAPSHOT_24H_DIR,
        SEEDER_DIR,
    ):
        path.mkdir(parents=True, exist_ok=True)


def run(command: list[str], cwd: Path | None = None, env: dict[str, str] | None = None) -> int:
    merged_env = os.environ.copy()

    if env:
        merged_env.update(env)

    printf(f"RUNNING: {' '.join(command)}")

    return subprocess.call(
        command,
        cwd=str(cwd) if cwd else None,
        env=merged_env
    )


def runtime_env() -> dict[str, str]:
    return {
        "ZZX_BITNODES_ROOT": str(BITNODES_ROOT),
        "ZZX_BITNODES_SRC_DIR": str(SRC_DIR),
        "ZZX_BITNODES_API_DIR": str(API_DIR),
        "ZZX_BITNODES_ARCHIVE_DIR": str(ARCHIVE_DIR),
        "ZZX_BITNODES_GEOIP_DIR": str(GEOIP_DIR),
        "ZZX_BITNODES_STATE_DIR": str(STATE_DIR),
        "ZZX_BITNODES_SNAPSHOT_24H_DIR": str(SNAPSHOT_24H_DIR),
        "ZZX_BITNODES_SEEDER_DIR": str(SEEDER_DIR),
        "ZZX_BITNODES_LOG_DIR": str(LOG_DIR),
        "PYTHONUNBUFFERED": "1",
    }


def is_git_repo(path: Path) -> bool:
    return (path / ".git").exists()


def clone(repo: str = DEFAULT_REPO, branch: str = DEFAULT_BRANCH) -> int:
    ensure_dirs()

    if is_git_repo(SRC_DIR):
        return run(
            ["git", "pull", "--ff-only", "origin", branch],
            cwd=SRC_DIR
        )

    if SRC_DIR.exists() and any(SRC_DIR.iterdir()):
        printf("bitcoin/bitnodes/src exists but is not a git repository. Refusing to overwrite.")
        return 1

    return run(
        ["git", "clone", "--branch", branch, repo, str(SRC_DIR)]
    )


def install_requirements() -> int:
    requirements = SRC_DIR / "requirements.txt"

    if not requirements.exists():
        printf("requirements.txt not found in bitcoin/bitnodes/src.")
        return 1

    code = run(
        [sys.executable, "-m", "pip", "install", "--upgrade", "pip"],
        cwd=SRC_DIR
    )

    if code:
        return code

    return run(
        [sys.executable, "-m", "pip", "install", "-r", str(requirements)],
        cwd=SRC_DIR
    )


def update_geoip() -> int:
    script = SRC_DIR / "geoip" / "update.sh"

    if not script.exists():
        printf("geoip/update.sh not found in bitcoin/bitnodes/src.")
        return 1

    return run(["bash", str(script)], cwd=SRC_DIR)


def locate_start_target() -> Path | None:
    candidates = (
        SRC_DIR / "start.sh",
        SRC_DIR / "crawl.py",
        SRC_DIR / "crawler.py",
        SRC_DIR / "manage.py",
        SRC_DIR / "docker-compose.yml",
        SRC_DIR / "compose.yaml",
        SRC_DIR / "compose.yml",
    )

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return None


def start() -> int:
    ensure_dirs()

    target = locate_start_target()

    if not target:
        printf("No original Bitnodes startup target found in bitcoin/bitnodes/src.")
        return 1

    env = runtime_env()

    if target.name == "start.sh":
        return run(["bash", str(target)], cwd=SRC_DIR, env=env)

    if target.name in ("crawl.py", "crawler.py", "manage.py"):
        return run([sys.executable, str(target)], cwd=SRC_DIR, env=env)

    if target.name in ("docker-compose.yml", "compose.yaml", "compose.yml"):
        return run(["docker", "compose", "-f", str(target), "up"], cwd=SRC_DIR, env=env)

    printf("Unsupported original Bitnodes startup target.")
    return 1


def bootstrap(repo: str = DEFAULT_REPO, branch: str = DEFAULT_BRANCH) -> int:
    code = clone(repo=repo, branch=branch)

    if code:
        return code

    code = install_requirements()

    if code:
        return code

    update_geoip()

    return start()


def clean() -> int:
    if SRC_DIR.exists():
        shutil.rmtree(SRC_DIR)
        printf("Removed bitcoin/bitnodes/src.")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Manage original ayeowch/bitnodes crawler source in bitcoin/bitnodes/src."
    )

    parser.add_argument(
        "command",
        choices=[
            "clone",
            "install",
            "geoip",
            "start",
            "bootstrap",
            "clean",
        ]
    )

    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--branch", default=DEFAULT_BRANCH)

    args = parser.parse_args()

    if args.command == "clone":
        return clone(repo=args.repo, branch=args.branch)

    if args.command == "install":
        return install_requirements()

    if args.command == "geoip":
        return update_geoip()

    if args.command == "start":
        return start()

    if args.command == "bootstrap":
        return bootstrap(repo=args.repo, branch=args.branch)

    if args.command == "clean":
        return clean()

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
