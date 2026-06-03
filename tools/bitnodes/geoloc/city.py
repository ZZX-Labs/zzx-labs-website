#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


APP_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GEO_ROOT = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo"
DEFAULT_CITY_DIR = DEFAULT_GEO_ROOT / "cities"

SCHEMA = "zzx-bitnodes-city-v2"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


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


def clean(value: Any) -> str:
    text = str(value or "").strip()
    if text.lower() in UNKNOWN_VALUES:
        return ""
    return re.sub(r"\s+", " ", text)


def normalize_key(value: Any) -> str:
    return clean(value).lower().replace("_", " ").replace("-", " ").strip()


def normalize_code(value: Any) -> str:
    text = clean(value).upper()
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


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return row.get(key)

    current: Any = row
    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def first(row: Mapping[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = clean(deep_get(row, key))
        if value:
            return value
    return ""


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value in (1, "1"):
        return True
    return str(value or "").strip().lower() in {"true", "yes", "y", "ok", "1"}


def country_code(row: Mapping[str, Any]) -> str:
    for key in (
        "country_code", "country", "cc", "iso_country", "iso_country_code",
        "country_data.country_code",
        "geo.country_code", "geo.country", "geo.iso_code",
        "geoip.country_code", "geoip.country",
        "geoip_data.country_code", "geoip_data.country",
        "location.country_code", "location.country",
        "metadata.country_code", "metadata.country",
    ):
        value = normalize_code(deep_get(row, key))
        if len(value) == 2:
            return value

    network = clean(row.get("network") or deep_get(row, "metadata.network")).lower()

    if boolish(row.get("is_tor")) or boolish(deep_get(row, "tor.is_tor")) or network == "tor":
        return "TOR"

    if boolish(row.get("is_i2p")) or boolish(deep_get(row, "i2p.is_i2p")) or network == "i2p":
        return "I2P"

    return ""


def admin1_code(row: Mapping[str, Any]) -> str:
    return normalize_code(first(row, (
        "admin1_code", "territory_code", "state_code", "subdivision_code", "province_code", "region_code",
        "territory_data.admin1_code", "territory_data.territory_code",
        "geo.admin1_code", "geo.territory_code", "geo.state_code", "geo.subdivision_code",
        "geoip.admin1_code", "geoip.territory_code", "geoip.state_code",
        "geoip_data.admin1_code", "geoip_data.state_code",
        "location.admin1_code", "location.state_code",
        "metadata.admin1_code", "metadata.state_code",
    )))


def admin2_code(row: Mapping[str, Any]) -> str:
    return normalize_code(first(row, (
        "admin2_code", "county_code", "district_code", "municipality_code", "parish_code",
        "county_data.admin2_code", "county_data.county_code",
        "geo.admin2_code", "geo.county_code", "geo.district_code",
        "geoip.admin2_code", "geoip.county_code", "geoip.district_code",
        "geoip_data.admin2_code", "geoip_data.county_code",
        "location.admin2_code", "location.county_code",
        "metadata.admin2_code", "metadata.county_code",
    )))


def raw_city_name(row: Mapping[str, Any]) -> str:
    return first(row, (
        "city", "city_name", "town", "town_name", "village", "village_name", "hamlet",
        "locality", "place", "place_name", "municipality", "settlement", "populated_place",
        "geo.city", "geo.city_name", "geo.town", "geo.village", "geo.locality", "geo.place",
        "geoip.city", "geoip.city_name", "geoip.town", "geoip.locality",
        "geoip_data.city", "geoip_data.city_name",
        "location.city", "location.city_name", "location.locality",
        "metadata.city", "metadata.city_name", "metadata.locality",
    ))


def row_lat_lon(row: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(
        row.get("latitude")
        or row.get("lat")
        or deep_get(row, "geoloc.latitude")
        or deep_get(row, "geo.latitude")
        or deep_get(row, "geo.lat")
        or deep_get(row, "geoip.latitude")
        or deep_get(row, "geoip.lat")
        or deep_get(row, "geoip_data.latitude")
        or deep_get(row, "location.latitude")
        or deep_get(row, "metadata.latitude")
    )

    lon = number(
        row.get("longitude")
        or row.get("lon")
        or row.get("lng")
        or deep_get(row, "geoloc.longitude")
        or deep_get(row, "geoloc.lon")
        or deep_get(row, "geo.longitude")
        or deep_get(row, "geo.lon")
        or deep_get(row, "geo.lng")
        or deep_get(row, "geoip.longitude")
        or deep_get(row, "geoip.lon")
        or deep_get(row, "geoip_data.longitude")
        or deep_get(row, "location.longitude")
        or deep_get(row, "metadata.longitude")
    )

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def load_city_index(country: str, admin1: str, city_dir: Path) -> dict[str, Any]:
    if not country:
        return {}

    candidates: list[Path] = []

    if admin1:
        candidates.extend([
            city_dir / country.upper() / f"{admin1.upper()}.json",
            city_dir / country.lower() / f"{admin1.upper()}.json",
            city_dir / country.upper() / f"{admin1.lower()}.json",
            city_dir / country.lower() / f"{admin1.lower()}.json",
        ])

    candidates.extend([
        city_dir / country.upper() / "Unknown.json",
        city_dir / country.upper() / "unknown.json",
        city_dir / country.lower() / "Unknown.json",
        city_dir / country.lower() / "unknown.json",
        city_dir / f"{country.upper()}.json",
        city_dir / f"{country.lower()}.json",
    ])

    for path in candidates:
        data = read_json(path, fallback={})
        if isinstance(data, dict) and data:
            return data

    return {}


def city_rows(index: Mapping[str, Any]) -> list[dict[str, Any]]:
    rows = index.get("cities", [])
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def build_name_lookup(cities: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}

    for city in cities:
        names = [city.get("name"), city.get("ascii_name")]
        alternate = city.get("alternate_names", [])

        if isinstance(alternate, list):
            names.extend(alternate)

        aliases = city.get("aliases", [])
        if isinstance(aliases, list):
            names.extend(aliases)

        for name in names:
            key = normalize_key(name)
            if key and key not in lookup:
                lookup[key] = city

    return lookup


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0088
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )

    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearest_city(cities: list[dict[str, Any]], lat: float, lon: float) -> tuple[dict[str, Any] | None, float | None]:
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


def city_payload(city: Mapping[str, Any], *, source: str, confidence: str, distance_km: float | None = None) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
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
        "updated_at": utc_now(),
    }


def resolve_city(row: Mapping[str, Any], city_dir: Path) -> dict[str, Any]:
    country = country_code(row)

    if country == "TOR":
        return {
            "schema": SCHEMA,
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
            "updated_at": utc_now(),
        }

    if country == "I2P":
        return {
            "schema": SCHEMA,
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
            "updated_at": utc_now(),
        }

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
            return city_payload(lookup[key], source="local-json-name", confidence="high")

        return {
            "schema": SCHEMA,
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
            "updated_at": utc_now(),
        }

    if lat is not None and lon is not None and cities:
        city, distance = nearest_city(cities, lat, lon)

        if city:
            confidence = "high" if distance is not None and distance <= 25 else "medium"
            return city_payload(city, source="nearest-lat-lon", confidence=confidence, distance_km=distance)

    return {
        "schema": SCHEMA,
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
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any], city_dir: Path) -> MutableMapping[str, Any]:
    meta = resolve_city(node, city_dir)

    node["city_data"] = meta
    node["city"] = meta["city"]
    node["city_ascii"] = meta["city_ascii"]

    if meta["latitude"] is not None and meta["longitude"] is not None:
        geoloc = node.setdefault("geoloc", {})
        if isinstance(geoloc, MutableMapping):
            geoloc["nearest_city_latitude"] = meta["latitude"]
            geoloc["nearest_city_longitude"] = meta["longitude"]

        node["nearest_city_latitude"] = meta["latitude"]
        node["nearest_city_longitude"] = meta["longitude"]

    node.setdefault("enrichment", {})
    node["enrichment"]["city"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "city_dir": str(city_dir),
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    context = context or {}
    city_dir = Path(context.get("city_dir") or context.get("cities_dir") or context.get("geo_city_dir") or DEFAULT_CITY_DIR)

    if isinstance(nodes, list):
        return [enrich_node(dict(node), city_dir) if isinstance(node, Mapping) else node for node in nodes]

    if isinstance(nodes, Mapping):
        return {key: enrich_node(dict(value), city_dir) if isinstance(value, Mapping) else value for key, value in nodes.items()}

    return nodes


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    if isinstance(payload, list):
        return enrich_nodes(payload, context)

    if not isinstance(payload, MutableMapping):
        return payload

    if isinstance(payload.get("nodes"), (list, dict)):
        payload["nodes"] = enrich_nodes(payload["nodes"], context)

    if isinstance(payload.get("results"), list):
        payload["results"] = enrich_nodes(payload["results"], context)

    if isinstance(payload.get("data"), list):
        payload["data"] = enrich_nodes(payload["data"], context)

    payload.setdefault("metadata", {})
    if isinstance(payload["metadata"], MutableMapping):
        payload["metadata"]["city_enriched_at"] = utc_now()
        payload["metadata"]["city_dir"] = str(context.get("city_dir") if context else DEFAULT_CITY_DIR)

    return payload


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    if isinstance(payload, list):
        return [node for node in payload if isinstance(node, Mapping)]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")
    if isinstance(nodes, list):
        return [node for node in nodes if isinstance(node, Mapping)]
    if isinstance(nodes, Mapping):
        return [node for node in nodes.values() if isinstance(node, Mapping)]

    for key in ("results", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [node for node in value if isinstance(node, Mapping)]

    return []


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    countries: dict[str, int] = {}
    sources: dict[str, int] = {}

    for node in nodes:
        city_data = node.get("city_data", {})
        if not isinstance(city_data, Mapping):
            city_data = {}

        city = clean(node.get("city")) or clean(city_data.get("city")) or "Unknown"
        country = clean(node.get("country_code")) or clean(city_data.get("country_code")) or "Unknown"
        source = clean(city_data.get("city_source")) or "unknown"

        counts[city] = counts.get(city, 0) + 1
        countries[country] = countries.get(country, 0) + 1
        sources[source] = sources.get(source, 0) + 1

    top_city = max(counts.items(), key=lambda item: item[1], default=("Unknown", 0))

    return {
        "schema": "zzx-bitnodes-city-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "city_count": len(counts),
        "country_count": len(countries),
        "cities": dict(sorted(counts.items(), key=lambda item: (-item[1], item[0]))),
        "countries": dict(sorted(countries.items(), key=lambda item: (-item[1], item[0]))),
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))),
        "top_city": {"city": top_city[0], "count": top_city[1]},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich Bitnodes records with globally indexed city/town/village/locality metadata.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--city-dir", default=str(DEFAULT_CITY_DIR))
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload, {"city_dir": args.city_dir})

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"city enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
