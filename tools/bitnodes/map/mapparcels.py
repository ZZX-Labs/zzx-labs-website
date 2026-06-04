#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"
DEFAULT_PARCEL_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo" / "parcels"

SCHEMA = "zzx-bitnodes-map-parcels-v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()
    if text.lower() in {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}:
        return ""
    return " ".join(text.split())


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(n):
        return fallback
    return n


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


def vectors(payload: Mapping[str, Any]) -> dict[str, Any]:
    value = payload.get("vectors", {})
    return value if isinstance(value, dict) else {}


def points(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    vectors_payload = vectors(payload)

    for key in ("points", "results", "data"):
        value = vectors_payload.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    for key in ("points", "results", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    return []


def point_lat_lon(point: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(first(point, (
        "latitude", "lat",
        "geoloc.latitude",
        "geo.latitude", "geo.lat",
        "geoip.latitude", "geoip.lat",
        "location.latitude",
        "metadata.latitude",
    )))

    lon = number(first(point, (
        "longitude", "lon", "lng",
        "geoloc.longitude", "geoloc.lon",
        "geo.longitude", "geo.lon", "geo.lng",
        "geoip.longitude", "geoip.lon",
        "location.longitude",
        "metadata.longitude",
    )))

    if lat is None or lon is None:
        return None, None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None
    return lat, lon


def base_context(point: Mapping[str, Any]) -> dict[str, str]:
    return {
        "country": clean(first(point, ("map_country", "country", "country_code", "geoip.country_code"))).upper() or "UNKNOWN",
        "territory": clean(first(point, ("map_territory_code", "territory_code", "state_code", "admin1_code"))).upper() or "UNKNOWN",
        "county": clean(first(point, ("map_county_code", "county", "county_code", "admin2_code"))) or "Unknown",
        "city": clean(first(point, ("map_city_name", "city", "city_name", "place_name"))) or "Unknown",
    }


def parcel_code(point: Mapping[str, Any], precision: int = 5) -> str:
    explicit = clean(first(point, (
        "parcel",
        "parcel_id",
        "parcel_code",
        "map_parcel",
        "parcel_data.parcel_id",
        "parcel_data.parcel_code",
        "metadata.parcel_id",
        "metadata.parcel_code",
    )))

    if explicit:
        return explicit

    lat, lon = point_lat_lon(point)
    ctx = base_context(point)

    if lat is None or lon is None:
        basis = json.dumps(ctx, sort_keys=True)
    else:
        basis = f"{ctx['country']}|{ctx['territory']}|{ctx['county']}|{ctx['city']}|{lat:.{precision}f}|{lon:.{precision}f}"

    digest = hashlib.sha3_256(basis.encode("utf-8")).hexdigest()[:16]
    return f"parcel:{digest}"


def point_network(point: Mapping[str, Any]) -> str:
    network = clean(first(point, ("network", "metadata.network"))).lower()
    if network:
        return network

    address = clean(first(point, ("address", "host", "node", "addr"))).lower()
    if ".onion" in address:
        return "tor"
    if ".i2p" in address:
        return "i2p"
    if ":" in address and ".onion" not in address and ".i2p" not in address:
        return "ipv6"
    if address.count(".") >= 3:
        return "ipv4"
    return "unknown"


def point_status(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("status", "metadata.status"))).lower() or "unknown"


def load_parcel_reference(parcel_dir: Path) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    for candidate in (
        parcel_dir / "parcels.json",
        parcel_dir / "mapparcels.json",
        parcel_dir / "parcel-index.json",
    ):
        data = read_json(candidate, fallback={})
        if not isinstance(data, dict):
            continue

        rows = data.get("parcels", data.get("parcel_index", data))

        if isinstance(rows, dict):
            for parcel_id, row in rows.items():
                if isinstance(row, dict):
                    refs[str(parcel_id)] = row

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue
                parcel_id = clean(row.get("parcel_id") or row.get("parcel_code") or row.get("id"))
                if parcel_id:
                    refs[parcel_id] = row

    return refs


def build_parcel_summary(rows: list[dict[str, Any]], refs: Mapping[str, Mapping[str, Any]], precision: int) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}

    for row in rows:
        parcel_id = parcel_code(row, precision=precision)
        ctx = base_context(row)
        reference = refs.get(parcel_id, {})

        item = grouped.setdefault(parcel_id, {
            "id": parcel_id,
            "parcel_id": parcel_id,
            "parcel_name": clean(reference.get("parcel_name") or reference.get("name")) or parcel_id,
            "country": ctx["country"],
            "territory": ctx["territory"],
            "county": ctx["county"],
            "city": ctx["city"],
            "color": clean(reference.get("color")) or "#8c927e",
            "point_count": 0,
            "network_counts": {},
            "status_counts": {},
            "coordinates": [],
        })

        item["point_count"] += 1

        network = point_network(row)
        status = point_status(row)

        item["network_counts"][network] = item["network_counts"].get(network, 0) + 1
        item["status_counts"][status] = item["status_counts"].get(status, 0) + 1

        lat, lon = point_lat_lon(row)
        if lat is not None and lon is not None:
            item["coordinates"].append((lat, lon))

    parcels = {}

    for key, item in grouped.items():
        coords = item.pop("coordinates", [])

        if coords:
            lats = [lat for lat, _lon in coords]
            lons = [lon for _lat, lon in coords]
            item["centroid"] = {
                "latitude": sum(lats) / len(lats),
                "longitude": sum(lons) / len(lons),
                "south": min(lats),
                "north": max(lats),
                "west": min(lons),
                "east": max(lons),
            }
        else:
            item["centroid"] = {}

        item["network_counts"] = dict(sorted(item["network_counts"].items()))
        item["status_counts"] = dict(sorted(item["status_counts"].items()))
        parcels[key] = item

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "precision": precision,
        "total_points": len(rows),
        "parcel_count": len(parcels),
        "parcels": dict(sorted(parcels.items(), key=lambda pair: (-pair[1]["point_count"], pair[0]))),
    }


def build_parcel_layers(payload: Mapping[str, Any]) -> dict[str, Any]:
    parcels = payload.get("parcels", {})
    if not isinstance(parcels, Mapping):
        parcels = {}

    layers = []

    for parcel_id, parcel in parcels.items():
        if not isinstance(parcel, Mapping):
            continue

        layers.append({
            "id": f"parcel:{parcel_id}",
            "label": parcel.get("parcel_name", str(parcel_id)),
            "kind": "parcel-filter",
            "enabled": True,
            "visible": False,
            "color": parcel.get("color", "#8c927e"),
            "point_count": parcel.get("point_count", 0),
            "filter": {
                "type": "parcel",
                "key": "map_parcel",
                "value": parcel_id,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-parcel-layers-v1",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points(rows: list[dict[str, Any]], parcel_payload: Mapping[str, Any], precision: int) -> list[dict[str, Any]]:
    parcels = parcel_payload.get("parcels", {})
    if not isinstance(parcels, Mapping):
        parcels = {}

    output = []

    for row in rows:
        item = dict(row)
        parcel_id = parcel_code(item, precision=precision)
        ref = parcels.get(parcel_id, {})

        item["map_parcel"] = parcel_id
        item["map_parcel_label"] = clean(ref.get("parcel_name")) or parcel_id
        item["map_parcel_color"] = clean(ref.get("color")) or "#8c927e"

        output.append(item)

    return output


def merge_parcels(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    parcel_dir = Path(context.get("parcel_dir") or context.get("map_parcel_dir") or DEFAULT_PARCEL_DIR)
    precision = int(context.get("parcel_precision") or context.get("precision") or 5)

    output = dict(payload)
    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    refs = load_parcel_reference(parcel_dir)

    parcel_payload = build_parcel_summary(rows, refs, precision)
    parcel_layers = build_parcel_layers(parcel_payload)
    annotated = annotate_points(rows, parcel_payload, precision)

    if vectors_payload:
        vectors_payload["points"] = annotated
        output["vectors"] = vectors_payload

    output["parcels"] = parcel_payload
    output["parcel_layers"] = parcel_layers

    settings = dict(output.get("settings", {}))
    settings["parcels"] = {
        "url": "./data/map-parcels.json",
        "layers_url": "./data/map-parcel-layers.json",
        "parcel_dir": str(parcel_dir),
        "precision": precision,
        "enabled": True,
        "user_selectable": True,
        "note": "Parcel IDs are deterministic synthetic buckets unless official parcel reference data is supplied.",
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_parcels(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    parcel_dir: Path = DEFAULT_PARCEL_DIR,
    precision: int = 5,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})
    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_parcels(payload, {"parcel_dir": str(parcel_dir), "parcel_precision": precision})
    parcels = merged["parcels"]
    parcel_layers = merged["parcel_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"
        write_json(data_dir / "map-parcels.json", parcels, compact=compact)
        write_json(data_dir / "map-parcel-layers.json", parcel_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})
        if not isinstance(settings, dict):
            settings = {}

        settings["parcels"] = merged["settings"]["parcels"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapparcels-build-report-v1",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "parcel_dir": str(parcel_dir),
        "precision": precision,
        "parcel_count": parcels.get("parcel_count", 0),
        "total_points": parcels.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Bitnodes map parcel summaries and synthetic parcel filters.")
    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--parcel-dir", default=str(DEFAULT_PARCEL_DIR))
    parser.add_argument("--precision", type=int, default=5)
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        parcel_dir=Path(args.parcel_dir).resolve(),
        precision=args.precision,
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map parcels complete: "
        f"{report['parcel_count']} parcels, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
