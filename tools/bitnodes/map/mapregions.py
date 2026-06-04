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
DEFAULT_REGION_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo" / "regions"

SCHEMA = "zzx-bitnodes-map-regions-v1"


REGION_GROUPS = {
    "global": {
        "label": "Global",
        "countries": [],
        "color": "#c0d674",
    },
    "north-america": {
        "label": "North America",
        "countries": ["US", "CA", "MX", "GL", "BM"],
        "color": "#70b7ff",
    },
    "central-america-caribbean": {
        "label": "Central America / Caribbean",
        "countries": [
            "BZ", "CR", "SV", "GT", "HN", "NI", "PA",
            "AG", "BS", "BB", "CU", "DM", "DO", "GD", "HT", "JM",
            "KN", "LC", "VC", "TT",
        ],
        "color": "#7dcfff",
    },
    "south-america": {
        "label": "South America",
        "countries": ["AR", "BO", "BR", "CL", "CO", "EC", "GY", "PY", "PE", "SR", "UY", "VE"],
        "color": "#79e6c5",
    },
    "europe": {
        "label": "Europe",
        "countries": [
            "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CY", "CZ",
            "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT",
            "XK", "LV", "LI", "LT", "LU", "MT", "MD", "MC", "ME", "NL",
            "MK", "NO", "PL", "PT", "RO", "RU", "SM", "RS", "SK", "SI",
            "ES", "SE", "CH", "UA", "GB", "VA",
        ],
        "color": "#c0d674",
    },
    "middle-east": {
        "label": "Middle East",
        "countries": ["BH", "IR", "IQ", "IL", "JO", "KW", "LB", "OM", "PS", "QA", "SA", "SY", "TR", "AE", "YE"],
        "color": "#f2c14e",
    },
    "africa": {
        "label": "Africa",
        "countries": [
            "DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM",
            "CG", "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA",
            "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW",
            "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST",
            "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN",
            "UG", "ZM", "ZW",
        ],
        "color": "#e6a42b",
    },
    "south-asia": {
        "label": "South Asia",
        "countries": ["AF", "BD", "BT", "IN", "MV", "NP", "PK", "LK"],
        "color": "#b889ff",
    },
    "east-asia": {
        "label": "East Asia",
        "countries": ["CN", "HK", "JP", "MO", "MN", "KP", "KR", "TW"],
        "color": "#ff6b6b",
    },
    "southeast-asia": {
        "label": "Southeast Asia",
        "countries": ["BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "TL", "VN"],
        "color": "#d6a8ff",
    },
    "central-asia": {
        "label": "Central Asia",
        "countries": ["KZ", "KG", "TJ", "TM", "UZ"],
        "color": "#9d67ad",
    },
    "oceania": {
        "label": "Oceania",
        "countries": ["AU", "NZ", "FJ", "PG", "SB", "VU", "WS", "TO", "TV", "KI", "FM", "MH", "NR", "PW"],
        "color": "#74d6ff",
    },
    "overlay-networks": {
        "label": "Overlay Networks",
        "countries": ["TOR", "I2P"],
        "color": "#9d67ad",
    },
}


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


def point_country(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "country",
        "country_code",
        "country_data.country_code",
        "geoip.country_code",
        "geoip_data.country_code",
        "location.country_code",
        "metadata.country_code",
    ))).upper() or "Unknown"


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

    if not country:
        return "unknown"

    if country in {"TOR", "I2P"}:
        return "overlay-networks"

    lookup = country_to_region_map(region_groups)
    return lookup.get(country, "unknown")


def build_region_summary(rows: list[dict[str, Any]], region_groups: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    region_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}
    network_counts_by_region: dict[str, dict[str, int]] = {}
    status_counts_by_region: dict[str, dict[str, int]] = {}
    centroids: dict[str, dict[str, float]] = {}
    coordinates: dict[str, list[tuple[float, float]]] = {}

    for row in rows:
        country = point_country(row)
        region = region_for_country(country, region_groups)
        network = point_network(row)
        status = point_status(row)

        region_counts[region] = region_counts.get(region, 0) + 1
        country_counts[country] = country_counts.get(country, 0) + 1

        network_counts_by_region.setdefault(region, {})
        network_counts_by_region[region][network] = network_counts_by_region[region].get(network, 0) + 1

        status_counts_by_region.setdefault(region, {})
        status_counts_by_region[region][status] = status_counts_by_region[region].get(status, 0) + 1

        lat, lon = point_lat_lon(row)
        if lat is not None and lon is not None:
            coordinates.setdefault(region, []).append((lat, lon))

    for region, coords in coordinates.items():
        if not coords:
            continue

        latitudes = [item[0] for item in coords]
        longitudes = [item[1] for item in coords]

        centroids[region] = {
            "latitude": sum(latitudes) / len(latitudes),
            "longitude": sum(longitudes) / len(longitudes),
            "south": min(latitudes),
            "north": max(latitudes),
            "west": min(longitudes),
            "east": max(longitudes),
        }

    regions = {}

    for region_id, count in region_counts.items():
        region = region_groups.get(region_id, {})
        regions[region_id] = {
            "id": region_id,
            "label": clean(region.get("label")) or region_id.replace("-", " ").title(),
            "color": clean(region.get("color")) or "#8c927e",
            "point_count": count,
            "countries": sorted([
                country
                for country, c_count in country_counts.items()
                if region_for_country(country, region_groups) == region_id and c_count > 0
            ]),
            "network_counts": dict(sorted(network_counts_by_region.get(region_id, {}).items())),
            "status_counts": dict(sorted(status_counts_by_region.get(region_id, {}).items())),
            "centroid": centroids.get(region_id, {}),
        }

    for region_id, region in region_groups.items():
        regions.setdefault(region_id, {
            "id": region_id,
            "label": clean(region.get("label")) or region_id.replace("-", " ").title(),
            "color": clean(region.get("color")) or "#8c927e",
            "point_count": 0,
            "countries": sorted(region.get("countries", [])) if isinstance(region.get("countries"), list) else [],
            "network_counts": {},
            "status_counts": {},
            "centroid": {},
        })

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "region_count": len(regions),
        "regions": dict(sorted(regions.items(), key=lambda item: (-item[1]["point_count"], item[0]))),
        "country_counts": dict(sorted(country_counts.items(), key=lambda item: (-item[1], item[0]))),
    }


def load_external_region_groups(region_dir: Path) -> dict[str, Any]:
    groups = dict(REGION_GROUPS)

    for candidate in (
        region_dir / "regions.json",
        region_dir / "mapregions.json",
        region_dir / "region-groups.json",
    ):
        data = read_json(candidate, fallback={})

        if not isinstance(data, dict):
            continue

        external_groups = data.get("regions", data.get("region_groups", data))

        if isinstance(external_groups, dict):
            for region_id, region in external_groups.items():
                if isinstance(region, dict):
                    groups[str(region_id)] = {
                        **groups.get(str(region_id), {}),
                        **region,
                    }

    return groups


def build_region_layers(region_payload: Mapping[str, Any]) -> dict[str, Any]:
    regions = region_payload.get("regions", {})
    if not isinstance(regions, Mapping):
        regions = {}

    layers = []

    for region_id, region in regions.items():
        if not isinstance(region, Mapping):
            continue

        layers.append({
            "id": f"region:{region_id}",
            "label": region.get("label", str(region_id).replace("-", " ").title()),
            "kind": "region-filter",
            "enabled": True,
            "visible": False,
            "color": region.get("color", "#8c927e"),
            "point_count": region.get("point_count", 0),
            "filter": {
                "type": "region",
                "key": "map_region",
                "value": region_id,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-region-layers-v1",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points_with_regions(rows: list[dict[str, Any]], region_groups: Mapping[str, Mapping[str, Any]]) -> list[dict[str, Any]]:
    output = []

    for row in rows:
        item = dict(row)
        country = point_country(item)
        region_id = region_for_country(country, region_groups)
        region = region_groups.get(region_id, {})

        item["map_region"] = region_id
        item["map_region_label"] = clean(region.get("label")) or region_id.replace("-", " ").title()
        item["map_region_color"] = clean(region.get("color")) or "#8c927e"

        output.append(item)

    return output


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
        "schema": "zzx-bitnodes-mapregions-build-report-v1",
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
        description="Build Bitnodes map region summaries, region filters, and region-annotated vectors."
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
