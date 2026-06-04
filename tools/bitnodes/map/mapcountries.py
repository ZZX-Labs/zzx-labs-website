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
DEFAULT_COUNTRY_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo" / "countries"

SCHEMA = "zzx-bitnodes-map-countries-v1"


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
    country = clean(first(point, (
        "country",
        "country_code",
        "country_data.country_code",
        "geoip.country_code",
        "geoip_data.country_code",
        "location.country_code",
        "metadata.country_code",
    ))).upper()

    network = clean(first(point, ("network", "metadata.network"))).lower()
    address = clean(first(point, ("address", "host", "node", "addr"))).lower()

    if network == "tor" or ".onion" in address:
        return "TOR"

    if network == "i2p" or ".i2p" in address:
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


def point_flag(point: Mapping[str, Any], keys: tuple[str, ...]) -> bool:
    for key in keys:
        value = first(point, (key,))

        if isinstance(value, bool):
            if value:
                return True
            continue

        if value in (1, "1"):
            return True

        text = str(value or "").strip().lower()

        if text in {"true", "yes", "y", "ok", "flagged", "matched"}:
            return True

    return False


def load_country_reference(country_dir: Path) -> dict[str, dict[str, Any]]:
    references: dict[str, dict[str, Any]] = {}

    for candidate in (
        country_dir / "countries.json",
        country_dir / "mapcountries.json",
        country_dir / "country-groups.json",
    ):
        data = read_json(candidate, fallback={})

        if not isinstance(data, dict):
            continue

        rows = data.get("countries", data.get("country_groups", data))

        if isinstance(rows, dict):
            for code, row in rows.items():
                if isinstance(row, dict):
                    references[str(code).upper()] = row

        if isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue

                code = clean(row.get("country_code") or row.get("code") or row.get("iso2")).upper()

                if code:
                    references[code] = row

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


def build_country_summary(
    rows: list[dict[str, Any]],
    references: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    country_counts: dict[str, int] = {}
    network_counts_by_country: dict[str, dict[str, int]] = {}
    status_counts_by_country: dict[str, dict[str, int]] = {}
    intelligence_counts_by_country: dict[str, dict[str, int]] = {}
    coordinates: dict[str, list[tuple[float, float]]] = {}
    centroids: dict[str, dict[str, float]] = {}

    for row in rows:
        country = point_country(row)
        network = point_network(row)
        status = point_status(row)

        country_counts[country] = country_counts.get(country, 0) + 1

        network_counts_by_country.setdefault(country, {})
        network_counts_by_country[country][network] = network_counts_by_country[country].get(network, 0) + 1

        status_counts_by_country.setdefault(country, {})
        status_counts_by_country[country][status] = status_counts_by_country[country].get(status, 0) + 1

        intelligence_counts_by_country.setdefault(country, {
            "vpn_nodes": 0,
            "proxy_nodes": 0,
            "datacenter_nodes": 0,
            "government_nodes": 0,
            "military_nodes": 0,
            "sanctioned_nodes": 0,
            "apt_nodes": 0,
            "threat_actor_nodes": 0,
            "known_malactor_nodes": 0,
        })

        if point_flag(row, ("is_vpn", "suspected_vpn", "vpn_data.is_vpn", "metadata.is_vpn")):
            intelligence_counts_by_country[country]["vpn_nodes"] += 1

        if point_flag(row, ("is_proxy", "suspected_proxy", "proxy_data.is_proxy", "metadata.is_proxy")):
            intelligence_counts_by_country[country]["proxy_nodes"] += 1

        if point_flag(row, ("is_datacenter", "datacenter_data.is_datacenter", "metadata.is_datacenter")):
            intelligence_counts_by_country[country]["datacenter_nodes"] += 1

        if point_flag(row, ("is_government", "government_data.is_government", "metadata.is_government")):
            intelligence_counts_by_country[country]["government_nodes"] += 1

        if point_flag(row, ("is_military", "military_data.is_military", "metadata.is_military")):
            intelligence_counts_by_country[country]["military_nodes"] += 1

        if point_flag(row, ("is_sanctioned", "is_sanctioned_node", "sanctions_data.is_sanctioned", "metadata.is_sanctioned")):
            intelligence_counts_by_country[country]["sanctioned_nodes"] += 1

        if point_flag(row, ("is_apt", "apt_data.is_apt", "metadata.is_apt")):
            intelligence_counts_by_country[country]["apt_nodes"] += 1

        if point_flag(row, ("is_threat_actor", "threat_actor_data.is_threat_actor", "metadata.is_threat_actor")):
            intelligence_counts_by_country[country]["threat_actor_nodes"] += 1

        if point_flag(row, ("is_known_malactor", "known_malactor_data.is_known_malactor", "metadata.is_known_malactor")):
            intelligence_counts_by_country[country]["known_malactor_nodes"] += 1

        lat, lon = point_lat_lon(row)

        if lat is not None and lon is not None:
            coordinates.setdefault(country, []).append((lat, lon))

    for country, coords in coordinates.items():
        if not coords:
            continue

        latitudes = [item[0] for item in coords]
        longitudes = [item[1] for item in coords]

        centroids[country] = {
            "latitude": sum(latitudes) / len(latitudes),
            "longitude": sum(longitudes) / len(longitudes),
            "south": min(latitudes),
            "north": max(latitudes),
            "west": min(longitudes),
            "east": max(longitudes),
        }

    countries: dict[str, Any] = {}

    for country, count in country_counts.items():
        reference = references.get(country, {})

        countries[country] = {
            "country_code": country,
            "country_name": (
                clean(reference.get("country_name"))
                or clean(reference.get("name"))
                or next((point_country_name(row) for row in rows if point_country(row) == country and point_country_name(row)), "")
                or country
            ),
            "continent": clean(reference.get("continent") or reference.get("continent_code")),
            "region": clean(reference.get("region")),
            "color": clean(reference.get("color")) or "#8c927e",
            "point_count": count,
            "network_counts": dict(sorted(network_counts_by_country.get(country, {}).items())),
            "status_counts": dict(sorted(status_counts_by_country.get(country, {}).items())),
            "intelligence_counts": intelligence_counts_by_country.get(country, {}),
            "centroid": centroids.get(country, {}),
        }

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "country_count": len(countries),
        "countries": dict(sorted(countries.items(), key=lambda item: (-item[1]["point_count"], item[0]))),
    }


def build_country_layers(country_payload: Mapping[str, Any]) -> dict[str, Any]:
    countries = country_payload.get("countries", {})

    if not isinstance(countries, Mapping):
        countries = {}

    layers = []

    for country_code, country in countries.items():
        if not isinstance(country, Mapping):
            continue

        layers.append({
            "id": f"country:{country_code}",
            "label": country.get("country_name", str(country_code)),
            "kind": "country-filter",
            "enabled": True,
            "visible": False,
            "color": country.get("color", "#8c927e"),
            "point_count": country.get("point_count", 0),
            "filter": {
                "type": "country",
                "key": "map_country",
                "value": country_code,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-country-layers-v1",
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
        "schema": "zzx-bitnodes-mapcountries-build-report-v1",
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
        description="Build Bitnodes map country summaries, country filters, and country-annotated vectors."
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
