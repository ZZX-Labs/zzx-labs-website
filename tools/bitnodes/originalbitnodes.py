#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import zzxbitnodes


RUN_ORIGINAL = TOOLS_DIR / "run_original_bitnodes.py"
EXPORT_FROM_REDIS = TOOLS_DIR / "export_from_redis.py"
ENRICH = TOOLS_DIR / "enrich.py"
AGGREGATE = TOOLS_DIR / "aggregate.py"
CHUNK_REGISTRY_BACKUP = TOOLS_DIR / "chunk_registry_backup.py"
UPDATE_DAILY_INDEX = TOOLS_DIR / "update_daily_index.py"
PUSH_SNAPSHOTS = TOOLS_DIR / "push_snapshots.py"

BITNODES_ROOT = APP_ROOT / "bitcoin" / "bitnodes"

ORIGINAL_OUTPUT = BITNODES_ROOT / "api" / "originalbitnodes"
ORIGINAL_ARCHIVE = BITNODES_ROOT / "archive" / "originalbitnodes"
ORIGINAL_STATE = BITNODES_ROOT / "data" / "state" / "originalbitnodes"
ORIGINAL_SNAPSHOT_24H = BITNODES_ROOT / "data" / "snapshots" / "24h" / "originalbitnodes"
ORIGINAL_SEEDERS = BITNODES_ROOT / "data" / "seeders" / "originalbitnodes"

ORIGINAL_ENRICHED_DIR = BITNODES_ROOT / "api" / "enriched" / "originalbitnodes"
ORIGINAL_ENRICHED_LATEST = ORIGINAL_ENRICHED_DIR / "latest.json"
ORIGINAL_ENRICHMENT_REPORT = ORIGINAL_ENRICHED_DIR / "enrichment-report.json"

ORIGINAL_AGGREGATE_DIR = BITNODES_ROOT / "api" / "aggregate" / "originalbitnodes"
ORIGINAL_AGGREGATE_LATEST = ORIGINAL_AGGREGATE_DIR / "latest.json"

ORIGINAL_REGISTRY_DIR = BITNODES_ROOT / "registry" / "originalbitnodes"
ORIGINAL_REGISTRY_LATEST_DIR = ORIGINAL_REGISTRY_DIR / "latest"


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def py(script: Path, *args: str) -> list[str]:
    return [
        sys.executable,
        str(script),
        *args,
    ]


def run_command(command: list[str], *, cwd: Path = APP_ROOT, check: bool = False) -> subprocess.CompletedProcess[str]:
    print("$ " + " ".join(str(part) for part in command))

    result = subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    if result.stdout.strip():
        print(result.stdout.strip())

    if result.stderr.strip():
        print(result.stderr.strip())

    if check and result.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(command)}")

    return result


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, pretty: bool = True) -> None:
    mkdir(path.parent)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            ensure_ascii=False,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
            sort_keys=pretty,
        )
        handle.write("\n")


def mirror_original_latest_to_legacy(pretty: bool = True) -> None:
    latest = ORIGINAL_OUTPUT / "latest.json"

    if not latest.exists():
        return

    payload = read_json(latest, fallback={})

    if not isinstance(payload, dict) or not payload:
        return

    payload["source"] = "originalbitnodes"
    payload["crawler"] = "originalbitnodes"
    payload["compatibility"] = {
        "mode": "original-bitnodes-compatible",
        "note": "This data set is generated through the Original Bitnodes-compatible crawler/export path.",
    }

    write_json(
        BITNODES_ROOT / "api" / "original-latest.json",
        payload,
        pretty=pretty,
    )


def run_classic_original_crawler(args: argparse.Namespace) -> int:
    if not RUN_ORIGINAL.exists():
        print(f"[originalbitnodes] missing classic runner: {RUN_ORIGINAL}")
        return 1

    command = py(
        RUN_ORIGINAL,
        "--output",
        str(ORIGINAL_OUTPUT),
        "--archive-dir",
        str(ORIGINAL_ARCHIVE),
        "--state-dir",
        str(ORIGINAL_STATE),
        "--snapshot-24h-dir",
        str(ORIGINAL_SNAPSHOT_24H),
        "--seeder-dir",
        str(ORIGINAL_SEEDERS),
        "--limit",
        str(args.limit),
        "--batch-size",
        str(args.batch_size),
        "--timeout",
        str(args.timeout),
        "--workers",
        str(args.workers),
        "--getaddr-rounds",
        str(args.getaddr_rounds),
        "--dns-seed-limit",
        str(args.dns_seed_limit),
        "--export-mode",
        args.export_mode,
    )

    if args.compact:
        command.append("--compact")

    if args.disable_geoip:
        command.append("--disable-geoip")

    if args.raw_output:
        command.extend(["--raw-output", args.raw_output])

    if args.mirror_legacy_api:
        command.append("--mirror-legacy-api")

    return run_command(command).returncode


def run_redis_export(args: argparse.Namespace) -> int:
    if not EXPORT_FROM_REDIS.exists():
        print(f"[originalbitnodes] missing Redis exporter: {EXPORT_FROM_REDIS}")
        return 1

    command = py(
        EXPORT_FROM_REDIS,
        "--output",
        str(ORIGINAL_OUTPUT),
        "--archive-dir",
        str(ORIGINAL_ARCHIVE),
    )

    if args.compact:
        command.append("--compact")

    if args.no_gzip:
        command.append("--no-gzip")

    if args.fail_empty:
        command.append("--fail-empty")

    if args.redis_scan_pattern:
        command.extend(["--scan-pattern", args.redis_scan_pattern])

    if args.redis_scan_limit:
        command.extend(["--scan-limit", str(args.redis_scan_limit)])

    return run_command(command).returncode


def run_zzx_compatible_original(args: argparse.Namespace) -> int:
    args.output = str(ORIGINAL_OUTPUT)
    args.archive_dir = str(ORIGINAL_ARCHIVE)
    args.state_dir = str(ORIGINAL_STATE)
    args.snapshot_24h_dir = str(ORIGINAL_SNAPSHOT_24H)
    args.seeder_dir = str(ORIGINAL_SEEDERS)

    args.disable_archive_replay = True
    args.archive_replay_files = 0

    args.export_mode = "reachable" if not args.export_mode else args.export_mode
    args.timeout = min(float(args.timeout), 5.0)
    args.workers = min(int(args.workers), 256)
    args.batch_size = min(int(args.batch_size), 4096)
    args.getaddr_rounds = min(int(args.getaddr_rounds), 16)
    args.dns_seed_limit = min(int(args.dns_seed_limit), 4096)

    args.registry_root = str(ORIGINAL_REGISTRY_DIR)
    args.registry_latest_dir = str(ORIGINAL_REGISTRY_LATEST_DIR)

    return zzxbitnodes.run_from_args(args)


def run_enrichment(args: argparse.Namespace) -> int:
    input_path = ORIGINAL_OUTPUT / "latest.json"

    if not input_path.exists():
        print(f"[originalbitnodes] enrichment skipped; missing {input_path}")
        return 0

    command = py(
        ENRICH,
        "--input",
        str(input_path),
        "--output",
        str(ORIGINAL_ENRICHED_LATEST),
        "--report",
        str(ORIGINAL_ENRICHMENT_REPORT),
        "--source",
        "originalbitnodes",
        "--api-dir",
        str(BITNODES_ROOT / "api"),
        "--state-dir",
        str(ORIGINAL_STATE),
    )

    if args.enrich_modules:
        command.extend(["--modules", args.enrich_modules])

    if args.strict:
        command.append("--strict")

    return run_command(command).returncode


def run_aggregate(args: argparse.Namespace) -> int:
    input_path = ORIGINAL_ENRICHED_LATEST if ORIGINAL_ENRICHED_LATEST.exists() else ORIGINAL_OUTPUT / "latest.json"

    if not input_path.exists():
        print(f"[originalbitnodes] aggregate skipped; missing {input_path}")
        return 0

    command = py(
        AGGREGATE,
        "--input",
        str(input_path),
        "--output",
        str(ORIGINAL_AGGREGATE_LATEST),
        "--api-dir",
        str(BITNODES_ROOT / "api"),
        "--state-dir",
        str(ORIGINAL_STATE),
        "--source",
        "originalbitnodes",
    )

    return run_command(command).returncode


def run_registry_backup(args: argparse.Namespace) -> int:
    if not args.registry_backup:
        return 0

    dated = ORIGINAL_REGISTRY_DIR / zzxbitnodes.datetime_date_slug()

    command = py(
        CHUNK_REGISTRY_BACKUP,
        "--input",
        str(ORIGINAL_ARCHIVE),
        "--api",
        str(BITNODES_ROOT / "api"),
        "--output",
        str(dated),
        "--latest-output",
        str(ORIGINAL_REGISTRY_LATEST_DIR),
    )

    code = run_command(command).returncode

    if code != 0:
        return code

    command = py(
        UPDATE_DAILY_INDEX,
        "--repo-root",
        str(ORIGINAL_REGISTRY_DIR),
    )

    return run_command(command).returncode


def push_snapshots(args: argparse.Namespace) -> int:
    if not args.git_push:
        return 0

    command = py(
        PUSH_SNAPSHOTS,
        "--message",
        "Update Original Bitnodes-compatible snapshots",
        "--paths",
        "bitcoin/bitnodes/api/originalbitnodes",
        "bitcoin/bitnodes/api/enriched/originalbitnodes",
        "bitcoin/bitnodes/api/aggregate/originalbitnodes",
        "bitcoin/bitnodes/archive/originalbitnodes",
        "bitcoin/bitnodes/data/state/originalbitnodes",
        "bitcoin/bitnodes/data/snapshots/24h/originalbitnodes",
        "bitcoin/bitnodes/registry/originalbitnodes",
    )

    return run_command(command).returncode


def pipeline_once(args: argparse.Namespace) -> int:
    for path in (
        ORIGINAL_OUTPUT,
        ORIGINAL_ARCHIVE,
        ORIGINAL_STATE,
        ORIGINAL_SNAPSHOT_24H,
        ORIGINAL_SEEDERS,
        ORIGINAL_ENRICHED_DIR,
        ORIGINAL_AGGREGATE_DIR,
    ):
        mkdir(path)

    if args.original_mode == "classic":
        code = run_classic_original_crawler(args)
    elif args.original_mode == "redis":
        code = run_redis_export(args)
    elif args.original_mode == "hybrid":
        code = run_classic_original_crawler(args)

        if code != 0:
            print("[originalbitnodes] classic path failed; attempting Redis export fallback.")
            code = run_redis_export(args)

        if code != 0:
            print("[originalbitnodes] Redis path failed; attempting ZZX-compatible fallback.")
            code = run_zzx_compatible_original(args)
    else:
        code = run_zzx_compatible_original(args)

    if code != 0:
        return code

    mirror_original_latest_to_legacy(pretty=not args.compact)

    if not args.no_enrich_after:
        code = run_enrichment(args)
        if code != 0 and args.strict:
            return code

    if not args.no_aggregate_after:
        code = run_aggregate(args)
        if code != 0 and args.strict:
            return code

    code = run_registry_backup(args)
    if code != 0 and args.strict:
        return code

    return push_snapshots(args)


def daemon_loop(args: argparse.Namespace) -> int:
    import time

    started = time.time()

    while True:
        if args.run_seconds > 0 and time.time() - started >= args.run_seconds:
            print(f"[originalbitnodes] run_seconds reached: {args.run_seconds}")
            return 0

        try:
            code = pipeline_once(args)

            if code != 0:
                print(f"[originalbitnodes] cycle failed with code {code}")

                if args.strict:
                    return code

        except KeyboardInterrupt:
            raise
        except Exception as exc:
            print(f"[originalbitnodes] cycle error: {exc}")

            if args.strict:
                return 1

        if args.run_seconds > 0 and time.time() - started >= args.run_seconds:
            return 0

        time.sleep(args.interval)


def build_parser() -> argparse.ArgumentParser:
    parser = zzxbitnodes.build_parser(
        description=(
            "Original Bitnodes-compatible crawler mode. "
            "Runs the original-compatible crawler path, Redis export path, "
            "or ZZX-compatible fallback while keeping outputs separate from zzxbitnodes."
        )
    )

    parser.set_defaults(
        output=str(ORIGINAL_OUTPUT),
        archive_dir=str(ORIGINAL_ARCHIVE),
        state_dir=str(ORIGINAL_STATE),
        snapshot_24h_dir=str(ORIGINAL_SNAPSHOT_24H),
        seeder_dir=str(ORIGINAL_SEEDERS),
    )

    parser.add_argument(
        "--original-mode",
        choices=["hybrid", "classic", "redis", "zzx-compatible"],
        default="hybrid",
        help=(
            "Original crawler path. hybrid tries run_original_bitnodes.py, then Redis export, "
            "then the ZZX-compatible crawler with original-compatible settings."
        ),
    )

    parser.add_argument(
        "--enrich-modules",
        default="",
        help="Optional comma-separated module list for enrich.py after original crawl/export.",
    )

    parser.add_argument(
        "--redis-scan-pattern",
        default="*",
        help="Redis scan pattern for original Redis-backed export mode.",
    )

    parser.add_argument(
        "--redis-scan-limit",
        type=int,
        default=250000,
        help="Maximum Redis keys to scan in redis/hybrid fallback mode.",
    )

    parser.add_argument(
        "--no-gzip",
        action="store_true",
        help="Disable gzip archive output when using Redis export mode.",
    )

    parser.add_argument(
        "--fail-empty",
        action="store_true",
        help="Fail Redis export instead of emitting an empty API when Redis is unavailable.",
    )

    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail immediately when post-processing fails.",
    )

    return parser


def normalize_original_args(args: argparse.Namespace) -> argparse.Namespace:
    args.output = str(ORIGINAL_OUTPUT)
    args.archive_dir = str(ORIGINAL_ARCHIVE)
    args.state_dir = str(ORIGINAL_STATE)
    args.snapshot_24h_dir = str(ORIGINAL_SNAPSHOT_24H)
    args.seeder_dir = str(ORIGINAL_SEEDERS)

    args.export_mode = "reachable"

    args.timeout = min(float(args.timeout), 5.0)
    args.workers = min(int(args.workers), 256)
    args.batch_size = min(int(args.batch_size), 4096)
    args.getaddr_rounds = min(int(args.getaddr_rounds), 16)
    args.dns_seed_limit = min(int(args.dns_seed_limit), 4096)
    args.archive_replay_files = 0
    args.disable_archive_replay = True

    args.registry_root = str(ORIGINAL_REGISTRY_DIR)
    args.registry_latest_dir = str(ORIGINAL_REGISTRY_LATEST_DIR)

    return args


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    args = normalize_original_args(args)

    if args.daemon:
        return daemon_loop(args)

    return pipeline_once(args)


if __name__ == "__main__":
    raise SystemExit(main())
