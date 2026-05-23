#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
DAEMON = TOOLS_DIR / "bitnodesd.py"


def call(command: list[str]) -> int:
    return subprocess.call([sys.executable, str(DAEMON), *command])


def main() -> int:
    parser = argparse.ArgumentParser(description="ZZX-Labs Bitnodes CLI.")
    sub = parser.add_subparsers(dest="command", required=True)

    for name in [
        "run",
        "status",
        "stop",
        "export-once",
        "redis-start",
        "redis-status",
        "native-crawl",
        "clone"
    ]:
        sub.add_parser(name)

    args = parser.parse_args()
    return call([args.command])


if __name__ == "__main__":
    raise SystemExit(main())
