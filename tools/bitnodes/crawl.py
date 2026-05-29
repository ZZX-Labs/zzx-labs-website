#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

CRAWLER_MODULES = {
    "zzxbitnodes": TOOLS_DIR / "zzxbitnodes.py",
    "originalbitnodes": TOOLS_DIR / "originalbitnodes.py",
}

DEFAULT_CRAWLER = "zzxbitnodes"


def py(script: Path, *args: str) -> list[str]:
    return [
        sys.executable,
        str(script),
        *args,
    ]


def run_module(module_name: str, passthrough: list[str]) -> int:
    script = CRAWLER_MODULES.get(module_name)

    if script is None:
        print(f"Unknown crawler module: {module_name}", file=sys.stderr)
        return 2

    if not script.exists():
        print(f"Missing crawler module: {script}", file=sys.stderr)
        return 1

    return subprocess.call(py(script, *passthrough), cwd=str(APP_ROOT))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="crawl.py",
        description=(
            "ZZX-Labs Bitnodes crawler wrapper. Routes to zzxbitnodes.py "
            "or originalbitnodes.py while preserving passthrough arguments."
        ),
    )

    parser.add_argument(
        "--crawler",
        "--source",
        choices=sorted(CRAWLER_MODULES.keys()),
        default=DEFAULT_CRAWLER,
        help="Crawler engine to run.",
    )

    parser.add_argument(
        "--list-crawlers",
        action="store_true",
        help="List available crawler engines and exit.",
    )

    return parser


def main() -> int:
    parser = build_parser()
    args, passthrough = parser.parse_known_args()

    if args.list_crawlers:
        for name, path in CRAWLER_MODULES.items():
            status = "ok" if path.exists() else "missing"
            print(f"{name}\t{status}\t{path}")
        return 0

    return run_module(args.crawler, passthrough)


if __name__ == "__main__":
    raise SystemExit(main())
