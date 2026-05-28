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
DEFAULT_TIMEZONE_DIR = DEFAULT_GEO_ROOT / "timezones"

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


def normalize_code(value: Any) -> str:
    return clean(value).upper()


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if not math.isfinite(n):
        return fallback

    return n


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


def raw_timezone(row: dict[str, Any]) -> str:
    for key in (
        "timezone",
        "time_zone",
        "tz",
        "iana_timezone",
        "iana_tz",
    ):
        value = clean(row.get(key))

        if value:
            return value

    for source_key in (
        "city_data",
        "postal_data",
        "geoloc",
        "geo",
    ):
        source = nested_dict(row, source_key)

        for key in (
            "timezone",
            "time_zone",
            "tz",
            "iana_timezone",
            "iana_tz",
        ):
            value = clean(source.get(key))

            if value:
                return value

    return ""


def load_timezone_index(country: str, timezone_dir: Path) -> dict[str, Any]:
    candidates = []

    if country:
        candidates.extend([
            timezone_dir / f"{country.upper()}.json",
            timezone_dir / f"{country.lower()}.json",
        ])

    candidates.extend([
        timezone_dir / "timezones.json",
        timezone_dir / "global.json",
    ])

    for path in candidates:
        data = read_json(path, fallback={})

        if isinstance(data, dict) and data:
            return data

    return {}


def timezone_rows(index: dict[str, Any]) -> list[dict[str, Any]]:
    rows = index.get("timezones", [])

    if isinstance(rows, list):
        return rows

    rows = index.get("zones", [])

    if isinstance(rows, list):
        return rows

    return []


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


def nearest_timezone(
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


def timezone_from_lon(lon: float | None) -> tuple[str, int | None]:
    if lon is None:
        return "", None

    offset = int(round(lon / 15.0))
    offset = max(-12, min(14, offset))

    if offset == 0:
        return "Etc/UTC", 0

    sign = "-" if offset > 0 else "+"
    etc_value = abs(offset)

    return f"Etc/GMT{sign}{etc_value}", offset


def timezone_payload(
    tz: str,
    *,
    source: str,
    confidence: str,
    country: str = "",
    offset_hours: int | float | None = None,
    distance_km: float | None = None,
) -> dict[str, Any]:
    return {
        "timezone": tz or "Unknown",
        "iana_timezone": tz or "Unknown",
        "country_code": country or "Unknown",
        "utc_offset_hours": offset_hours,
        "timezone_source": source,
        "timezone_confidence": confidence,
        "nearest_distance_km": distance_km,
    }


def resolve_timezone(
    row: dict[str, Any],
    timezone_dir: Path,
) -> dict[str, Any]:
    if row.get("is_tor") or nested_dict(row, "tor").get("is_tor"):
        return timezone_payload(
            "UTC",
            source="tor-overlay",
            confidence="high",
            country="TOR",
            offset_hours=0,
            distance_km=0.0,
        )

    if row.get("is_i2p") or nested_dict(row, "i2p").get("is_i2p"):
        return timezone_payload(
            "UTC",
            source="i2p-overlay",
            confidence="high",
            country="I2P",
            offset_hours=0,
            distance_km=0.0,
        )

    country = country_code(row)
    tz = raw_timezone(row)

    if tz:
        return timezone_payload(
            tz,
            source="explicit",
            confidence="high",
            country=country,
            offset_hours=None,
            distance_km=None,
        )

    lat, lon = row_lat_lon(row)
    index = load_timezone_index(country, timezone_dir)
    rows = timezone_rows(index)

    if lat is not None and lon is not None and rows:
        nearest, distance = nearest_timezone(rows, lat, lon)

        if nearest:
            timezone_name = clean(
                nearest.get("timezone")
                or nearest.get("iana_timezone")
                or nearest.get("tz")
                or nearest.get("name")
            )

            if timezone_name:
                return timezone_payload(
                    timezone_name,
                    source="nearest-lat-lon",
                    confidence="high" if distance is not None and distance <= 250 else "medium",
                    country=country,
                    offset_hours=number(nearest.get("utc_offset_hours")),
                    distance_km=distance,
                )

    guessed_tz, guessed_offset = timezone_from_lon(lon)

    if guessed_tz:
        return timezone_payload(
            guessed_tz,
            source="longitude-estimate",
            confidence="low",
            country=country,
            offset_hours=guessed_offset,
            distance_km=None,
        )

    return timezone_payload(
        "Unknown",
        source="fallback",
        confidence="none",
        country=country,
        offset_hours=None,
        distance_km=None,
    )


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    context = context or {}

    timezone_dir = Path(
        context.get("timezone_dir")
        or context.get("timezones_dir")
        or context.get("geo_timezone_dir")
        or DEFAULT_TIMEZONE_DIR
    )

    for node in nodes:
        meta = resolve_timezone(node, timezone_dir)

        node["timezone_data"] = meta
        node["timezone"] = meta["timezone"]
        node["iana_timezone"] = meta["iana_timezone"]

        node.setdefault("enrichment", {})
        node["enrichment"]["timezone"] = {
            "status": "ok",
            "updated_at": utc_now(),
            "timezone_dir": str(timezone_dir),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    countries: dict[str, int] = {}
    sources: dict[str, int] = {}

    for node in nodes:
        timezone_data = nested_dict(node, "timezone_data")

        tz = (
            clean(node.get("timezone"))
            or clean(timezone_data.get("timezone"))
            or "Unknown"
        )

        country = (
            clean(node.get("country_code"))
            or clean(timezone_data.get("country_code"))
            or "Unknown"
        )

        source = clean(timezone_data.get("timezone_source")) or "unknown"

        counts[tz] = counts.get(tz, 0) + 1
        countries[country] = countries.get(country, 0) + 1
        sources[source] = sources.get(source, 0) + 1

    top_timezone = max(
        counts.items(),
        key=lambda item: item[1],
        default=("Unknown", 0),
    )

    return {
        "schema": "zzx-bitnodes-timezone-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "timezone_count": len(counts),
        "country_count": len(countries),
        "timezones": counts,
        "countries": countries,
        "sources": sources,
        "top_timezone": {
            "timezone": top_timezone[0],
            "count": top_timezone[1],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with timezone metadata."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument(
        "--timezone-dir",
        default=str(DEFAULT_TIMEZONE_DIR),
        help="Directory containing timezone JSON indexes.",
    )

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    enriched = enrich_nodes(
        nodes,
        {
            "timezone_dir": args.timezone_dir,
        },
    )

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["timezone_enriched_at"] = utc_now()
        payload["metadata"]["timezone_dir"] = args.timezone_dir
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"timezone enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
