#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

DATAPLANE = TOOLS_DIR / "dataplane.py"
EXPORT_DB = TOOLS_DIR / "export_db.py"
EXPORT_FROM_REDIS = TOOLS_DIR / "export_from_redis.py"
EXPORT_JSON = TOOLS_DIR / "export_json.py"
EXPORT_CSV = TOOLS_DIR / "export_csv.py"
EXPORT_XML = TOOLS_DIR / "export_xml.py"

DEFAULT_INPUT = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state" / "latest.json"
DEFAULT_OUTPUT = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_DATA_OUTPUT = APP_ROOT / "bitcoin" / "bitnodes" / "api" / "data"
DEFAULT_ARCHIVE = APP_ROOT / "bitcoin" / "bitnodes" / "archive"
DEFAULT_DATABASE = "zzx_bitnodes"
DEFAULT_MAX_BYTES = 24_000_000


def py(script: Path, *args: str) -> list[str]:
    return [sys.executable, str(script), *args]


def call(command: list[str]) -> int:
    print("$ " + " ".join(str(part) for part in command), flush=True)
    return subprocess.call(command, cwd=str(APP_ROOT))


def existing_input(path: str | Path) -> Path | None:
    item = Path(path).expanduser().resolve()

    if item.exists() and item.is_file():
        return item

    return None


def require_script(path: Path) -> bool:
    if path.exists() and path.is_file():
        return True

    print(f"Missing exporter script: {path}", file=sys.stderr)
    return False


def add_snapshot_parser_args(parser: argparse.ArgumentParser, *, include_archive: bool) -> None:
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--source", default=None)
    parser.add_argument("--compact", action="store_true")

    if include_archive:
        parser.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE))
        parser.add_argument("--no-archive", action="store_true")
        parser.add_argument("--no-gzip", action="store_true")


def add_dataplane_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--input",
        action="append",
        default=[],
        help=(
            "Input snapshot JSON file. May be supplied multiple times. "
            "Defaults to bitcoin/bitnodes/data/state/latest.json when present."
        ),
    )
    parser.add_argument("--output-dir", default=str(DEFAULT_DATA_OUTPUT))
    parser.add_argument("--database", default=DEFAULT_DATABASE)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--strict", action="store_true")


def add_common_snapshot_args(
    command: list[str],
    args: argparse.Namespace,
    *,
    include_archive: bool = False,
) -> list[str]:
    input_path = existing_input(args.input)

    if input_path is None:
        raise FileNotFoundError(f"snapshot input does not exist: {args.input}")

    command.extend(
        [
            "--input",
            str(input_path),
            "--output",
            str(Path(args.output).expanduser().resolve()),
        ]
    )

    if getattr(args, "source", None):
        command.extend(["--source", str(args.source)])

    if getattr(args, "compact", False):
        command.append("--compact")

    if include_archive:
        command.extend(
            [
                "--archive-dir",
                str(Path(args.archive_dir).expanduser().resolve()),
            ]
        )

        if getattr(args, "no_archive", False):
            command.append("--no-archive")

        if getattr(args, "no_gzip", False):
            command.append("--no-gzip")

    return command


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="export.py",
        description=(
            "ZZX-Labs Bitnodes export wrapper. Supports canonical DB-first dataplane, "
            "MariaDB/SQLite database artifacts, JSON, CSV, XML, Redis, auto, and legacy all-format exports."
        ),
    )

    sub = parser.add_subparsers(dest="mode", required=True)

    dataplane = sub.add_parser(
        "dataplane",
        help="Canonical DB-first export path. Produces DB shards plus compact JSON/CSV/XML/Redis artifacts.",
    )
    add_dataplane_args(dataplane)

    db_export = sub.add_parser(
        "db",
        help="Direct DB artifact export using export_db.py.",
    )
    add_dataplane_args(db_export)

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
        help="Legacy static JSON API export from a local Bitnodes snapshot JSON file.",
    )
    add_snapshot_parser_args(json_export, include_archive=True)

    csv_export = sub.add_parser(
        "csv",
        help="Legacy CSV export from a local Bitnodes snapshot JSON file.",
    )
    add_snapshot_parser_args(csv_export, include_archive=False)

    xml_export = sub.add_parser(
        "xml",
        help="Legacy XML export from a local Bitnodes snapshot JSON file.",
    )
    add_snapshot_parser_args(xml_export, include_archive=False)

    all_export = sub.add_parser(
        "all",
        help="Run legacy JSON, CSV, and XML exporters from a local snapshot.",
    )
    add_snapshot_parser_args(all_export, include_archive=True)
    all_export.add_argument(
        "--keep-going",
        action="store_true",
        help="Continue running later exporters even if an earlier exporter fails.",
    )

    auto = sub.add_parser(
        "auto",
        help=(
            "Canonical auto mode. Prefer dataplane when a snapshot exists; otherwise "
            "fall back to Redis export."
        ),
    )
    auto.add_argument("--input", default=str(DEFAULT_INPUT))
    auto.add_argument("--output", default=str(DEFAULT_OUTPUT))
    auto.add_argument("--output-dir", default=str(DEFAULT_DATA_OUTPUT))
    auto.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE))
    auto.add_argument("--database", default=DEFAULT_DATABASE)
    auto.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    auto.add_argument("--source", default=None)
    auto.add_argument("--compact", action="store_true")
    auto.add_argument("--strict", action="store_true")
    auto.add_argument("--scan-pattern", default="*")
    auto.add_argument("--scan-limit", type=int, default=250000)
    auto.add_argument("--fail-empty", action="store_true")
    auto.add_argument("--no-gzip", action="store_true")
    auto.add_argument(
        "--legacy-all",
        action="store_true",
        help="When snapshot input exists, run legacy JSON + CSV + XML instead of dataplane.",
    )
    auto.add_argument(
        "--legacy-json",
        action="store_true",
        help="When snapshot input exists, run only the legacy JSON exporter instead of dataplane.",
    )
    auto.add_argument(
        "--keep-going",
        action="store_true",
        help="Continue later legacy exporters even if an earlier exporter fails.",
    )

    return parser


def run_dataplane(args: argparse.Namespace, *, script: Path = DATAPLANE) -> int:
    if not require_script(script):
        return 1

    inputs = list(getattr(args, "input", []) or [])

    if not inputs and DEFAULT_INPUT.exists():
        inputs = [str(DEFAULT_INPUT)]

    command = py(
        script,
        "--output-dir",
        str(Path(args.output_dir).expanduser().resolve()),
        "--database",
        str(args.database),
        "--max-bytes",
        str(args.max_bytes),
    )

    for item in inputs:
        command.extend(["--input", str(Path(item).expanduser().resolve())])

    if getattr(args, "compact", False):
        command.append("--compact")

    if getattr(args, "strict", False):
        command.append("--strict")

    return call(command)


def run_db_export(args: argparse.Namespace) -> int:
    return run_dataplane(args, script=EXPORT_DB)


def run_redis_export(args: argparse.Namespace) -> int:
    if not require_script(EXPORT_FROM_REDIS):
        return 1

    command = py(
        EXPORT_FROM_REDIS,
        "--output",
        str(Path(args.output).expanduser().resolve()),
        "--archive-dir",
        str(Path(args.archive_dir).expanduser().resolve()),
        "--scan-pattern",
        str(args.scan_pattern),
        "--scan-limit",
        str(args.scan_limit),
    )

    if getattr(args, "compact", False):
        command.append("--compact")

    if getattr(args, "no_gzip", False):
        command.append("--no-gzip")

    if getattr(args, "fail_empty", False):
        command.append("--fail-empty")

    return call(command)


def run_json_export(args: argparse.Namespace) -> int:
    if not require_script(EXPORT_JSON):
        return 1

    try:
        command = add_common_snapshot_args(
            py(EXPORT_JSON),
            args,
            include_archive=True,
        )
    except FileNotFoundError as err:
        print(str(err), file=sys.stderr)
        return 1

    return call(command)


def run_csv_export(args: argparse.Namespace) -> int:
    if not require_script(EXPORT_CSV):
        return 1

    try:
        command = add_common_snapshot_args(
            py(EXPORT_CSV),
            args,
            include_archive=False,
        )
    except FileNotFoundError as err:
        print(str(err), file=sys.stderr)
        return 1

    return call(command)


def run_xml_export(args: argparse.Namespace) -> int:
    if not require_script(EXPORT_XML):
        return 1

    try:
        command = add_common_snapshot_args(
            py(EXPORT_XML),
            args,
            include_archive=False,
        )
    except FileNotFoundError as err:
        print(str(err), file=sys.stderr)
        return 1

    return call(command)


def run_all_export(args: argparse.Namespace) -> int:
    steps = [
        ("json", run_json_export),
        ("csv", run_csv_export),
        ("xml", run_xml_export),
    ]

    failures: list[tuple[str, int]] = []

    for name, fn in steps:
        print(f"[export.py] running {name} exporter", flush=True)
        code = fn(args)

        if code != 0:
            failures.append((name, code))
            print(f"[export.py] {name} exporter failed with exit code {code}", file=sys.stderr)

            if not getattr(args, "keep_going", False):
                return code

    if failures:
        print("[export.py] export failures:", file=sys.stderr)

        for name, code in failures:
            print(f"  {name}: {code}", file=sys.stderr)

        return failures[0][1]

    return 0


def run_auto_export(args: argparse.Namespace) -> int:
    input_path = existing_input(args.input)

    if input_path is not None:
        if getattr(args, "legacy_all", False):
            return run_all_export(args)

        if getattr(args, "legacy_json", False):
            return run_json_export(args)

        dp_args = argparse.Namespace(
            input=[str(input_path)],
            output_dir=args.output_dir,
            database=args.database,
            max_bytes=args.max_bytes,
            compact=args.compact,
            strict=args.strict,
        )
        return run_dataplane(dp_args)

    print(f"JSON input missing; falling back to Redis export: {args.input}", flush=True)
    return run_redis_export(args)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.mode == "dataplane":
        return run_dataplane(args)

    if args.mode == "db":
        return run_db_export(args)

    if args.mode == "redis":
        return run_redis_export(args)

    if args.mode == "json":
        return run_json_export(args)

    if args.mode == "csv":
        return run_csv_export(args)

    if args.mode == "xml":
        return run_xml_export(args)

    if args.mode == "all":
        return run_all_export(args)

    if args.mode == "auto":
        return run_auto_export(args)

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
