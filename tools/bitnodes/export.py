#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

EXPORT_FROM_REDIS = TOOLS_DIR / "export_from_redis.py"
EXPORT_JSON = TOOLS_DIR / "export_json.py"

DEFAULT_INPUT = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state" / "latest.json"
DEFAULT_OUTPUT = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_ARCHIVE = APP_ROOT / "bitcoin" / "bitnodes" / "archive"


def py(script: Path, *args: str) -> list[str]:
    return [
        sys.executable,
        str(script),
        *args,
    ]


def call(command: list[str]) -> int:
    print("$ " + " ".join(str(part) for part in command), flush=True)
    return subprocess.call(command, cwd=str(APP_ROOT))


def existing_input(path: str | Path) -> Path | None:
    item = Path(path).resolve()

    if item.exists() and item.is_file():
        return item

    return None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="export.py",
        description="ZZX-Labs Bitnodes export wrapper for Redis and static JSON exporters.",
    )

    sub = parser.add_subparsers(dest="mode", required=True)

    redis_export = sub.add_parser(
        "redis",
        help="Export from original/compatible Redis-backed Bitnodes data.",
    )

    redis_export.add_argument("--output", default=str(DEFAULT_OUTPUT))
    redis_export.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE))
    redis_export.add_argument("--scan-pattern", default="*")
    redis_export.add_argument("--scan-limit", type=int, default=250000)
    redis_export.add_argument("--compact", action="store_true")
    redis_export.add_argument("--no-gzip", action="store_true")
    redis_export.add_argument("--fail-empty", action="store_true")

    json_export = sub.add_parser(
        "json",
        help="Export from a local Bitnodes snapshot JSON file.",
    )

    json_export.add_argument("--input", default=str(DEFAULT_INPUT))
    json_export.add_argument("--output", default=str(DEFAULT_OUTPUT))
    json_export.add_argument("--source", default=None)
    json_export.add_argument("--compact", action="store_true")
    json_export.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE))
    json_export.add_argument("--no-archive", action="store_true")
    json_export.add_argument("--no-gzip", action="store_true")

    auto = sub.add_parser(
        "auto",
        help="Prefer JSON export when input exists; otherwise fall back to Redis export.",
    )

    auto.add_argument("--input", default=str(DEFAULT_INPUT))
    auto.add_argument("--output", default=str(DEFAULT_OUTPUT))
    auto.add_argument("--source", default=None)
    auto.add_argument("--compact", action="store_true")
    auto.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE))
    auto.add_argument("--no-archive", action="store_true")
    auto.add_argument("--no-gzip", action="store_true")
    auto.add_argument("--scan-pattern", default="*")
    auto.add_argument("--scan-limit", type=int, default=250000)
    auto.add_argument("--fail-empty", action="store_true")

    return parser


def run_redis_export(args: argparse.Namespace) -> int:
    command = py(
        EXPORT_FROM_REDIS,
        "--output",
        str(Path(args.output).resolve()),
        "--archive-dir",
        str(Path(args.archive_dir).resolve()),
        "--scan-pattern",
        str(args.scan_pattern),
        "--scan-limit",
        str(args.scan_limit),
    )

    if args.compact:
        command.append("--compact")

    if args.no_gzip:
        command.append("--no-gzip")

    if args.fail_empty:
        command.append("--fail-empty")

    return call(command)


def run_json_export(args: argparse.Namespace) -> int:
    input_path = existing_input(args.input)

    if input_path is None:
        print(f"JSON input does not exist: {args.input}", file=sys.stderr)
        return 1

    command = py(
        EXPORT_JSON,
        "--input",
        str(input_path),
        "--output",
        str(Path(args.output).resolve()),
        "--archive-dir",
        str(Path(args.archive_dir).resolve()),
    )

    if args.source:
        command.extend(["--source", str(args.source)])

    if args.compact:
        command.append("--compact")

    if args.no_archive:
        command.append("--no-archive")

    if args.no_gzip:
        command.append("--no-gzip")

    return call(command)


def run_auto_export(args: argparse.Namespace) -> int:
    input_path = existing_input(args.input)

    if input_path is not None:
        return run_json_export(args)

    print(f"JSON input missing; falling back to Redis export: {args.input}")
    return run_redis_export(args)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.mode == "redis":
        return run_redis_export(args)

    if args.mode == "json":
        return run_json_export(args)

    if args.mode == "auto":
        return run_auto_export(args)

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
