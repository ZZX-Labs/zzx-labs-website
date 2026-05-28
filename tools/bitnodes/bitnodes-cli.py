#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
APP_ROOT = TOOLS_DIR.parents[1]

WRAPPER = TOOLS_DIR / "bitnodes.py"
DAEMON = TOOLS_DIR / "bitnodesd.py"
CRAWLER = TOOLS_DIR / "crawl.py"
ENRICH = TOOLS_DIR / "enrich.py"
MAPS = TOOLS_DIR / "maps.py"
BUILD_GEO_INDEXES = TOOLS_DIR / "build_geo_indexes.py"

API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
STATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state"
MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"

DEFAULT_ENRICHED_DIR = API_DIR / "enriched"
DEFAULT_ENRICHED_LATEST = DEFAULT_ENRICHED_DIR / "latest.json"
DEFAULT_ENRICHMENT_REPORT = DEFAULT_ENRICHED_DIR / "enrichment-report.json"


def py(script: Path, *args: str) -> list[str]:
    return [
        sys.executable,
        str(script),
        *args,
    ]


def call(command: list[str]) -> int:
    return subprocess.call(command)


def call_daemon(args: list[str]) -> int:
    return call(py(DAEMON, *args))


def latest_input() -> Path:
    candidates = [
        API_DIR / "zzxbitnodes" / "latest.json",
        API_DIR / "zzxbitnodes" / "nodes.json",
        API_DIR / "originalbitnodes" / "latest.json",
        API_DIR / "originalbitnodes" / "nodes.json",
        STATE_DIR / "latest.json",
        STATE_DIR / "nodes.json",
        STATE_DIR / "registry.json",
    ]

    for path in candidates:
        if path.exists():
            return path

    return API_DIR / "zzxbitnodes" / "latest.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bitnodes-cli.py",
        description="ZZX-Labs Bitnodes CLI controller.",
    )

    sub = parser.add_subparsers(
        dest="command",
        required=True,
    )

    daemon_commands = [
        "run",
        "status",
        "stop",
        "export-once",
        "native-crawl",
        "redis-start",
        "redis-status",
        "clone",
        "tail",
    ]

    for name in daemon_commands:
        child = sub.add_parser(name)

        if name == "tail":
            child.add_argument("--lines", type=int, default=80)

    crawl = sub.add_parser("crawl")
    crawl.add_argument("--limit", type=int, default=5000)
    crawl.add_argument("--workers", type=int, default=256)
    crawl.add_argument("--interval", type=int, default=900)
    crawl.add_argument("--daemon", action="store_true")
    crawl.add_argument("--git-push", action="store_true")

    enrich = sub.add_parser("enrich")
    enrich.add_argument("--input", default="")
    enrich.add_argument("--output", default=str(DEFAULT_ENRICHED_LATEST))
    enrich.add_argument("--report", default=str(DEFAULT_ENRICHMENT_REPORT))
    enrich.add_argument("--modules", default="")
    enrich.add_argument("--source", default="zzxbitnodes")
    enrich.add_argument("--strict", action="store_true")

    maps = sub.add_parser("maps")
    maps.add_argument("--input", default="")
    maps.add_argument("--source", default="zzxbitnodes")
    maps.add_argument("--theme", default="zzx_dark_olive")
    maps.add_argument("--settings", default="default")
    maps.add_argument("--tile-provider", default="cartodb_dark")
    maps.add_argument("--strict", action="store_true")
    maps.add_argument("--no-modules", action="store_true")

    sub.add_parser("geo-index")

    full = sub.add_parser("pipeline")
    full.add_argument("--input", default="")
    full.add_argument("--source", default="zzxbitnodes")
    full.add_argument("--theme", default="zzx_dark_olive")
    full.add_argument("--settings", default="default")
    full.add_argument("--tile-provider", default="cartodb_dark")
    full.add_argument("--strict", action="store_true")

    return parser


def command_crawl(args: argparse.Namespace) -> int:
    command = py(
        CRAWLER,
        "--limit",
        str(args.limit),
        "--workers",
        str(args.workers),
    )

    if args.daemon:
        command.append("--daemon")
        command.extend(["--interval", str(args.interval)])

    if args.git_push:
        command.append("--git-push")

    return call(command)


def command_enrich(args: argparse.Namespace) -> int:
    input_path = Path(args.input).resolve() if args.input else latest_input()

    command = py(
        ENRICH,
        "--input",
        str(input_path),
        "--output",
        str(Path(args.output).resolve()),
        "--report",
        str(Path(args.report).resolve()),
        "--source",
        args.source,
        "--api-dir",
        str(API_DIR),
        "--state-dir",
        str(STATE_DIR),
    )

    if args.modules:
        command.extend(["--modules", args.modules])

    if args.strict:
        command.append("--strict")

    return call(command)


def command_maps(args: argparse.Namespace) -> int:
    input_path = Path(args.input).resolve() if args.input else (
        DEFAULT_ENRICHED_LATEST if DEFAULT_ENRICHED_LATEST.exists() else latest_input()
    )

    command = py(
        MAPS,
        "--input",
        str(input_path),
        "--api-dir",
        str(API_DIR),
        "--state-dir",
        str(STATE_DIR),
        "--map-dir",
        str(MAP_DIR),
        "--live-map-dir",
        str(LIVE_MAP_DIR),
        "--source",
        args.source,
        "--theme",
        args.theme,
        "--settings",
        args.settings,
        "--tile-provider",
        args.tile_provider,
    )

    if args.strict:
        command.append("--strict")

    if args.no_modules:
        command.append("--no-modules")

    return call(command)


def command_geo_index() -> int:
    return call(py(BUILD_GEO_INDEXES, "--download"))


def command_pipeline(args: argparse.Namespace) -> int:
    enrich_args = argparse.Namespace(
        input=args.input,
        output=str(DEFAULT_ENRICHED_LATEST),
        report=str(DEFAULT_ENRICHMENT_REPORT),
        modules="",
        source=args.source,
        strict=args.strict,
    )

    code = command_enrich(enrich_args)

    if code != 0:
        return code

    maps_args = argparse.Namespace(
        input=str(DEFAULT_ENRICHED_LATEST),
        source=args.source,
        theme=args.theme,
        settings=args.settings,
        tile_provider=args.tile_provider,
        strict=args.strict,
        no_modules=False,
    )

    return command_maps(maps_args)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command in {
        "run",
        "status",
        "stop",
        "export-once",
        "native-crawl",
        "redis-start",
        "redis-status",
        "clone",
    }:
        return call_daemon([args.command])

    if args.command == "tail":
        return call_daemon([
            "tail",
            "--lines",
            str(args.lines),
        ])

    if args.command == "crawl":
        return command_crawl(args)

    if args.command == "enrich":
        return command_enrich(args)

    if args.command == "maps":
        return command_maps(args)

    if args.command == "geo-index":
        return command_geo_index()

    if args.command == "pipeline":
        return command_pipeline(args)

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
