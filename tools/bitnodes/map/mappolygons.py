#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]
BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))

DEFAULT_MAP_DIR = BITNODES_ROOT / "maps"
DEFAULT_LIVE_MAP_DIR = BITNODES_ROOT / "live-map"
DEFAULT_POLYGON_DIR = BITNODES_ROOT / "data" / "geo" / "polygons"

SCHEMA = "zzx-bitnodes-map-polygons-v4"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()
    return "" if text.lower() in UNKNOWN_VALUES else " ".join(text.split())


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        if value in ("", None):
            return fallback
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    return n if math.isfinite(n) else fallback


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    return str(value or "").strip().lower() in {
        "true", "yes", "y", "ok", "1", "reachable", "online",
        "success", "flagged", "matched", "listed", "hit", "confirmed",
    }


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

    path.write_text(
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


def deep_get(row: Mapping[str, Any], key: str) -> Any:
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


def flag(row: Mapping[str, Any], keys: tuple[str, ...]) -> bool:
    return any(boolish(first(row, (key,))) for key in keys)


def vectors(payload: Mapping[str, Any]) -> dict[str, Any]:
    value = payload.get("vectors", {})
    return value if isinstance(value, dict) else {}


def points(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    candidates = [vectors(payload), payload]

    for source in candidates:
        for key in ("points", "results", "data", "rows", "nodes"):
            value = source.get(key)

            if isinstance(value, list):
                return [dict(row) for row in value if isinstance(row, Mapping)]

            if isinstance(value, Mapping):
                return [
                    {"address": str(address), **dict(row)}
                    for address, row in value.items()
                    if isinstance(row, Mapping)
                ]

    geojson = payload.get("geojson")
    if isinstance(geojson, Mapping) and isinstance(geojson.get("features"), list):
        rows = []

        for index, feature in enumerate(geojson["features"]):
            if not isinstance(feature, Mapping):
                continue

            props = feature.get("properties") if isinstance(feature.get("properties"), Mapping) else {}
            geom = feature.get("geometry") if isinstance(feature.get("geometry"), Mapping) else {}
            coords = geom.get("coordinates") if isinstance(geom.get("coordinates"), list) else []

            row = dict(props)
            row.setdefault("id", feature.get("id") or f"feature-{index:08d}")

            if len(coords) >= 2:
                row.setdefault("longitude", coords[0])
                row.setdefault("latitude", coords[1])

            rows.append(row)

        return rows

    return []


def point_lat_lon(point: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(first(point, (
        "latitude", "lat", "geoloc.latitude", "geo.latitude", "geo.lat",
        "geoip.latitude", "geoip.lat", "geoip_data.latitude",
        "location.latitude", "metadata.latitude",
    )))

    lon = number(first(point, (
        "longitude", "lon", "lng", "geoloc.longitude", "geoloc.lon",
        "geo.longitude", "geo.lon", "geo.lng", "geoip.longitude",
        "geoip.lon", "geoip_data.longitude", "location.longitude",
        "metadata.longitude",
    )))

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def point_country(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "country", "country_code", "country_data.country_code",
        "geoip.country_code", "geoip_data.country_code",
        "location.country_code", "metadata.country_code",
    ))) or "Unknown"


def point_network(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "network", "metadata.network", "network_type", "geoip.network_type",
    ))).lower() or "unknown"


def point_status(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("status", "metadata.status"))).lower() or "unknown"


def is_sanctioned(point: Mapping[str, Any]) -> bool:
    return flag(point, (
        "is_sanctioned", "is_sanctioned_node",
        "sanctions_data.is_sanctioned", "metadata.is_sanctioned_node",
    ))


def is_policy_restricted(point: Mapping[str, Any]) -> bool:
    return flag(point, (
        "policy_restricted", "is_policy_restricted_node",
        "sanctions_data.is_policy_restricted", "metadata.is_policy_restricted_node",
    ))


def is_threat(point: Mapping[str, Any]) -> bool:
    level = clean(first(point, (
        "threat_level", "tag_threat_level", "threat_infrastructure.threat_level",
        "tag_attribution.threat_level", "metadata.threat_level",
    ))).lower()

    return flag(point, (
        "is_threat_infrastructure", "suspected_threat_infrastructure",
        "threat_infrastructure.is_threat_infrastructure",
        "confirmed_intelligence_match",
    )) or level in {"confirmed", "high", "medium", "low"}


def polygon_feature(
    *,
    feature_id: str,
    name: str,
    coordinates: list[list[list[float]]],
    properties: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": feature_id,
        "geometry": {"type": "Polygon", "coordinates": coordinates},
        "properties": {"name": name, **(properties or {})},
    }


def rectangle_polygon(*, west: float, south: float, east: float, north: float) -> list[list[list[float]]]:
    return [[[west, south], [east, south], [east, north], [west, north], [west, south]]]


def world_bounds_feature() -> dict[str, Any]:
    return polygon_feature(
        feature_id="world_bounds",
        name="World Bounds",
        coordinates=rectangle_polygon(west=-180.0, south=-85.0, east=180.0, north=85.0),
        properties={
            "kind": "reference-bounds",
            "stroke": "#c0d674",
            "fill": "transparent",
            "opacity": 0.22,
            "interactive": False,
        },
    )


def bucket_key(lat: float, lon: float, size: int) -> tuple[int, int]:
    return math.floor(lat / size) * size, math.floor(lon / size) * size


def counted(values: list[str]) -> dict[str, int]:
    output: dict[str, int] = {}

    for value in values:
        key = clean(value) or "Unknown"
        output[key] = output.get(key, 0) + 1

    return dict(sorted(output.items(), key=lambda item: (-item[1], item[0])))


def build_density_grid_features(rows: list[dict[str, Any]], *, size: int, feature_prefix: str) -> list[dict[str, Any]]:
    buckets: dict[tuple[int, int], list[dict[str, Any]]] = {}

    for point in rows:
        lat, lon = point_lat_lon(point)

        if lat is None or lon is None:
            continue

        buckets.setdefault(bucket_key(lat, lon, size), []).append(point)

    if not buckets:
        return []

    max_count = max(len(value) for value in buckets.values()) or 1
    features = []

    for (south, west), bucket_rows in sorted(buckets.items(), key=lambda item: (-len(item[1]), item[0])):
        north = min(85.0, south + size)
        east = min(180.0, west + size)
        count = len(bucket_rows)
        intensity = count / max_count

        sanctioned_count = sum(1 for row in bucket_rows if is_sanctioned(row))
        restricted_count = sum(1 for row in bucket_rows if is_policy_restricted(row))
        threat_count = sum(1 for row in bucket_rows if is_threat(row))

        if sanctioned_count:
            stroke = "#ff0000"
            fill = "#ff0000"
        elif restricted_count:
            stroke = "#ff3b30"
            fill = "#ff3b30"
        elif threat_count:
            stroke = "#ff9500"
            fill = "#ff9500"
        else:
            stroke = "#c0d674"
            fill = "#c0d674"

        features.append(
            polygon_feature(
                feature_id=f"{feature_prefix}:{south}:{west}",
                name=f"{size}° Density Cell {south},{west}",
                coordinates=rectangle_polygon(west=west, south=south, east=east, north=north),
                properties={
                    "kind": "density-grid",
                    "grid_size_degrees": size,
                    "point_count": count,
                    "intensity": round(intensity, 6),
                    "networks": counted([point_network(row) for row in bucket_rows]),
                    "statuses": counted([point_status(row) for row in bucket_rows]),
                    "countries": counted([point_country(row) for row in bucket_rows]),
                    "sanctioned_nodes": sanctioned_count,
                    "policy_restricted_nodes": restricted_count,
                    "threat_infrastructure_nodes": threat_count,
                    "stroke": stroke,
                    "fill": fill,
                    "opacity": round(max(0.08, min(0.55, intensity * 0.55)), 4),
                    "marker_ring": bool(sanctioned_count or restricted_count or threat_count),
                },
            )
        )

    return features


def country_footprint_features(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}

    for point in rows:
        lat, lon = point_lat_lon(point)

        if lat is None or lon is None:
            continue

        grouped.setdefault(point_country(point), []).append(point)

    features = []

    for country, country_rows in sorted(grouped.items(), key=lambda item: (-len(item[1]), item[0])):
        if country == "Unknown":
            continue

        coords = [point_lat_lon(row) for row in country_rows]
        coords = [(lat, lon) for lat, lon in coords if lat is not None and lon is not None]

        if not coords:
            continue

        lats = [lat for lat, _lon in coords]
        lons = [lon for _lat, lon in coords]
        center_lat = sum(lats) / len(lats)
        center_lon = sum(lons) / len(lons)

        spread_lat = max(1.0, min(12.0, (max(lats) - min(lats)) / 2.0 + 0.75))
        spread_lon = max(1.0, min(12.0, (max(lons) - min(lons)) / 2.0 + 0.75))

        sanctioned_count = sum(1 for row in country_rows if is_sanctioned(row))
        restricted_count = sum(1 for row in country_rows if is_policy_restricted(row))
        threat_count = sum(1 for row in country_rows if is_threat(row))

        features.append(
            polygon_feature(
                feature_id=f"country-footprint:{country}",
                name=f"{country} Node Footprint",
                coordinates=rectangle_polygon(
                    west=max(-180.0, center_lon - spread_lon),
                    south=max(-85.0, center_lat - spread_lat),
                    east=min(180.0, center_lon + spread_lon),
                    north=min(85.0, center_lat + spread_lat),
                ),
                properties={
                    "kind": "country-footprint",
                    "country": country,
                    "point_count": len(country_rows),
                    "center_latitude": center_lat,
                    "center_longitude": center_lon,
                    "sanctioned_nodes": sanctioned_count,
                    "policy_restricted_nodes": restricted_count,
                    "threat_infrastructure_nodes": threat_count,
                    "stroke": "#ff0000" if sanctioned_count else "#ff3b30" if restricted_count else "#ff9500" if threat_count else "#e6a42b",
                    "fill": "#ff0000" if sanctioned_count else "#ff3b30" if restricted_count else "#ff9500" if threat_count else "#e6a42b",
                    "opacity": 0.18 if sanctioned_count or restricted_count or threat_count else 0.12,
                    "marker_ring": bool(sanctioned_count or restricted_count or threat_count),
                },
            )
        )

    return features


def overlay_zone(feature_id: str, name: str, west: float, east: float, network: str, color: str) -> dict[str, Any]:
    return polygon_feature(
        feature_id=feature_id,
        name=name,
        coordinates=rectangle_polygon(west=west, south=-12.0, east=east, north=12.0),
        properties={
            "kind": "overlay-zone",
            "network": network,
            "symbolic": True,
            "stroke": color,
            "fill": color,
            "opacity": 0.18,
            "note": f"{network.upper()} nodes are symbolically plotted because physical attribution is intentionally ambiguous.",
        },
    )


def load_external_polygon_features(polygon_dir: Path) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []

    if not polygon_dir.exists():
        return features

    paths = sorted(polygon_dir.glob("*.geojson")) + sorted(polygon_dir.glob("*.json")) + sorted(polygon_dir.glob("*.geojson.gz")) + sorted(polygon_dir.glob("*.json.gz"))

    for path in paths:
        payload = read_json(path, fallback={})

        if not isinstance(payload, Mapping):
            continue

        found = []
        if payload.get("type") == "FeatureCollection" and isinstance(payload.get("features"), list):
            found = [feature for feature in payload["features"] if isinstance(feature, Mapping)]
        elif payload.get("type") == "Feature":
            found = [payload]

        for feature in found:
            item = dict(feature)
            props = item.get("properties") if isinstance(item.get("properties"), Mapping) else {}
            item["properties"] = {**dict(props), "source_file": path.name, "external_polygon": True}
            features.append(item)

    return features


def build_polygon_payload(payload: dict[str, Any], polygon_dir: Path = DEFAULT_POLYGON_DIR) -> dict[str, Any]:
    rows = points(payload)
    external_features = load_external_polygon_features(polygon_dir)

    features = [
        world_bounds_feature(),
        *build_density_grid_features(rows, size=10, feature_prefix="node-density-grid-10"),
        *build_density_grid_features(rows, size=5, feature_prefix="node-density-grid-5"),
        *build_density_grid_features(rows, size=2, feature_prefix="node-density-grid-2"),
        *country_footprint_features(rows),
        overlay_zone("tor-overlay-zone", "Tor Atlantic Overlay Zone", -42.0, -22.0, "tor", "#9d67ad"),
        overlay_zone("i2p-overlay-zone", "I2P Indian Ocean Overlay Zone", 22.0, 42.0, "i2p", "#b889ff"),
        *external_features,
    ]

    def kind_count(kind: str) -> int:
        return sum(1 for feature in features if feature.get("properties", {}).get("kind") == kind)

    return {
        "type": "FeatureCollection",
        "schema": SCHEMA,
        "name": "ZZX Bitnodes Map Polygons",
        "generated_at": utc_now(),
        "polygon_dir": str(polygon_dir),
        "feature_count": len(features),
        "density_feature_count": kind_count("density-grid"),
        "country_footprint_count": kind_count("country-footprint"),
        "overlay_feature_count": kind_count("overlay-zone"),
        "external_feature_count": len(external_features),
        "red_ring_semantics": {
            "sanctioned_density_or_country": "red polygon stroke/fill and marker_ring=true",
            "policy_restricted_density_or_country": "red-orange polygon stroke/fill and marker_ring=true",
            "threat_density_or_country": "orange threat polygon stroke/fill and marker_ring=true",
        },
        "false_positive_control": {
            "threat_infrastructure": "defensive infrastructure correlation only",
            "threat_actor_labels": "explicit trusted metadata/feed labels only",
            "no_country_to_apt_inference": True,
        },
        "features": features,
    }


def merge_polygons(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    polygon_dir = Path(context.get("polygon_dir") or DEFAULT_POLYGON_DIR)

    output = dict(payload)
    polygons = build_polygon_payload(output, polygon_dir=polygon_dir)

    output["polygons"] = polygons

    settings = dict(output.get("settings", {}))
    settings["polygons"] = {
        "url": "./data/map-polygons.geojson",
        "enabled": True,
        "visible": False,
        "feature_count": polygons["feature_count"],
        "density_feature_count": polygons["density_feature_count"],
        "country_footprint_count": polygons["country_footprint_count"],
        "overlay_feature_count": polygons["overlay_feature_count"],
        "external_feature_count": polygons["external_feature_count"],
        "polygon_dir": str(polygon_dir),
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_polygons(payload, context)


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_polygons(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    polygon_dir: Path = DEFAULT_POLYGON_DIR,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})
    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_polygons(payload, {"polygon_dir": str(polygon_dir)})
    polygons = merged["polygons"]

    for directory in (map_dir, live_map_dir):
        write_json(directory / "data" / "map-polygons.geojson", polygons, compact=compact)

        settings_path = directory / "data" / "map-settings.json"
        settings = read_json(settings_path, fallback={})
        if not isinstance(settings, dict):
            settings = {}

        settings["polygons"] = merged["settings"]["polygons"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mappolygons-build-report-v4",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "polygon_dir": str(polygon_dir),
        "feature_count": polygons["feature_count"],
        "density_feature_count": polygons["density_feature_count"],
        "country_footprint_count": polygons["country_footprint_count"],
        "overlay_feature_count": polygons["overlay_feature_count"],
        "external_feature_count": polygons["external_feature_count"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map polygons, density cells, symbolic overlay zones, country footprints, and external GeoJSON overlays.",
        allow_abbrev=False,
    )

    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--polygon-dir", default=str(DEFAULT_POLYGON_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        polygon_dir=Path(args.polygon_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map polygons complete: "
        f"{report['feature_count']} features, "
        f"density={report['density_feature_count']}, "
        f"country={report['country_footprint_count']}, "
        f"external={report['external_feature_count']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
