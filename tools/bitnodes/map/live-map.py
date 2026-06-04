#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[3]
TOOLS_BITNODES = APP_ROOT / "tools" / "bitnodes"
MAP_TOOLS = TOOLS_BITNODES / "map"

DEFAULT_SOURCE = "zzxbitnodes"

DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"

DEFAULT_INPUT = DEFAULT_LIVE_MAP_DIR / "data" / "live-map.json"
DEFAULT_VECTORS = DEFAULT_LIVE_MAP_DIR / "data" / "map-vectors.json"
DEFAULT_GEOJSON = DEFAULT_LIVE_MAP_DIR / "data" / "map-points.geojson"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    text = json.dumps(
        payload,
        ensure_ascii=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
        sort_keys=not compact,
    )

    path.write_text(text + "\n", encoding="utf-8")


def py(script: Path, *args: str) -> list[str]:
    return [sys.executable, str(script), *args]


def run_step(name: str, command: list[str], cwd: Path) -> dict[str, Any]:
    started = utc_now()

    proc = subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        capture_output=True,
    )

    return {
        "name": name,
        "started_at": started,
        "finished_at": utc_now(),
        "returncode": proc.returncode,
        "ok": proc.returncode == 0,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
        "command": command,
    }


def choose_input(path: Path, fallback_vectors: Path) -> Path:
    if path.exists():
        return path

    if fallback_vectors.exists():
        return fallback_vectors

    return path


def build_live_map(
    *,
    input_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    source: str,
    theme: str,
    settings: str,
    tile_provider: str,
    compact: bool = False,
    fail_empty: bool = False,
) -> dict[str, Any]:
    data_dir = live_map_dir / "data"
    map_data_dir = map_dir / "data"

    data_dir.mkdir(parents=True, exist_ok=True)
    map_data_dir.mkdir(parents=True, exist_ok=True)

    vectors_path = data_dir / "map-vectors.json"
    geojson_path = data_dir / "map-points.geojson"

    steps: list[dict[str, Any]] = []

    selected_input = choose_input(input_path, vectors_path)

    steps.append(run_step(
        "mapplotter",
        py(
            MAP_TOOLS / "mapplotter.py",
            "--input", str(selected_input),
            "--output-dir", str(map_data_dir),
            "--live-output-dir", str(data_dir),
            "--source", source,
            *("--compact",) if compact else (),
            *("--fail-empty",) if fail_empty else (),
        ),
        APP_ROOT,
    ))

    if not steps[-1]["ok"]:
        return report(False, steps, map_dir, live_map_dir, source)

    plotter_vectors_input = data_dir / "live-map.json"
    if not plotter_vectors_input.exists():
        plotter_vectors_input = selected_input

    steps.append(run_step(
        "mapvectors",
        py(
            MAP_TOOLS / "mapvectors.py",
            "--input", str(plotter_vectors_input),
            "--output", str(vectors_path),
            "--geojson", str(geojson_path),
            "--source", source,
            *("--compact",) if compact else (),
        ),
        APP_ROOT,
    ))

    if not steps[-1]["ok"]:
        return report(False, steps, map_dir, live_map_dir, source)

    for target in (
        map_data_dir / "map-vectors.json",
        map_data_dir / "map-points.geojson",
    ):
        if target.name == "map-vectors.json":
            write_json(target, read_json(vectors_path, fallback={}), compact=compact)
        else:
            write_json(target, read_json(geojson_path, fallback={}), compact=compact)

    steps.append(run_step(
        "mapsettings",
        py(
            MAP_TOOLS / "mapsettings.py",
            "--map-dir", str(map_dir),
            "--live-map-dir", str(live_map_dir),
            "--settings", settings,
            *("--compact",) if compact else (),
        ),
        APP_ROOT,
    ))

    steps.append(run_step(
        "mapthemes",
        py(
            MAP_TOOLS / "mapthemes.py",
            "--map-dir", str(map_dir),
            "--live-map-dir", str(live_map_dir),
            "--theme", theme,
            *("--compact",) if compact else (),
        ),
        APP_ROOT,
    ))

    steps.append(run_step(
        "openstreetmaps",
        py(
            MAP_TOOLS / "openstreetmaps.py",
            "--map-dir", str(map_dir),
            "--live-map-dir", str(live_map_dir),
            "--tile-provider", tile_provider,
            *("--compact",) if compact else (),
        ),
        APP_ROOT,
    ))

    steps.append(run_step(
        "vector_types",
        py(
            MAP_TOOLS / "vector_types.py",
            "--map-dir", str(map_dir),
            "--live-map-dir", str(live_map_dir),
            *("--compact",) if compact else (),
        ),
        APP_ROOT,
    ))

    steps.append(run_step(
        "maplayers",
        py(
            MAP_TOOLS / "maplayers.py",
            "--vectors", str(vectors_path),
            "--map-dir", str(map_dir),
            "--live-map-dir", str(live_map_dir),
            *("--compact",) if compact else (),
        ),
        APP_ROOT,
    ))

    steps.append(run_step(
        "mapoverlays",
        py(
            MAP_TOOLS / "mapoverlays.py",
            "--vectors", str(vectors_path),
            "--map-dir", str(map_dir),
            "--live-map-dir", str(live_map_dir),
            *("--compact",) if compact else (),
        ),
        APP_ROOT,
    ))

    steps.append(run_step(
        "mappolygons",
        py(
            MAP_TOOLS / "mappolygons.py",
            "--vectors", str(vectors_path),
            "--map-dir", str(map_dir),
            "--live-map-dir", str(live_map_dir),
            *("--compact",) if compact else (),
        ),
        APP_ROOT,
    ))

    ok = all(step["ok"] for step in steps)
    return report(ok, steps, map_dir, live_map_dir, source)


def report(
    ok: bool,
    steps: list[dict[str, Any]],
    map_dir: Path,
    live_map_dir: Path,
    source: str,
) -> dict[str, Any]:
    vectors = read_json(live_map_dir / "data" / "map-vectors.json", fallback={})
    geojson = read_json(live_map_dir / "data" / "map-points.geojson", fallback={})

    features = geojson.get("features", []) if isinstance(geojson, dict) else []
    point_count = vectors.get("point_count", 0) if isinstance(vectors, dict) else 0

    return {
        "schema": "zzx-bitnodes-live-map-build-report-v1",
        "generated_at": utc_now(),
        "ok": ok,
        "source": source,
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "point_count": point_count,
        "geojson_feature_count": len(features) if isinstance(features, list) else 0,
        "steps": steps,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build complete ZZX Bitnodes live-map data assets."
    )

    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--theme", default="zzx_dark_olive")
    parser.add_argument("--settings", default="live")
    parser.add_argument("--tile-provider", default="cartodb_dark")
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--fail-empty", action="store_true")

    args = parser.parse_args()

    build_report = build_live_map(
        input_path=Path(args.input).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        source=args.source,
        theme=args.theme,
        settings=args.settings,
        tile_provider=args.tile_provider,
        compact=args.compact,
        fail_empty=args.fail_empty,
    )

    if args.report:
        write_json(Path(args.report), build_report, compact=args.compact)

    print(
        "live-map complete: "
        f"ok={build_report['ok']}, "
        f"points={build_report['point_count']}, "
        f"features={build_report['geojson_feature_count']}"
    )

    return 0 if build_report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
