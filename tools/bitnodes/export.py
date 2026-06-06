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
EXPORT_REDIS = TOOLS_DIR / "export_redis.py"
EXPORT_FROM_REDIS = TOOLS_DIR / "export_from_redis.py"
EXPORT_JSON = TOOLS_DIR / "export_json.py"
EXPORT_CSV = TOOLS_DIR / "export_csv.py"
EXPORT_XML = TOOLS_DIR / "export_xml.py"

BITNODES_ROOT = APP_ROOT / "bitcoin" / "bitnodes"
DEFAULT_API = BITNODES_ROOT / "api"
DEFAULT_DATA = DEFAULT_API / "data"
DEFAULT_ARCHIVE = BITNODES_ROOT / "archive"

DEFAULT_INPUTS = [
    DEFAULT_API / "aggregate" / "zzxbitnodes" / "latest.json",
    DEFAULT_API / "aggregate" / "originalbitnodes" / "latest.json",
    DEFAULT_API / "enriched" / "zzxbitnodes" / "latest.json",
    DEFAULT_API / "enriched" / "originalbitnodes" / "latest.json",
    DEFAULT_API / "zzxbitnodes" / "latest.json",
    DEFAULT_API / "originalbitnodes" / "latest.json",
    BITNODES_ROOT / "data" / "state" / "latest.json",
]

DEFAULT_DATABASE = "zzx_bitnodes"
DEFAULT_MAX_BYTES = 24_000_000


def py(script: Path, *args: str) -> list[str]:
    return [sys.executable, str(script), *args]


def call(command: list[str]) -> int:
    print("$ " + " ".join(str(part) for part in command), flush=True)
    return subprocess.call(command, cwd=str(APP_ROOT))


def require_script(path: Path) -> bool:
    if path.exists() and path.is_file():
        return True

    print(f"Missing exporter script: {path}", file=sys.stderr)
    return False


def existing_file(path: str | Path) -> Path | None:
    item = Path(path).expanduser().resolve()

    if item.exists() and item.is_file():
        return item

    return None


def default_existing_inputs() -> list[Path]:
    return [path for path in DEFAULT_INPUTS if path.exists() and path.is_file()]


def add_dataplane_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--input", action="append", default=[])
    parser.add_argument("--output-dir", default=str(DEFAULT_DATA))
    parser.add_argument("--database", default=DEFAULT_DATABASE)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--duckdb", action="store_true")
    parser.add_argument("--parquet", action="store_true")
    parser.add_argument("--no-sqlite", action="store_true")


def add_legacy_args(parser: argparse.ArgumentParser, *, archive: bool = False) -> None:
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default=str(DEFAULT_API))
    parser.add_argument("--source", default=None)
    parser.add_argument("--compact", action="store_true")

    if archive:
        parser.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE))
        parser.add_argument("--no-archive", action="store_true")
        parser.add_argument("--no-gzip", action="store_true")
        parser.add_argument("--include-group-nodes", action="store_true")
        parser.add_argument("--fanout", action="store_true")
    else:
        parser.add_argument("--no-gzip", action="store_true")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="export.py",
        description="ZZX-Labs Bitnodes export wrapper. Dataplane is canonical; JSON/CSV/XML remain legacy cache exporters.",
        allow_abbrev=False,
    )

    sub = parser.add_subparsers(dest="mode", required=True)

    dataplane = sub.add_parser("dataplane", help="Run canonical dataplane.py.")
    add_dataplane_args(dataplane)

    db = sub.add_parser("db", help="Run export_db.py directly.")
    add_dataplane_args(db)

    redis = sub.add_parser("redis", help="Export dataplane JSON into Redis rebuild artifacts.")
    redis.add_argument("--input", default=str(DEFAULT_DATA / "json" / "latest.json.gz"))
    redis.add_argument("--output-dir", default=str(DEFAULT_DATA / "redis"))
    redis.add_argument("--key-prefix", default="zzx:bitnodes")
    redis.add_argument("--compact", action="store_true")
    redis.add_argument("--import-redis", action="store_true")
    redis.add_argument("--redis-cli", default="redis-cli")

    from_redis = sub.add_parser("from-redis", aliases=["redis-ingest"], help="Ingest original/compatible Redis data into dataplane.")
    from_redis.add_argument("--output", default=str(DEFAULT_API / "originalbitnodes"))
    from_redis.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE / "originalbitnodes"))
    from_redis.add_argument("--dataplane-dir", default=str(DEFAULT_DATA))
    from_redis.add_argument("--database", default=DEFAULT_DATABASE)
    from_redis.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    from_redis.add_argument("--source", default="originalbitnodes")
    from_redis.add_argument("--scan-pattern", default="*")
    from_redis.add_argument("--scan-limit", type=int, default=250000)
    from_redis.add_argument("--compact", action="store_true")
    from_redis.add_argument("--fail-empty", action="store_true")
    from_redis.add_argument("--strict", action="store_true")

    json_parser = sub.add_parser("json", help="Legacy JSON cache export.")
    add_legacy_args(json_parser, archive=True)

    csv_parser = sub.add_parser("csv", help="Legacy CSV cache export.")
    add_legacy_args(csv_parser)

    xml_parser = sub.add_parser("xml", help="Legacy XML cache export.")
    add_legacy_args(xml_parser)

    all_parser = sub.add_parser("all", help="Run legacy JSON, CSV, and XML exports.")
    add_legacy_args(all_parser, archive=True)
    all_parser.add_argument("--keep-going", action="store_true")

    auto = sub.add_parser("auto", help="Prefer dataplane inputs, then legacy snapshot, then Redis ingest.")
    auto.add_argument("--input", action="append", default=[])
    auto.add_argument("--output", default=str(DEFAULT_API))
    auto.add_argument("--output-dir", default=str(DEFAULT_DATA))
    auto.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE))
    auto.add_argument("--database", default=DEFAULT_DATABASE)
    auto.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    auto.add_argument("--source", default=None)
    auto.add_argument("--compact", action="store_true")
    auto.add_argument("--strict", action="store_true")
    auto.add_argument("--duckdb", action="store_true")
    auto.add_argument("--parquet", action="store_true")
    auto.add_argument("--no-sqlite", action="store_true")
    auto.add_argument("--legacy-json", action="store_true")
    auto.add_argument("--legacy-all", action="store_true")
    auto.add_argument("--keep-going", action="store_true")
    auto.add_argument("--scan-pattern", default="*")
    auto.add_argument("--scan-limit", type=int, default=250000)
    auto.add_argument("--fail-empty", action="store_true")

    return parser


def resolved_inputs(args: argparse.Namespace) -> list[Path]:
    values = list(getattr(args, "input", []) or [])
    paths = [Path(value).expanduser().resolve() for value in values if value]

    existing = [path for path in paths if path.exists()]

    if existing:
        return existing

    return default_existing_inputs()


def run_dataplane(args: argparse.Namespace, *, script: Path = DATAPLANE) -> int:
    if not require_script(script):
        return 1

    inputs = resolved_inputs(args)

    command = py(
        script,
        "--output-dir", str(Path(args.output_dir).expanduser().resolve()),
        "--database", str(args.database),
        "--max-bytes", str(args.max_bytes),
    )

    for path in inputs:
        command.extend(["--input", str(path)])

    if getattr(args, "compact", False):
        command.append("--compact")

    if getattr(args, "strict", False):
        command.append("--strict")

    if getattr(args, "duckdb", False):
        command.append("--duckdb")

    if getattr(args, "parquet", False):
        command.append("--parquet")

    if getattr(args, "no_sqlite", False):
        command.append("--no-sqlite")

    return call(command)


def run_db_export(args: argparse.Namespace) -> int:
    return run_dataplane(args, script=EXPORT_DB)


def run_redis_export(args: argparse.Namespace) -> int:
    if not require_script(EXPORT_REDIS):
        return 1

    command = py(
        EXPORT_REDIS,
        "--input", str(Path(args.input).expanduser().resolve()),
        "--output-dir", str(Path(args.output_dir).expanduser().resolve()),
        "--key-prefix", str(args.key_prefix),
    )

    if getattr(args, "compact", False):
        command.append("--compact")

    if getattr(args, "import_redis", False):
        command.append("--import-redis")
        command.extend(["--redis-cli", str(args.redis_cli)])

    return call(command)


def run_from_redis(args: argparse.Namespace) -> int:
    if not require_script(EXPORT_FROM_REDIS):
        return 1

    command = py(
        EXPORT_FROM_REDIS,
        "--output", str(Path(args.output).expanduser().resolve()),
        "--archive-dir", str(Path(args.archive_dir).expanduser().resolve()),
        "--dataplane-dir", str(Path(args.dataplane_dir).expanduser().resolve()),
        "--database", str(args.database),
        "--max-bytes", str(args.max_bytes),
        "--source", str(args.source),
        "--scan-pattern", str(args.scan_pattern),
        "--scan-limit", str(args.scan_limit),
    )

    if getattr(args, "compact", False):
        command.append("--compact")

    if getattr(args, "fail_empty", False):
        command.append("--fail-empty")

    if getattr(args, "strict", False):
        command.append("--strict")

    return call(command)


def run_json_export(args: argparse.Namespace) -> int:
    if not require_script(EXPORT_JSON):
        return 1

    input_path = existing_file(args.input)

    if input_path is None:
        print(f"snapshot input does not exist: {args.input}", file=sys.stderr)
        return 1

    command = py(
        EXPORT_JSON,
        "--input", str(input_path),
        "--output", str(Path(args.output).expanduser().resolve()),
    )

    if getattr(args, "source", None):
        command.extend(["--source", str(args.source)])

    if getattr(args, "compact", False):
        command.append("--compact")

    if not getattr(args, "no_archive", False):
        command.extend(["--archive-dir", str(Path(args.archive_dir).expanduser().resolve())])
    else:
        command.append("--no-archive")

    if getattr(args, "no_gzip", False):
        command.append("--no-gzip")

    if getattr(args, "include_group_nodes", False):
        command.append("--include-group-nodes")

    if getattr(args, "fanout", False):
        command.append("--fanout")

    return call(command)


def run_csv_export(args: argparse.Namespace) -> int:
    if not require_script(EXPORT_CSV):
        return 1

    input_path = existing_file(args.input)

    if input_path is None:
        print(f"snapshot input does not exist: {args.input}", file=sys.stderr)
        return 1

    command = py(
        EXPORT_CSV,
        "--input", str(input_path),
        "--output", str(Path(args.output).expanduser().resolve()),
    )

    if getattr(args, "source", None):
        command.extend(["--source", str(args.source)])

    if getattr(args, "compact", False):
        command.append("--compact")

    if getattr(args, "no_gzip", False):
        command.append("--no-gzip")

    return call(command)


def run_xml_export(args: argparse.Namespace) -> int:
    if not require_script(EXPORT_XML):
        return 1

    input_path = existing_file(args.input)

    if input_path is None:
        print(f"snapshot input does not exist: {args.input}", file=sys.stderr)
        return 1

    command = py(
        EXPORT_XML,
        "--input", str(input_path),
        "--output", str(Path(args.output).expanduser().resolve()),
    )

    if getattr(args, "source", None):
        command.extend(["--source", str(args.source)])

    if getattr(args, "compact", False):
        command.append("--compact")

    if getattr(args, "no_gzip", False):
        command.append("--no-gzip")

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
        for name, code in failures:
            print(f"[export.py] failure: {name}={code}", file=sys.stderr)

        return failures[0][1]

    return 0


def run_auto_export(args: argparse.Namespace) -> int:
    inputs = resolved_inputs(args)

    if inputs:
        if getattr(args, "legacy_all", False):
            legacy = argparse.Namespace(
                input=str(inputs[0]),
                output=args.output,
                source=args.source,
                compact=args.compact,
                archive_dir=args.archive_dir,
                no_archive=False,
                no_gzip=False,
                include_group_nodes=False,
                fanout=False,
                keep_going=args.keep_going,
            )
            return run_all_export(legacy)

        if getattr(args, "legacy_json", False):
            legacy = argparse.Namespace(
                input=str(inputs[0]),
                output=args.output,
                source=args.source,
                compact=args.compact,
                archive_dir=args.archive_dir,
                no_archive=False,
                no_gzip=False,
                include_group_nodes=False,
                fanout=False,
            )
            return run_json_export(legacy)

        dp = argparse.Namespace(
            input=[str(path) for path in inputs],
            output_dir=args.output_dir,
            database=args.database,
            max_bytes=args.max_bytes,
            compact=args.compact,
            strict=args.strict,
            duckdb=args.duckdb,
            parquet=args.parquet,
            no_sqlite=args.no_sqlite,
        )
        return run_dataplane(dp)

    print("[export.py] no JSON inputs found; falling back to Redis ingest", flush=True)

    redis_args = argparse.Namespace(
        output=str(DEFAULT_API / "originalbitnodes"),
        archive_dir=str(DEFAULT_ARCHIVE / "originalbitnodes"),
        dataplane_dir=args.output_dir,
        database=args.database,
        max_bytes=args.max_bytes,
        source="originalbitnodes",
        scan_pattern=args.scan_pattern,
        scan_limit=args.scan_limit,
        compact=args.compact,
        fail_empty=args.fail_empty,
        strict=args.strict,
    )
    return run_from_redis(redis_args)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.mode == "dataplane":
        return run_dataplane(args)

    if args.mode == "db":
        return run_db_export(args)

    if args.mode == "redis":
        return run_redis_export(args)

    if args.mode in {"from-redis", "redis-ingest"}:
        return run_from_redis(args)

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
