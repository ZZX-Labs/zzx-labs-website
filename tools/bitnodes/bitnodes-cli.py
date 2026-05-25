#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
DAEMON = TOOLS_DIR / "bitnodesd.py"


VALID_COMMANDS = [
    "run",
    "status",
    "stop",
    "export-once",
    "native-crawl",
    "redis-start",
    "redis-status",
    "clone",
    "tail"
]


def call(command: list[str]) -> int:
    cmd = [
        sys.executable,
        str(DAEMON),
        *command
    ]

    return subprocess.call(cmd)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="ZZX-Labs Bitnodes CLI."
    )

    sub = parser.add_subparsers(
        dest="command",
        required=True
    )

    for name in VALID_COMMANDS:
        child = sub.add_parser(name)

        if name == "tail":
            child.add_argument(
                "--lines",
                type=int,
                default=80
            )

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    command = [args.command]

    if args.command == "tail":
        command.extend([
            "--lines",
            str(args.lines)
        ])

    return call(command)


if __name__ == "__main__":
    raise SystemExit(main())