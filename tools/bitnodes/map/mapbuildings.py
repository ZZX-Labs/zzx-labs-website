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
DEFAULT_BUILDING_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo" / "buildings"

SCHEMA = "zzx-bitnodes-map-buildings-v1"


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
        "latitude",
        "lat",
        "geoloc.latitude",
        "geo.latitude",
        "geo.lat",
        "geoip.latitude",
        "geoip.lat",
        "location.latitude",
        "metadata.latitude",
    )))

    lon = number(first(point, (
        "longitude",
        "lon",
        "lng",
        "geoloc.longitude",
        "geoloc.lon",
        "geo.longitude",
        "geo.lon",
        "geo.lng",
        "geoip.longitude",
        "geoip.lon",
        "location.longitude",
        "metadata.longitude",
    )))

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def node_address(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("address", "host", "node", "addr", "hostname")))


def context_id(point: Mapping[str, Any]) -> str:
    parts = [
        clean(first(point, ("map_country", "country", "country_code", "geoip.country_code"))).upper() or "UNKNOWN",
        clean(first(point, ("map_territory", "map_territory_code", "territory", "state", "admin1_code"))) or "UNKNOWN",
        clean(first(point, ("map_county", "map_county_code", "county", "admin2_code"))) or "Unknown",
        clean(first(point, ("map_city", "map_city_name", "city", "city_name"))) or "Unknown",
        clean(first(point, ("map_parcel", "parcel_id", "parcel_code"))) or "parcel:unknown",
    ]

    return "|".join(parts)


def point_network(point: Mapping[str, Any]) -> str:
    network = clean(first(point, ("network", "metadata.network"))).lower()

    if network:
        return network

    address = node_address(point).lower()

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


def point_owner_type(point: Mapping[str, Any]) -> str:
    checks = (
        ("military", ("is_military", "military_data.is_military", "metadata.is_military")),
        ("government", ("is_government", "government_data.is_government", "metadata.is_government")),
        ("university", ("is_university", "is_academic", "is_institute", "metadata.is_university")),
        ("datacenter", ("is_datacenter", "datacenter_data.is_datacenter", "provider_data.is_datacenter", "metadata.is_datacenter")),
        ("private", ("is_private", "is_commercial", "metadata.is_private")),
        ("public", ("is_public", "is_residential", "metadata.is_public")),
    )

    for label, keys in checks:
        for key in keys:
            value = first(point, (key,))

            if isinstance(value, bool) and value:
                return label

            if value in (1, "1"):
                return label

            if str(value or "").strip().lower() in {"true", "yes", "ok", "matched", "flagged"}:
                return label

    return "unknown"


def building_id(point: Mapping[str, Any], precision: int = 6) -> str:
    explicit = clean(first(point, (
        "building",
        "building_id",
        "building_code",
        "map_building",
        "building_data.building_id",
        "building_data.osm_id",
        "metadata.building_id",
    )))

    if explicit:
        return explicit

    lat, lon = point_lat_lon(point)

    if lat is None or lon is None:
        basis = f"{context_id(point)}|{node_address(point)}"
    else:
        basis = f"{context_id(point)}|{lat:.{precision}f}|{lon:.{precision}f}"

    digest = hashlib.sha3_256(basis.encode("utf-8")).hexdigest()[:18]
    return f"building:{digest}"


def meters_to_degrees(lat: float, meters: float) -> tuple[float, float]:
    lat_step = meters / 111_320.0
    lon_step = meters / max(1.0, 111_320.0 * math.cos(math.radians(lat)))
    return lat_step, lon_step


def rectangle_footprint(
    lat: float,
    lon: float,
    *,
    width_m: float,
    depth_m: float,
    rotation_degrees: float = 0.0,
) -> list[list[list[float]]]:
    lat_step, lon_step = meters_to_degrees(lat, 1.0)

    half_w = width_m / 2.0
    half_d = depth_m / 2.0
    theta = math.radians(rotation_degrees)

    corners_m = [
        (-half_w, -half_d),
        (half_w, -half_d),
        (half_w, half_d),
        (-half_w, half_d),
        (-half_w, -half_d),
    ]

    coords: list[list[float]] = []

    for x_m, y_m in corners_m:
        x_rot = x_m * math.cos(theta) - y_m * math.sin(theta)
        y_rot = x_m * math.sin(theta) + y_m * math.cos(theta)

        coords.append([
            lon + x_rot * lon_step,
            lat + y_rot * lat_step,
        ])

    return [coords]


def load_building_reference(building_dir: Path) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    for candidate in (
        building_dir / "buildings.json",
        building_dir / "mapbuildings.json",
        building_dir / "building-footprints.json",
    ):
        data = read_json(candidate, fallback={})

        if not isinstance(data, dict):
            continue

        rows = data.get("buildings", data.get("footprints", data))

        if isinstance(rows, dict):
            for building_key, row in rows.items():
                if isinstance(row, dict):
                    refs[str(building_key)] = row

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue

                key = clean(row.get("building_id") or row.get("osm_id") or row.get("id"))
                if key:
                    refs[key] = row

    return refs


def reference_geometry(reference: Mapping[str, Any]) -> dict[str, Any] | None:
    geometry = reference.get("geometry")

    if isinstance(geometry, Mapping):
        if geometry.get("type") in {"Polygon", "MultiPolygon"}:
            return dict(geometry)

    footprint = reference.get("footprint")

    if isinstance(footprint, Mapping):
        if footprint.get("type") in {"Polygon", "MultiPolygon"}:
            return dict(footprint)

    coordinates = reference.get("coordinates")

    if isinstance(coordinates, list):
        return {
            "type": "Polygon",
            "coordinates": coordinates,
        }

    return None


def feature_for_building(
    *,
    building_key: str,
    points_for_building: list[dict[str, Any]],
    reference: Mapping[str, Any],
    precision: int,
    footprint_size_m: float,
) -> dict[str, Any] | None:
    coords = []

    for point in points_for_building:
        lat, lon = point_lat_lon(point)
        if lat is not None and lon is not None:
            coords.append((lat, lon))

    if not coords:
        return None

    center_lat = sum(lat for lat, _lon in coords) / len(coords)
    center_lon = sum(lon for _lat, lon in coords) / len(coords)

    geometry = reference_geometry(reference)

    if geometry is None:
        width = number(reference.get("width_m"), footprint_size_m) or footprint_size_m
        depth = number(reference.get("depth_m"), footprint_size_m) or footprint_size_m
        rotation = number(reference.get("rotation_degrees"), 0.0) or 0.0

        geometry = {
            "type": "Polygon",
            "coordinates": rectangle_footprint(
                center_lat,
                center_lon,
                width_m=width,
                depth_m=depth,
                rotation_degrees=rotation,
            ),
        }

    networks: dict[str, int] = {}
    statuses: dict[str, int] = {}
    owners: dict[str, int] = {}

    for point in points_for_building:
        network = point_network(point)
        status = point_status(point)
        owner = point_owner_type(point)

        networks[network] = networks.get(network, 0) + 1
        statuses[status] = statuses.get(status, 0) + 1
        owners[owner] = owners.get(owner, 0) + 1

    owner_type = max(owners.items(), key=lambda item: item[1], default=("unknown", 0))[0]
    color = clean(reference.get("color")) or {
        "government": "#edf7b9",
        "military": "#c0d674",
        "university": "#e6a42b",
        "datacenter": "#70b7ff",
        "private": "#70b7ff",
        "public": "#c0d674",
        "unknown": "#8c927e",
    }.get(owner_type, "#8c927e")

    return {
        "type": "Feature",
        "id": building_key,
        "geometry": geometry,
        "properties": {
            "schema": SCHEMA,
            "building_id": building_key,
            "building_name": clean(reference.get("building_name") or reference.get("name")) or building_key,
            "source": clean(reference.get("source")) or "synthetic-centroid-footprint",
            "precision": precision,
            "point_count": len(points_for_building),
            "center_latitude": center_lat,
            "center_longitude": center_lon,
            "owner_type": owner_type,
            "network_counts": dict(sorted(networks.items())),
            "status_counts": dict(sorted(statuses.items())),
            "owner_counts": dict(sorted(owners.items())),
            "color": color,
            "stroke": color,
            "fill": color,
            "opacity": 0.2,
            "note": "Building footprint is a best-effort IP location polygon. It may represent registered, provider, or regional address data rather than a physically verified node location.",
            "addresses": [node_address(point) for point in points_for_building if node_address(point)],
        },
    }


def build_building_payload(
    rows: list[dict[str, Any]],
    refs: Mapping[str, Mapping[str, Any]],
    *,
    precision: int,
    footprint_size_m: float,
) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = {}

    for row in rows:
        key = building_id(row, precision=precision)
        grouped.setdefault(key, []).append(row)

    features = []

    for key, group in sorted(grouped.items(), key=lambda item: (-len(item[1]), item[0])):
        reference = refs.get(key, {})
        feature = feature_for_building(
            building_key=key,
            points_for_building=group,
            reference=reference,
            precision=precision,
            footprint_size_m=footprint_size_m,
        )

        if feature:
            features.append(feature)

    return {
        "type": "FeatureCollection",
        "schema": SCHEMA,
        "name": "ZZX Bitnodes Building Footprints",
        "generated_at": utc_now(),
        "precision": precision,
        "footprint_size_m": footprint_size_m,
        "total_points": len(rows),
        "building_count": len(features),
        "features": features,
    }


def build_building_layers(payload: Mapping[str, Any]) -> dict[str, Any]:
    features = payload.get("features", [])

    if not isinstance(features, list):
        features = []

    layers = []

    for feature in features:
        if not isinstance(feature, Mapping):
            continue

        props = feature.get("properties", {})
        if not isinstance(props, Mapping):
            props = {}

        building_id_value = clean(props.get("building_id") or feature.get("id"))
        if not building_id_value:
            continue

        layers.append({
            "id": f"building:{building_id_value}",
            "label": clean(props.get("building_name")) or building_id_value,
            "kind": "building-footprint",
            "enabled": True,
            "visible": False,
            "color": clean(props.get("color")) or "#8c927e",
            "point_count": int(props.get("point_count", 0) or 0),
            "filter": {
                "type": "building",
                "key": "map_building",
                "value": building_id_value,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-building-layers-v1",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points(rows: list[dict[str, Any]], precision: int) -> list[dict[str, Any]]:
    output = []

    for row in rows:
        item = dict(row)
        key = building_id(item, precision=precision)

        item["map_building"] = key
        item["map_building_label"] = key
        item["map_building_location_note"] = (
            "Best-effort building/registered-address footprint. "
            "Not physical proof that the node hardware is inside the building."
        )

        output.append(item)

    return output


def merge_buildings(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}

    building_dir = Path(context.get("building_dir") or context.get("map_building_dir") or DEFAULT_BUILDING_DIR)
    precision = int(context.get("building_precision") or context.get("precision") or 6)
    footprint_size_m = float(context.get("building_footprint_size_m") or context.get("footprint_size_m") or 32.0)

    output = dict(payload)
    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    refs = load_building_reference(building_dir)

    annotated = annotate_points(rows, precision=precision)
    building_payload = build_building_payload(
        annotated,
        refs,
        precision=precision,
        footprint_size_m=footprint_size_m,
    )
    building_layers = build_building_layers(building_payload)

    if vectors_payload:
        vectors_payload["points"] = annotated
        output["vectors"] = vectors_payload

    output["buildings"] = building_payload
    output["building_layers"] = building_layers

    settings = dict(output.get("settings", {}))
    settings["buildings"] = {
        "url": "./data/map-buildings.geojson",
        "layers_url": "./data/map-building-layers.json",
        "building_dir": str(building_dir),
        "precision": precision,
        "footprint_size_m": footprint_size_m,
        "enabled": True,
        "visible": False,
        "user_selectable": True,
        "location_confidence_note": (
            "Building footprints are best-effort IP geolocation/rendering approximations. "
            "They may indicate a registered address, ISP PoP, datacenter, corporate office, or regional geolocation centroid."
        ),
    }

    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_buildings(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    building_dir: Path = DEFAULT_BUILDING_DIR,
    precision: int = 6,
    footprint_size_m: float = 32.0,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})

    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_buildings(
        payload,
        {
            "building_dir": str(building_dir),
            "building_precision": precision,
            "building_footprint_size_m": footprint_size_m,
        },
    )

    buildings = merged["buildings"]
    building_layers = merged["building_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"

        write_json(data_dir / "map-buildings.geojson", buildings, compact=compact)
        write_json(data_dir / "map-building-layers.json", building_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})

        if not isinstance(settings, dict):
            settings = {}

        settings["buildings"] = merged["settings"]["buildings"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapbuildings-build-report-v1",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "building_dir": str(building_dir),
        "precision": precision,
        "footprint_size_m": footprint_size_m,
        "building_count": buildings.get("building_count", 0),
        "total_points": buildings.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build best-effort Bitnodes building footprint polygons from node IP geolocation."
    )

    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--building-dir", default=str(DEFAULT_BUILDING_DIR))
    parser.add_argument("--precision", type=int, default=6)
    parser.add_argument("--footprint-size-m", type=float, default=32.0)
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        building_dir=Path(args.building_dir).resolve(),
        precision=args.precision,
        footprint_size_m=args.footprint_size_m,
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map buildings complete: "
        f"{report['building_count']} building footprints, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
