#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"


def run_module(module_name: str, passthrough: list[str]) -> int:
    script = TOOLS_DIR / f"{module_name}.py"

    if not script.exists():
        print(f"Missing crawler module: {script}")
        return 1

    return subprocess.call(
        [
            sys.executable,
            str(script),
            *passthrough
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="ZZX-Labs Bitnodes crawler wrapper."
    )

    parser.add_argument(
        "--crawler",
        "--source",
        choices=[
            "zzxbitnodes",
            "originalbitnodes"
        ],
        default="zzxbitnodes",
        help="Crawler engine to run."
    )

    args, passthrough = parser.parse_known_args()

    return run_module(
        args.crawler,
        passthrough
    )


if __name__ == "__main__":
    raise SystemExit(main())
