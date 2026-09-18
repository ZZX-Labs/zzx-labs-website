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
DEFAULT_REGION_DIR = BITNODES_ROOT / "data" / "geo" / "regions"

SCHEMA = "zzx-bitnodes-map-regions-v4"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}

REGION_GROUPS: dict[str, dict[str, Any]] = {
    "global": {"label": "Global", "countries": [], "color": "#c0d674"},
    "north-america": {"label": "North America", "countries": ["US", "CA", "MX", "GL", "BM"], "color": "#70b7ff"},
    "central-america-caribbean": {
        "label": "Central America / Caribbean",
        "countries": ["BZ", "CR", "SV", "GT", "HN", "NI", "PA", "AG", "BS", "BB", "CU", "DM", "DO", "GD", "HT", "JM", "KN", "LC", "VC", "TT"],
        "color": "#7dcfff",
    },
    "south-america": {"label": "South America", "countries": ["AR", "BO", "BR", "CL", "CO", "EC", "GY", "PY", "PE", "SR", "UY", "VE"], "color": "#79e6c5"},
    "europe": {
        "label": "Europe",
        "countries": ["AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "XK", "LV", "LI", "LT", "LU", "MT", "MD", "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU", "SM", "RS", "SK", "SI", "ES", "SE", "CH", "UA", "GB", "VA"],
        "color": "#c0d674",
    },
    "middle-east": {"label": "Middle East", "countries": ["BH", "IR", "IQ", "IL", "JO", "KW", "LB", "OM", "PS", "QA", "SA", "SY", "TR", "AE", "YE"], "color": "#f2c14e"},
    "africa": {
        "label": "Africa",
        "countries": ["DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW"],
        "color": "#e6a42b",
    },
    "south-asia": {"label": "South Asia", "countries": ["AF", "BD", "BT", "IN", "MV", "NP", "PK", "LK"], "color": "#b889ff"},
    "east-asia": {"label": "East Asia", "countries": ["CN", "HK", "JP", "MO", "MN", "KP", "KR", "TW"], "color": "#ff6b6b"},
    "southeast-asia": {"label": "Southeast Asia", "countries": ["BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "TL", "VN"], "color": "#d6a8ff"},
    "central-asia": {"label": "Central Asia", "countries": ["KZ", "KG", "TJ", "TM", "UZ"], "color": "#9d67ad"},
    "oceania": {"label": "Oceania", "countries": ["AU", "NZ", "FJ", "PG", "SB", "VU", "WS", "TO", "TV", "KI", "FM", "MH", "NR", "PW"], "color": "#74d6ff"},
    "overlay-networks": {"label": "Overlay Networks", "countries": ["TOR", "I2P"], "color": "#9d67ad"},
    "unknown": {"label": "Unknown / Unmapped", "countries": [], "color": "#8c927e"},
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


def point_country(point: Mapping[str, Any]) -> str:
    country = clean(first(point, (
        "country_code",
        "country",
        "country_data.country_code",
        "geoip.country_code",
        "geoip_data.country_code",
        "location.country_code",
        "metadata.country_code",
        "metadata.country",
    ))).upper()

    if country in {"TOR", "I2P"}:
        return country

    network = point_network(point)
    if network == "tor":
        return "TOR"
    if network == "i2p":
        return "I2P"

    return country or "UNKNOWN"


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


def point_network(point: Mapping[str, Any]) -> str:
    network = clean(first(point, ("network", "metadata.network", "address_family"))).lower()
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
    return clean(first(point, ("status", "metadata.status"))).lower().replace("_", "-") or "unknown"


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
        "threat_infrastructure.is_threat_infrastructure",
        "confirmed_intelligence_match",
    )) or level in {"confirmed", "high", "medium", "low"}


def country_to_region_map(region_groups: Mapping[str, Mapping[str, Any]]) -> dict[str, str]:
    output: dict[str, str] = {}

    for region_id, region in region_groups.items():
        countries = region.get("countries", [])
        if not isinstance(countries, list):
            continue

        for country in countries:
            output[str(country).upper()] = region_id

    return output


def region_for_country(country: str, region_groups: Mapping[str, Mapping[str, Any]]) -> str:
    country = clean(country).upper()

    if country in {"TOR", "I2P"}:
        return "overlay-networks"

    if not country or country == "UNKNOWN":
        return "unknown"

    lookup = country_to_region_map(region_groups)
    return lookup.get(country, "unknown")


def sorted_counts(counter: dict[str, int]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))


def inc(counter: dict[str, int], key: Any) -> None:
    value = clean(key) or "Unknown"
    counter[value] = counter.get(value, 0) + 1


def load_external_region_groups(region_dir: Path) -> dict[str, Any]:
    groups: dict[str, Any] = {key: dict(value) for key, value in REGION_GROUPS.items()}

    for candidate in (
        region_dir / "regions.json",
        region_dir / "regions.json.gz",
        region_dir / "mapregions.json",
        region_dir / "mapregions.json.gz",
        region_dir / "region-groups.json",
        region_dir / "region-groups.json.gz",
    ):
        data = read_json(candidate, fallback={})

        if not isinstance(data, dict):
            continue

        external_groups = data.get("regions", data.get("region_groups", data))

        if isinstance(external_groups, dict):
            for region_id, region in external_groups.items():
                if isinstance(region, dict):
                    groups[str(region_id)] = {**groups.get(str(region_id), {}), **region}

    return groups


def annotate_points_with_regions(rows: list[dict[str, Any]], region_groups: Mapping[str, Mapping[str, Any]]) -> list[dict[str, Any]]:
    output = []

    for row in rows:
        item = dict(row)
        country = point_country(item)
        region_id = region_for_country(country, region_groups)
        region = region_groups.get(region_id, region_groups.get("unknown", {}))

        item["map_region"] = region_id
        item["map_region_label"] = clean(region.get("label")) or region_id.replace("-", " ").title()
        item["map_region_color"] = clean(region.get("color")) or "#8c927e"

        output.append(item)

    return output


def build_region_summary(rows: list[dict[str, Any]], region_groups: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    region_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}
    network_counts_by_region: dict[str, dict[str, int]] = {}
    status_counts_by_region: dict[str, dict[str, int]] = {}
    security_counts_by_region: dict[str, dict[str, int]] = {}
    coordinates: dict[str, list[tuple[float, float]]] = {}

    for row in rows:
        country = point_country(row)
        region_id = region_for_country(country, region_groups)
        network = point_network(row)
        status = point_status(row)

        inc(region_counts, region_id)
        inc(country_counts, country)

        network_counts_by_region.setdefault(region_id, {})
        status_counts_by_region.setdefault(region_id, {})
        security_counts_by_region.setdefault(region_id, {
            "sanctioned_nodes": 0,
            "policy_restricted_nodes": 0,
            "threat_infrastructure_nodes": 0,
        })

        inc(network_counts_by_region[region_id], network)
        inc(status_counts_by_region[region_id], status)

        if is_sanctioned(row):
            security_counts_by_region[region_id]["sanctioned_nodes"] += 1
        if is_policy_restricted(row):
            security_counts_by_region[region_id]["policy_restricted_nodes"] += 1
        if is_threat(row):
            security_counts_by_region[region_id]["threat_infrastructure_nodes"] += 1

        lat, lon = point_lat_lon(row)
        if lat is not None and lon is not None:
            coordinates.setdefault(region_id, []).append((lat, lon))

    centroids: dict[str, dict[str, float]] = {}

    for region_id, coords in coordinates.items():
        lats = [lat for lat, _lon in coords]
        lons = [lon for _lat, lon in coords]
        centroids[region_id] = {
            "latitude": sum(lats) / len(lats),
            "longitude": sum(lons) / len(lons),
            "south": min(lats),
            "north": max(lats),
            "west": min(lons),
            "east": max(lons),
        }

    regions = {}

    for region_id, region in region_groups.items():
        count = region_counts.get(region_id, 0)
        countries = region.get("countries", [])
        if not isinstance(countries, list):
            countries = []

        active_countries = sorted([
            country
            for country, c_count in country_counts.items()
            if c_count > 0 and region_for_country(country, region_groups) == region_id
        ])

        regions[region_id] = {
            "id": region_id,
            "label": clean(region.get("label")) or region_id.replace("-", " ").title(),
            "color": clean(region.get("color")) or "#8c927e",
            "point_count": count,
            "countries": active_countries or sorted(str(country).upper() for country in countries),
            "network_counts": sorted_counts(network_counts_by_region.get(region_id, {})),
            "status_counts": sorted_counts(status_counts_by_region.get(region_id, {})),
            "security_counts": security_counts_by_region.get(region_id, {
                "sanctioned_nodes": 0,
                "policy_restricted_nodes": 0,
                "threat_infrastructure_nodes": 0,
            }),
            "centroid": centroids.get(region_id, {}),
        }

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "region_count": len(regions),
        "regions": dict(sorted(regions.items(), key=lambda item: (-int(item[1]["point_count"]), item[0]))),
        "country_counts": sorted_counts(country_counts),
        "red_ring_semantics": {
            "sanctioned_region_count": "region contains nodes with red marker ring",
            "policy_restricted_region_count": "region contains nodes with red-orange marker ring",
            "threat_region_count": "region contains defensive threat-infrastructure matches",
        },
        "false_positive_control": {
            "threat_infrastructure": "defensive infrastructure correlation only",
            "threat_actor_labels": "explicit trusted metadata/feed labels only",
            "no_country_to_apt_inference": True,
        },
    }


def build_region_layers(region_payload: Mapping[str, Any]) -> dict[str, Any]:
    regions = region_payload.get("regions", {})
    if not isinstance(regions, Mapping):
        regions = {}

    layers = []

    for region_id, region in regions.items():
        if not isinstance(region, Mapping):
            continue

        security = region.get("security_counts", {})
        if not isinstance(security, Mapping):
            security = {}

        color = clean(region.get("color")) or "#8c927e"
        marker_ring = False
        table_badge = ""

        if int(security.get("sanctioned_nodes", 0) or 0) > 0:
            color = "#ff0000"
            marker_ring = True
            table_badge = "SANCTIONED"
        elif int(security.get("policy_restricted_nodes", 0) or 0) > 0:
            color = "#ff3b30"
            marker_ring = True
            table_badge = "RESTRICTED"
        elif int(security.get("threat_infrastructure_nodes", 0) or 0) > 0:
            color = "#ff9500"
            marker_ring = True
            table_badge = "THREAT"

        layers.append({
            "id": f"region:{region_id}",
            "label": region.get("label", str(region_id).replace("-", " ").title()),
            "kind": "region-filter",
            "enabled": True,
            "visible": False,
            "color": color,
            "point_count": region.get("point_count", 0),
            "marker_ring": marker_ring,
            "table_badge": table_badge,
            "filter": {
                "type": "equals",
                "key": "map_region",
                "value": region_id,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-region-layers-v4",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def merge_regions(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    region_dir = Path(context.get("region_dir") or context.get("map_region_dir") or DEFAULT_REGION_DIR)

    output = dict(payload)
    region_groups = load_external_region_groups(region_dir)

    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    annotated = annotate_points_with_regions(rows, region_groups)

    if vectors_payload:
        vectors_payload["points"] = annotated
        vectors_payload.setdefault("vectors", {})
        if isinstance(vectors_payload["vectors"], dict):
            vectors_payload["vectors"]["points"] = annotated
        output["vectors"] = vectors_payload

    region_payload = build_region_summary(annotated, region_groups)
    region_layers = build_region_layers(region_payload)

    output["regions"] = region_payload
    output["region_layers"] = region_layers

    settings = dict(output.get("settings", {}))
    settings["regions"] = {
        "url": "./data/map-regions.json",
        "layers_url": "./data/map-region-layers.json",
        "region_dir": str(region_dir),
        "enabled": True,
        "user_selectable": True,
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_regions(payload, context)


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_regions(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    region_dir: Path = DEFAULT_REGION_DIR,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})
    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_regions(payload, {"region_dir": str(region_dir)})
    regions = merged["regions"]
    region_layers = merged["region_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"

        write_json(data_dir / "map-regions.json", regions, compact=compact)
        write_json(data_dir / "map-region-layers.json", region_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})
        if not isinstance(settings, dict):
            settings = {}

        settings["regions"] = merged["settings"]["regions"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapregions-build-report-v4",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "region_dir": str(region_dir),
        "region_count": regions.get("region_count", 0),
        "total_points": regions.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map region summaries, region filters, and region-annotated vectors.",
        allow_abbrev=False,
    )

    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--region-dir", default=str(DEFAULT_REGION_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        region_dir=Path(args.region_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map regions complete: "
        f"{report['region_count']} regions, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
