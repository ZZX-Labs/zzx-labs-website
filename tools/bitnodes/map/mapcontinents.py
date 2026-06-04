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
DEFAULT_CONTINENT_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo" / "continents"

SCHEMA = "zzx-bitnodes-map-continents-v1"


CONTINENT_GROUPS = {
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

    return country or "UNKNOWN"


def point_continent(point: Mapping[str, Any]) -> str:
    continent = clean(first(point, (
        "continent",
        "continent_code",
        "continent_data.continent_code",
        "continent_data.continent",
        "geoip.continent_code",
        "geoip_data.continent_code",
        "location.continent_code",
        "metadata.continent_code",
    ))).upper()

    if continent in CONTINENT_GROUPS:
        return continent

    if continent in {"NORTH AMERICA"}:
        return "NA"
    if continent in {"SOUTH AMERICA"}:
        return "SA"
    if continent in {"EUROPE"}:
        return "EU"
    if continent in {"AFRICA"}:
        return "AF"
    if continent in {"ASIA"}:
        return "AS"
    if continent in {"OCEANIA"}:
        return "OC"
    if continent in {"ANTARCTICA"}:
        return "AN"

    return ""


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

    country = point_country(point)

    if point_network(point) == "tor":
        return "OV"

    if point_network(point) == "i2p":
        return "OV"

    lookup = country_to_continent_map(continent_groups)
    return lookup.get(country, "UN")


def load_external_continent_groups(continent_dir: Path) -> dict[str, Any]:
    groups = dict(CONTINENT_GROUPS)

    for candidate in (
        continent_dir / "continents.json",
        continent_dir / "mapcontinents.json",
        continent_dir / "continent-groups.json",
    ):
        data = read_json(candidate, fallback={})

        if not isinstance(data, dict):
            continue

        external_groups = data.get("continents", data.get("continent_groups", data))

        if isinstance(external_groups, dict):
            for continent_id, continent in external_groups.items():
                if isinstance(continent, dict):
                    key = str(continent_id).upper()
                    groups[key] = {
                        **groups.get(key, {}),
                        **continent,
                    }

    return groups


def build_continent_summary(
    rows: list[dict[str, Any]],
    continent_groups: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    continent_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}
    network_counts_by_continent: dict[str, dict[str, int]] = {}
    status_counts_by_continent: dict[str, dict[str, int]] = {}
    coordinates: dict[str, list[tuple[float, float]]] = {}
    centroids: dict[str, dict[str, float]] = {}

    for row in rows:
        continent = continent_for_point(row, continent_groups)
        country = point_country(row)
        network = point_network(row)
        status = point_status(row)

        continent_counts[continent] = continent_counts.get(continent, 0) + 1
        country_counts[country] = country_counts.get(country, 0) + 1

        network_counts_by_continent.setdefault(continent, {})
        network_counts_by_continent[continent][network] = network_counts_by_continent[continent].get(network, 0) + 1

        status_counts_by_continent.setdefault(continent, {})
        status_counts_by_continent[continent][status] = status_counts_by_continent[continent].get(status, 0) + 1

        lat, lon = point_lat_lon(row)

        if lat is not None and lon is not None:
            coordinates.setdefault(continent, []).append((lat, lon))

    for continent, coords in coordinates.items():
        if not coords:
            continue

        latitudes = [item[0] for item in coords]
        longitudes = [item[1] for item in coords]

        centroids[continent] = {
            "latitude": sum(latitudes) / len(latitudes),
            "longitude": sum(longitudes) / len(longitudes),
            "south": min(latitudes),
            "north": max(latitudes),
            "west": min(longitudes),
            "east": max(longitudes),
        }

    continents = {}

    for continent_id, group in continent_groups.items():
        count = continent_counts.get(continent_id, 0)

        continents[continent_id] = {
            "id": continent_id,
            "label": clean(group.get("label")) or continent_id,
            "color": clean(group.get("color")) or "#8c927e",
            "point_count": count,
            "countries": sorted(group.get("countries", [])) if isinstance(group.get("countries"), list) else [],
            "network_counts": dict(sorted(network_counts_by_continent.get(continent_id, {}).items())),
            "status_counts": dict(sorted(status_counts_by_continent.get(continent_id, {}).items())),
            "centroid": centroids.get(continent_id, {}),
        }

    for continent_id, count in continent_counts.items():
        continents.setdefault(continent_id, {
            "id": continent_id,
            "label": continent_id,
            "color": "#8c927e",
            "point_count": count,
            "countries": [],
            "network_counts": dict(sorted(network_counts_by_continent.get(continent_id, {}).items())),
            "status_counts": dict(sorted(status_counts_by_continent.get(continent_id, {}).items())),
            "centroid": centroids.get(continent_id, {}),
        })

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "continent_count": len(continents),
        "continents": dict(sorted(continents.items(), key=lambda item: (-item[1]["point_count"], item[0]))),
        "country_counts": dict(sorted(country_counts.items(), key=lambda item: (-item[1], item[0]))),
    }


def build_continent_layers(continent_payload: Mapping[str, Any]) -> dict[str, Any]:
    continents = continent_payload.get("continents", {})

    if not isinstance(continents, Mapping):
        continents = {}

    layers = []

    for continent_id, continent in continents.items():
        if not isinstance(continent, Mapping):
            continue

        layers.append({
            "id": f"continent:{continent_id}",
            "label": continent.get("label", str(continent_id)),
            "kind": "continent-filter",
            "enabled": True,
            "visible": False,
            "color": continent.get("color", "#8c927e"),
            "point_count": continent.get("point_count", 0),
            "filter": {
                "type": "continent",
                "key": "map_continent",
                "value": continent_id,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-continent-layers-v1",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points_with_continents(
    rows: list[dict[str, Any]],
    continent_groups: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    output = []

    for row in rows:
        item = dict(row)
        continent_id = continent_for_point(item, continent_groups)
        continent = continent_groups.get(continent_id, {})

        item["map_continent"] = continent_id
        item["map_continent_label"] = clean(continent.get("label")) or continent_id
        item["map_continent_color"] = clean(continent.get("color")) or "#8c927e"

        output.append(item)

    return output


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
        "schema": "zzx-bitnodes-mapcontinents-build-report-v1",
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
        description="Build Bitnodes map continent summaries, continent filters, and continent-annotated vectors."
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
