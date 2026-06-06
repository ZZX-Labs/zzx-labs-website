#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Sequence


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

BITNODES_ROOT = APP_ROOT / "bitcoin" / "bitnodes"
BITNODES_API = BITNODES_ROOT / "api"
BITNODES_DATA = BITNODES_ROOT / "data"
BITNODES_ARCHIVE = BITNODES_ROOT / "archive"

EXPORT_WRAPPER = TOOLS_DIR / "export.py"

CRAWLER_MODULES = {
    "zzxbitnodes": TOOLS_DIR / "zzxbitnodes.py",
    "originalbitnodes": TOOLS_DIR / "originalbitnodes.py",
}

DEFAULT_CRAWLER = "zzxbitnodes"
DEFAULT_DATA_OUTPUT = BITNODES_API / "data"
DEFAULT_DATABASE = "zzx_bitnodes"
DEFAULT_MAX_BYTES = 24_000_000


def build_env() -> dict[str, str]:
    env = dict(os.environ)
    env.setdefault("BITNODES_ROOT", str(BITNODES_ROOT))
    env.setdefault("BITNODES_API", str(BITNODES_API))
    env.setdefault("BITNODES_DATA", str(BITNODES_DATA))
    env.setdefault("BITNODES_ARCHIVE", str(BITNODES_ARCHIVE))
    env.setdefault("BITNODES_TOOLS", str(TOOLS_DIR))
    env.setdefault("PYTHONUNBUFFERED", "1")
    return env


def py(script: Path, args: Sequence[str]) -> list[str]:
    return [sys.executable, str(script), *args]


def call(command: list[str]) -> int:
    print("$ " + " ".join(str(part) for part in command), flush=True)
    return subprocess.call(command, cwd=str(APP_ROOT), env=build_env())


def option_present(args: list[str], flag: str) -> bool:
    return flag in args or any(item.startswith(f"{flag}=") for item in args)


def remove_option(args: list[str], flag: str) -> list[str]:
    out: list[str] = []
    skip_next = False

    for item in args:
        if skip_next:
            skip_next = False
            continue

        if item == flag:
            skip_next = True
            continue

        if item.startswith(f"{flag}="):
            continue

        out.append(item)

    return out


def set_option(args: list[str], flag: str, value: str) -> list[str]:
    cleaned = remove_option(args, flag)
    return [*cleaned, flag, value]


def add_option_if_missing(args: list[str], flag: str, value: str) -> list[str]:
    if option_present(args, flag):
        return args
    return [*args, flag, value]


def strip_wrapper_args(argv: list[str]) -> list[str]:
    wrapper_value_flags = {
        "--crawler",
        "--source",
        "--wrapper-interval",
        "--wrapper-run-seconds",
        "--dataplane-output-dir",
        "--dataplane-database",
        "--dataplane-max-bytes",
    }

    wrapper_bool_flags = {
        "--list-crawlers",
        "--wrapper-daemon",
        "--stop-on-error",
        "--export-after",
        "--no-export-after",
        "--dataplane-compact",
        "--dataplane-strict",
    }

    out: list[str] = []
    skip_next = False

    for item in argv:
        if skip_next:
            skip_next = False
            continue

        if item in wrapper_value_flags:
            skip_next = True
            continue

        if any(item.startswith(f"{flag}=") for flag in wrapper_value_flags):
            continue

        if item in wrapper_bool_flags:
            continue

        out.append(item)

    return out


def force_crawler_paths(module_name: str, args: list[str]) -> list[str]:
    if module_name == "zzxbitnodes":
        args = set_option(args, "--output", str(BITNODES_API / "zzxbitnodes"))
        args = set_option(args, "--archive-dir", str(BITNODES_ARCHIVE / "runtime" / "zzxbitnodes"))
        args = set_option(args, "--state-dir", str(BITNODES_DATA / "runtime" / "state" / "zzxbitnodes"))
        args = set_option(args, "--snapshot-24h-dir", str(BITNODES_DATA / "runtime" / "snapshots" / "24h" / "zzxbitnodes"))
        args = set_option(args, "--seeder-dir", str(BITNODES_DATA / "runtime" / "seeders" / "zzxbitnodes"))
        return args

    if module_name == "originalbitnodes":
        args = set_option(args, "--output", str(BITNODES_API / "originalbitnodes"))
        args = set_option(args, "--archive-dir", str(BITNODES_ARCHIVE / "runtime" / "originalbitnodes"))
        args = set_option(args, "--state-dir", str(BITNODES_DATA / "runtime" / "state" / "originalbitnodes"))
        args = set_option(args, "--snapshot-24h-dir", str(BITNODES_DATA / "runtime" / "snapshots" / "24h" / "originalbitnodes"))
        args = set_option(args, "--seeder-dir", str(BITNODES_DATA / "runtime" / "seeders" / "originalbitnodes"))
        args = add_option_if_missing(args, "--original-mode", "hybrid")
        return args

    return args


def ensure_runtime_dirs() -> None:
    for path in (
        BITNODES_API,
        BITNODES_API / "zzxbitnodes",
        BITNODES_API / "originalbitnodes",
        BITNODES_API / "data",
        BITNODES_DATA,
        BITNODES_DATA / "runtime",
        BITNODES_DATA / "runtime" / "state",
        BITNODES_DATA / "runtime" / "snapshots" / "24h",
        BITNODES_DATA / "runtime" / "seeders",
        BITNODES_ARCHIVE,
        BITNODES_ARCHIVE / "runtime",
    ):
        path.mkdir(parents=True, exist_ok=True)


def run_module(module_name: str, passthrough: list[str]) -> int:
    script = CRAWLER_MODULES.get(module_name)

    if script is None:
        print(f"[crawl.py] unknown crawler module: {module_name}", file=sys.stderr, flush=True)
        return 2

    if not script.exists():
        print(f"[crawl.py] missing crawler module: {script}", file=sys.stderr, flush=True)
        return 1

    ensure_runtime_dirs()

    cmd = py(script, passthrough)

    print(f"[crawl.py] cwd: {APP_ROOT}", flush=True)
    print(f"[crawl.py] exec: {' '.join(cmd)}", flush=True)

    return call(cmd)


def split_passthrough_for_both(passthrough: list[str]) -> tuple[list[str], list[str]]:
    clean = strip_wrapper_args(passthrough)

    zzx_args = force_crawler_paths("zzxbitnodes", list(clean))
    original_args = force_crawler_paths("originalbitnodes", list(clean))

    original_args = remove_option(original_args, "--mirror-legacy-api")
    original_args = set_option(original_args, "--export-mode", "reachable")
    original_args = set_option(original_args, "--archive-replay-files", "0")

    if not option_present(original_args, "--disable-archive-replay"):
        original_args.append("--disable-archive-replay")

    return zzx_args, original_args


def run_both(passthrough: list[str], continue_on_error: bool = True) -> int:
    zzx_args, original_args = split_passthrough_for_both(passthrough)

    print("[crawl.py] running zzxbitnodes", flush=True)
    zzx_code = run_module("zzxbitnodes", zzx_args)

    if zzx_code != 0:
        print(f"[crawl.py] zzxbitnodes exited with code {zzx_code}", file=sys.stderr, flush=True)

        if not continue_on_error:
            return zzx_code

    print("[crawl.py] running originalbitnodes", flush=True)
    original_code = run_module("originalbitnodes", original_args)

    if original_code != 0:
        print(f"[crawl.py] originalbitnodes exited with code {original_code}", file=sys.stderr, flush=True)

    if zzx_code != 0:
        return zzx_code

    return original_code


def latest_inputs_for(crawler: str) -> list[Path]:
    candidates: list[Path] = []

    if crawler in {"zzxbitnodes", "both"}:
        candidates.extend(
            [
                BITNODES_API / "enriched" / "zzxbitnodes" / "latest.json",
                BITNODES_API / "zzxbitnodes" / "latest.json",
            ]
        )

    if crawler in {"originalbitnodes", "both"}:
        candidates.extend(
            [
                BITNODES_API / "enriched" / "originalbitnodes" / "latest.json",
                BITNODES_API / "originalbitnodes" / "latest.json",
            ]
        )

    return [path for path in candidates if path.exists() and path.is_file()]


def run_dataplane_after(args: argparse.Namespace) -> int:
    if not EXPORT_WRAPPER.exists():
        print(f"[crawl.py] missing export wrapper: {EXPORT_WRAPPER}", file=sys.stderr, flush=True)
        return 1

    inputs = latest_inputs_for(args.crawler)

    if not inputs:
        print("[crawl.py] no crawler latest.json inputs found for dataplane export", file=sys.stderr, flush=True)

        if args.dataplane_strict:
            return 1

        return 0

    command = py(
        EXPORT_WRAPPER,
        [
            "dataplane",
            "--output-dir",
            str(Path(args.dataplane_output_dir).resolve()),
            "--database",
            str(args.dataplane_database),
            "--max-bytes",
            str(args.dataplane_max_bytes),
        ],
    )

    for path in inputs:
        command.extend(["--input", str(path.resolve())])

    if args.dataplane_compact:
        command.append("--compact")

    if args.dataplane_strict:
        command.append("--strict")

    print("[crawl.py] running post-crawl dataplane export", flush=True)
    return call(command)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="crawl.py",
        description="ZZX-Labs Bitnodes crawler wrapper and post-crawl dataplane orchestrator.",
        allow_abbrev=False,
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

    parser.add_argument(
        "--export-after",
        dest="export_after",
        action="store_true",
        default=True,
        help="Run DB-first dataplane export after successful crawler execution.",
    )

    parser.add_argument(
        "--no-export-after",
        dest="export_after",
        action="store_false",
        help="Disable post-crawl dataplane export.",
    )

    parser.add_argument(
        "--dataplane-output-dir",
        default=str(DEFAULT_DATA_OUTPUT),
        help="Output directory for canonical DB/data artifacts.",
    )

    parser.add_argument(
        "--dataplane-database",
        default=DEFAULT_DATABASE,
        help="MariaDB database name for generated SQL shards.",
    )

    parser.add_argument(
        "--dataplane-max-bytes",
        type=int,
        default=DEFAULT_MAX_BYTES,
        help="Maximum compressed public shard size target.",
    )

    parser.add_argument(
        "--dataplane-compact",
        action="store_true",
        help="Write compact dataplane manifests and JSON artifacts.",
    )

    parser.add_argument(
        "--dataplane-strict",
        action="store_true",
        help="Fail if dataplane inputs or records are missing.",
    )

    return parser


def list_crawlers() -> int:
    for name, path in CRAWLER_MODULES.items():
        status = "ok" if path.exists() else "missing"
        print(f"{name}\t{status}\t{path}")

    print("both\tvirtual\tzzxbitnodes -> originalbitnodes")
    return 0


def run_once(args: argparse.Namespace, passthrough: list[str]) -> int:
    clean = strip_wrapper_args(passthrough)

    if args.crawler == "both":
        code = run_both(clean, continue_on_error=not args.stop_on_error)
    else:
        clean = force_crawler_paths(args.crawler, clean)
        code = run_module(args.crawler, clean)

    if code != 0:
        return code

    if args.export_after:
        return run_dataplane_after(args)

    return 0


def daemon_loop(args: argparse.Namespace, passthrough: list[str]) -> int:
    started = time.time()
    cycle = 0

    while True:
        cycle += 1

        if args.wrapper_run_seconds > 0 and time.time() - started >= args.wrapper_run_seconds:
            print("[crawl.py] wrapper daemon runtime reached.", flush=True)
            return 0

        print(f"[crawl.py] wrapper daemon cycle {cycle}", flush=True)

        code = run_once(args, passthrough)

        if code != 0 and args.stop_on_error:
            return code

        if args.wrapper_run_seconds > 0 and time.time() - started >= args.wrapper_run_seconds:
            print("[crawl.py] wrapper daemon runtime reached.", flush=True)
            return 0

        sleep_for = max(1, int(args.wrapper_interval))
        print(f"[crawl.py] sleeping {sleep_for}s", flush=True)
        time.sleep(sleep_for)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args, passthrough = parser.parse_known_args(argv)

    if args.list_crawlers:
        return list_crawlers()

    if args.wrapper_daemon:
        return daemon_loop(args, passthrough)

    return run_once(args, passthrough)


if __name__ == "__main__":
    raise SystemExit(main())
