#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]
TOOLS_BITNODES = APP_ROOT / "tools" / "bitnodes"
MAP_TOOLS = TOOLS_BITNODES / "map"

BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))
BITNODES_API = Path(os.environ.get("BITNODES_API", str(BITNODES_ROOT / "api")))
BITNODES_DATA = Path(os.environ.get("BITNODES_DATA", str(BITNODES_ROOT / "data")))

DEFAULT_SOURCE = "zzxbitnodes"
DEFAULT_MAP_DIR = BITNODES_ROOT / "maps"
DEFAULT_LIVE_MAP_DIR = BITNODES_ROOT / "live-map"
DEFAULT_INPUT = DEFAULT_LIVE_MAP_DIR / "data" / "live-map.json"
DEFAULT_SQLITE = BITNODES_DATA / "mariadb" / "api" / "bitnodes.sqlite3"
DEFAULT_DB_SHARDS = BITNODES_DATA / "mariadb"

MAP_SCHEMA = "zzx-bitnodes-live-map-build-report-v4"


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

        if path.name.endswith(".gz"):
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)

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
            default=str,
        ) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)


def clean(value: Any) -> str:
    return str(value or "").strip()


def number(value: Any) -> float | None:
    try:
        if value in ("", None):
            return None
        out = float(value)
        if out != out:
            return None
        return out
    except Exception:
        return None


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    return str(value or "").strip().lower() in {"true", "yes", "y", "ok", "reachable", "online"}


def py(script: Path, args: list[str]) -> list[str]:
    return [sys.executable, str(script), *args]


def run_step(name: str, command: list[str], cwd: Path) -> dict[str, Any]:
    started = utc_now()

    proc = subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        capture_output=True,
        check=False,
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


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)

    return current


def first(row: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)

        if value not in ("", None):
            return value

    return None


def split_host_port(address: str) -> tuple[str, int | None]:
    value = clean(address)

    if value.startswith("[") and "]" in value:
        host = value[1:value.index("]")]
        rest = value[value.index("]") + 1:]
        if rest.startswith(":") and rest[1:].isdigit():
            return host, int(rest[1:])
        return host, None

    lower = value.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        host, port = value.rsplit(":", 1)
        return host, int(port) if port.isdigit() else None

    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)
        return host, int(port) if port.isdigit() else None

    return value, None


def infer_network(address: str, row: Mapping[str, Any]) -> str:
    explicit = clean(first(row, "network", "address_family", "metadata.network")).lower()

    if explicit:
        return explicit

    lower = address.lower()

    if ".onion" in lower:
        return "tor"

    if ".i2p" in lower:
        return "i2p"

    if ":" in lower and lower.count(":") > 1:
        return "ipv6"

    if lower.count(".") >= 3:
        return "ipv4"

    return "unknown"


def normalize_original_array(address: str, value: list[Any]) -> dict[str, Any]:
    padded = list(value) + [None] * max(0, 24 - len(value))
    metadata = padded[19] if isinstance(padded[19], Mapping) else {}
    host, port = split_host_port(address)

    return {
        "address": address,
        "host": host,
        "port": port or 8333,
        "protocol": padded[0],
        "agent": padded[1],
        "services": padded[2],
        "timestamp": padded[3],
        "height": padded[4],
        "hostname": padded[5],
        "city": padded[6],
        "country": padded[7],
        "latitude": padded[8],
        "longitude": padded[9],
        "timezone": padded[10],
        "asn": padded[11],
        "organization": padded[12],
        "provider": padded[13],
        "metadata": dict(metadata),
        "reachable": True,
        "raw": value,
    }


def normalize_node(address: str, value: Any, source: str) -> dict[str, Any] | None:
    if isinstance(value, Mapping):
        row = dict(value)
        address = clean(first(row, "address", "canonical_address", "node", "addr", "host") or address)
    elif isinstance(value, list):
        row = normalize_original_array(address, value)
    else:
        return None

    lat = number(first(row, "latitude", "lat", "geoip.latitude", "geoloc.latitude", "metadata.latitude"))
    lon = number(first(row, "longitude", "lon", "lng", "geoip.longitude", "geoloc.longitude", "metadata.longitude"))

    network = infer_network(address, row)

    if lat is None or lon is None:
        if network == "tor":
            lat, lon = 0.0, -32.0
        elif network == "i2p":
            lat, lon = 0.0, 32.0
        else:
            return None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None

    host, port = split_host_port(address)

    threat_level = clean(first(row, "threat_level", "tag_threat_level", "threat_infrastructure.threat_level", "metadata.threat_level"))
    sanctioned = boolish(first(row, "is_sanctioned_node", "sanctions_data.is_sanctioned", "metadata.is_sanctioned_node"))
    policy_restricted = boolish(first(row, "is_policy_restricted_node", "sanctions_data.is_policy_restricted", "metadata.is_policy_restricted_node"))

    point = {
        "address": address,
        "host": clean(first(row, "host", "hostname") or host),
        "port": int(first(row, "port") or port or 8333),
        "source": source,
        "network": network,
        "latitude": lat,
        "longitude": lon,
        "lat": lat,
        "lon": lon,
        "reachable": boolish(first(row, "reachable", "reachable_now")),
        "reachable_now": boolish(first(row, "reachable_now", "reachable")),
        "reachable_24h": boolish(first(row, "reachable_24h")),
        "protocol": first(row, "protocol", "version"),
        "agent": first(row, "agent", "user_agent", "subver"),
        "height": first(row, "height", "block_height"),
        "services": first(row, "services"),
        "country": first(row, "country", "country_code", "country_data.country_code"),
        "country_code": first(row, "country_code", "country_data.country_code", "metadata.country_code"),
        "country_name": first(row, "country_name", "country_data.country_name", "metadata.country_name"),
        "continent": first(row, "continent", "continent_data.continent", "metadata.continent"),
        "region": first(row, "region", "region_name", "metadata.region"),
        "territory": first(row, "territory", "state", "admin1", "metadata.territory"),
        "county": first(row, "county", "district", "admin2", "metadata.county"),
        "city": first(row, "city", "city_name", "metadata.city"),
        "zip": first(row, "zip", "zipcode", "postal_code", "postcode", "metadata.zip"),
        "timezone": first(row, "timezone", "iana_timezone", "metadata.timezone"),
        "asn": first(row, "asn", "asn_data.asn", "metadata.asn"),
        "organization": first(row, "organization", "org", "asn_data.organization", "metadata.organization"),
        "provider": first(row, "provider", "provider_data.provider", "metadata.provider"),
        "w3w": first(row, "w3w", "what3words", "w3w_data.w3w"),
        "zzxgcs": first(row, "zzxgcs", "zzxgcs_data.zzxgcs"),
        "geohash": first(row, "geohash", "geohashid_data.geohash"),
        "geohashid": first(row, "geohashid", "geohashid_data.geohashid"),
        "is_tor": boolish(first(row, "is_tor", "tor.is_tor")) or network == "tor",
        "is_i2p": boolish(first(row, "is_i2p", "i2p.is_i2p")) or network == "i2p",
        "is_vpn": boolish(first(row, "is_vpn", "vpn.is_vpn")),
        "is_proxy": boolish(first(row, "is_proxy", "proxy.is_proxy")),
        "is_sanctioned_node": sanctioned,
        "is_policy_restricted_node": policy_restricted,
        "is_threat_infrastructure": boolish(first(row, "is_threat_infrastructure", "threat_infrastructure.is_threat_infrastructure")),
        "threat_level": threat_level or "none",
        "threat_color": first(row, "threat_color", "tag_threat_color", "threat_infrastructure.map.threat_color"),
        "marker_ring": sanctioned or policy_restricted or boolish(first(row, "is_threat_infrastructure")),
        "marker_color": marker_color(network, sanctioned, policy_restricted, threat_level),
    }

    return point


def marker_color(network: str, sanctioned: bool, policy_restricted: bool, threat_level: str) -> str:
    if sanctioned:
        return "#ff0000"

    if policy_restricted:
        return "#ff3b30"

    if threat_level in {"confirmed", "high"}:
        return "#ff0000"

    if threat_level == "medium":
        return "#ff9500"

    if threat_level == "low":
        return "#ffcc00"

    return {
        "tor": "#8f5cff",
        "i2p": "#ff8a00",
        "ipv6": "#4da3ff",
        "cjdns": "#00d1b2",
        "ipv4": "#c0d674",
    }.get(network, "#d1d1d1")


def extract_nodes(payload: Any, source: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    if isinstance(payload, Mapping):
        nodes = payload.get("nodes")

        if isinstance(nodes, Mapping):
            for address, value in nodes.items():
                row = normalize_node(str(address), value, source)
                if row:
                    rows.append(row)
            return rows

        if isinstance(nodes, list):
            for index, value in enumerate(nodes):
                row = normalize_node(str(index), value, source)
                if row:
                    rows.append(row)
            return rows

        for key in ("points", "rows", "data", "results", "peers", "node_records", "reachable_nodes"):
            value = payload.get(key)

            if isinstance(value, list):
                for index, item in enumerate(value):
                    row = normalize_node(str(index), item, source)
                    if row:
                        rows.append(row)
                return rows

            if isinstance(value, Mapping):
                return extract_nodes({"nodes": value}, source)

        vectors = payload.get("vectors")
        if isinstance(vectors, Mapping) and isinstance(vectors.get("points"), list):
            return extract_nodes({"points": vectors["points"]}, source)

    if isinstance(payload, list):
        for index, item in enumerate(payload):
            row = normalize_node(str(index), item, source)
            if row:
                rows.append(row)

    return rows


def load_nodes_from_json(input_path: Path, source: str) -> list[dict[str, Any]]:
    payload = read_json(input_path, fallback={})
    return extract_nodes(payload, source)


def sqlite_available(path: Path) -> bool:
    return path.exists() and path.is_file()


def load_nodes_from_sqlite(sqlite_path: Path, source: str, limit: int) -> list[dict[str, Any]]:
    if not sqlite_available(sqlite_path):
        return []

    conn = sqlite3.connect(str(sqlite_path))
    conn.row_factory = sqlite3.Row

    try:
        query = """
            SELECT *
            FROM bitnodes_api_nodes
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
        """
        params: list[Any] = []

        if source:
            query += " AND source_name = ?"
            params.append(source)

        query += " ORDER BY reachable_now DESC, height DESC, address ASC"

        if limit > 0:
            query += " LIMIT ?"
            params.append(limit)

        records = [dict(row) for row in conn.execute(query, tuple(params)).fetchall()]
    finally:
        conn.close()

    rows: list[dict[str, Any]] = []

    for record in records:
        row = normalize_node(clean(record.get("address")), record, clean(record.get("source_name") or source))
        if row:
            rows.append(row)

    return rows


def sql_gz_paths(root: Path) -> list[Path]:
    if not root.exists():
        return []

    return sorted(root.rglob("*.sql.gz"))


def load_nodes_from_sql_gz(root: Path, source: str, limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for path in sql_gz_paths(root):
        if source and source not in path.as_posix() and "mixed" not in path.as_posix():
            continue

        try:
            with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
                text = handle.read(16 * 1024 * 1024)
        except Exception:
            continue

        for match in re.finditer(r"\{.*?\}", text, flags=re.DOTALL):
            try:
                payload = json.loads(match.group(0))
            except Exception:
                continue

            if not isinstance(payload, Mapping):
                continue

            row = normalize_node(clean(payload.get("address")), payload, source)
            if row:
                rows.append(row)

            if limit > 0 and len(rows) >= limit:
                return rows

    return rows


def write_live_input(path: Path, rows: list[dict[str, Any]], source: str, compact: bool = False) -> None:
    payload = {
        "schema": "zzx-bitnodes-live-map-input-v4",
        "generated_at": utc_now(),
        "source": source,
        "node_count": len(rows),
        "nodes": rows,
    }
    write_json(path, payload, compact=compact)


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
        steps.append(
            {
                "name": name,
                "started_at": utc_now(),
                "finished_at": utc_now(),
                "returncode": 1 if required else 0,
                "ok": not required,
                "stdout": "",
                "stderr": f"missing {'required' if required else 'optional'} tool: {script}",
                "command": [str(script), *args],
            }
        )
        return

    final_args = list(args)

    if compact and "--compact" not in final_args:
        final_args.append("--compact")

    steps.append(run_step(name, py(script, final_args), APP_ROOT))


def build_fallback_vectors(rows: list[dict[str, Any]], vectors_path: Path, geojson_path: Path, compact: bool = False) -> None:
    points = []
    features = []

    for index, row in enumerate(rows):
        lat = number(row.get("latitude"))
        lon = number(row.get("longitude"))

        if lat is None or lon is None:
            continue

        point = {
            "id": row.get("address") or f"node-{index}",
            "type": "node",
            "source": row.get("source"),
            "network": row.get("network"),
            "lat": lat,
            "lon": lon,
            "latitude": lat,
            "longitude": lon,
            "marker_color": row.get("marker_color"),
            "marker_ring": row.get("marker_ring"),
            "properties": row,
        }
        points.append(point)

        features.append(
            {
                "type": "Feature",
                "id": point["id"],
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat],
                },
                "properties": row,
            }
        )

    write_json(
        vectors_path,
        {
            "schema": "zzx-bitnodes-map-vectors-v4",
            "generated_at": utc_now(),
            "point_count": len(points),
            "points": points,
            "vectors": {
                "points": points,
            },
        },
        compact=compact,
    )

    write_json(
        geojson_path,
        {
            "type": "FeatureCollection",
            "schema": "zzx-bitnodes-map-geojson-v4",
            "generated_at": utc_now(),
            "features": features,
        },
        compact=compact,
    )


def load_best_nodes(
    *,
    input_path: Path,
    sqlite_path: Path,
    db_shards: Path,
    source: str,
    limit: int,
    prefer_db: bool,
) -> tuple[list[dict[str, Any]], str]:
    if prefer_db:
        rows = load_nodes_from_sqlite(sqlite_path, source, limit)

        if rows:
            return rows, "sqlite"

        rows = load_nodes_from_sql_gz(db_shards, source, limit)

        if rows:
            return rows, "mariadb-sql-gz"

    if input_path.exists():
        rows = load_nodes_from_json(input_path, source)

        if rows:
            return rows[:limit] if limit > 0 else rows, "json"

    rows = load_nodes_from_sqlite(sqlite_path, source, limit)

    if rows:
        return rows, "sqlite"

    rows = load_nodes_from_sql_gz(db_shards, source, limit)

    if rows:
        return rows, "mariadb-sql-gz"

    return [], "none"


def build_live_map(
    *,
    input_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    sqlite_path: Path,
    db_shards: Path,
    source: str,
    theme: str,
    settings: str,
    tile_provider: str,
    limit: int,
    compact: bool = False,
    fail_empty: bool = False,
    no_plotter: bool = False,
    prefer_db: bool = True,
    fallback_vectors: bool = True,
) -> dict[str, Any]:
    data_dir = live_map_dir / "data"
    map_data_dir = map_dir / "data"

    data_dir.mkdir(parents=True, exist_ok=True)
    map_data_dir.mkdir(parents=True, exist_ok=True)

    vectors_path = data_dir / "map-vectors.json"
    geojson_path = data_dir / "map-points.geojson"
    generated_live_json = data_dir / "live-map.json"

    steps: list[dict[str, Any]] = []

    rows, input_mode = load_best_nodes(
        input_path=input_path,
        sqlite_path=sqlite_path,
        db_shards=db_shards,
        source=source,
        limit=limit,
        prefer_db=prefer_db,
    )

    if not rows:
        return build_report(
            ok=False,
            steps=steps,
            map_dir=map_dir,
            live_map_dir=live_map_dir,
            source=source,
            input_mode=input_mode,
            reason="no usable nodes with coordinates found",
        )

    write_live_input(generated_live_json, rows, source, compact=compact)

    if not no_plotter and (MAP_TOOLS / "mapplotter.py").exists():
        plotter_args = [
            "--input",
            str(generated_live_json),
            "--output-dir",
            str(map_data_dir),
            "--live-output-dir",
            str(data_dir),
            "--source",
            source,
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

    vector_input = choose_vector_input(generated_live_json, input_path, vectors_path)

    run_tool_if_exists(
        steps=steps,
        name="mapvectors",
        script=MAP_TOOLS / "mapvectors.py",
        args=[
            "--input",
            str(vector_input),
            "--output",
            str(vectors_path),
            "--geojson",
            str(geojson_path),
            "--source",
            source,
        ],
        compact=compact,
        required=False,
    )

    if (not vectors_path.exists() or point_count(vectors_path) == 0) and fallback_vectors:
        build_fallback_vectors(rows, vectors_path, geojson_path, compact=compact)
        steps.append(
            {
                "name": "fallback_vectors",
                "started_at": utc_now(),
                "finished_at": utc_now(),
                "returncode": 0,
                "ok": True,
                "stdout": "built fallback vectors directly from live-map input",
                "stderr": "",
                "command": [],
            }
        )

    copy_if_exists(vectors_path, map_data_dir / "map-vectors.json")
    copy_if_exists(geojson_path, map_data_dir / "map-points.geojson")

    optional_simple_tools = [
        ("mapsettings", ["--map-dir", str(map_dir), "--live-map-dir", str(live_map_dir), "--settings", settings]),
        ("mapthemes", ["--map-dir", str(map_dir), "--live-map-dir", str(live_map_dir), "--theme", theme]),
        ("openstreetmaps", ["--map-dir", str(map_dir), "--live-map-dir", str(live_map_dir), "--tile-provider", tile_provider]),
        ("vector_types", ["--map-dir", str(map_dir), "--live-map-dir", str(live_map_dir)]),
    ]

    for name, args in optional_simple_tools:
        run_tool_if_exists(
            steps=steps,
            name=name,
            script=MAP_TOOLS / f"{name}.py",
            args=args,
            compact=compact,
            required=False,
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
                "--vectors",
                str(vectors_path),
                "--map-dir",
                str(map_dir),
                "--live-map-dir",
                str(live_map_dir),
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
            input_mode=input_mode,
            reason=f"empty live-map output: points={points}, features={features}",
        )

    return build_report(
        ok=ok,
        steps=steps,
        map_dir=map_dir,
        live_map_dir=live_map_dir,
        source=source,
        input_mode=input_mode,
        reason="" if ok else f"empty live-map output: points={points}, features={features}",
    )


def build_report(
    *,
    ok: bool,
    steps: list[dict[str, Any]],
    map_dir: Path,
    live_map_dir: Path,
    source: str,
    input_mode: str,
    reason: str = "",
) -> dict[str, Any]:
    vectors = read_json(live_map_dir / "data" / "map-vectors.json", fallback={})
    geojson = read_json(live_map_dir / "data" / "map-points.geojson", fallback={})
    live_input = read_json(live_map_dir / "data" / "live-map.json", fallback={})

    features = geojson.get("features", []) if isinstance(geojson, dict) else []
    points = vectors.get("points", []) if isinstance(vectors, dict) else []
    nodes = live_input.get("nodes", []) if isinstance(live_input, dict) else []

    return {
        "schema": MAP_SCHEMA,
        "generated_at": utc_now(),
        "ok": ok,
        "reason": reason,
        "source": source,
        "input_mode": input_mode,
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "node_count": len(nodes) if isinstance(nodes, list) else 0,
        "point_count": len(points) if isinstance(points, list) else 0,
        "geojson_feature_count": len(features) if isinstance(features, list) else 0,
        "red_ring_semantics": {
            "is_sanctioned_node": "red marker ring",
            "is_policy_restricted_node": "red-orange marker ring",
            "confirmed_or_high_threat": "red marker",
        },
        "steps": steps,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build complete ZZX Bitnodes live-map data assets from MariaDB/SQLite shards or JSON fallback.",
        allow_abbrev=False,
    )

    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--sqlite", default=str(DEFAULT_SQLITE))
    parser.add_argument("--db-shards", default=str(DEFAULT_DB_SHARDS))
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--theme", default="zzx_dark_olive")
    parser.add_argument("--settings", default="live")
    parser.add_argument("--tile-provider", default="cartodb_dark")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--fail-empty", action="store_true")
    parser.add_argument("--no-plotter", action="store_true")
    parser.add_argument("--no-db", action="store_true")
    parser.add_argument("--no-fallback-vectors", action="store_true")

    args = parser.parse_args()

    payload = build_live_map(
        input_path=resolve_path(args.input),
        sqlite_path=resolve_path(args.sqlite),
        db_shards=resolve_path(args.db_shards),
        map_dir=resolve_path(args.map_dir),
        live_map_dir=resolve_path(args.live_map_dir),
        source=args.source,
        theme=args.theme,
        settings=args.settings,
        tile_provider=args.tile_provider,
        limit=args.limit,
        compact=args.compact,
        fail_empty=args.fail_empty,
        no_plotter=args.no_plotter,
        prefer_db=not args.no_db,
        fallback_vectors=not args.no_fallback_vectors,
    )

    report_path = (
        resolve_path(args.report)
        if args.report
        else resolve_path(args.live_map_dir) / "data" / "live-map-build-report.json"
    )

    write_json(report_path, payload, compact=args.compact)

    print(
        "live-map complete: "
        f"ok={payload['ok']}, "
        f"mode={payload['input_mode']}, "
        f"nodes={payload['node_count']}, "
        f"points={payload['point_count']}, "
        f"features={payload['geojson_feature_count']}"
    )

    if payload["reason"]:
        print(f"live-map reason: {payload['reason']}", file=sys.stderr)

    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
