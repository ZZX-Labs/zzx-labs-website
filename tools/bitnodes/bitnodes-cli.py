#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
DAEMON = TOOLS_DIR / "bitnodesd.py"
RUNNER = TOOLS_DIR / "run_original_bitnodes.py"


def call(args: list[str]) -> int:
    return subprocess.call([sys.executable, *args])


def main() -> int:
    parser = argparse.ArgumentParser(description="ZZX-Labs Bitnodes CLI.")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("run")
    sub.add_parser("status")
    sub.add_parser("stop")
    sub.add_parser("export-once")
    sub.add_parser("clone")
    sub.add_parser("bootstrap-original")
    sub.add_parser("start-original")

    args = parser.parse_args()

    if args.command in {"run", "status", "stop", "export-once", "clone"}:
        return call([str(DAEMON), args.command])

    if args.command == "bootstrap-original":
        return call([str(RUNNER), "bootstrap"])

    if args.command == "start-original":
        return call([str(RUNNER), "start"])

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
