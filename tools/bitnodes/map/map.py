#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
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


def py(script: Path, args: list[str]) -> list[str]:
    return [sys.executable, str(script), *args]


def run(command: list[str]) -> int:
    print(f"[map.py] {' '.join(command)}", flush=True)
    return subprocess.call(command, cwd=str(APP_ROOT))


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def feature_count(path: Path) -> int:
    data = read_json(path)
    if isinstance(data, dict) and isinstance(data.get("features"), list):
        return len(data["features"])
    return 0


def point_count(path: Path) -> int:
    data = read_json(path)
    if isinstance(data, dict) and isinstance(data.get("points"), list):
        return len(data["points"])
    return 0


def validate_input(path_text: str, strict: bool) -> Path | None:
    if not path_text:
        return None

    path = Path(path_text)

    if not path.is_absolute():
        path = APP_ROOT / path

    if path.exists() and path.is_file() and path.stat().st_size > 0:
        return path

    message = f"[map.py] missing or empty input: {path}"

    if strict:
        print(message, file=sys.stderr, flush=True)
        raise SystemExit(1)

    print(message, file=sys.stderr, flush=True)
    return None


def common_args(args: argparse.Namespace) -> list[str]:
    out = [
        "--map-dir", args.map_dir,
        "--live-map-dir", args.live_map_dir,
        "--source", args.source,
        "--theme", args.theme,
        "--settings", args.settings,
        "--tile-provider", args.tile_provider,
    ]

    if args.compact:
        out.append("--compact")

    return out


def run_maps(args: argparse.Namespace, input_path: Path | None) -> int:
    cmd_args: list[str] = []

    if input_path is not None:
        cmd_args.extend(["--input", str(input_path)])

    cmd_args.extend([
        "--api-dir", args.api_dir,
        "--state-dir", args.state_dir,
    ])

    cmd_args.extend(common_args(args))

    if args.strict:
        cmd_args.append("--strict")

    if args.no_modules:
        cmd_args.append("--no-modules")

    return run(py(MAP_TOOLS_DIR / "maps.py", cmd_args))


def run_live_map(args: argparse.Namespace, input_path: Path | None) -> int:
    live_input = input_path

    if live_input is None:
        candidate = Path(args.live_map_dir) / "data" / "live-map.json"
        if not candidate.is_absolute():
            candidate = APP_ROOT / candidate
        live_input = candidate

    cmd_args = [
        "--input", str(live_input),
        *common_args(args),
    ]

    if args.fail_empty:
        cmd_args.append("--fail-empty")

    return run(py(MAP_TOOLS_DIR / "live-map.py", cmd_args))


def run_vectors_fallback(args: argparse.Namespace, input_path: Path | None) -> int:
    if input_path is None:
        print("[map.py] cannot build vector fallback without input", file=sys.stderr, flush=True)
        return 1 if args.fail_empty or args.strict else 0

    live_data = Path(args.live_map_dir) / "data"
    maps_data = Path(args.map_dir) / "data"

    if not live_data.is_absolute():
        live_data = APP_ROOT / live_data

    if not maps_data.is_absolute():
        maps_data = APP_ROOT / maps_data

    live_data.mkdir(parents=True, exist_ok=True)
    maps_data.mkdir(parents=True, exist_ok=True)

    vector_path = live_data / "map-vectors.json"
    geojson_path = live_data / "map-points.geojson"

    cmd_args = [
        "--input", str(input_path),
        "--output", str(vector_path),
        "--geojson", str(geojson_path),
        "--source", args.source,
    ]

    if args.compact:
        cmd_args.append("--compact")

    code = run(py(MAP_TOOLS_DIR / "mapvectors.py", cmd_args))

    if code != 0:
        return code

    for src, dst in (
        (vector_path, maps_data / "map-vectors.json"),
        (geojson_path, maps_data / "map-points.geojson"),
    ):
        dst.write_bytes(src.read_bytes())

    return 0


def validate_nonempty(args: argparse.Namespace) -> int:
    live_data = Path(args.live_map_dir) / "data"

    if not live_data.is_absolute():
        live_data = APP_ROOT / live_data

    geojson = live_data / "map-points.geojson"
    vectors = live_data / "map-vectors.json"

    features = feature_count(geojson)
    points = point_count(vectors)

    if features > 0 and points > 0:
        return 0

    message = f"[map.py] empty map output: features={features}, points={points}"

    if args.fail_empty or args.strict:
        print(message, file=sys.stderr, flush=True)
        return 1

    print(message, flush=True)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="ZZX Bitnodes map wrapper. Builds maps/, live-map/, or both.",
        allow_abbrev=False,
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
    parser.add_argument("--vectors-fallback", action="store_true")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    input_path = validate_input(args.input, strict=args.strict or args.fail_empty)

    if args.target in {"maps", "both"}:
        code = run_maps(args, input_path)
        if code != 0:
            return code

    if args.target in {"live-map", "both"}:
        code = run_live_map(args, input_path)
        if code != 0:
            if args.vectors_fallback:
                code = run_vectors_fallback(args, input_path)
            if code != 0:
                return code

    if args.target in {"live-map", "both"}:
        features = feature_count(Path(args.live_map_dir) / "data" / "map-points.geojson")
        points = point_count(Path(args.live_map_dir) / "data" / "map-vectors.json")

        if (features <= 0 or points <= 0) and args.vectors_fallback:
            code = run_vectors_fallback(args, input_path)
            if code != 0:
                return code

        code = validate_nonempty(args)
        if code != 0:
            return code

    print(f"[map.py] complete target={args.target} at {utc_now()}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
