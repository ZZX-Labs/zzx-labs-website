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
DEFAULT_COUNTRY_DIR = BITNODES_ROOT / "data" / "geo" / "countries"

SCHEMA = "zzx-bitnodes-map-countries-v4"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}


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


def point_country_name(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "country_name",
        "country_data.country_name",
        "geoip.country_name",
        "geoip_data.country_name",
        "location.country_name",
        "metadata.country_name",
    )))


def point_continent(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
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


def point_region(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "map_region",
        "region",
        "region_data.region",
        "geoip.region",
        "geoip_data.region",
        "location.region",
        "metadata.region",
    )))


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


def load_country_reference(country_dir: Path) -> dict[str, dict[str, Any]]:
    references: dict[str, dict[str, Any]] = {}

    for candidate in (
        country_dir / "countries.json",
        country_dir / "countries.json.gz",
        country_dir / "mapcountries.json",
        country_dir / "mapcountries.json.gz",
        country_dir / "country-groups.json",
        country_dir / "country-groups.json.gz",
    ):
        data = read_json(candidate, fallback={})

        if not isinstance(data, dict):
            continue

        rows = data.get("countries", data.get("country_groups", data))

        if isinstance(rows, dict):
            for code, row in rows.items():
                if isinstance(row, dict):
                    references[str(code).upper()] = dict(row)

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue

                code = clean(row.get("country_code") or row.get("code") or row.get("iso2")).upper()

                if code:
                    references[code] = dict(row)

    references.setdefault("TOR", {
        "country_code": "TOR",
        "country_name": "Tor Overlay Network",
        "continent": "OV",
        "region": "overlay-networks",
        "color": "#9d67ad",
    })

    references.setdefault("I2P", {
        "country_code": "I2P",
        "country_name": "I2P Overlay Network",
        "continent": "OV",
        "region": "overlay-networks",
        "color": "#b889ff",
    })

    references.setdefault("UNKNOWN", {
        "country_code": "UNKNOWN",
        "country_name": "Unknown / Unclassified",
        "continent": "UN",
        "region": "unknown",
        "color": "#8c927e",
    })

    return references


def sorted_counts(counter: dict[str, int]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))


def inc(counter: dict[str, int], key: Any) -> None:
    value = clean(key) or "Unknown"
    counter[value] = counter.get(value, 0) + 1


def build_country_summary(
    rows: list[dict[str, Any]],
    references: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    country_counts: dict[str, int] = {}
    network_counts_by_country: dict[str, dict[str, int]] = {}
    status_counts_by_country: dict[str, dict[str, int]] = {}
    security_counts_by_country: dict[str, dict[str, int]] = {}
    intelligence_counts_by_country: dict[str, dict[str, int]] = {}
    coordinates: dict[str, list[tuple[float, float]]] = {}

    for row in rows:
        country = point_country(row)
        network = point_network(row)
        status = point_status(row)

        inc(country_counts, country)

        network_counts_by_country.setdefault(country, {})
        status_counts_by_country.setdefault(country, {})
        security_counts_by_country.setdefault(country, {
            "sanctioned_nodes": 0,
            "policy_restricted_nodes": 0,
            "threat_infrastructure_nodes": 0,
        })
        intelligence_counts_by_country.setdefault(country, {
            "vpn_nodes": 0,
            "proxy_nodes": 0,
            "datacenter_nodes": 0,
            "government_nodes": 0,
            "military_nodes": 0,
            "apt_label_nodes": 0,
            "threat_actor_label_nodes": 0,
            "known_malactor_nodes": 0,
        })

        inc(network_counts_by_country[country], network)
        inc(status_counts_by_country[country], status)

        if is_sanctioned(row):
            security_counts_by_country[country]["sanctioned_nodes"] += 1
        if is_policy_restricted(row):
            security_counts_by_country[country]["policy_restricted_nodes"] += 1
        if is_threat(row):
            security_counts_by_country[country]["threat_infrastructure_nodes"] += 1

        if flag(row, ("is_vpn", "suspected_vpn", "vpn_data.is_vpn", "vpn.is_vpn", "metadata.is_vpn")):
            intelligence_counts_by_country[country]["vpn_nodes"] += 1
        if flag(row, ("is_proxy", "suspected_proxy", "proxy_data.is_proxy", "proxy.is_proxy", "metadata.is_proxy")):
            intelligence_counts_by_country[country]["proxy_nodes"] += 1
        if flag(row, ("is_datacenter", "datacenter_data.is_datacenter", "datacenter.is_datacenter", "metadata.is_datacenter")):
            intelligence_counts_by_country[country]["datacenter_nodes"] += 1
        if flag(row, ("is_government", "government_data.is_government", "government.is_government", "metadata.is_government")):
            intelligence_counts_by_country[country]["government_nodes"] += 1
        if flag(row, ("is_military", "military_data.is_military", "military.is_military", "metadata.is_military")):
            intelligence_counts_by_country[country]["military_nodes"] += 1
        if flag(row, ("suspected_apt_related", "is_apt", "apt_data.is_apt", "metadata.is_apt")):
            intelligence_counts_by_country[country]["apt_label_nodes"] += 1
        if flag(row, ("suspected_threat_actor_group_related", "is_threat_actor", "threat_actor_data.is_threat_actor", "metadata.is_threat_actor")):
            intelligence_counts_by_country[country]["threat_actor_label_nodes"] += 1
        if flag(row, ("is_known_malactor", "knownmalactor.is_known_malactor", "known_malactor_data.is_known_malactor", "metadata.is_known_malactor")):
            intelligence_counts_by_country[country]["known_malactor_nodes"] += 1

        lat, lon = point_lat_lon(row)
        if lat is not None and lon is not None:
            coordinates.setdefault(country, []).append((lat, lon))

    centroids: dict[str, dict[str, float]] = {}

    for country, coords in coordinates.items():
        lats = [lat for lat, _lon in coords]
        lons = [lon for _lat, lon in coords]
        centroids[country] = {
            "latitude": sum(lats) / len(lats),
            "longitude": sum(lons) / len(lons),
            "south": min(lats),
            "north": max(lats),
            "west": min(lons),
            "east": max(lons),
        }

    countries: dict[str, Any] = {}

    for country, count in country_counts.items():
        reference = references.get(country, {})

        country_name = (
            clean(reference.get("country_name"))
            or clean(reference.get("name"))
            or next((point_country_name(row) for row in rows if point_country(row) == country and point_country_name(row)), "")
            or country
        )

        countries[country] = {
            "country_code": country,
            "country_name": country_name,
            "continent": clean(reference.get("continent") or reference.get("continent_code")) or next((point_continent(row) for row in rows if point_country(row) == country and point_continent(row)), ""),
            "region": clean(reference.get("region")) or next((point_region(row) for row in rows if point_country(row) == country and point_region(row)), ""),
            "color": clean(reference.get("color")) or "#8c927e",
            "point_count": count,
            "network_counts": sorted_counts(network_counts_by_country.get(country, {})),
            "status_counts": sorted_counts(status_counts_by_country.get(country, {})),
            "security_counts": security_counts_by_country.get(country, {
                "sanctioned_nodes": 0,
                "policy_restricted_nodes": 0,
                "threat_infrastructure_nodes": 0,
            }),
            "intelligence_counts": intelligence_counts_by_country.get(country, {}),
            "centroid": centroids.get(country, {}),
        }

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "country_count": len(countries),
        "countries": dict(sorted(countries.items(), key=lambda item: (-int(item[1]["point_count"]), item[0]))),
        "red_ring_semantics": {
            "sanctioned_country_count": "country contains nodes with red marker ring",
            "policy_restricted_country_count": "country contains nodes with red-orange marker ring",
            "threat_country_count": "country contains defensive threat-infrastructure matches",
        },
        "false_positive_control": {
            "threat_infrastructure": "defensive infrastructure correlation only",
            "threat_actor_labels": "explicit trusted metadata/feed labels only",
            "no_country_to_apt_inference": True,
        },
    }


def build_country_layers(country_payload: Mapping[str, Any]) -> dict[str, Any]:
    countries = country_payload.get("countries", {})
    if not isinstance(countries, Mapping):
        countries = {}

    layers = []

    for country_code, country in countries.items():
        if not isinstance(country, Mapping):
            continue

        security = country.get("security_counts", {})
        if not isinstance(security, Mapping):
            security = {}

        color = clean(country.get("color")) or "#8c927e"
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
            "id": f"country:{country_code}",
            "label": country.get("country_name", str(country_code)),
            "kind": "country-filter",
            "enabled": True,
            "visible": False,
            "color": color,
            "point_count": country.get("point_count", 0),
            "marker_ring": marker_ring,
            "table_badge": table_badge,
            "filter": {
                "type": "equals",
                "key": "map_country",
                "value": country_code,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-country-layers-v4",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points_with_countries(
    rows: list[dict[str, Any]],
    country_payload: Mapping[str, Any],
) -> list[dict[str, Any]]:
    countries = country_payload.get("countries", {})
    if not isinstance(countries, Mapping):
        countries = {}

    output = []

    for row in rows:
        item = dict(row)
        country = point_country(item)
        reference = countries.get(country, {})

        item["map_country"] = country
        item["map_country_label"] = clean(reference.get("country_name")) or country
        item["map_country_color"] = clean(reference.get("color")) or "#8c927e"

        output.append(item)

    return output


def merge_countries(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    country_dir = Path(context.get("country_dir") or context.get("map_country_dir") or DEFAULT_COUNTRY_DIR)

    output = dict(payload)
    references = load_country_reference(country_dir)

    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)

    country_payload = build_country_summary(rows, references)
    annotated = annotate_points_with_countries(rows, country_payload)
    country_layers = build_country_layers(country_payload)

    if vectors_payload:
        vectors_payload["points"] = annotated
        vectors_payload.setdefault("vectors", {})
        if isinstance(vectors_payload["vectors"], dict):
            vectors_payload["vectors"]["points"] = annotated
        output["vectors"] = vectors_payload

    output["countries"] = country_payload
    output["country_layers"] = country_layers

    settings = dict(output.get("settings", {}))
    settings["countries"] = {
        "url": "./data/map-countries.json",
        "layers_url": "./data/map-country-layers.json",
        "country_dir": str(country_dir),
        "enabled": True,
        "user_selectable": True,
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_countries(payload, context)


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_countries(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    country_dir: Path = DEFAULT_COUNTRY_DIR,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})

    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_countries(payload, {"country_dir": str(country_dir)})
    countries = merged["countries"]
    country_layers = merged["country_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"

        write_json(data_dir / "map-countries.json", countries, compact=compact)
        write_json(data_dir / "map-country-layers.json", country_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})

        if not isinstance(settings, dict):
            settings = {}

        settings["countries"] = merged["settings"]["countries"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapcountries-build-report-v4",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "country_dir": str(country_dir),
        "country_count": countries.get("country_count", 0),
        "total_points": countries.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map country summaries, country filters, and country-annotated vectors.",
        allow_abbrev=False,
    )

    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--country-dir", default=str(DEFAULT_COUNTRY_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        country_dir=Path(args.country_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map countries complete: "
        f"{report['country_count']} countries, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
