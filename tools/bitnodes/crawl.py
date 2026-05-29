#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
import time
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

    return subprocess.call(
        py(script, *passthrough),
        cwd=str(APP_ROOT),
    )


def split_passthrough_for_both(passthrough: list[str]) -> tuple[list[str], list[str]]:
    zzx_args = list(passthrough)
    original_args = list(passthrough)

    if "--original-mode" not in original_args:
        original_args.extend(["--original-mode", "hybrid"])

    return zzx_args, original_args


def run_both(passthrough: list[str], continue_on_error: bool = True) -> int:
    zzx_args, original_args = split_passthrough_for_both(passthrough)

    print("[crawl.py] running zzxbitnodes", flush=True)
    zzx_code = run_module("zzxbitnodes", zzx_args)

    if zzx_code != 0 and not continue_on_error:
        return zzx_code

    print("[crawl.py] running originalbitnodes", flush=True)
    original_code = run_module("originalbitnodes", original_args)

    if zzx_code != 0:
        return zzx_code

    return original_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="crawl.py",
        description=(
            "ZZX-Labs Bitnodes crawler wrapper. Routes to zzxbitnodes.py, "
            "originalbitnodes.py, or both while preserving passthrough arguments."
        ),
    )

    parser.add_argument(
        "--crawler",
        "--source",
        choices=["zzxbitnodes", "originalbitnodes", "both"],
        default=DEFAULT_CRAWLER,
        help="Crawler engine to run.",
    )

    parser.add_argument(
        "--list-crawlers",
        action="store_true",
        help="List available crawler engines and exit.",
    )

    parser.add_argument(
        "--wrapper-daemon",
        action="store_true",
        help="Run the selected crawler wrapper repeatedly.",
    )

    parser.add_argument(
        "--wrapper-interval",
        type=int,
        default=3600,
        help="Seconds between wrapper daemon cycles.",
    )

    parser.add_argument(
        "--wrapper-run-seconds",
        type=int,
        default=0,
        help="Maximum wrapper daemon runtime. 0 means unlimited.",
    )

    parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Stop both-mode execution if the first crawler fails.",
    )

    return parser


def run_once(args: argparse.Namespace, passthrough: list[str]) -> int:
    if args.crawler == "both":
        return run_both(
            passthrough,
            continue_on_error=not args.stop_on_error,
        )

    return run_module(args.crawler, passthrough)


def daemon_loop(args: argparse.Namespace, passthrough: list[str]) -> int:
    started = time.time()

    while True:
        if args.wrapper_run_seconds > 0 and time.time() - started >= args.wrapper_run_seconds:
            return 0

        code = run_once(args, passthrough)

        if code != 0 and args.stop_on_error:
            return code

        if args.wrapper_run_seconds > 0 and time.time() - started >= args.wrapper_run_seconds:
            return 0

        time.sleep(max(1, args.wrapper_interval))


def main() -> int:
    parser = build_parser()
    args, passthrough = parser.parse_known_args()

    if args.list_crawlers:
        for name, path in CRAWLER_MODULES.items():
            status = "ok" if path.exists() else "missing"
            print(f"{name}\t{status}\t{path}")

        print("both\tvirtual\tzzxbitnodes -> originalbitnodes")
        return 0

    if args.wrapper_daemon:
        return daemon_loop(args, passthrough)

    return run_once(args, passthrough)


if __name__ == "__main__":
    raise SystemExit(main())
