#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
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
DEFAULT_BUILDING_DIR = BITNODES_ROOT / "data" / "geo" / "buildings"

SCHEMA = "zzx-bitnodes-map-buildings-v4"
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
        out = float(value)
    except (TypeError, ValueError):
        return fallback
    return out if math.isfinite(out) else fallback


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
    for source in (vectors(payload), payload):
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
        rows: list[dict[str, Any]] = []

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
        "latitude", "lat", "geoloc.latitude", "building_data.latitude",
        "building_data.center_latitude", "geo.latitude", "geo.lat",
        "geoip.latitude", "geoip.lat", "geoip_data.latitude",
        "location.latitude", "metadata.latitude",
    )))
    lon = number(first(point, (
        "longitude", "lon", "lng", "geoloc.longitude", "geoloc.lon",
        "building_data.longitude", "building_data.center_longitude",
        "geo.longitude", "geo.lon", "geo.lng", "geoip.longitude",
        "geoip.lon", "geoip_data.longitude", "location.longitude",
        "metadata.longitude",
    )))

    if lat is None or lon is None:
        return None, None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None
    return lat, lon


def point_address(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("address", "host", "node", "addr", "hostname", "id")))


def point_network(point: Mapping[str, Any]) -> str:
    network = clean(first(point, ("network", "metadata.network", "address_family"))).lower()
    if network:
        return network

    address = point_address(point).lower()

    if ".onion" in address:
        return "tor"
    if ".i2p" in address:
        return "i2p"
    if ":" in address and ".onion" not in address and ".i2p" not in address:
        return "ipv6"
    if address.count(".") >= 3:
        return "ipv4"

    return "unknown"


def point_country(point: Mapping[str, Any]) -> str:
    country = clean(first(point, (
        "map_country", "country_code", "country", "country_data.country_code",
        "geoip.country_code", "geoip_data.country_code", "location.country_code",
        "metadata.country_code", "metadata.country",
    ))).upper()

    if country in {"TOR", "I2P"}:
        return country

    network = point_network(point)
    if network == "tor":
        return "TOR"
    if network == "i2p":
        return "I2P"

    return country or "UNKNOWN"


def point_territory(point: Mapping[str, Any]) -> str:
    territory = clean(first(point, (
        "map_territory_code", "territory_code", "territory", "state_code",
        "state", "province_code", "province", "subdivision_code",
        "subdivision", "admin1_code", "admin1", "territory_data.territory_code",
        "territory_data.admin1_code", "geoip.territory_code", "geoip.admin1_code",
        "geoip_data.territory_code", "geoip_data.admin1_code",
        "metadata.territory_code", "metadata.admin1_code",
    ))).upper()

    country = point_country(point)
    if country in {"TOR", "I2P"}:
        return country

    return territory or "UNKNOWN"


def point_county(point: Mapping[str, Any]) -> str:
    county = clean(first(point, (
        "map_county_code", "county_code", "county", "district_code", "district",
        "municipality_code", "municipality", "parish_code", "parish",
        "admin2_code", "admin2", "county_data.county_code", "county_data.county",
        "geoip.county_code", "geoip.county", "geoip.admin2_code",
        "geoip_data.county_code", "geoip_data.admin2_code",
        "metadata.county_code", "metadata.county", "metadata.admin2_code",
    )))

    country = point_country(point)
    if country in {"TOR", "I2P"}:
        return country

    return county or "Unknown"


def point_city(point: Mapping[str, Any]) -> str:
    city = clean(first(point, (
        "map_city_name", "map_city", "city", "city_name", "town", "town_name",
        "village", "village_name", "locality", "place", "place_name",
        "city_data.city", "city_data.city_name", "city_data.name",
        "geoip.city", "geoip.city_name", "geoip_data.city",
        "metadata.city", "metadata.city_name",
    )))

    country = point_country(point)
    if country == "TOR":
        return "Tor Overlay Channel"
    if country == "I2P":
        return "I2P Overlay Channel"

    return city or "Unknown"


def point_parcel(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "map_parcel", "parcel", "parcel_id", "parcel_code",
        "parcel_data.parcel_id", "parcel_data.parcel_code",
        "metadata.parcel_id", "metadata.parcel_code",
    ))) or "parcel:unknown"


def point_status(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("status", "metadata.status"))).lower().replace("_", "-") or "unknown"


def point_owner_type(point: Mapping[str, Any]) -> str:
    checks = (
        ("military", ("is_military", "military_data.is_military", "military.is_military", "metadata.is_military")),
        ("government", ("is_government", "government_data.is_government", "government.is_government", "metadata.is_government")),
        ("university", ("is_university", "is_academic", "is_institute", "metadata.is_university", "metadata.is_academic")),
        ("datacenter", ("is_datacenter", "datacenter_data.is_datacenter", "datacenter.is_datacenter", "provider_data.is_datacenter", "metadata.is_datacenter")),
        ("private", ("is_private", "is_commercial", "metadata.is_private")),
        ("public", ("is_public", "is_residential", "metadata.is_public")),
    )

    for label, keys in checks:
        if flag(point, keys):
            return label

    return "unknown"


def explicit_building(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "map_building",
        "building",
        "building_id",
        "building_code",
        "building_data.building_id",
        "building_data.osm_id",
        "building_data.way_id",
        "building_data.relation_id",
        "metadata.building_id",
    )))


def context_id(point: Mapping[str, Any]) -> str:
    return "|".join([
        point_country(point),
        point_territory(point),
        point_county(point),
        point_city(point),
        point_parcel(point),
    ])


def synthetic_building_id(point: Mapping[str, Any], precision: int = 6) -> str:
    lat, lon = point_lat_lon(point)

    if lat is None or lon is None:
        basis = f"{context_id(point)}|{point_address(point)}"
    else:
        basis = f"{context_id(point)}|{lat:.{precision}f}|{lon:.{precision}f}"

    digest = hashlib.sha3_256(basis.encode("utf-8")).hexdigest()[:20]
    return f"building:{digest}"


def point_building(point: Mapping[str, Any], precision: int = 6) -> str:
    return explicit_building(point) or synthetic_building_id(point, precision=precision)


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
        building_dir / "buildings.json.gz",
        building_dir / "mapbuildings.json",
        building_dir / "mapbuildings.json.gz",
        building_dir / "building-footprints.json",
        building_dir / "building-footprints.json.gz",
        building_dir / "footprints.json",
        building_dir / "footprints.json.gz",
    ):
        data = read_json(candidate, fallback={})
        if not isinstance(data, dict):
            continue

        rows = data.get("buildings", data.get("footprints", data.get("features", data)))

        if isinstance(rows, dict):
            for building_key, row in rows.items():
                if isinstance(row, dict):
                    refs[str(building_key)] = dict(row)

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue

                if row.get("type") == "Feature":
                    props = row.get("properties") if isinstance(row.get("properties"), Mapping) else {}
                    key = clean(props.get("building_id") or props.get("osm_id") or row.get("id"))
                    if key:
                        refs[key] = {
                            **dict(props),
                            "geometry": row.get("geometry"),
                        }
                    continue

                key = clean(row.get("building_id") or row.get("osm_id") or row.get("id"))
                if key:
                    refs[key] = dict(row)

    return refs


def reference_geometry(reference: Mapping[str, Any]) -> dict[str, Any] | None:
    for key in ("geometry", "footprint"):
        geometry = reference.get(key)
        if isinstance(geometry, Mapping) and geometry.get("type") in {"Polygon", "MultiPolygon"}:
            return dict(geometry)

    coordinates = reference.get("coordinates")
    if isinstance(coordinates, list):
        return {"type": "Polygon", "coordinates": coordinates}

    return None


def is_sanctioned(point: Mapping[str, Any]) -> bool:
    return flag(point, ("is_sanctioned", "is_sanctioned_node", "sanctions_data.is_sanctioned", "metadata.is_sanctioned_node"))


def is_policy_restricted(point: Mapping[str, Any]) -> bool:
    return flag(point, ("policy_restricted", "is_policy_restricted_node", "sanctions_data.is_policy_restricted", "metadata.is_policy_restricted_node"))


def is_threat(point: Mapping[str, Any]) -> bool:
    level = clean(first(point, (
        "threat_level", "tag_threat_level", "threat_infrastructure.threat_level",
        "tag_attribution.threat_level", "metadata.threat_level",
    ))).lower()

    return flag(point, (
        "is_threat_infrastructure", "suspected_threat_infrastructure",
        "threat_infrastructure.is_threat_infrastructure", "confirmed_intelligence_match",
    )) or level in {"confirmed", "high", "medium", "low"}


def sorted_counts(counter: dict[str, int]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))


def inc(counter: dict[str, int], key: Any) -> None:
    value = clean(key) or "Unknown"
    counter[value] = counter.get(value, 0) + 1


def owner_color(owner_type: str) -> str:
    return {
        "government": "#edf7b9",
        "military": "#c0d674",
        "university": "#e6a42b",
        "datacenter": "#70b7ff",
        "private": "#70b7ff",
        "public": "#c0d674",
        "unknown": "#8c927e",
    }.get(owner_type, "#8c927e")


def summarize_group(points_for_building: list[dict[str, Any]]) -> dict[str, Any]:
    networks: dict[str, int] = {}
    statuses: dict[str, int] = {}
    owners: dict[str, int] = {}
    countries: dict[str, int] = {}
    cities: dict[str, int] = {}
    security = {
        "sanctioned_nodes": 0,
        "policy_restricted_nodes": 0,
        "threat_infrastructure_nodes": 0,
    }
    intelligence = {
        "vpn_nodes": 0,
        "proxy_nodes": 0,
        "datacenter_nodes": 0,
        "government_nodes": 0,
        "military_nodes": 0,
        "apt_label_nodes": 0,
        "threat_actor_label_nodes": 0,
        "known_malactor_nodes": 0,
    }

    for point in points_for_building:
        inc(networks, point_network(point))
        inc(statuses, point_status(point))
        inc(owners, point_owner_type(point))
        inc(countries, point_country(point))
        inc(cities, point_city(point))

        if is_sanctioned(point):
            security["sanctioned_nodes"] += 1
        if is_policy_restricted(point):
            security["policy_restricted_nodes"] += 1
        if is_threat(point):
            security["threat_infrastructure_nodes"] += 1

        if flag(point, ("is_vpn", "suspected_vpn", "vpn_data.is_vpn", "vpn.is_vpn", "metadata.is_vpn")):
            intelligence["vpn_nodes"] += 1
        if flag(point, ("is_proxy", "suspected_proxy", "proxy_data.is_proxy", "proxy.is_proxy", "metadata.is_proxy")):
            intelligence["proxy_nodes"] += 1
        if flag(point, ("is_datacenter", "datacenter_data.is_datacenter", "datacenter.is_datacenter", "metadata.is_datacenter")):
            intelligence["datacenter_nodes"] += 1
        if flag(point, ("is_government", "government_data.is_government", "government.is_government", "metadata.is_government")):
            intelligence["government_nodes"] += 1
        if flag(point, ("is_military", "military_data.is_military", "military.is_military", "metadata.is_military")):
            intelligence["military_nodes"] += 1
        if flag(point, ("suspected_apt_related", "is_apt", "apt_data.is_apt", "metadata.is_apt")):
            intelligence["apt_label_nodes"] += 1
        if flag(point, ("suspected_threat_actor_group_related", "is_threat_actor", "threat_actor_data.is_threat_actor", "metadata.is_threat_actor")):
            intelligence["threat_actor_label_nodes"] += 1
        if flag(point, ("is_known_malactor", "knownmalactor.is_known_malactor", "known_malactor_data.is_known_malactor", "metadata.is_known_malactor")):
            intelligence["known_malactor_nodes"] += 1

    owner_type = max(owners.items(), key=lambda item: item[1], default=("unknown", 0))[0]

    return {
        "owner_type": owner_type,
        "country_counts": sorted_counts(countries),
        "city_counts": sorted_counts(cities),
        "network_counts": sorted_counts(networks),
        "status_counts": sorted_counts(statuses),
        "owner_counts": sorted_counts(owners),
        "security_counts": security,
        "intelligence_counts": intelligence,
    }


def security_color(base_color: str, security: Mapping[str, Any]) -> tuple[str, bool, str]:
    if int(security.get("sanctioned_nodes", 0) or 0) > 0:
        return "#ff0000", True, "SANCTIONED"
    if int(security.get("policy_restricted_nodes", 0) or 0) > 0:
        return "#ff3b30", True, "RESTRICTED"
    if int(security.get("threat_infrastructure_nodes", 0) or 0) > 0:
        return "#ff9500", True, "THREAT"
    return base_color, False, ""


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

    summary = summarize_group(points_for_building)
    base_color = clean(reference.get("color")) or owner_color(summary["owner_type"])
    color, marker_ring, table_badge = security_color(base_color, summary["security_counts"])

    return {
        "type": "Feature",
        "id": building_key,
        "geometry": geometry,
        "properties": {
            "schema": SCHEMA,
            "building_id": building_key,
            "building_name": clean(reference.get("building_name") or reference.get("name")) or building_key,
            "source": clean(reference.get("source")) or "synthetic-centroid-footprint",
            "synthetic": building_key.startswith("building:"),
            "precision": precision,
            "point_count": len(points_for_building),
            "center_latitude": center_lat,
            "center_longitude": center_lon,
            **summary,
            "color": color,
            "stroke": color,
            "fill": color,
            "opacity": 0.22 if marker_ring else 0.18,
            "marker_ring": marker_ring,
            "table_badge": table_badge,
            "note": "Building footprint is a best-effort IP location polygon. It may represent registered, provider, datacenter, corporate, regional, or synthetic centroid data rather than verified node hardware location.",
            "addresses": sorted(set(point_address(point) for point in points_for_building if point_address(point))),
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
        key = point_building(row, precision=precision)
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
        "red_ring_semantics": {
            "sanctioned_building_count": "building footprint contains nodes with red marker ring",
            "policy_restricted_building_count": "building footprint contains nodes with red-orange marker ring",
            "threat_building_count": "building footprint contains defensive threat-infrastructure matches",
        },
        "false_positive_control": {
            "synthetic_buildings": "deterministic coordinate/context buckets unless official building footprint data is supplied",
            "physical_location_warning": "IP geolocation is not physical proof that node hardware is inside the rendered building",
            "threat_infrastructure": "defensive infrastructure correlation only",
            "threat_actor_labels": "explicit trusted metadata/feed labels only",
            "no_country_to_apt_inference": True,
        },
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
            "marker_ring": boolish(props.get("marker_ring")),
            "table_badge": clean(props.get("table_badge")),
            "filter": {
                "type": "equals",
                "key": "map_building",
                "value": building_id_value,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-building-layers-v4",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points(rows: list[dict[str, Any]], precision: int) -> list[dict[str, Any]]:
    output = []

    for row in rows:
        item = dict(row)
        key = point_building(item, precision=precision)

        item["map_building"] = key
        item["map_building_label"] = key
        item["map_building_precision"] = precision
        item["map_building_synthetic"] = key.startswith("building:")
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
        vectors_payload.setdefault("vectors", {})
        if isinstance(vectors_payload["vectors"], dict):
            vectors_payload["vectors"]["points"] = annotated
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


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
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
        "schema": "zzx-bitnodes-mapbuildings-build-report-v4",
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
        description="Build best-effort Bitnodes building footprint polygons, security counters, filters, and building-annotated vectors.",
        allow_abbrev=False,
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
