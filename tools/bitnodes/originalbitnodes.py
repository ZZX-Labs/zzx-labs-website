#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import zzxbitnodes


RUN_ORIGINAL = TOOLS_DIR / "run_original_bitnodes.py"
EXPORT = TOOLS_DIR / "export.py"
EXPORT_FROM_REDIS = TOOLS_DIR / "export_from_redis.py"
ENRICH = TOOLS_DIR / "enrich.py"
AGGREGATE = TOOLS_DIR / "aggregate.py"
CHUNK_REGISTRY_BACKUP = TOOLS_DIR / "chunk_registry_backup.py"
UPDATE_DAILY_INDEX = TOOLS_DIR / "update_daily_index.py"
PUSH_SNAPSHOTS = TOOLS_DIR / "push_snapshots.py"

BITNODES_ROOT = APP_ROOT / "bitcoin" / "bitnodes"

DATA_DIR = BITNODES_ROOT / "data"
API_DIR = BITNODES_ROOT / "api"
ARCHIVE_DIR = BITNODES_ROOT / "archive"

SNAPSHOTS_ROOT = DATA_DIR / "snapshots"
SNAPSHOT_BUCKETS = ("24h", "week", "monthly", "quarterly", "yearly", "all-time")

SOURCE = "originalbitnodes"

ORIGINAL_OUTPUT = API_DIR / SOURCE
ORIGINAL_ARCHIVE = ARCHIVE_DIR / SOURCE
ORIGINAL_STATE = DATA_DIR / "state" / SOURCE
ORIGINAL_SNAPSHOT_24H = SNAPSHOTS_ROOT / "24h" / SOURCE
ORIGINAL_SEEDERS = DATA_DIR / "seeders" / SOURCE

ORIGINAL_ENRICHED_DIR = API_DIR / "enriched" / SOURCE
ORIGINAL_ENRICHED_LATEST = ORIGINAL_ENRICHED_DIR / "latest.json"
ORIGINAL_ENRICHMENT_REPORT = ORIGINAL_ENRICHED_DIR / "enrichment-report.json"

ORIGINAL_AGGREGATE_DIR = API_DIR / "aggregate" / SOURCE
ORIGINAL_AGGREGATE_LATEST = ORIGINAL_AGGREGATE_DIR / "latest.json"

ORIGINAL_REGISTRY_DIR = DATA_DIR / "registry" / SOURCE
ORIGINAL_REGISTRY_LATEST_DIR = ORIGINAL_REGISTRY_DIR / "latest"


def printf(message: str) -> None:
    print(message, flush=True)


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def py(script: Path, *args: str) -> list[str]:
    return [sys.executable, str(script), *args]


def run_command(
    command: list[str],
    *,
    cwd: Path = APP_ROOT,
    check: bool = False,
) -> subprocess.CompletedProcess[str]:
    printf("$ " + " ".join(str(part) for part in command))

    result = subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    if result.stdout.strip():
        printf(result.stdout.strip())

    if result.stderr.strip():
        printf(result.stderr.strip())

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


def ensure_layout() -> None:
    for path in (
        DATA_DIR,
        API_DIR,
        ARCHIVE_DIR,
        ORIGINAL_OUTPUT,
        ORIGINAL_ARCHIVE,
        ORIGINAL_STATE,
        ORIGINAL_SNAPSHOT_24H,
        ORIGINAL_SEEDERS,
        ORIGINAL_ENRICHED_DIR,
        ORIGINAL_AGGREGATE_DIR,
        ORIGINAL_REGISTRY_DIR,
        ORIGINAL_REGISTRY_LATEST_DIR,
    ):
        mkdir(path)

    for bucket in SNAPSHOT_BUCKETS:
        mkdir(SNAPSHOTS_ROOT / bucket / SOURCE)


def latest_node_count(path: Path) -> int:
    payload = read_json(path, fallback={})

    if isinstance(payload, list):
        return len(payload)

    if not isinstance(payload, dict):
        return 0

    for key in ("nodes", "results", "rows", "data", "reachable", "node_records", "peers"):
        value = payload.get(key)

        if isinstance(value, dict):
            return len(value)

        if isinstance(value, list):
            return len(value)

    return 0


def original_latest_has_nodes() -> bool:
    return latest_node_count(ORIGINAL_OUTPUT / "latest.json") > 0


def mirror_original_latest_to_legacy(pretty: bool = True) -> None:
    latest = ORIGINAL_OUTPUT / "latest.json"

    if not latest.exists():
        return

    payload = read_json(latest, fallback={})

    if not isinstance(payload, dict) or not payload:
        return

    payload["source"] = SOURCE
    payload["crawler"] = SOURCE
    payload["compatibility"] = {
        "mode": "original-bitnodes-compatible",
        "note": "Original Bitnodes-compatible data path with ZZX fallback safety.",
    }

    write_json(API_DIR / "original-latest.json", payload, pretty=pretty)


def copy_latest_to_snapshot_buckets(pretty: bool = True) -> None:
    latest = ORIGINAL_OUTPUT / "latest.json"

    if not latest.exists():
        return

    payload = read_json(latest, fallback={})

    if not isinstance(payload, dict) or not payload:
        return

    zzxbitnodes.write_bucket_snapshots(SOURCE, payload, pretty=pretty)


def run_classic_original_crawler(args: argparse.Namespace) -> int:
    if not RUN_ORIGINAL.exists():
        printf(f"[originalbitnodes] missing classic runner: {RUN_ORIGINAL}")
        return 1

    command = py(
        RUN_ORIGINAL,
        "pipeline",
        "--mode",
        "classic",
        "--ensure-source",
        "--repo",
        "https://github.com/ayeowch/bitnodes",
        "--branch",
        "master",
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
    )

    if args.compact:
        command.append("--compact")

    if getattr(args, "strict", False):
        command.append("--strict")

    return run_command(command).returncode


def run_redis_export(args: argparse.Namespace) -> int:
    if not EXPORT_FROM_REDIS.exists():
        printf(f"[originalbitnodes] missing Redis exporter: {EXPORT_FROM_REDIS}")
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

    args.export_mode = "reachable"
    args.timeout = min(float(args.timeout), 5.0)
    args.workers = min(int(args.workers), 256)
    args.batch_size = min(int(args.batch_size), 4096)
    args.getaddr_rounds = min(int(args.getaddr_rounds), 16)
    args.dns_seed_limit = min(int(args.dns_seed_limit), 4096)

    args.registry_root = str(ORIGINAL_REGISTRY_DIR)
    args.registry_latest_dir = str(ORIGINAL_REGISTRY_LATEST_DIR)

    args.no_export_all_after = getattr(args, "no_export_all_after", False)
    args.build_maps = getattr(args, "build_maps", False)
    args.enrich_modules = getattr(args, "enrich_modules", "")

    return zzxbitnodes.run_from_args(args)


def run_enrichment(args: argparse.Namespace) -> int:
    input_path = ORIGINAL_OUTPUT / "latest.json"

    if not input_path.exists():
        printf(f"[originalbitnodes] enrichment skipped; missing {input_path}")
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
        SOURCE,
        "--api-dir",
        str(API_DIR),
        "--state-dir",
        str(ORIGINAL_STATE),
    )

    if args.enrich_modules:
        command.extend(["--modules", args.enrich_modules])

    if args.compact:
        command.append("--compact")

    if args.strict:
        command.append("--strict")

    return run_command(command).returncode


def run_aggregate(args: argparse.Namespace) -> int:
    input_path = ORIGINAL_ENRICHED_LATEST if ORIGINAL_ENRICHED_LATEST.exists() else ORIGINAL_OUTPUT / "latest.json"

    if not input_path.exists():
        printf(f"[originalbitnodes] aggregate skipped; missing {input_path}")
        return 0

    command = py(
        AGGREGATE,
        "--input",
        str(input_path),
        "--output",
        str(ORIGINAL_AGGREGATE_LATEST),
        "--api-dir",
        str(API_DIR),
        "--state-dir",
        str(ORIGINAL_STATE),
        "--source",
        SOURCE,
    )

    return run_command(command).returncode


def run_all_exports(args: argparse.Namespace) -> int:
    if not EXPORT.exists():
        return 0

    input_path = ORIGINAL_AGGREGATE_LATEST if ORIGINAL_AGGREGATE_LATEST.exists() else ORIGINAL_ENRICHED_LATEST

    if not input_path.exists():
        input_path = ORIGINAL_OUTPUT / "latest.json"

    if not input_path.exists():
        printf(f"[originalbitnodes] all export skipped; missing {input_path}")
        return 0

    command = py(
        EXPORT,
        "all",
        "--input",
        str(input_path),
        "--output",
        str(ORIGINAL_OUTPUT),
        "--archive-dir",
        str(ORIGINAL_ARCHIVE),
        "--source",
        SOURCE,
        "--keep-going",
    )

    if args.compact:
        command.append("--compact")

    return run_command(command).returncode


def run_registry_backup(args: argparse.Namespace) -> int:
    if not args.registry_backup:
        return 0

    dated = ORIGINAL_REGISTRY_DIR / zzxbitnodes.date_slug()

    command = py(
        CHUNK_REGISTRY_BACKUP,
        "--input",
        str(ORIGINAL_ARCHIVE),
        "--api",
        str(API_DIR),
        "--output",
        str(dated),
        "--latest-output",
        str(ORIGINAL_REGISTRY_LATEST_DIR),
        "--max-mb",
        "24",
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
        "bitcoin/bitnodes/data/snapshots/week/originalbitnodes",
        "bitcoin/bitnodes/data/snapshots/monthly/originalbitnodes",
        "bitcoin/bitnodes/data/snapshots/quarterly/originalbitnodes",
        "bitcoin/bitnodes/data/snapshots/yearly/originalbitnodes",
        "bitcoin/bitnodes/data/snapshots/all-time/originalbitnodes",
        "bitcoin/bitnodes/data/registry/originalbitnodes",
    )

    return run_command(command).returncode


def pipeline_once(args: argparse.Namespace) -> int:
    ensure_layout()

    if args.original_mode == "classic":
        code = run_classic_original_crawler(args)

    elif args.original_mode == "redis":
        code = run_redis_export(args)

        if code == 0 and not original_latest_has_nodes():
            printf("[originalbitnodes] Redis export produced 0 nodes.")
            code = 1

    elif args.original_mode == "hybrid":
        code = run_classic_original_crawler(args)

        if code != 0 or not original_latest_has_nodes():
            printf("[originalbitnodes] classic path failed or produced 0 nodes; attempting Redis export fallback.")
            code = run_redis_export(args)

        if code == 0 and not original_latest_has_nodes():
            printf("[originalbitnodes] Redis fallback produced 0 nodes; attempting ZZX-compatible fallback.")
            code = run_zzx_compatible_original(args)

    else:
        code = run_zzx_compatible_original(args)

    if code != 0:
        return code

    mirror_original_latest_to_legacy(pretty=not args.compact)
    copy_latest_to_snapshot_buckets(pretty=not args.compact)

    if not args.no_enrich_after:
        code = run_enrichment(args)
        if code != 0 and args.strict:
            return code

    if not args.no_aggregate_after:
        code = run_aggregate(args)
        if code != 0 and args.strict:
            return code

    if not args.no_export_all_after:
        code = run_all_exports(args)
        if code != 0 and args.strict:
            return code

    code = run_registry_backup(args)
    if code != 0 and args.strict:
        return code

    return push_snapshots(args)


def daemon_loop(args: argparse.Namespace) -> int:
    started = time.time()

    while True:
        if args.run_seconds > 0 and time.time() - started >= args.run_seconds:
            printf(f"[originalbitnodes] run_seconds reached: {args.run_seconds}")
            return 0

        try:
            code = pipeline_once(args)

            if code != 0:
                printf(f"[originalbitnodes] cycle failed with code {code}")

                if args.strict:
                    return code

        except KeyboardInterrupt:
            raise
        except Exception as exc:
            printf(f"[originalbitnodes] cycle error: {exc}")

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
        registry_root=str(ORIGINAL_REGISTRY_DIR),
        registry_latest_dir=str(ORIGINAL_REGISTRY_LATEST_DIR),
    )

    parser.add_argument(
        "--original-mode",
        choices=["hybrid", "classic", "redis", "zzx-compatible"],
        default="hybrid",
    )

    parser.add_argument("--enrich-modules", default="")
    parser.add_argument("--redis-scan-pattern", default="*")
    parser.add_argument("--redis-scan-limit", type=int, default=250000)
    parser.add_argument("--no-gzip", action="store_true")
    parser.add_argument("--fail-empty", action="store_true")
    parser.add_argument("--strict", action="store_true")

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

    if not hasattr(args, "no_export_all_after"):
        args.no_export_all_after = False

    if not hasattr(args, "build_maps"):
        args.build_maps = False

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
