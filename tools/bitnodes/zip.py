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
DEFAULT_ZIP_DIR = DEFAULT_GEO_ROOT / "postal"

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


POSTAL_FIELD_KEYS = (
    "zip",
    "zip_code",
    "zipcode",
    "postal",
    "postal_code",
    "postcode",
    "post_code",
)


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


def normalize_code(value: Any) -> str:
    return clean(value).upper()


def normalize_postal(value: Any) -> str:
    text = clean(value).upper()

    if not text:
        return ""

    return re.sub(r"[^A-Z0-9\- ]+", "", text).strip()


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


def raw_postal_code(row: dict[str, Any]) -> str:
    value = first(row, POSTAL_FIELD_KEYS)

    if value:
        return normalize_postal(value)

    geo = nested_dict(row, "geo")
    value = first(geo, POSTAL_FIELD_KEYS)

    if value:
        return normalize_postal(value)

    geoloc = nested_dict(row, "geoloc")
    value = first(geoloc, POSTAL_FIELD_KEYS)

    if value:
        return normalize_postal(value)

    return ""


def raw_place_name(row: dict[str, Any]) -> str:
    return first(
        row,
        (
            "city",
            "city_name",
            "town",
            "town_name",
            "village",
            "village_name",
            "locality",
            "place",
            "place_name",
        ),
    ) or first(
        nested_dict(row, "city_data"),
        (
            "city",
            "city_ascii",
            "name",
            "place_name",
        ),
    ) or first(
        nested_dict(row, "geo"),
        (
            "city",
            "city_name",
            "town",
            "town_name",
            "village",
            "village_name",
            "locality",
            "place",
            "place_name",
        ),
    )


def row_lat_lon(row: dict[str, Any]) -> tuple[float | None, float | None]:
    lat = number(
        row.get("latitude")
        or row.get("lat")
        or nested_dict(row, "geoloc").get("latitude")
        or nested_dict(row, "city_data").get("latitude")
    )

    lon = number(
        row.get("longitude")
        or row.get("lon")
        or row.get("lng")
        or nested_dict(row, "geoloc").get("longitude")
        or nested_dict(row, "city_data").get("longitude")
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


def load_postal_index(country: str, zip_dir: Path) -> dict[str, Any]:
    if not country:
        return {}

    candidates = [
        zip_dir / f"{country.upper()}.json",
        zip_dir / f"{country.lower()}.json",
    ]

    for path in candidates:
        data = read_json(path, fallback={})

        if isinstance(data, dict) and data:
            return data

    return {}


def postal_rows(index: dict[str, Any]) -> list[dict[str, Any]]:
    rows = index.get("postal_codes", [])

    if isinstance(rows, list):
        return rows

    rows = index.get("postcodes", [])

    if isinstance(rows, list):
        return rows

    return []


def build_postal_lookup(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}

    for row in rows:
        postal = normalize_postal(
            row.get("postal_code")
            or row.get("zip")
            or row.get("postcode")
            or row.get("code")
        )

        if postal and postal not in lookup:
            lookup[postal] = row

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


def nearest_postal(
    rows: list[dict[str, Any]],
    lat: float,
    lon: float,
) -> tuple[dict[str, Any] | None, float | None]:
    best: dict[str, Any] | None = None
    best_distance: float | None = None

    for row in rows:
        row_lat = number(row.get("latitude") or row.get("lat"))
        row_lon = number(row.get("longitude") or row.get("lon") or row.get("lng"))

        if row_lat is None or row_lon is None:
            continue

        distance = haversine_km(lat, lon, row_lat, row_lon)

        if best_distance is None or distance < best_distance:
            best = row
            best_distance = distance

    return best, best_distance


def postal_payload(
    row: dict[str, Any],
    *,
    source: str,
    confidence: str,
    distance_km: float | None = None,
) -> dict[str, Any]:
    postal = normalize_postal(
        row.get("postal_code")
        or row.get("zip")
        or row.get("postcode")
        or row.get("code")
    )

    return {
        "postal_code": postal or "Unknown",
        "zip": postal or "Unknown",
        "place_name": clean(row.get("place_name") or row.get("city") or row.get("name")),
        "country_code": normalize_code(row.get("country_code")) or "Unknown",
        "admin1_code": normalize_code(row.get("admin1_code")) or "Unknown",
        "admin2_code": normalize_code(row.get("admin2_code")) or "Unknown",
        "admin3_code": normalize_code(row.get("admin3_code")) or "Unknown",
        "latitude": number(row.get("latitude") or row.get("lat")),
        "longitude": number(row.get("longitude") or row.get("lon") or row.get("lng")),
        "accuracy": clean(row.get("accuracy")),
        "postal_source": source,
        "postal_confidence": confidence,
        "nearest_distance_km": distance_km,
    }


def resolve_postal(
    row: dict[str, Any],
    zip_dir: Path,
) -> dict[str, Any]:
    if row.get("is_tor") or nested_dict(row, "tor").get("is_tor"):
        return {
            "postal_code": "TOR",
            "zip": "TOR",
            "place_name": "Everywhere / Nowhere",
            "country_code": "TOR",
            "admin1_code": "TOR",
            "admin2_code": "TOR",
            "admin3_code": "",
            "latitude": 0.0,
            "longitude": -32.0,
            "accuracy": "",
            "postal_source": "tor-overlay",
            "postal_confidence": "high",
            "nearest_distance_km": 0.0,
        }

    if row.get("is_i2p") or nested_dict(row, "i2p").get("is_i2p"):
        return {
            "postal_code": "I2P",
            "zip": "I2P",
            "place_name": "Distributed Overlay",
            "country_code": "I2P",
            "admin1_code": "I2P",
            "admin2_code": "I2P",
            "admin3_code": "",
            "latitude": 0.0,
            "longitude": 32.0,
            "accuracy": "",
            "postal_source": "i2p-overlay",
            "postal_confidence": "high",
            "nearest_distance_km": 0.0,
        }

    country = country_code(row)
    admin1 = admin1_code(row)
    admin2 = admin2_code(row)
    postal = raw_postal_code(row)
    place = raw_place_name(row)
    lat, lon = row_lat_lon(row)

    index = load_postal_index(country, zip_dir)
    rows = postal_rows(index)
    lookup = build_postal_lookup(rows)

    if postal:
        if postal in lookup:
            return postal_payload(
                lookup[postal],
                source="local-json-postal",
                confidence="high",
            )

        return {
            "postal_code": postal,
            "zip": postal,
            "place_name": place,
            "country_code": country or "Unknown",
            "admin1_code": admin1 or "Unknown",
            "admin2_code": admin2 or "Unknown",
            "admin3_code": "",
            "latitude": lat,
            "longitude": lon,
            "accuracy": "",
            "postal_source": "explicit-postal",
            "postal_confidence": "medium",
            "nearest_distance_km": None,
        }

    if lat is not None and lon is not None and rows:
        nearest, distance = nearest_postal(rows, lat, lon)

        if nearest:
            confidence = "high" if distance is not None and distance <= 15 else "medium"

            return postal_payload(
                nearest,
                source="nearest-lat-lon",
                confidence=confidence,
                distance_km=distance,
            )

    return {
        "postal_code": "Unknown",
        "zip": "Unknown",
        "place_name": place,
        "country_code": country or "Unknown",
        "admin1_code": admin1 or "Unknown",
        "admin2_code": admin2 or "Unknown",
        "admin3_code": "",
        "latitude": lat,
        "longitude": lon,
        "accuracy": "",
        "postal_source": "fallback",
        "postal_confidence": "none",
        "nearest_distance_km": None,
    }


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    context = context or {}

    zip_dir = Path(
        context.get("zip_dir")
        or context.get("postal_dir")
        or context.get("postcodes_dir")
        or context.get("geo_zip_dir")
        or DEFAULT_ZIP_DIR
    )

    for node in nodes:
        meta = resolve_postal(node, zip_dir)

        node["postal_data"] = meta
        node["postal_code"] = meta["postal_code"]
        node["zip"] = meta["zip"]

        node.setdefault("enrichment", {})
        node["enrichment"]["zip"] = {
            "status": "ok",
            "updated_at": utc_now(),
            "zip_dir": str(zip_dir),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    countries: dict[str, int] = {}
    sources: dict[str, int] = {}

    for node in nodes:
        postal_data = nested_dict(node, "postal_data")

        postal = (
            clean(node.get("postal_code"))
            or clean(node.get("zip"))
            or clean(postal_data.get("postal_code"))
            or "Unknown"
        )

        country = (
            clean(node.get("country_code"))
            or clean(postal_data.get("country_code"))
            or "Unknown"
        )

        source = clean(postal_data.get("postal_source")) or "unknown"

        counts[postal] = counts.get(postal, 0) + 1
        countries[country] = countries.get(country, 0) + 1
        sources[source] = sources.get(source, 0) + 1

    top_postal = max(
        counts.items(),
        key=lambda item: item[1],
        default=("Unknown", 0),
    )

    return {
        "schema": "zzx-bitnodes-postal-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "postal_count": len(counts),
        "country_count": len(countries),
        "postal_codes": counts,
        "countries": countries,
        "sources": sources,
        "top_postal_code": {
            "postal_code": top_postal[0],
            "count": top_postal[1],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with globally indexed postal/ZIP code metadata."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument(
        "--zip-dir",
        default=str(DEFAULT_ZIP_DIR),
        help="Directory containing per-country postal-code JSON indexes.",
    )

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    enriched = enrich_nodes(
        nodes,
        {
            "zip_dir": args.zip_dir,
        },
    )

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["zip_enriched_at"] = utc_now()
        payload["metadata"]["zip_dir"] = args.zip_dir
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"zip/postal enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
