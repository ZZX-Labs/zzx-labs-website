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
DEFAULT_CONTINENT_DIR = BITNODES_ROOT / "data" / "geo" / "continents"

SCHEMA = "zzx-bitnodes-map-continents-v4"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}

CONTINENT_GROUPS: dict[str, dict[str, Any]] = {
    "NA": {
        "id": "NA",
        "label": "North America",
        "countries": ["US", "CA", "MX", "GL", "BM", "PM"],
        "color": "#70b7ff",
    },
    "SA": {
        "id": "SA",
        "label": "South America",
        "countries": ["AR", "BO", "BR", "CL", "CO", "EC", "FK", "GF", "GY", "PY", "PE", "SR", "UY", "VE"],
        "color": "#79e6c5",
    },
    "EU": {
        "id": "EU",
        "label": "Europe",
        "countries": [
            "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CY", "CZ", "DK", "EE",
            "FI", "FR", "DE", "GI", "GR", "HU", "IS", "IE", "IT", "XK", "LV", "LI",
            "LT", "LU", "MT", "MD", "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO",
            "RU", "SM", "RS", "SK", "SI", "ES", "SE", "CH", "UA", "GB", "VA",
        ],
        "color": "#c0d674",
    },
    "AF": {
        "id": "AF",
        "label": "Africa",
        "countries": [
            "DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CG",
            "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN",
            "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ",
            "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD",
            "TZ", "TG", "TN", "UG", "EH", "ZM", "ZW",
        ],
        "color": "#e6a42b",
    },
    "AS": {
        "id": "AS",
        "label": "Asia",
        "countries": [
            "AF", "AM", "AZ", "BH", "BD", "BT", "BN", "KH", "CN", "GE", "HK", "IN",
            "ID", "IR", "IQ", "IL", "JP", "JO", "KZ", "KW", "KG", "LA", "LB", "MO",
            "MY", "MV", "MN", "MM", "NP", "KP", "OM", "PK", "PS", "PH", "QA", "SA",
            "SG", "KR", "LK", "SY", "TW", "TJ", "TH", "TL", "TR", "TM", "AE", "UZ",
            "VN", "YE",
        ],
        "color": "#b889ff",
    },
    "OC": {
        "id": "OC",
        "label": "Oceania",
        "countries": [
            "AS", "AU", "CK", "FJ", "PF", "GU", "KI", "MH", "FM", "NR", "NC", "NZ",
            "NU", "NF", "MP", "PW", "PG", "PN", "WS", "SB", "TK", "TO", "TV", "VU",
            "WF",
        ],
        "color": "#74d6ff",
    },
    "AN": {
        "id": "AN",
        "label": "Antarctica",
        "countries": ["AQ", "BV", "GS", "HM", "TF"],
        "color": "#edf7b9",
    },
    "OV": {
        "id": "OV",
        "label": "Overlay Networks",
        "countries": ["TOR", "I2P"],
        "color": "#9d67ad",
    },
    "UN": {
        "id": "UN",
        "label": "Unknown / Unclassified",
        "countries": ["UNKNOWN", ""],
        "color": "#8c927e",
    },
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


def point_continent(point: Mapping[str, Any]) -> str:
    continent = clean(first(point, (
        "continent_code",
        "continent",
        "continent_data.continent_code",
        "continent_data.continent",
        "geoip.continent_code",
        "geoip_data.continent_code",
        "location.continent_code",
        "metadata.continent_code",
        "metadata.continent",
    ))).upper()

    aliases = {
        "NORTH AMERICA": "NA",
        "SOUTH AMERICA": "SA",
        "EUROPE": "EU",
        "AFRICA": "AF",
        "ASIA": "AS",
        "OCEANIA": "OC",
        "ANTARCTICA": "AN",
        "OVERLAY": "OV",
        "OVERLAY NETWORKS": "OV",
        "UNKNOWN": "UN",
    }

    if continent in CONTINENT_GROUPS:
        return continent

    return aliases.get(continent, "")


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


def country_to_continent_map(continent_groups: Mapping[str, Mapping[str, Any]]) -> dict[str, str]:
    output: dict[str, str] = {}

    for continent_id, continent in continent_groups.items():
        countries = continent.get("countries", [])
        if not isinstance(countries, list):
            continue

        for country in countries:
            output[str(country).upper()] = continent_id

    return output


def continent_for_point(point: Mapping[str, Any], continent_groups: Mapping[str, Mapping[str, Any]]) -> str:
    explicit = point_continent(point)

    if explicit:
        return explicit

    network = point_network(point)
    if network in {"tor", "i2p"}:
        return "OV"

    country = point_country(point)
    lookup = country_to_continent_map(continent_groups)
    return lookup.get(country, "UN")


def sorted_counts(counter: dict[str, int]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))


def inc(counter: dict[str, int], key: Any) -> None:
    value = clean(key) or "Unknown"
    counter[value] = counter.get(value, 0) + 1


def load_external_continent_groups(continent_dir: Path) -> dict[str, Any]:
    groups: dict[str, Any] = {key: dict(value) for key, value in CONTINENT_GROUPS.items()}

    for candidate in (
        continent_dir / "continents.json",
        continent_dir / "continents.json.gz",
        continent_dir / "mapcontinents.json",
        continent_dir / "mapcontinents.json.gz",
        continent_dir / "continent-groups.json",
        continent_dir / "continent-groups.json.gz",
    ):
        data = read_json(candidate, fallback={})

        if not isinstance(data, dict):
            continue

        external_groups = data.get("continents", data.get("continent_groups", data))

        if isinstance(external_groups, dict):
            for continent_id, continent in external_groups.items():
                if isinstance(continent, dict):
                    key = str(continent_id).upper()
                    groups[key] = {**groups.get(key, {}), **continent}

    return groups


def annotate_points_with_continents(
    rows: list[dict[str, Any]],
    continent_groups: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    output = []

    for row in rows:
        item = dict(row)
        continent_id = continent_for_point(item, continent_groups)
        continent = continent_groups.get(continent_id, continent_groups.get("UN", {}))

        item["map_continent"] = continent_id
        item["map_continent_label"] = clean(continent.get("label")) or continent_id
        item["map_continent_color"] = clean(continent.get("color")) or "#8c927e"

        output.append(item)

    return output


def build_continent_summary(
    rows: list[dict[str, Any]],
    continent_groups: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    continent_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}
    network_counts_by_continent: dict[str, dict[str, int]] = {}
    status_counts_by_continent: dict[str, dict[str, int]] = {}
    security_counts_by_continent: dict[str, dict[str, int]] = {}
    coordinates: dict[str, list[tuple[float, float]]] = {}

    for row in rows:
        continent = continent_for_point(row, continent_groups)
        country = point_country(row)
        network = point_network(row)
        status = point_status(row)

        inc(continent_counts, continent)
        inc(country_counts, country)

        network_counts_by_continent.setdefault(continent, {})
        status_counts_by_continent.setdefault(continent, {})
        security_counts_by_continent.setdefault(continent, {
            "sanctioned_nodes": 0,
            "policy_restricted_nodes": 0,
            "threat_infrastructure_nodes": 0,
        })

        inc(network_counts_by_continent[continent], network)
        inc(status_counts_by_continent[continent], status)

        if is_sanctioned(row):
            security_counts_by_continent[continent]["sanctioned_nodes"] += 1
        if is_policy_restricted(row):
            security_counts_by_continent[continent]["policy_restricted_nodes"] += 1
        if is_threat(row):
            security_counts_by_continent[continent]["threat_infrastructure_nodes"] += 1

        lat, lon = point_lat_lon(row)
        if lat is not None and lon is not None:
            coordinates.setdefault(continent, []).append((lat, lon))

    centroids: dict[str, dict[str, float]] = {}

    for continent, coords in coordinates.items():
        lats = [lat for lat, _lon in coords]
        lons = [lon for _lat, lon in coords]
        centroids[continent] = {
            "latitude": sum(lats) / len(lats),
            "longitude": sum(lons) / len(lons),
            "south": min(lats),
            "north": max(lats),
            "west": min(lons),
            "east": max(lons),
        }

    continents = {}

    for continent_id, group in continent_groups.items():
        count = continent_counts.get(continent_id, 0)
        countries = group.get("countries", [])
        if not isinstance(countries, list):
            countries = []

        continents[continent_id] = {
            "id": continent_id,
            "label": clean(group.get("label")) or continent_id,
            "color": clean(group.get("color")) or "#8c927e",
            "point_count": count,
            "countries": sorted(str(country).upper() for country in countries),
            "network_counts": sorted_counts(network_counts_by_continent.get(continent_id, {})),
            "status_counts": sorted_counts(status_counts_by_continent.get(continent_id, {})),
            "security_counts": security_counts_by_continent.get(continent_id, {
                "sanctioned_nodes": 0,
                "policy_restricted_nodes": 0,
                "threat_infrastructure_nodes": 0,
            }),
            "centroid": centroids.get(continent_id, {}),
        }

    for continent_id, count in continent_counts.items():
        continents.setdefault(continent_id, {
            "id": continent_id,
            "label": continent_id,
            "color": "#8c927e",
            "point_count": count,
            "countries": [],
            "network_counts": sorted_counts(network_counts_by_continent.get(continent_id, {})),
            "status_counts": sorted_counts(status_counts_by_continent.get(continent_id, {})),
            "security_counts": security_counts_by_continent.get(continent_id, {
                "sanctioned_nodes": 0,
                "policy_restricted_nodes": 0,
                "threat_infrastructure_nodes": 0,
            }),
            "centroid": centroids.get(continent_id, {}),
        })

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "continent_count": len(continents),
        "continents": dict(sorted(continents.items(), key=lambda item: (-int(item[1]["point_count"]), item[0]))),
        "country_counts": sorted_counts(country_counts),
        "red_ring_semantics": {
            "sanctioned_continent_count": "continent contains nodes with red marker ring",
            "policy_restricted_continent_count": "continent contains nodes with red-orange marker ring",
            "threat_continent_count": "continent contains defensive threat-infrastructure matches",
        },
        "false_positive_control": {
            "threat_infrastructure": "defensive infrastructure correlation only",
            "threat_actor_labels": "explicit trusted metadata/feed labels only",
            "no_country_to_apt_inference": True,
        },
    }


def build_continent_layers(continent_payload: Mapping[str, Any]) -> dict[str, Any]:
    continents = continent_payload.get("continents", {})
    if not isinstance(continents, Mapping):
        continents = {}

    layers = []

    for continent_id, continent in continents.items():
        if not isinstance(continent, Mapping):
            continue

        security = continent.get("security_counts", {})
        if not isinstance(security, Mapping):
            security = {}

        color = clean(continent.get("color")) or "#8c927e"
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
            "id": f"continent:{continent_id}",
            "label": continent.get("label", str(continent_id)),
            "kind": "continent-filter",
            "enabled": True,
            "visible": False,
            "color": color,
            "point_count": continent.get("point_count", 0),
            "marker_ring": marker_ring,
            "table_badge": table_badge,
            "filter": {
                "type": "equals",
                "key": "map_continent",
                "value": continent_id,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-continent-layers-v4",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def merge_continents(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    continent_dir = Path(context.get("continent_dir") or context.get("map_continent_dir") or DEFAULT_CONTINENT_DIR)

    output = dict(payload)
    continent_groups = load_external_continent_groups(continent_dir)

    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    annotated = annotate_points_with_continents(rows, continent_groups)

    if vectors_payload:
        vectors_payload["points"] = annotated
        vectors_payload.setdefault("vectors", {})
        if isinstance(vectors_payload["vectors"], dict):
            vectors_payload["vectors"]["points"] = annotated
        output["vectors"] = vectors_payload

    continent_payload = build_continent_summary(annotated, continent_groups)
    continent_layers = build_continent_layers(continent_payload)

    output["continents"] = continent_payload
    output["continent_layers"] = continent_layers

    settings = dict(output.get("settings", {}))
    settings["continents"] = {
        "url": "./data/map-continents.json",
        "layers_url": "./data/map-continent-layers.json",
        "continent_dir": str(continent_dir),
        "enabled": True,
        "user_selectable": True,
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_continents(payload, context)


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_continents(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    continent_dir: Path = DEFAULT_CONTINENT_DIR,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})

    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_continents(payload, {"continent_dir": str(continent_dir)})
    continents = merged["continents"]
    continent_layers = merged["continent_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"

        write_json(data_dir / "map-continents.json", continents, compact=compact)
        write_json(data_dir / "map-continent-layers.json", continent_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})

        if not isinstance(settings, dict):
            settings = {}

        settings["continents"] = merged["settings"]["continents"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapcontinents-build-report-v4",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "continent_dir": str(continent_dir),
        "continent_count": continents.get("continent_count", 0),
        "total_points": continents.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map continent summaries, continent filters, and continent-annotated vectors.",
        allow_abbrev=False,
    )

    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--continent-dir", default=str(DEFAULT_CONTINENT_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        continent_dir=Path(args.continent_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map continents complete: "
        f"{report['continent_count']} continents, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
