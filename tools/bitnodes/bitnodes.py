#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent

GUI = TOOLS_DIR / "bitnodes-gui.py"
CLI = TOOLS_DIR / "bitnodes-cli.py"
DAEMON = TOOLS_DIR / "bitnodesd.py"
CRAWLER = TOOLS_DIR / "crawl.py"
ENRICH = TOOLS_DIR / "enrich.py"
MAPS = TOOLS_DIR / "maps.py"

DEFAULT_MODE = "gui"


def run(command: list[str]) -> int:
    process = subprocess.run(command)
    return process.returncode


def python_command(script: Path, *args: str) -> list[str]:
    return [
        sys.executable,
        str(script),
        *args,
    ]


def launch_gui(extra_args: list[str]) -> int:
    return run(
        python_command(GUI, *extra_args)
    )


def launch_cli(extra_args: list[str]) -> int:
    return run(
        python_command(CLI, *extra_args)
    )


def launch_daemon(extra_args: list[str]) -> int:
    return run(
        python_command(DAEMON, *extra_args)
    )


def launch_crawler(extra_args: list[str]) -> int:
    return run(
        python_command(CRAWLER, *extra_args)
    )


def launch_enrich(extra_args: list[str]) -> int:
    return run(
        python_command(ENRICH, *extra_args)
    )


def launch_maps(extra_args: list[str]) -> int:
    return run(
        python_command(MAPS, *extra_args)
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bitnodes.py",
        description=(
            "ZZX-Labs Bitnodes unified wrapper for GUI, CLI, daemon, "
            "crawler, enrichment, and mapping systems."
        ),
    )

    parser.add_argument(
        "mode",
        nargs="?",
        default=DEFAULT_MODE,
        choices=(
            "gui",
            "cli",
            "daemon",
            "crawl",
            "crawler",
            "enrich",
            "maps",
        ),
        help=(
            "Execution mode. "
            "Defaults to GUI mode."
        ),
    )

    parser.add_argument(
        "extra",
        nargs=argparse.REMAINDER,
        help=(
            "Additional arguments passed directly to the selected subsystem."
        ),
    )

    return parser


def normalize_mode(mode: str) -> str:
    value = str(mode).strip().lower()

    if value == "crawler":
        return "crawl"

    return value


def main() -> int:
    parser = build_parser()

    args = parser.parse_args()

    mode = normalize_mode(args.mode)

    extra_args = list(args.extra or [])

    if extra_args and extra_args[0] == "--":
        extra_args = extra_args[1:]

    if mode == "gui":
        return launch_gui(extra_args)

    if mode == "cli":
        return launch_cli(extra_args)

    if mode == "daemon":
        return launch_daemon(extra_args)

    if mode == "crawl":
        return launch_crawler(extra_args)

    if mode == "enrich":
        return launch_enrich(extra_args)

    if mode == "maps":
        return launch_maps(extra_args)

    parser.print_help()

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
