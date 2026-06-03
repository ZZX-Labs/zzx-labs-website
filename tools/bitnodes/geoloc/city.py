#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GEO_ROOT = APP_ROOT / "tools" / "bitnodes" / "data" / "geo"
DEFAULT_CITY_DIR = DEFAULT_GEO_ROOT / "cities"

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


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return re.sub(r"\s+", " ", text)


def normalize_key(value: Any) -> str:
    return clean(value).lower().replace("_", " ").replace("-", " ").strip()


def normalize_code(value: Any) -> str:
    text = clean(value).upper()

    if not text:
        return ""

    if "-" in text:
        text = text.rsplit("-", 1)[-1]

    return text.strip()


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if not math.isfinite(n):
        return fallback

    return n


def first(mapping: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = clean(mapping.get(key))

        if value:
            return value

    return ""


def nested_dict(row: dict[str, Any], key: str) -> dict[str, Any]:
    value = row.get(key)

    return value if isinstance(value, dict) else {}


def country_code(row: dict[str, Any]) -> str:
    for key in (
        "country_code",
        "cc",
        "iso_country",
        "iso_country_code",
    ):
        value = normalize_code(row.get(key))

        if len(value) == 2:
            return value

    country_data = nested_dict(row, "country_data")

    for key in (
        "country_code",
        "cc",
        "iso_country",
        "iso_country_code",
    ):
        value = normalize_code(country_data.get(key))

        if len(value) == 2:
            return value

    geo = nested_dict(row, "geo")

    for key in (
        "country_code",
        "country",
        "iso_code",
        "iso_country",
        "iso_country_code",
    ):
        value = normalize_code(geo.get(key))

        if len(value) == 2:
            return value

    value = normalize_code(row.get("country"))

    if len(value) == 2:
        return value

    return ""


def admin1_code(row: dict[str, Any]) -> str:
    for key in (
        "admin1_code",
        "territory_code",
        "state_code",
        "subdivision_code",
        "province_code",
        "region_code",
    ):
        value = normalize_code(row.get(key))

        if value:
            return value

    territory_data = nested_dict(row, "territory_data")

    for key in (
        "admin1_code",
        "territory_code",
        "state_code",
        "subdivision_code",
        "province_code",
        "region_code",
    ):
        value = normalize_code(territory_data.get(key))

        if value:
            return value

    geo = nested_dict(row, "geo")

    for key in (
        "admin1_code",
        "territory_code",
        "state_code",
        "subdivision_code",
        "province_code",
        "region_code",
    ):
        value = normalize_code(geo.get(key))

        if value:
            return value

    return ""


def admin2_code(row: dict[str, Any]) -> str:
    for key in (
        "admin2_code",
        "county_code",
        "district_code",
        "municipality_code",
        "parish_code",
    ):
        value = normalize_code(row.get(key))

        if value:
            return value

    county_data = nested_dict(row, "county_data")

    for key in (
        "admin2_code",
        "county_code",
        "district_code",
        "municipality_code",
        "parish_code",
    ):
        value = normalize_code(county_data.get(key))

        if value:
            return value

    geo = nested_dict(row, "geo")

    for key in (
        "admin2_code",
        "county_code",
        "district_code",
        "municipality_code",
        "parish_code",
    ):
        value = normalize_code(geo.get(key))

        if value:
            return value

    return ""


def raw_city_name(row: dict[str, Any]) -> str:
    name = first(
        row,
        (
            "city",
            "city_name",
            "town",
            "town_name",
            "village",
            "village_name",
            "hamlet",
            "locality",
            "place",
            "place_name",
            "municipality",
            "settlement",
            "populated_place",
        ),
    )

    if name:
        return name

    geo = nested_dict(row, "geo")

    return first(
        geo,
        (
            "city",
            "city_name",
            "town",
            "town_name",
            "village",
            "village_name",
            "hamlet",
            "locality",
            "place",
            "place_name",
            "municipality",
            "settlement",
            "populated_place",
        ),
    )


def row_lat_lon(row: dict[str, Any]) -> tuple[float | None, float | None]:
    lat = number(
        row.get("latitude")
        or row.get("lat")
        or nested_dict(row, "geoloc").get("latitude")
    )

    lon = number(
        row.get("longitude")
        or row.get("lon")
        or row.get("lng")
        or nested_dict(row, "geoloc").get("longitude")
    )

    if lat is None or lon is None:
        geo = nested_dict(row, "geo")

        lat = number(geo.get("latitude") or geo.get("lat"))
        lon = number(geo.get("longitude") or geo.get("lon") or geo.get("lng"))

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def load_city_index(country: str, admin1: str, city_dir: Path) -> dict[str, Any]:
    if not country:
        return {}

    candidates = []

    if admin1:
        candidates.extend([
            city_dir / country.upper() / f"{admin1.upper()}.json",
            city_dir / country.lower() / f"{admin1.upper()}.json",
            city_dir / country.upper() / f"{admin1.lower()}.json",
        ])

    candidates.extend([
        city_dir / country.upper() / "Unknown.json",
        city_dir / country.upper() / "unknown.json",
    ])

    for path in candidates:
        data = read_json(path, fallback={})

        if isinstance(data, dict) and data:
            return data

    return {}


def city_rows(index: dict[str, Any]) -> list[dict[str, Any]]:
    rows = index.get("cities", [])

    return rows if isinstance(rows, list) else []


def build_name_lookup(cities: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}

    for city in cities:
        names = [
            city.get("name"),
            city.get("ascii_name"),
        ]

        alternate = city.get("alternate_names", [])

        if isinstance(alternate, list):
            names.extend(alternate)

        for name in names:
            key = normalize_key(name)

            if key and key not in lookup:
                lookup[key] = city

    return lookup


def haversine_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    radius = 6371.0088

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(delta_lambda / 2) ** 2
    )

    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearest_city(
    cities: list[dict[str, Any]],
    lat: float,
    lon: float,
) -> tuple[dict[str, Any] | None, float | None]:
    best: dict[str, Any] | None = None
    best_distance: float | None = None

    for city in cities:
        city_lat = number(city.get("latitude"))
        city_lon = number(city.get("longitude"))

        if city_lat is None or city_lon is None:
            continue

        distance = haversine_km(lat, lon, city_lat, city_lon)

        if best_distance is None or distance < best_distance:
            best = city
            best_distance = distance

    return best, best_distance


def city_payload(
    city: dict[str, Any],
    *,
    source: str,
    confidence: str,
    distance_km: float | None = None,
) -> dict[str, Any]:
    return {
        "city": clean(city.get("name")) or clean(city.get("ascii_name")) or "Unknown",
        "city_ascii": clean(city.get("ascii_name")),
        "geoname_id": clean(city.get("geoname_id")),
        "feature_class": clean(city.get("feature_class")),
        "feature_code": clean(city.get("feature_code")),
        "country_code": normalize_code(city.get("country_code")) or "Unknown",
        "admin1_code": normalize_code(city.get("admin1_code")) or "Unknown",
        "admin2_code": normalize_code(city.get("admin2_code")) or "Unknown",
        "latitude": number(city.get("latitude")),
        "longitude": number(city.get("longitude")),
        "population": number(city.get("population"), 0),
        "timezone": clean(city.get("timezone")),
        "city_source": source,
        "city_confidence": confidence,
        "nearest_distance_km": distance_km,
    }


def resolve_city(
    row: dict[str, Any],
    city_dir: Path,
) -> dict[str, Any]:
    if row.get("is_tor") or nested_dict(row, "tor").get("is_tor"):
        return {
            "city": "Everywhere / Nowhere",
            "city_ascii": "Everywhere / Nowhere",
            "geoname_id": "",
            "feature_class": "overlay",
            "feature_code": "TOR",
            "country_code": "TOR",
            "admin1_code": "TOR",
            "admin2_code": "TOR",
            "latitude": 0.0,
            "longitude": -32.0,
            "population": 0,
            "timezone": "UTC",
            "city_source": "tor-overlay",
            "city_confidence": "high",
            "nearest_distance_km": 0.0,
        }

    if row.get("is_i2p") or nested_dict(row, "i2p").get("is_i2p"):
        return {
            "city": "Distributed Overlay",
            "city_ascii": "Distributed Overlay",
            "geoname_id": "",
            "feature_class": "overlay",
            "feature_code": "I2P",
            "country_code": "I2P",
            "admin1_code": "I2P",
            "admin2_code": "I2P",
            "latitude": 0.0,
            "longitude": 32.0,
            "population": 0,
            "timezone": "UTC",
            "city_source": "i2p-overlay",
            "city_confidence": "high",
            "nearest_distance_km": 0.0,
        }

    country = country_code(row)
    admin1 = admin1_code(row)
    admin2 = admin2_code(row)
    name = raw_city_name(row)
    lat, lon = row_lat_lon(row)

    index = load_city_index(country, admin1, city_dir)
    cities = city_rows(index)
    lookup = build_name_lookup(cities)

    if name:
        key = normalize_key(name)

        if key in lookup:
            return city_payload(
                lookup[key],
                source="local-json-name",
                confidence="high",
            )

        return {
            "city": name,
            "city_ascii": name,
            "geoname_id": "",
            "feature_class": "",
            "feature_code": "",
            "country_code": country or "Unknown",
            "admin1_code": admin1 or "Unknown",
            "admin2_code": admin2 or "Unknown",
            "latitude": lat,
            "longitude": lon,
            "population": 0,
            "timezone": "",
            "city_source": "explicit-name",
            "city_confidence": "medium",
            "nearest_distance_km": None,
        }

    if lat is not None and lon is not None and cities:
        city, distance = nearest_city(cities, lat, lon)

        if city:
            confidence = "high" if distance is not None and distance <= 25 else "medium"

            return city_payload(
                city,
                source="nearest-lat-lon",
                confidence=confidence,
                distance_km=distance,
            )

    return {
        "city": "Unknown",
        "city_ascii": "",
        "geoname_id": "",
        "feature_class": "",
        "feature_code": "",
        "country_code": country or "Unknown",
        "admin1_code": admin1 or "Unknown",
        "admin2_code": admin2 or "Unknown",
        "latitude": lat,
        "longitude": lon,
        "population": 0,
        "timezone": "",
        "city_source": "fallback",
        "city_confidence": "none",
        "nearest_distance_km": None,
    }


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    context = context or {}

    city_dir = Path(
        context.get("city_dir")
        or context.get("cities_dir")
        or context.get("geo_city_dir")
        or DEFAULT_CITY_DIR
    )

    for node in nodes:
        meta = resolve_city(node, city_dir)

        node["city_data"] = meta
        node["city"] = meta["city"]
        node["city_ascii"] = meta["city_ascii"]

        if meta["latitude"] is not None and meta["longitude"] is not None:
            node.setdefault("geoloc", {})
            node["geoloc"]["nearest_city_latitude"] = meta["latitude"]
            node["geoloc"]["nearest_city_longitude"] = meta["longitude"]
            node["nearest_city_latitude"] = meta["latitude"]
            node["nearest_city_longitude"] = meta["longitude"]

        node.setdefault("enrichment", {})
        node["enrichment"]["city"] = {
            "status": "ok",
            "updated_at": utc_now(),
            "city_dir": str(city_dir),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    countries: dict[str, int] = {}
    sources: dict[str, int] = {}

    for node in nodes:
        city_data = nested_dict(node, "city_data")

        city = (
            clean(node.get("city"))
            or clean(city_data.get("city"))
            or "Unknown"
        )

        country = (
            clean(node.get("country_code"))
            or clean(city_data.get("country_code"))
            or "Unknown"
        )

        source = clean(city_data.get("city_source")) or "unknown"

        counts[city] = counts.get(city, 0) + 1
        countries[country] = countries.get(country, 0) + 1
        sources[source] = sources.get(source, 0) + 1

    top_city = max(
        counts.items(),
        key=lambda item: item[1],
        default=("Unknown", 0),
    )

    return {
        "schema": "zzx-bitnodes-city-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "city_count": len(counts),
        "country_count": len(countries),
        "cities": counts,
        "countries": countries,
        "sources": sources,
        "top_city": {
            "city": top_city[0],
            "count": top_city[1],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with globally indexed city/town/village/locality metadata."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument(
        "--city-dir",
        default=str(DEFAULT_CITY_DIR),
        help="Directory containing per-country/admin1 city JSON indexes.",
    )

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    enriched = enrich_nodes(
        nodes,
        {
            "city_dir": args.city_dir,
        },
    )

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["city_enriched_at"] = utc_now()
        payload["metadata"]["city_dir"] = args.city_dir
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"city enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
