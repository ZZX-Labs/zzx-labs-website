#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

BITNODES_ROOT = APP_ROOT / "bitcoin" / "bitnodes"
SRC_DIR = BITNODES_ROOT / "src"

DATA_DIR = BITNODES_ROOT / "data"
API_DIR = BITNODES_ROOT / "api"
ARCHIVE_DIR = BITNODES_ROOT / "archive"
LOG_DIR = BITNODES_ROOT / "log"
GEOIP_DIR = DATA_DIR / "geoip"

ORIGINAL_API_DIR = API_DIR / "originalbitnodes"
ORIGINAL_ARCHIVE_DIR = ARCHIVE_DIR / "originalbitnodes"
ORIGINAL_STATE_DIR = DATA_DIR / "state" / "originalbitnodes"
ORIGINAL_SNAPSHOT_24H_DIR = DATA_DIR / "snapshots" / "24h" / "originalbitnodes"
ORIGINAL_SEEDER_DIR = DATA_DIR / "seeders" / "originalbitnodes"
ORIGINAL_REGISTRY_DIR = BITNODES_ROOT / "registry" / "originalbitnodes"
ORIGINAL_REGISTRY_LATEST_DIR = ORIGINAL_REGISTRY_DIR / "latest"

ORIGINAL_ENRICHED_DIR = API_DIR / "enriched" / "originalbitnodes"
ORIGINAL_ENRICHED_LATEST = ORIGINAL_ENRICHED_DIR / "latest.json"
ORIGINAL_ENRICHMENT_REPORT = ORIGINAL_ENRICHED_DIR / "enrichment-report.json"

ORIGINAL_AGGREGATE_DIR = API_DIR / "aggregate" / "originalbitnodes"
ORIGINAL_AGGREGATE_LATEST = ORIGINAL_AGGREGATE_DIR / "latest.json"

EXPORT_FROM_REDIS = TOOLS_DIR / "export_from_redis.py"
ENRICH = TOOLS_DIR / "enrich.py"
AGGREGATE = TOOLS_DIR / "aggregate.py"
CHUNK_REGISTRY_BACKUP = TOOLS_DIR / "chunk_registry_backup.py"
UPDATE_DAILY_INDEX = TOOLS_DIR / "update_daily_index.py"
PUSH_SNAPSHOTS = TOOLS_DIR / "push_snapshots.py"

DEFAULT_REPO = "https://github.com/ayeowch/bitnodes"
DEFAULT_BRANCH = "master"


def printf(message: str) -> None:
    print(message, flush=True)


def utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def date_slug() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def ensure_dirs() -> None:
    for path in (
        BITNODES_ROOT,
        DATA_DIR,
        API_DIR,
        ARCHIVE_DIR,
        LOG_DIR,
        GEOIP_DIR,
        ORIGINAL_API_DIR,
        ORIGINAL_ARCHIVE_DIR,
        ORIGINAL_STATE_DIR,
        ORIGINAL_SNAPSHOT_24H_DIR,
        ORIGINAL_SEEDER_DIR,
        ORIGINAL_REGISTRY_DIR,
        ORIGINAL_REGISTRY_LATEST_DIR,
        ORIGINAL_ENRICHED_DIR,
        ORIGINAL_AGGREGATE_DIR,
    ):
        path.mkdir(parents=True, exist_ok=True)


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
    path.parent.mkdir(parents=True, exist_ok=True)

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


def run(
    command: list[str],
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    check: bool = False,
) -> int:
    merged_env = os.environ.copy()

    if env:
        merged_env.update(env)

    printf(f"RUNNING: {' '.join(str(item) for item in command)}")

    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        env=merged_env,
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
        raise RuntimeError(f"Command failed: {' '.join(command)}")

    return result.returncode


def py(script: Path, *args: str) -> list[str]:
    return [
        sys.executable,
        str(script),
        *args,
    ]


def runtime_env() -> dict[str, str]:
    return {
        "ZZX_BITNODES_ROOT": str(BITNODES_ROOT),
        "ZZX_BITNODES_SRC_DIR": str(SRC_DIR),
        "ZZX_BITNODES_API_DIR": str(ORIGINAL_API_DIR),
        "ZZX_BITNODES_ARCHIVE_DIR": str(ORIGINAL_ARCHIVE_DIR),
        "ZZX_BITNODES_GEOIP_DIR": str(GEOIP_DIR),
        "ZZX_BITNODES_STATE_DIR": str(ORIGINAL_STATE_DIR),
        "ZZX_BITNODES_SNAPSHOT_24H_DIR": str(ORIGINAL_SNAPSHOT_24H_DIR),
        "ZZX_BITNODES_SEEDER_DIR": str(ORIGINAL_SEEDER_DIR),
        "ZZX_BITNODES_REGISTRY_DIR": str(ORIGINAL_REGISTRY_DIR),
        "ZZX_BITNODES_LOG_DIR": str(LOG_DIR),
        "ZZX_BITNODES_SOURCE": "originalbitnodes",
        "PYTHONUNBUFFERED": "1",
    }


def is_git_repo(path: Path) -> bool:
    return (path / ".git").exists()


def clone(repo: str = DEFAULT_REPO, branch: str = DEFAULT_BRANCH) -> int:
    ensure_dirs()

    if is_git_repo(SRC_DIR):
        printf("Existing original Bitnodes git repository detected. Updating source clone.")
        return run(["git", "pull", "--ff-only", "origin", branch], cwd=SRC_DIR)

    if SRC_DIR.exists() and any(SRC_DIR.iterdir()):
        printf(
            "bitcoin/bitnodes/src exists but is not a git repository. "
            "Removing stale runtime directory before clone."
        )
        shutil.rmtree(SRC_DIR)

    SRC_DIR.parent.mkdir(parents=True, exist_ok=True)

    return run([
        "git",
        "clone",
        "--depth",
        "1",
        "--branch",
        branch,
        repo,
        str(SRC_DIR),
    ])


def install_requirements() -> int:
    requirements = SRC_DIR / "requirements.txt"

    if not requirements.exists():
        printf("requirements.txt not found in bitcoin/bitnodes/src.")
        return 1

    code = run([sys.executable, "-m", "pip", "install", "--upgrade", "pip"], cwd=SRC_DIR)

    if code:
        return code

    return run([sys.executable, "-m", "pip", "install", "-r", str(requirements)], cwd=SRC_DIR)


def update_geoip() -> int:
    candidates = [
        SRC_DIR / "geoip" / "update.sh",
        SRC_DIR / "geoip" / "update.py",
        SRC_DIR / "scripts" / "geoip.sh",
        SRC_DIR / "scripts" / "update_geoip.py",
    ]

    for script in candidates:
        if not script.exists():
            continue

        if script.suffix == ".sh":
            return run(["bash", str(script)], cwd=SRC_DIR, env=runtime_env())

        if script.suffix == ".py":
            return run([sys.executable, str(script)], cwd=SRC_DIR, env=runtime_env())

    printf("No original Bitnodes GeoIP updater found. Continuing without upstream GeoIP update.")
    return 0


def locate_start_target() -> Path | None:
    candidates = (
        SRC_DIR / "start.sh",
        SRC_DIR / "run.sh",
        SRC_DIR / "crawler.py",
        SRC_DIR / "crawl.py",
        SRC_DIR / "bitnodes.py",
        SRC_DIR / "manage.py",
        SRC_DIR / "main.py",
        SRC_DIR / "docker-compose.yml",
        SRC_DIR / "compose.yaml",
        SRC_DIR / "compose.yml",
    )

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return None


def start_original(
    *,
    limit: int,
    batch_size: int,
    timeout: float,
    workers: int,
    getaddr_rounds: int,
    dns_seed_limit: int,
    compact: bool,
) -> int:
    ensure_dirs()

    target = locate_start_target()

    if not target:
        printf("No original Bitnodes startup target found in bitcoin/bitnodes/src.")
        return 1

    env = runtime_env()
    env.update({
        "ZZX_BITNODES_LIMIT": str(limit),
        "ZZX_BITNODES_BATCH_SIZE": str(batch_size),
        "ZZX_BITNODES_TIMEOUT": str(timeout),
        "ZZX_BITNODES_WORKERS": str(workers),
        "ZZX_BITNODES_GETADDR_ROUNDS": str(getaddr_rounds),
        "ZZX_BITNODES_DNS_SEED_LIMIT": str(dns_seed_limit),
        "ZZX_BITNODES_COMPACT": "1" if compact else "0",
    })

    if target.name in {"start.sh", "run.sh"}:
        return run(["bash", str(target)], cwd=SRC_DIR, env=env)

    if target.suffix == ".py":
        return run([sys.executable, str(target)], cwd=SRC_DIR, env=env)

    if target.name in {"docker-compose.yml", "compose.yaml", "compose.yml"}:
        return run(
            ["docker", "compose", "-f", str(target), "up", "--abort-on-container-exit"],
            cwd=SRC_DIR,
            env=env,
        )

    printf("Unsupported original Bitnodes startup target.")
    return 1


def export_redis(
    *,
    compact: bool,
    no_gzip: bool,
    fail_empty: bool,
    scan_pattern: str,
    scan_limit: int,
) -> int:
    ensure_dirs()

    command = py(
        EXPORT_FROM_REDIS,
        "--output",
        str(ORIGINAL_API_DIR),
        "--archive-dir",
        str(ORIGINAL_ARCHIVE_DIR),
        "--scan-pattern",
        scan_pattern,
        "--scan-limit",
        str(scan_limit),
    )

    if compact:
        command.append("--compact")

    if no_gzip:
        command.append("--no-gzip")

    if fail_empty:
        command.append("--fail-empty")

    return run(command, cwd=APP_ROOT, env=runtime_env())


def enrich_original(
    modules: str = "",
    strict: bool = False,
) -> int:
    latest = ORIGINAL_API_DIR / "latest.json"

    if not latest.exists():
        printf(f"Original enrichment skipped; missing {latest}")
        return 0

    command = py(
        ENRICH,
        "--input",
        str(latest),
        "--output",
        str(ORIGINAL_ENRICHED_LATEST),
        "--report",
        str(ORIGINAL_ENRICHMENT_REPORT),
        "--source",
        "originalbitnodes",
        "--api-dir",
        str(API_DIR),
        "--state-dir",
        str(ORIGINAL_STATE_DIR),
    )

    if modules:
        command.extend(["--modules", modules])

    if strict:
        command.append("--strict")

    return run(command, cwd=APP_ROOT)


def aggregate_original() -> int:
    input_path = ORIGINAL_ENRICHED_LATEST if ORIGINAL_ENRICHED_LATEST.exists() else ORIGINAL_API_DIR / "latest.json"

    if not input_path.exists():
        printf(f"Original aggregate skipped; missing {input_path}")
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
        str(ORIGINAL_STATE_DIR),
        "--source",
        "originalbitnodes",
    )

    return run(command, cwd=APP_ROOT)


def registry_backup_original(enabled: bool = True) -> int:
    if not enabled:
        return 0

    dated = ORIGINAL_REGISTRY_DIR / date_slug()

    command = py(
        CHUNK_REGISTRY_BACKUP,
        "--input",
        str(ORIGINAL_ARCHIVE_DIR),
        "--api",
        str(API_DIR),
        "--output",
        str(dated),
        "--latest-output",
        str(ORIGINAL_REGISTRY_LATEST_DIR),
    )

    code = run(command, cwd=APP_ROOT)

    if code:
        return code

    command = py(
        UPDATE_DAILY_INDEX,
        "--repo-root",
        str(ORIGINAL_REGISTRY_DIR),
    )

    return run(command, cwd=APP_ROOT)


def push_original(enabled: bool = False) -> int:
    if not enabled:
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

    return run(command, cwd=APP_ROOT)


def mirror_original_latest(pretty: bool = True) -> None:
    latest = ORIGINAL_API_DIR / "latest.json"

    if not latest.exists():
        return

    payload = read_json(latest, fallback={})

    if not isinstance(payload, dict) or not payload:
        return

    payload["source"] = "originalbitnodes"
    payload["crawler"] = "originalbitnodes"
    payload["updated_by"] = "run_original_bitnodes.py"
    payload["compatibility"] = {
        "mode": "original-bitnodes-compatible",
        "upstream": DEFAULT_REPO,
        "note": "Generated from the original Bitnodes-compatible runner/export path.",
    }

    write_json(API_DIR / "original-latest.json", payload, pretty=pretty)


def write_status(stage: str, extra: dict[str, Any] | None = None) -> None:
    payload = {
        "schema": "zzx-original-bitnodes-runner-status-v1",
        "updated_at": utc_iso(),
        "stage": stage,
        "src_dir": str(SRC_DIR),
        "api_dir": str(ORIGINAL_API_DIR),
        "archive_dir": str(ORIGINAL_ARCHIVE_DIR),
        "state_dir": str(ORIGINAL_STATE_DIR),
        "registry_dir": str(ORIGINAL_REGISTRY_DIR),
        **(extra or {}),
    }

    write_json(LOG_DIR / "originalbitnodes-status.json", payload)


def pipeline_once(args: argparse.Namespace) -> int:
    ensure_dirs()
    write_status("pipeline-started")

    if args.ensure_source:
        code = clone(repo=args.repo, branch=args.branch)

        if code:
            write_status("clone-failed", {"exit_code": code})
            return code

    if args.install:
        code = install_requirements()

        if code:
            write_status("install-failed", {"exit_code": code})
            return code

    if args.geoip:
        update_geoip()

    if args.mode in {"classic", "hybrid"}:
        code = start_original(
            limit=args.limit,
            batch_size=args.batch_size,
            timeout=args.timeout,
            workers=args.workers,
            getaddr_rounds=args.getaddr_rounds,
            dns_seed_limit=args.dns_seed_limit,
            compact=args.compact,
        )

        if code and args.mode == "classic":
            write_status("classic-failed", {"exit_code": code})
            return code

        if code:
            printf("Classic original runner failed; falling back to Redis export.")

    if args.mode in {"redis", "hybrid"}:
        code = export_redis(
            compact=args.compact,
            no_gzip=args.no_gzip,
            fail_empty=args.fail_empty,
            scan_pattern=args.redis_scan_pattern,
            scan_limit=args.redis_scan_limit,
        )

        if code:
            write_status("redis-export-failed", {"exit_code": code})
            return code

    mirror_original_latest(pretty=not args.compact)

    if not args.no_enrich:
        code = enrich_original(
            modules=args.enrich_modules,
            strict=args.strict,
        )

        if code and args.strict:
            write_status("enrichment-failed", {"exit_code": code})
            return code

    if not args.no_aggregate:
        code = aggregate_original()

        if code and args.strict:
            write_status("aggregate-failed", {"exit_code": code})
            return code

    if args.registry_backup:
        code = registry_backup_original(enabled=True)

        if code and args.strict:
            write_status("registry-backup-failed", {"exit_code": code})
            return code

    if args.git_push:
        code = push_original(enabled=True)

        if code and args.strict:
            write_status("push-failed", {"exit_code": code})
            return code

    write_status("pipeline-complete")
    return 0


def daemon_loop(args: argparse.Namespace) -> int:
    started = time.time()

    while True:
        if args.run_seconds > 0 and time.time() - started >= args.run_seconds:
            write_status("daemon-run-seconds-complete")
            return 0

        try:
            code = pipeline_once(args)

            if code:
                printf(f"Original Bitnodes cycle failed with code {code}")

                if args.strict:
                    return code

        except KeyboardInterrupt:
            raise
        except Exception as exc:
            printf(f"Original Bitnodes daemon cycle error: {exc}")

            if args.strict:
                return 1

        if args.run_seconds > 0 and time.time() - started >= args.run_seconds:
            return 0

        time.sleep(args.interval)


def clean() -> int:
    if SRC_DIR.exists():
        shutil.rmtree(SRC_DIR)
        printf("Removed bitcoin/bitnodes/src.")

    return 0


def bootstrap(args: argparse.Namespace) -> int:
    code = clone(repo=args.repo, branch=args.branch)

    if code:
        return code

    code = install_requirements()

    if code:
        return code

    update_geoip()

    return pipeline_once(args)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Manage and run the original ayeowch/bitnodes crawler as a ZZX-compatible data source."
    )

    sub = parser.add_subparsers(dest="command", required=True)

    for command in ("clone", "install", "geoip", "clean"):
        child = sub.add_parser(command)
        child.add_argument("--repo", default=DEFAULT_REPO)
        child.add_argument("--branch", default=DEFAULT_BRANCH)

    for command in ("start", "crawl", "export", "postprocess", "pipeline", "daemon", "bootstrap"):
        child = sub.add_parser(command)
        child.add_argument("--repo", default=DEFAULT_REPO)
        child.add_argument("--branch", default=DEFAULT_BRANCH)

        child.add_argument("--mode", choices=["hybrid", "classic", "redis"], default="hybrid")
        child.add_argument("--ensure-source", action="store_true")
        child.add_argument("--install", action="store_true")
        child.add_argument("--geoip", action="store_true")

        child.add_argument("--limit", type=int, default=500000)
        child.add_argument("--batch-size", type=int, default=4096)
        child.add_argument("--timeout", type=float, default=5.0)
        child.add_argument("--workers", type=int, default=256)
        child.add_argument("--getaddr-rounds", type=int, default=16)
        child.add_argument("--dns-seed-limit", type=int, default=4096)

        child.add_argument("--compact", action="store_true")
        child.add_argument("--redis-scan-pattern", default="*")
        child.add_argument("--redis-scan-limit", type=int, default=250000)
        child.add_argument("--no-gzip", action="store_true")
        child.add_argument("--fail-empty", action="store_true")

        child.add_argument("--enrich-modules", default="")
        child.add_argument("--no-enrich", action="store_true")
        child.add_argument("--no-aggregate", action="store_true")
        child.add_argument("--registry-backup", action="store_true")
        child.add_argument("--git-push", action="store_true")
        child.add_argument("--strict", action="store_true")

        child.add_argument("--interval", type=int, default=3600)
        child.add_argument("--run-seconds", type=int, default=0)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    ensure_dirs()

    if args.command == "clone":
        return clone(repo=args.repo, branch=args.branch)

    if args.command == "install":
        return install_requirements()

    if args.command == "geoip":
        return update_geoip()

    if args.command == "clean":
        return clean()

    if args.command in {"start", "crawl"}:
        return start_original(
            limit=args.limit,
            batch_size=args.batch_size,
            timeout=args.timeout,
            workers=args.workers,
            getaddr_rounds=args.getaddr_rounds,
            dns_seed_limit=args.dns_seed_limit,
            compact=args.compact,
        )

    if args.command == "export":
        return export_redis(
            compact=args.compact,
            no_gzip=args.no_gzip,
            fail_empty=args.fail_empty,
            scan_pattern=args.redis_scan_pattern,
            scan_limit=args.redis_scan_limit,
        )

    if args.command == "postprocess":
        mirror_original_latest(pretty=not args.compact)

        code = 0

        if not args.no_enrich:
            code = enrich_original(args.enrich_modules, args.strict)

        if code == 0 and not args.no_aggregate:
            code = aggregate_original()

        if code == 0 and args.registry_backup:
            code = registry_backup_original(enabled=True)

        if code == 0 and args.git_push:
            code = push_original(enabled=True)

        return code

    if args.command == "pipeline":
        return pipeline_once(args)

    if args.command == "daemon":
        return daemon_loop(args)

    if args.command == "bootstrap":
        return bootstrap(args)

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
