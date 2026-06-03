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
DEFAULT_TIMEZONE_DIR = DEFAULT_GEO_ROOT / "timezones"

SCHEMA = "zzx-bitnodes-timezone-v2"

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
        "country_code",
        "country",
        "cc",
        "iso_country",
        "iso_country_code",
        "country_data.country_code",
        "geo.country_code",
        "geo.country",
        "geo.iso_code",
        "geoip.country_code",
        "geoip.country",
        "geoip_data.country_code",
        "geoip_data.country",
        "location.country_code",
        "location.country",
        "metadata.country_code",
        "metadata.country",
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


def row_lat_lon(row: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(
        row.get("latitude")
        or row.get("lat")
        or deep_get(row, "geoloc.latitude")
        or deep_get(row, "city_data.latitude")
        or deep_get(row, "postal_data.latitude")
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
        or deep_get(row, "city_data.longitude")
        or deep_get(row, "postal_data.longitude")
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


def raw_timezone(row: Mapping[str, Any]) -> str:
    keys = (
        "timezone",
        "time_zone",
        "tz",
        "iana_timezone",
        "iana_tz",
        "city_data.timezone",
        "city_data.time_zone",
        "city_data.tz",
        "postal_data.timezone",
        "postal_data.time_zone",
        "postal_data.tz",
        "geoloc.timezone",
        "geoloc.time_zone",
        "geoloc.tz",
        "geo.timezone",
        "geo.time_zone",
        "geo.tz",
        "geoip.timezone",
        "geoip.time_zone",
        "geoip.tz",
        "geoip_data.timezone",
        "geoip_data.time_zone",
        "geoip_data.tz",
        "location.timezone",
        "location.time_zone",
        "location.tz",
        "metadata.timezone",
        "metadata.time_zone",
        "metadata.tz",
    )

    return first(row, keys)


def load_timezone_index(country: str, timezone_dir: Path) -> dict[str, Any]:
    candidates: list[Path] = []

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


def timezone_rows(index: Mapping[str, Any]) -> list[dict[str, Any]]:
    for key in ("timezones", "zones", "iana_timezones", "tz"):
        rows = index.get(key)

        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]

    return []


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
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


def nearest_timezone(rows: list[dict[str, Any]], lat: float, lon: float) -> tuple[dict[str, Any] | None, float | None]:
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
        "schema": SCHEMA,
        "timezone": tz or "Unknown",
        "iana_timezone": tz or "Unknown",
        "country_code": country or "Unknown",
        "utc_offset_hours": offset_hours,
        "timezone_source": source,
        "timezone_confidence": confidence,
        "nearest_distance_km": distance_km,
        "updated_at": utc_now(),
    }


def resolve_timezone(row: Mapping[str, Any], timezone_dir: Path) -> dict[str, Any]:
    country = country_code(row)

    if country == "TOR":
        return timezone_payload(
            "UTC",
            source="tor-overlay",
            confidence="high",
            country="TOR",
            offset_hours=0,
            distance_km=0.0,
        )

    if country == "I2P":
        return timezone_payload(
            "UTC",
            source="i2p-overlay",
            confidence="high",
            country="I2P",
            offset_hours=0,
            distance_km=0.0,
        )

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


def enrich_node(node: MutableMapping[str, Any], timezone_dir: Path) -> MutableMapping[str, Any]:
    meta = resolve_timezone(node, timezone_dir)

    node["timezone_data"] = meta
    node["timezone"] = meta["timezone"]
    node["iana_timezone"] = meta["iana_timezone"]

    node.setdefault("enrichment", {})
    node["enrichment"]["timezone"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "timezone_dir": str(timezone_dir),
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    context = context or {}
    timezone_dir = Path(
        context.get("timezone_dir")
        or context.get("timezones_dir")
        or context.get("geo_timezone_dir")
        or DEFAULT_TIMEZONE_DIR
    )

    if isinstance(nodes, list):
        return [
            enrich_node(dict(node), timezone_dir) if isinstance(node, Mapping) else node
            for node in nodes
        ]

    if isinstance(nodes, Mapping):
        return {
            key: enrich_node(dict(value), timezone_dir) if isinstance(value, Mapping) else value
            for key, value in nodes.items()
        }

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
        payload["metadata"]["timezone_enriched_at"] = utc_now()
        payload["metadata"]["timezone_dir"] = str(
            context.get("timezone_dir") if context else DEFAULT_TIMEZONE_DIR
        )

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
        timezone_data = node.get("timezone_data", {})

        if not isinstance(timezone_data, Mapping):
            timezone_data = {}

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
        "schema": "zzx-bitnodes-timezone-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "timezone_count": len(counts),
        "country_count": len(countries),
        "timezones": dict(sorted(counts.items(), key=lambda item: (-item[1], item[0]))),
        "countries": dict(sorted(countries.items(), key=lambda item: (-item[1], item[0]))),
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))),
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
    parser.add_argument("--timezone-dir", default=str(DEFAULT_TIMEZONE_DIR))
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload, {"timezone_dir": args.timezone_dir})

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"timezone enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
