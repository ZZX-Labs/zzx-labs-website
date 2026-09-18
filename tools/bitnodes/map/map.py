#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]
MAP_TOOLS_DIR = APP_ROOT / "tools" / "bitnodes" / "map"

BITNODES_ROOT = APP_ROOT / "bitcoin" / "bitnodes"
DEFAULT_MAP_DIR = BITNODES_ROOT / "maps"
DEFAULT_LIVE_MAP_DIR = BITNODES_ROOT / "live-map"
DEFAULT_API_DIR = BITNODES_ROOT / "api"
DEFAULT_STATE_DIR = BITNODES_ROOT / "data" / "state"
DEFAULT_SQLITE = BITNODES_ROOT / "data" / "mariadb" / "api" / "bitnodes.sqlite3"
DEFAULT_DB_SHARDS = BITNODES_ROOT / "data" / "mariadb"
DEFAULT_PUBLIC_INPUT_DIR = BITNODES_ROOT / "data" / "map-public-input"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def resolve_path(value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else APP_ROOT / path


def py(script: Path, args: list[str]) -> list[str]:
    return [sys.executable, str(script), *args]


def run(command: list[str]) -> int:
    print(f"[map.py] {' '.join(command)}", flush=True)
    return subprocess.call(command, cwd=str(APP_ROOT))


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


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


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return row.get(key)

    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)

    return current


def first(row: Mapping[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = deep_get(row, key)
        if value not in ("", None):
            return value
    return None


def valid_coord(lat: Any, lon: Any) -> bool:
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except Exception:
        return False

    return -90 <= lat_f <= 90 and -180 <= lon_f <= 180


def row_coord(row: Mapping[str, Any]) -> tuple[Any, Any]:
    lat = first(row, (
        "latitude",
        "lat",
        "geo.latitude",
        "geoip.latitude",
        "geoip_data.latitude",
        "geoloc.latitude",
        "location.latitude",
        "metadata.latitude",
    ))

    lon = first(row, (
        "longitude",
        "lon",
        "lng",
        "geo.longitude",
        "geoip.longitude",
        "geoip_data.longitude",
        "geoloc.longitude",
        "location.longitude",
        "metadata.longitude",
    ))

    return lat, lon


def node_key(row: Mapping[str, Any], index: int) -> str:
    for key in ("address", "node", "addr", "id", "host", "hostname"):
        value = row.get(key)
        if value not in ("", None):
            return str(value)

    return f"node-{index:08d}"


def normalize_node_rows(payload: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    metadata: dict[str, Any] = {}

    if isinstance(payload, dict):
        if isinstance(payload.get("metadata"), dict):
            metadata = dict(payload["metadata"])

        nodes = payload.get("nodes")

        if isinstance(nodes, dict):
            rows: list[dict[str, Any]] = []

            for index, (key, value) in enumerate(nodes.items()):
                if isinstance(value, dict):
                    row = dict(value)
                    row.setdefault("address", key)
                    rows.append(row)
                elif isinstance(value, list):
                    row = list_node_to_dict(value, key, index)
                    rows.append(row)

            return rows, metadata

        if isinstance(nodes, list):
            return [
                dict(row)
                for row in nodes
                if isinstance(row, dict)
            ], metadata

        if isinstance(payload.get("points"), list):
            return [
                dict(row)
                for row in payload["points"]
                if isinstance(row, dict)
            ], metadata

        vectors = payload.get("vectors")
        if isinstance(vectors, dict) and isinstance(vectors.get("points"), list):
            return [
                dict(row)
                for row in vectors["points"]
                if isinstance(row, dict)
            ], metadata

        if payload.get("type") == "FeatureCollection" and isinstance(payload.get("features"), list):
            rows = []

            for index, feature in enumerate(payload["features"]):
                if not isinstance(feature, dict):
                    continue

                props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
                geom = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else {}
                coords = geom.get("coordinates")

                row = dict(props)

                if isinstance(coords, list) and len(coords) >= 2:
                    row["longitude"] = coords[0]
                    row["lon"] = coords[0]
                    row["latitude"] = coords[1]
                    row["lat"] = coords[1]

                row.setdefault("address", feature.get("id") or f"feature-{index:08d}")
                rows.append(row)

            return rows, metadata

        rows = []

        for index, (key, value) in enumerate(payload.items()):
            if isinstance(value, dict):
                row = dict(value)
                row.setdefault("address", key)
                rows.append(row)
            elif isinstance(value, list):
                row = list_node_to_dict(value, key, index)
                rows.append(row)

        return rows, metadata

    if isinstance(payload, list):
        return [
            dict(row)
            for row in payload
            if isinstance(row, dict)
        ], metadata

    return [], metadata


def list_node_to_dict(value: list[Any], key: str, index: int) -> dict[str, Any]:
    row: dict[str, Any] = {
        "address": key or f"node-{index:08d}",
        "raw": value,
    }

    if len(value) > 0:
        row["services"] = value[0]
    if len(value) > 1:
        row["timestamp"] = value[1]
    if len(value) > 2:
        row["user_agent"] = value[2]
        row["agent"] = value[2]
    if len(value) > 3:
        row["protocol"] = value[3]
    if len(value) > 4:
        row["height"] = value[4]
    if len(value) > 5:
        row["hostname"] = value[5]
    if len(value) > 6:
        row["city"] = value[6]
    if len(value) > 7:
        row["country"] = value[7]
        row["country_code"] = value[7]
    if len(value) > 8:
        row["latitude"] = value[8]
        row["lat"] = value[8]
    if len(value) > 9:
        row["longitude"] = value[9]
        row["lon"] = value[9]
    if len(value) > 10:
        row["timezone"] = value[10]
    if len(value) > 11:
        row["asn"] = value[11]
    if len(value) > 12:
        row["organization"] = value[12]
        row["provider"] = value[12]

    return row


def cap_payload_for_public_map(
    input_path: Path,
    *,
    output_path: Path,
    max_points: int,
    compact: bool,
) -> Path:
    payload = read_json(input_path)

    if payload is None:
        raise SystemExit(f"[map.py] cannot read map input JSON: {input_path}")

    rows, metadata = normalize_node_rows(payload)

    coordinate_rows: list[dict[str, Any]] = []
    skipped = 0

    for row in rows:
        lat, lon = row_coord(row)

        if valid_coord(lat, lon):
            row["latitude"] = float(lat)
            row["lat"] = float(lat)
            row["longitude"] = float(lon)
            row["lon"] = float(lon)
            coordinate_rows.append(row)
        else:
            skipped += 1

    max_points = max(1, int(max_points))
    capped = coordinate_rows[:max_points]

    nodes = {
        node_key(row, index): row
        for index, row in enumerate(capped)
    }

    output = {
        "schema": "zzx-bitnodes-public-safe-map-input-v1",
        "generated_at": utc_now(),
        "source_input": str(input_path),
        "public_safe": True,
        "max_points": max_points,
        "original_rows": len(rows),
        "coordinate_rows": len(coordinate_rows),
        "skipped_without_coordinates": skipped,
        "emitted_nodes": len(nodes),
        "metadata": {
            **metadata,
            "public_safe": True,
            "public_map_input": True,
            "public_feature_limit": max_points,
            "original_rows": len(rows),
            "coordinate_rows": len(coordinate_rows),
            "emitted_nodes": len(nodes),
        },
        "nodes": nodes,
    }

    write_json(output_path, output, compact=compact)

    print(
        "[map.py] public-safe input built: "
        f"{output_path} rows={len(rows)} coordinate_rows={len(coordinate_rows)} "
        f"emitted={len(nodes)} max_points={max_points}",
        flush=True,
    )

    if not nodes:
        raise SystemExit("[map.py] public-safe map input has zero coordinate-bearing nodes")

    return output_path


def feature_count(path: Path) -> int:
    data = read_json(path)

    if isinstance(data, dict) and isinstance(data.get("features"), list):
        return len(data["features"])

    return 0


def point_count(path: Path) -> int:
    data = read_json(path)

    if isinstance(data, dict):
        if isinstance(data.get("points"), list):
            return len(data["points"])

        vectors = data.get("vectors")
        if isinstance(vectors, dict) and isinstance(vectors.get("points"), list):
            return len(vectors["points"])

    return 0


def validate_input(path_text: str, strict: bool) -> Path | None:
    if not path_text:
        return None

    path = resolve_path(path_text)

    if path.exists() and path.is_file() and path.stat().st_size > 0:
        return path

    message = f"[map.py] missing or empty input: {path}"

    if strict:
        print(message, file=sys.stderr, flush=True)
        raise SystemExit(1)

    print(message, file=sys.stderr, flush=True)
    return None


def base_args(args: argparse.Namespace) -> list[str]:
    out = [
        "--map-dir", args.map_dir,
        "--live-map-dir", args.live_map_dir,
        "--source", args.source,
        "--theme", args.theme,
        "--settings", args.settings,
        "--tile-provider", args.tile_provider,
        "--limit", str(args.effective_limit),
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
        "--sqlite", args.sqlite,
        "--db-shards", args.db_shards,
    ])

    cmd_args.extend(base_args(args))

    if args.strict:
        cmd_args.append("--strict")

    if args.no_modules:
        cmd_args.append("--no-modules")

    if args.no_db:
        cmd_args.append("--no-db")

    return run(py(MAP_TOOLS_DIR / "maps.py", cmd_args))


def run_live_map(args: argparse.Namespace, input_path: Path | None) -> int:
    live_input = input_path

    if live_input is None:
        live_input = resolve_path(Path(args.live_map_dir) / "data" / "live-map.json")

    cmd_args = [
        "--input", str(live_input),
        "--sqlite", args.sqlite,
        "--db-shards", args.db_shards,
        *base_args(args),
    ]

    if args.fail_empty:
        cmd_args.append("--fail-empty")

    if args.no_plotter:
        cmd_args.append("--no-plotter")

    if args.no_db:
        cmd_args.append("--no-db")

    if args.no_fallback_vectors:
        cmd_args.append("--no-fallback-vectors")

    return run(py(MAP_TOOLS_DIR / "live-map.py", cmd_args))


def run_vectors_fallback(args: argparse.Namespace, input_path: Path | None) -> int:
    live_data = resolve_path(Path(args.live_map_dir) / "data")
    maps_data = resolve_path(Path(args.map_dir) / "data")

    candidate = input_path or live_data / "live-map.json"

    if not candidate.exists():
        print("[map.py] cannot build vector fallback without input", file=sys.stderr, flush=True)
        return 1 if args.fail_empty or args.strict else 0

    live_data.mkdir(parents=True, exist_ok=True)
    maps_data.mkdir(parents=True, exist_ok=True)

    vector_path = live_data / "map-vectors.json"
    geojson_path = live_data / "map-points.geojson"

    cmd_args = [
        "--input", str(candidate),
        "--output", str(vector_path),
        "--geojson", str(geojson_path),
        "--source", args.source,
        "--limit", str(args.effective_limit),
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
        if src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(src.read_bytes())

    return 0


def validate_nonempty(args: argparse.Namespace) -> int:
    live_data = resolve_path(Path(args.live_map_dir) / "data")
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


def build_public_aliases(args: argparse.Namespace) -> None:
    for directory in (Path(args.map_dir), Path(args.live_map_dir)):
        directory = resolve_path(directory)
        data_dir = directory / "data"

        src = data_dir / "map-vectors.json"
        dst = data_dir / "map-vectors-public.json"

        if src.exists():
            dst.write_bytes(src.read_bytes())
            print(f"[map.py] wrote public vector alias: {dst}", flush=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="ZZX Bitnodes map wrapper. Builds maps/, live-map/, or both from MariaDB/SQLite/JSON.",
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
    parser.add_argument("--sqlite", default=str(DEFAULT_SQLITE))
    parser.add_argument("--db-shards", default=str(DEFAULT_DB_SHARDS))
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))

    parser.add_argument("--source", default="zzxbitnodes")
    parser.add_argument("--theme", default="zzx_dark_olive")
    parser.add_argument("--settings", default="default")
    parser.add_argument("--tile-provider", default="cartodb_dark")
    parser.add_argument("--limit", type=int, default=0)

    parser.add_argument("--public-safe", action="store_true")
    parser.add_argument("--max-points", type=int, default=5000)
    parser.add_argument("--public-input-output", default="")

    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--no-modules", action="store_true")
    parser.add_argument("--no-db", action="store_true")
    parser.add_argument("--no-plotter", action="store_true")
    parser.add_argument("--no-fallback-vectors", action="store_true")
    parser.add_argument("--fail-empty", action="store_true")
    parser.add_argument("--vectors-fallback", action="store_true")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    input_path = validate_input(args.input, strict=args.strict or args.fail_empty)

    args.effective_limit = int(args.limit or 0)

    if args.public_safe:
        if input_path is None:
            print("[map.py] --public-safe requires --input", file=sys.stderr, flush=True)
            return 1

        max_points = max(1, int(args.max_points or 5000))
        args.effective_limit = max_points

        if args.public_input_output:
            public_input = resolve_path(args.public_input_output)
        else:
            public_input = DEFAULT_PUBLIC_INPUT_DIR / f"{args.source}.latest.public-map-input.json"

        input_path = cap_payload_for_public_map(
            input_path,
            output_path=public_input,
            max_points=max_points,
            compact=args.compact,
        )

    if args.target in {"maps", "both"}:
        code = run_maps(args, input_path)

        if code != 0:
            return code

    if args.target in {"live-map", "both"}:
        code = run_live_map(args, input_path)

        if code != 0 and args.vectors_fallback:
            code = run_vectors_fallback(args, input_path)

        if code != 0:
            return code

    if args.target in {"live-map", "both"}:
        live_data = resolve_path(Path(args.live_map_dir) / "data")
        features = feature_count(live_data / "map-points.geojson")
        points = point_count(live_data / "map-vectors.json")

        if (features <= 0 or points <= 0) and args.vectors_fallback:
            code = run_vectors_fallback(args, input_path)

            if code != 0:
                return code

        code = validate_nonempty(args)

        if code != 0:
            return code

    if args.public_safe:
        build_public_aliases(args)

    print(f"[map.py] complete target={args.target} at {utc_now()}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
