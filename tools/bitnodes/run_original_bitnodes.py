#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[2]
VENDOR_DIR = APP_ROOT / "tools" / "bitnodes" / "vendor" / "bitnodes"


def run(command: list[str], cwd: Path | None = None) -> int:
    return subprocess.call(command, cwd=str(cwd) if cwd else None)


def clone() -> int:
    VENDOR_DIR.parent.mkdir(parents=True, exist_ok=True)

    if VENDOR_DIR.exists():
        return run(["git", "pull", "--ff-only"], cwd=VENDOR_DIR)

    return run(
        [
            "git",
            "clone",
            "https://github.com/ayeowch/bitnodes",
            str(VENDOR_DIR)
        ]
    )


def install_requirements() -> int:
    requirements = VENDOR_DIR / "requirements.txt"

    if not requirements.exists():
        print("requirements.txt not found in original Bitnodes repo.")
        return 1

    return run(
        [
            "python",
            "-m",
            "pip",
            "install",
            "-r",
            str(requirements)
        ],
        cwd=VENDOR_DIR
    )


def update_geoip() -> int:
    script = VENDOR_DIR / "geoip" / "update.sh"

    if not script.exists():
        print("geoip/update.sh not found.")
        return 1

    return run(["bash", str(script)], cwd=VENDOR_DIR)


def start() -> int:
    script = VENDOR_DIR / "start.sh"

    if not script.exists():
        print("start.sh not found.")
        return 1

    return run(["bash", str(script)], cwd=VENDOR_DIR)


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage original ayeowch/bitnodes crawler repo.")
    parser.add_argument("command", choices=["clone", "install", "geoip", "start", "bootstrap"])

    args = parser.parse_args()

    if args.command == "clone":
        return clone()

    if args.command == "install":
        return install_requirements()

    if args.command == "geoip":
        return update_geoip()

    if args.command == "start":
        return start()

    if args.command == "bootstrap":
        code = clone()
        if code:
            return code

        code = install_requirements()
        if code:
            return code

        update_geoip()
        return start()

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
