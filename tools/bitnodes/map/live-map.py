#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
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


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def resolve_path(value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else APP_ROOT / path


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
        ) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)


def py(script: Path, args: list[str]) -> list[str]:
    return [sys.executable, str(script), *args]


def run_step(name: str, command: list[str], cwd: Path) -> dict[str, Any]:
    started = utc_now()

    proc = subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        capture_output=True,
    )

    stdout = proc.stdout.strip()
    stderr = proc.stderr.strip()

    if stdout:
        print(stdout, flush=True)

    if stderr:
        print(stderr, file=sys.stderr, flush=True)

    return {
        "name": name,
        "started_at": started,
        "finished_at": utc_now(),
        "returncode": proc.returncode,
        "ok": proc.returncode == 0,
        "stdout": stdout,
        "stderr": stderr,
        "command": command,
    }


def json_has_nodes(path: Path) -> bool:
    payload = read_json(path, fallback={})

    if isinstance(payload, list):
        return len(payload) > 0

    if not isinstance(payload, dict):
        return False

    for key in ("nodes", "rows", "data", "results", "peers", "node_records", "points", "features"):
        value = payload.get(key)

        if isinstance(value, dict) and value:
            return True

        if isinstance(value, list) and value:
            return True

    vectors = payload.get("vectors")

    if isinstance(vectors, dict):
        points = vectors.get("points")
        if isinstance(points, list) and points:
            return True

    return False


def point_count(path: Path) -> int:
    payload = read_json(path, fallback={})

    if isinstance(payload, dict):
        points = payload.get("points")
        if isinstance(points, list):
            return len(points)

        vectors = payload.get("vectors")
        if isinstance(vectors, dict) and isinstance(vectors.get("points"), list):
            return len(vectors["points"])

    return 0


def feature_count(path: Path) -> int:
    payload = read_json(path, fallback={})

    if isinstance(payload, dict) and isinstance(payload.get("features"), list):
        return len(payload["features"])

    return 0


def choose_vector_input(original_input: Path, generated_live_json: Path, vectors_path: Path) -> Path:
    if generated_live_json.exists() and generated_live_json.stat().st_size > 0 and json_has_nodes(generated_live_json):
        return generated_live_json

    if original_input.exists() and original_input.stat().st_size > 0 and json_has_nodes(original_input):
        return original_input

    if vectors_path.exists() and vectors_path.stat().st_size > 0 and json_has_nodes(vectors_path):
        return vectors_path

    return original_input


def copy_if_exists(src: Path, dst: Path) -> None:
    if not src.exists():
        return

    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def run_tool_if_exists(
    *,
    steps: list[dict[str, Any]],
    name: str,
    script: Path,
    args: list[str],
    compact: bool,
    required: bool = False,
) -> None:
    if not script.exists():
        steps.append({
            "name": name,
            "started_at": utc_now(),
            "finished_at": utc_now(),
            "returncode": 0 if not required else 1,
            "ok": not required,
            "stdout": "",
            "stderr": f"missing optional tool: {script}",
            "command": [str(script), *args],
        })
        return

    if compact and "--compact" not in args:
        args.append("--compact")

    steps.append(run_step(name, py(script, args), APP_ROOT))


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
    no_plotter: bool = False,
) -> dict[str, Any]:
    data_dir = live_map_dir / "data"
    map_data_dir = map_dir / "data"

    data_dir.mkdir(parents=True, exist_ok=True)
    map_data_dir.mkdir(parents=True, exist_ok=True)

    vectors_path = data_dir / "map-vectors.json"
    geojson_path = data_dir / "map-points.geojson"
    generated_live_json = data_dir / "live-map.json"

    steps: list[dict[str, Any]] = []

    if not input_path.exists() or input_path.stat().st_size <= 0:
        return build_report(
            ok=False,
            steps=steps,
            map_dir=map_dir,
            live_map_dir=live_map_dir,
            source=source,
            reason=f"missing or empty input: {input_path}",
        )

    if not no_plotter and (MAP_TOOLS / "mapplotter.py").exists():
        plotter_args = [
            "--input", str(input_path),
            "--output-dir", str(map_data_dir),
            "--live-output-dir", str(data_dir),
            "--source", source,
        ]

        if fail_empty:
            plotter_args.append("--fail-empty")

        run_tool_if_exists(
            steps=steps,
            name="mapplotter",
            script=MAP_TOOLS / "mapplotter.py",
            args=plotter_args,
            compact=compact,
            required=False,
        )

    vector_input = choose_vector_input(input_path, generated_live_json, vectors_path)

    vector_args = [
        "--input", str(vector_input),
        "--output", str(vectors_path),
        "--geojson", str(geojson_path),
        "--source", source,
    ]

    run_tool_if_exists(
        steps=steps,
        name="mapvectors",
        script=MAP_TOOLS / "mapvectors.py",
        args=vector_args,
        compact=compact,
        required=True,
    )

    if not steps[-1]["ok"]:
        return build_report(
            ok=False,
            steps=steps,
            map_dir=map_dir,
            live_map_dir=live_map_dir,
            source=source,
            reason="mapvectors failed",
        )

    copy_if_exists(vectors_path, map_data_dir / "map-vectors.json")
    copy_if_exists(geojson_path, map_data_dir / "map-points.geojson")

    run_tool_if_exists(
        steps=steps,
        name="mapsettings",
        script=MAP_TOOLS / "mapsettings.py",
        args=[
            "--map-dir", str(map_dir),
            "--live-map-dir", str(live_map_dir),
            "--settings", settings,
        ],
        compact=compact,
    )

    run_tool_if_exists(
        steps=steps,
        name="mapthemes",
        script=MAP_TOOLS / "mapthemes.py",
        args=[
            "--map-dir", str(map_dir),
            "--live-map-dir", str(live_map_dir),
            "--theme", theme,
        ],
        compact=compact,
    )

    run_tool_if_exists(
        steps=steps,
        name="openstreetmaps",
        script=MAP_TOOLS / "openstreetmaps.py",
        args=[
            "--map-dir", str(map_dir),
            "--live-map-dir", str(live_map_dir),
            "--tile-provider", tile_provider,
        ],
        compact=compact,
    )

    run_tool_if_exists(
        steps=steps,
        name="vector_types",
        script=MAP_TOOLS / "vector_types.py",
        args=[
            "--map-dir", str(map_dir),
            "--live-map-dir", str(live_map_dir),
        ],
        compact=compact,
    )

    for name in (
        "maplayers",
        "mapoverlays",
        "mappolygons",
        "mapregions",
        "mapcontinents",
        "mapcountries",
        "mapterritories",
        "mapcounties",
        "mapcities",
        "mapparcels",
        "mapbuildings",
        "maptimezones",
        "mapw3waddresses",
        "mapzzxgcsaddresses",
        "mapgeohashids",
        "mapnodes",
    ):
        run_tool_if_exists(
            steps=steps,
            name=name,
            script=MAP_TOOLS / f"{name}.py",
            args=[
                "--vectors", str(vectors_path),
                "--map-dir", str(map_dir),
                "--live-map-dir", str(live_map_dir),
            ],
            compact=compact,
            required=False,
        )

    points = point_count(vectors_path)
    features = feature_count(geojson_path)

    ok = points > 0 and features > 0

    if fail_empty and not ok:
        return build_report(
            ok=False,
            steps=steps,
            map_dir=map_dir,
            live_map_dir=live_map_dir,
            source=source,
            reason=f"empty live-map output: points={points}, features={features}",
        )

    return build_report(
        ok=ok if fail_empty else all(step["ok"] or "missing optional tool" in step.get("stderr", "") for step in steps),
        steps=steps,
        map_dir=map_dir,
        live_map_dir=live_map_dir,
        source=source,
        reason="" if ok else f"empty live-map output: points={points}, features={features}",
    )


def build_report(
    *,
    ok: bool,
    steps: list[dict[str, Any]],
    map_dir: Path,
    live_map_dir: Path,
    source: str,
    reason: str = "",
) -> dict[str, Any]:
    vectors = read_json(live_map_dir / "data" / "map-vectors.json", fallback={})
    geojson = read_json(live_map_dir / "data" / "map-points.geojson", fallback={})

    features = geojson.get("features", []) if isinstance(geojson, dict) else []
    points = vectors.get("points", []) if isinstance(vectors, dict) else []

    return {
        "schema": "zzx-bitnodes-live-map-build-report-v2",
        "generated_at": utc_now(),
        "ok": ok,
        "reason": reason,
        "source": source,
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "point_count": len(points) if isinstance(points, list) else 0,
        "geojson_feature_count": len(features) if isinstance(features, list) else 0,
        "steps": steps,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build complete ZZX Bitnodes live-map data assets.",
        allow_abbrev=False,
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
    parser.add_argument("--no-plotter", action="store_true")

    args = parser.parse_args()

    build_report_payload = build_live_map(
        input_path=resolve_path(args.input),
        map_dir=resolve_path(args.map_dir),
        live_map_dir=resolve_path(args.live_map_dir),
        source=args.source,
        theme=args.theme,
        settings=args.settings,
        tile_provider=args.tile_provider,
        compact=args.compact,
        fail_empty=args.fail_empty,
        no_plotter=args.no_plotter,
    )

    report_path = resolve_path(args.report) if args.report else resolve_path(args.live_map_dir) / "data" / "live-map-build-report.json"
    write_json(report_path, build_report_payload, compact=args.compact)

    print(
        "live-map complete: "
        f"ok={build_report_payload['ok']}, "
        f"points={build_report_payload['point_count']}, "
        f"features={build_report_payload['geojson_feature_count']}"
    )

    if build_report_payload["reason"]:
        print(f"live-map reason: {build_report_payload['reason']}", file=sys.stderr)

    return 0 if build_report_payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
