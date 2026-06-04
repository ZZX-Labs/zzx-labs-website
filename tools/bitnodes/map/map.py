#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[3]
MAP_TOOLS_DIR = APP_ROOT / "tools" / "bitnodes" / "map"

DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"
DEFAULT_API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_STATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def py(script: Path, *args: str) -> list[str]:
    return [sys.executable, str(script), *args]


def run(command: list[str]) -> int:
    print(f"[map.py] {' '.join(command)}", flush=True)
    return subprocess.call(command, cwd=str(APP_ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="ZZX Bitnodes map wrapper. Builds maps/, live-map/, or both."
    )

    parser.add_argument(
        "target",
        nargs="?",
        default="both",
        choices=["maps", "live-map", "both"],
    )

    parser.add_argument("--input", default="")
    parser.add_argument("--api-dir", default=str(DEFAULT_API_DIR))
    parser.add_argument("--state-dir", default=str(DEFAULT_STATE_DIR))
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--source", default="zzxbitnodes")
    parser.add_argument("--theme", default="zzx_dark_olive")
    parser.add_argument("--settings", default="default")
    parser.add_argument("--tile-provider", default="cartodb_dark")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--no-modules", action="store_true")
    parser.add_argument("--fail-empty", action="store_true")

    args = parser.parse_args()

    common = [
        "--map-dir", args.map_dir,
        "--live-map-dir", args.live_map_dir,
        "--source", args.source,
        "--theme", args.theme,
        "--settings", args.settings,
        "--tile-provider", args.tile_provider,
    ]

    if args.compact:
        common.append("--compact")

    if args.target in {"maps", "both"}:
        cmd = py(
            MAP_TOOLS_DIR / "maps.py",
            *("--input", args.input) if args.input else (),
            "--api-dir", args.api_dir,
            "--state-dir", args.state_dir,
            *common,
            *("--strict",) if args.strict else (),
            *("--no-modules",) if args.no_modules else (),
        )

        code = run(cmd)

        if code != 0:
            return code

    if args.target in {"live-map", "both"}:
        live_input = args.input or str(Path(args.live_map_dir) / "data" / "live-map.json")

        cmd = py(
            MAP_TOOLS_DIR / "live-map.py",
            "--input", live_input,
            *common,
            *("--fail-empty",) if args.fail_empty else (),
        )

        code = run(cmd)

        if code != 0:
            return code

    print(f"[map.py] complete target={args.target} at {utc_now()}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
