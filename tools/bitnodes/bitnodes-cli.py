#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
APP_ROOT = TOOLS_DIR.parents[1]

APP_NAME = "bitnodes-cli.py"
APP_VERSION = "0.4.0"

WRAPPER = TOOLS_DIR / "bitnodes.py"
DAEMON = TOOLS_DIR / "bitnodesd.py"

TOOLS = {
    "crawl": TOOLS_DIR / "crawl.py",
    "zzx-crawl": TOOLS_DIR / "zzx_crawl.py",
    "enrich": TOOLS_DIR / "enrich.py",
    "maps": TOOLS_DIR / "maps.py",
    "geo-index": TOOLS_DIR / "build_geo_indexes.py",
    "push-ipdb": TOOLS_DIR / "push_ipdb.py",
    "asn": TOOLS_DIR / "asn.py",
    "isp": TOOLS_DIR / "isp.py",
    "provider": TOOLS_DIR / "provider.py",
    "organization": TOOLS_DIR / "organization.py",
    "government": TOOLS_DIR / "government.py",
    "military": TOOLS_DIR / "military.py",
    "datacenter": TOOLS_DIR / "datacenter.py",
    "aptattribution": TOOLS_DIR / "aptattribution.py",
    "tagattribution": TOOLS_DIR / "tagattribution.py",
    "knownmalactor": TOOLS_DIR / "knownmalactor.py",
}

API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
STATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state"
MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"

ENRICHED_DIR = API_DIR / "enriched"
ENRICHED_LATEST = ENRICHED_DIR / "latest.json"
ENRICHMENT_REPORT = ENRICHED_DIR / "enrichment-report.json"


def py(script: Path, *args: str) -> list[str]:
    return [sys.executable, str(script), *args]


def eprint(text: str) -> None:
    print(text, file=sys.stderr)


def call(command: list[str]) -> int:
    try:
        return subprocess.call(
            command,
            cwd=str(TOOLS_DIR),
            env=os.environ.copy(),
        )
    except KeyboardInterrupt:
        eprint("\n[bitnodes-cli] interrupted.")
        return 130
    except OSError as exc:
        eprint(f"[bitnodes-cli] launch failed: {exc}")
        return 1


def require_script(path: Path) -> bool:
    if not path.exists():
        eprint(f"[bitnodes-cli] missing subsystem: {path}")
        return False

    if not path.is_file():
        eprint(f"[bitnodes-cli] target is not a file: {path}")
        return False

    return True


def call_script(script: Path, args: list[str] | None = None) -> int:
    if args is None:
        args = []

    if not require_script(script):
        return 127

    return call(py(script, *args))


def call_daemon(args: list[str]) -> int:
    return call_script(DAEMON, args)


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


def default_modules() -> str:
    return ",".join(
        [
            "ip_db",
            "ipv4",
            "ipv6",
            "tor",
            "i2p",
            "proxy",
            "vpn",
            "geoloc",
            "continent",
            "region",
            "country",
            "territory",
            "county",
            "city",
            "zip",
            "timezone",
            "asn",
            "isp",
            "provider",
            "organization",
            "datacenter",
            "government",
            "military",
            "w3w_lookup",
            "geohashid_lookup",
            "sanctioned_nodes",
            "aptattribution",
            "tagattribution",
            "knownmalactor",
            "peers",
            "peer_index",
            "peer_health",
            "dns_seeder_health",
        ]
    )


def print_status() -> int:
    print(f"{APP_NAME} {APP_VERSION}")
    print(f"app_root: {APP_ROOT}")
    print(f"tools_dir: {TOOLS_DIR}")
    print(f"python: {sys.executable}")
    print(f"api_dir: {API_DIR}")
    print(f"state_dir: {STATE_DIR}")
    print(f"map_dir: {MAP_DIR}")
    print("")

    print("core:")
    for name, path in {
        "bitnodes.py": WRAPPER,
        "bitnodesd.py": DAEMON,
    }.items():
        print(f"  {name:<24} {'ok' if path.exists() else 'missing'}")

    print("")
    print("tools:")
    missing = 0

    for name, path in TOOLS.items():
        ok = path.exists()
        if not ok:
            missing += 1
        print(f"  {name:<24} {'ok' if ok else 'missing'}")

    return 1 if missing else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=APP_NAME,
        description=(
            "ZZX-Labs Bitnodes CLI control plane. "
            "Used by bitnodes.py and by local/remote operators."
        ),
    )

    parser.add_argument(
        "--version",
        action="store_true",
        help="Print version.",
    )

    parser.add_argument(
        "--check",
        action="store_true",
        help="Check expected subsystem files.",
    )

    sub = parser.add_subparsers(dest="command")

    for name in (
        "run",
        "start",
        "status",
        "stop",
        "restart",
        "export-once",
        "native-crawl",
        "redis-start",
        "redis-status",
        "clone",
    ):
        sub.add_parser(name)

    tail = sub.add_parser("tail")
    tail.add_argument("--lines", type=int, default=80)

    crawl = sub.add_parser("crawl")
    crawl.add_argument("--limit", type=int, default=5000)
    crawl.add_argument("--workers", type=int, default=256)
    crawl.add_argument("--interval", type=int, default=900)
    crawl.add_argument("--daemon", action="store_true")
    crawl.add_argument("--git-push", action="store_true")
    crawl.add_argument("--zzx", action="store_true")
    crawl.add_argument("--original", action="store_true")

    enrich = sub.add_parser("enrich")
    enrich.add_argument("--input", default="")
    enrich.add_argument("--output", default=str(ENRICHED_LATEST))
    enrich.add_argument("--report", default=str(ENRICHMENT_REPORT))
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
    sub.add_parser("push-ipdb")

    for name in (
        "asn",
        "isp",
        "provider",
        "organization",
        "government",
        "military",
        "datacenter",
        "aptattribution",
        "tagattribution",
        "knownmalactor",
    ):
        tool = sub.add_parser(name)
        tool.add_argument("extra", nargs=argparse.REMAINDER)

    pipeline = sub.add_parser("pipeline")
    pipeline.add_argument("--input", default="")
    pipeline.add_argument("--source", default="zzxbitnodes")
    pipeline.add_argument("--theme", default="zzx_dark_olive")
    pipeline.add_argument("--settings", default="default")
    pipeline.add_argument("--tile-provider", default="cartodb_dark")
    pipeline.add_argument("--strict", action="store_true")
    pipeline.add_argument("--skip-crawl", action="store_true")
    pipeline.add_argument("--skip-enrich", action="store_true")
    pipeline.add_argument("--skip-maps", action="store_true")
    pipeline.add_argument("--skip-ipdb", action="store_true")
    pipeline.add_argument("--limit", type=int, default=5000)
    pipeline.add_argument("--workers", type=int, default=256)
    pipeline.add_argument("--git-push", action="store_true")
    pipeline.add_argument("--zzx", action="store_true")

    return parser


def command_crawl(args: argparse.Namespace) -> int:
    script = TOOLS["crawl"]

    if args.zzx and not args.original and TOOLS["zzx-crawl"].exists():
        script = TOOLS["zzx-crawl"]

    command = [
        "--limit",
        str(args.limit),
        "--workers",
        str(args.workers),
    ]

    if args.daemon:
        command.extend(
            [
                "--daemon",
                "--interval",
                str(args.interval),
            ]
        )

    if args.git_push:
        command.append("--git-push")

    return call_script(script, command)


def command_enrich(args: argparse.Namespace) -> int:
    input_path = Path(args.input).resolve() if args.input else latest_input()

    ENRICHED_DIR.mkdir(parents=True, exist_ok=True)

    command = [
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
        "--modules",
        args.modules or default_modules(),
    ]

    if args.strict:
        command.append("--strict")

    return call_script(TOOLS["enrich"], command)


def command_maps(args: argparse.Namespace) -> int:
    input_path = Path(args.input).resolve() if args.input else (
        ENRICHED_LATEST if ENRICHED_LATEST.exists() else latest_input()
    )

    command = [
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
    ]

    if args.strict:
        command.append("--strict")

    if args.no_modules:
        command.append("--no-modules")

    return call_script(TOOLS["maps"], command)


def command_geo_index() -> int:
    return call_script(TOOLS["geo-index"], ["--download"])


def command_push_ipdb() -> int:
    return call_script(TOOLS["push-ipdb"])


def command_tool(command_name: str, args: argparse.Namespace) -> int:
    extra = list(getattr(args, "extra", []) or [])

    if extra and extra[0] == "--":
        extra = extra[1:]

    return call_script(TOOLS[command_name], extra)


def command_pipeline(args: argparse.Namespace) -> int:
    if not args.skip_crawl:
        crawl_args = argparse.Namespace(
            limit=args.limit,
            workers=args.workers,
            interval=900,
            daemon=False,
            git_push=args.git_push,
            zzx=args.zzx,
            original=False,
        )

        code = command_crawl(crawl_args)

        if code != 0:
            return code

    if not args.skip_ipdb:
        code = command_push_ipdb()

        if code != 0:
            return code

    if not args.skip_enrich:
        enrich_args = argparse.Namespace(
            input=args.input,
            output=str(ENRICHED_LATEST),
            report=str(ENRICHMENT_REPORT),
            modules=default_modules(),
            source=args.source,
            strict=args.strict,
        )

        code = command_enrich(enrich_args)

        if code != 0:
            return code

    if not args.skip_maps:
        maps_args = argparse.Namespace(
            input=str(ENRICHED_LATEST),
            source=args.source,
            theme=args.theme,
            settings=args.settings,
            tile_provider=args.tile_provider,
            strict=args.strict,
            no_modules=False,
        )

        return command_maps(maps_args)

    return 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.version:
        print(f"{APP_NAME} {APP_VERSION}")
        return 0

    if args.check:
        return print_status()

    if not args.command:
        parser.print_help()
        return 1

    if args.command in {
        "run",
        "start",
        "status",
        "stop",
        "restart",
        "export-once",
        "native-crawl",
        "redis-start",
        "redis-status",
        "clone",
    }:
        return call_daemon([args.command])

    if args.command == "tail":
        return call_daemon(["tail", "--lines", str(args.lines)])

    if args.command == "crawl":
        return command_crawl(args)

    if args.command == "enrich":
        return command_enrich(args)

    if args.command == "maps":
        return command_maps(args)

    if args.command == "geo-index":
        return command_geo_index()

    if args.command == "push-ipdb":
        return command_push_ipdb()

    if args.command in {
        "asn",
        "isp",
        "provider",
        "organization",
        "government",
        "military",
        "datacenter",
        "aptattribution",
        "tagattribution",
        "knownmalactor",
    }:
        return command_tool(args.command, args)

    if args.command == "pipeline":
        return command_pipeline(args)

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
