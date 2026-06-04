#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"
DEFAULT_POLYGON_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo" / "polygons"


POLYGON_ORDER = [
    "world_bounds",
    "node_density_grid_10",
    "node_density_grid_5",
    "node_density_grid_2",
    "country_centroids",
    "tor_overlay_zone",
    "i2p_overlay_zone",
]


UNKNOWN_VALUES = {
    "",
    "unknown",
    "none",
    "null",
    "undefined",
    "—",
    "-",
    "n/a",
    "na",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
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
        "geoip_data.latitude",
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
        "geoip_data.longitude",
        "location.longitude",
        "metadata.longitude",
    )))

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def valid_point(point: Mapping[str, Any]) -> bool:
    lat, lon = point_lat_lon(point)
    return lat is not None and lon is not None


def point_country(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "country",
        "country_code",
        "country_data.country_code",
        "geoip.country_code",
        "geoip_data.country_code",
        "location.country_code",
        "metadata.country_code",
    ))) or "Unknown"


def point_network(point: Mapping[str, Any]) -> str:
    network = clean(first(point, (
        "network",
        "metadata.network",
        "network_type",
        "geoip.network_type",
    ))).lower()

    return network or "unknown"


def point_status(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "status",
        "metadata.status",
    ))).lower() or "unknown"


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
        "geometry": {
            "type": "Polygon",
            "coordinates": coordinates,
        },
        "properties": {
            "name": name,
            **(properties or {}),
        },
    }


def rectangle_polygon(
    *,
    west: float,
    south: float,
    east: float,
    north: float,
) -> list[list[list[float]]]:
    return [[
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
    ]]


def world_bounds_feature() -> dict[str, Any]:
    return polygon_feature(
        feature_id="world_bounds",
        name="World Bounds",
        coordinates=rectangle_polygon(
            west=-180.0,
            south=-85.0,
            east=180.0,
            north=85.0,
        ),
        properties={
            "kind": "reference-bounds",
            "stroke": "#c0d674",
            "fill": "transparent",
            "opacity": 0.22,
            "interactive": False,
        },
    )


def bucket_key(lat: float, lon: float, size: int) -> tuple[int, int]:
    lat_bucket = math.floor(lat / size) * size
    lon_bucket = math.floor(lon / size) * size
    return lat_bucket, lon_bucket


def build_density_grid_features(
    rows: list[dict[str, Any]],
    *,
    size: int,
    feature_prefix: str,
) -> list[dict[str, Any]]:
    buckets: dict[tuple[int, int], list[dict[str, Any]]] = {}

    for point in rows:
        lat, lon = point_lat_lon(point)

        if lat is None or lon is None:
            continue

        key = bucket_key(lat, lon, size)
        buckets.setdefault(key, []).append(point)

    if not buckets:
        return []

    max_count = max(len(value) for value in buckets.values()) or 1
    features = []

    for (south, west), bucket_rows in sorted(
        buckets.items(),
        key=lambda item: (-len(item[1]), item[0][0], item[0][1]),
    ):
        north = min(85.0, south + size)
        east = min(180.0, west + size)

        count = len(bucket_rows)
        intensity = count / max_count

        networks: dict[str, int] = {}
        statuses: dict[str, int] = {}
        countries: dict[str, int] = {}

        for row in bucket_rows:
            network = point_network(row)
            status = point_status(row)
            country = point_country(row)

            networks[network] = networks.get(network, 0) + 1
            statuses[status] = statuses.get(status, 0) + 1
            countries[country] = countries.get(country, 0) + 1

        features.append(
            polygon_feature(
                feature_id=f"{feature_prefix}:{south}:{west}",
                name=f"{size}° Density Cell {south},{west}",
                coordinates=rectangle_polygon(
                    west=west,
                    south=south,
                    east=east,
                    north=north,
                ),
                properties={
                    "kind": "density-grid",
                    "grid_size_degrees": size,
                    "point_count": count,
                    "intensity": round(intensity, 6),
                    "networks": dict(sorted(networks.items())),
                    "statuses": dict(sorted(statuses.items())),
                    "countries": dict(sorted(countries.items(), key=lambda item: (-item[1], item[0]))),
                    "stroke": "#c0d674",
                    "fill": "#c0d674",
                    "opacity": round(max(0.08, min(0.55, intensity * 0.55)), 4),
                },
            )
        )

    return features


def country_centroid_features(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}

    for point in rows:
        if not valid_point(point):
            continue

        country = point_country(point)
        grouped.setdefault(country, []).append(point)

    features = []

    for country, country_rows in sorted(
        grouped.items(),
        key=lambda item: (-len(item[1]), item[0]),
    ):
        if country == "Unknown":
            continue

        latitudes = []
        longitudes = []

        for row in country_rows:
            lat, lon = point_lat_lon(row)

            if lat is None or lon is None:
                continue

            latitudes.append(lat)
            longitudes.append(lon)

        if not latitudes or not longitudes:
            continue

        center_lat = sum(latitudes) / len(latitudes)
        center_lon = sum(longitudes) / len(longitudes)

        spread_lat = max(1.0, min(12.0, (max(latitudes) - min(latitudes)) / 2.0 + 0.75))
        spread_lon = max(1.0, min(12.0, (max(longitudes) - min(longitudes)) / 2.0 + 0.75))

        features.append(
            polygon_feature(
                feature_id=f"country-centroid:{country}",
                name=f"{country} Node Footprint",
                coordinates=rectangle_polygon(
                    west=max(-180.0, center_lon - spread_lon),
                    south=max(-85.0, center_lat - spread_lat),
                    east=min(180.0, center_lon + spread_lon),
                    north=min(85.0, center_lat + spread_lat),
                ),
                properties={
                    "kind": "country-centroid-footprint",
                    "country": country,
                    "point_count": len(country_rows),
                    "center_latitude": center_lat,
                    "center_longitude": center_lon,
                    "stroke": "#e6a42b",
                    "fill": "#e6a42b",
                    "opacity": 0.16,
                },
            )
        )

    return features


def tor_overlay_zone() -> dict[str, Any]:
    return polygon_feature(
        feature_id="tor-overlay-zone",
        name="Tor Atlantic Overlay Zone",
        coordinates=rectangle_polygon(
            west=-42.0,
            south=-12.0,
            east=-22.0,
            north=12.0,
        ),
        properties={
            "kind": "overlay-zone",
            "network": "tor",
            "symbolic": True,
            "stroke": "#9d67ad",
            "fill": "#9d67ad",
            "opacity": 0.18,
            "note": "Tor nodes are symbolically plotted in the Atlantic channel because physical attribution is intentionally ambiguous.",
        },
    )


def i2p_overlay_zone() -> dict[str, Any]:
    return polygon_feature(
        feature_id="i2p-overlay-zone",
        name="I2P Indian Ocean Overlay Zone",
        coordinates=rectangle_polygon(
            west=22.0,
            south=-12.0,
            east=42.0,
            north=12.0,
        ),
        properties={
            "kind": "overlay-zone",
            "network": "i2p",
            "symbolic": True,
            "stroke": "#b889ff",
            "fill": "#b889ff",
            "opacity": 0.18,
            "note": "I2P nodes are symbolically plotted in the Indian Ocean channel because physical attribution is intentionally ambiguous.",
        },
    )


def load_external_polygon_features(polygon_dir: Path) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []

    if not polygon_dir.exists():
        return features

    for path in sorted(polygon_dir.glob("*.geojson")) + sorted(polygon_dir.glob("*.json")):
        payload = read_json(path, fallback={})

        if not isinstance(payload, dict):
            continue

        if payload.get("type") == "FeatureCollection" and isinstance(payload.get("features"), list):
            for feature in payload["features"]:
                if isinstance(feature, dict):
                    feature.setdefault("properties", {})
                    if isinstance(feature["properties"], dict):
                        feature["properties"].setdefault("source_file", path.name)
                    features.append(feature)

        elif payload.get("type") == "Feature":
            payload.setdefault("properties", {})
            if isinstance(payload["properties"], dict):
                payload["properties"].setdefault("source_file", path.name)
            features.append(payload)

    return features


def build_polygon_payload(payload: dict[str, Any], polygon_dir: Path = DEFAULT_POLYGON_DIR) -> dict[str, Any]:
    rows = points(payload)
    external_features = load_external_polygon_features(polygon_dir)

    features = [
        world_bounds_feature(),
        *build_density_grid_features(rows, size=10, feature_prefix="node-density-grid-10"),
        *build_density_grid_features(rows, size=5, feature_prefix="node-density-grid-5"),
        *build_density_grid_features(rows, size=2, feature_prefix="node-density-grid-2"),
        *country_centroid_features(rows),
        tor_overlay_zone(),
        i2p_overlay_zone(),
        *external_features,
    ]

    density_features = [
        feature for feature in features
        if feature.get("properties", {}).get("kind") == "density-grid"
    ]

    country_features = [
        feature for feature in features
        if feature.get("properties", {}).get("kind") == "country-centroid-footprint"
    ]

    overlay_features = [
        feature for feature in features
        if feature.get("properties", {}).get("kind") == "overlay-zone"
    ]

    return {
        "type": "FeatureCollection",
        "schema": "zzx-bitnodes-map-polygons-v2",
        "name": "ZZX Bitnodes Map Polygons",
        "generated_at": utc_now(),
        "polygon_order": POLYGON_ORDER,
        "polygon_dir": str(polygon_dir),
        "feature_count": len(features),
        "density_feature_count": len(density_features),
        "country_footprint_count": len(country_features),
        "overlay_feature_count": len(overlay_features),
        "external_feature_count": len(external_features),
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
        "schema": "zzx-bitnodes-mappolygons-build-report-v2",
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
        description="Build Bitnodes map polygons, density cells, symbolic overlay zones, and country footprints."
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
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
