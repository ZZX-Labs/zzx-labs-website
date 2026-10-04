#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


APP_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GEO_ROOT = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo"
DEFAULT_TIMEZONE_DIR = DEFAULT_GEO_ROOT / "timezones"

SCHEMA = "zzx-bitnodes-timezone-v3"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}

TZ_ALIASES = {
    "UTC": "Etc/UTC",
    "GMT": "Etc/UTC",
    "Z": "Etc/UTC",
    "TOR": "Etc/UTC",
    "I2P": "Etc/UTC",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback

        if path.suffix == ".gz":
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)

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
        default=str,
    )

    path.write_text(text + "\n", encoding="utf-8")


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return re.sub(r"\s+", " ", text)


def normalize_code(value: Any) -> str:
    return clean(value).upper()


def normalize_timezone(value: Any) -> str:
    text = clean(value)

    if not text:
        return ""

    upper = text.upper()

    if upper in TZ_ALIASES:
        return TZ_ALIASES[upper]

    return text


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if not math.isfinite(n):
        return fallback

    return n


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None

        current = current.get(part)

    return current


def first(row: Mapping[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = clean(deep_get(row, key) if "." in key else row.get(key))

        if value:
            return value

    return ""


def first_value(row: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)

        if value not in ("", None):
            return value

    return None


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    return str(value or "").strip().lower() in {"true", "yes", "y", "ok", "1", "on"}


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
        "geoloc.country_code",
        "geoloc.country",
        "metadata.country_code",
        "metadata.country",
        "metadata.geoip.country_code",
        "metadata.geoloc.country_code",
    ):
        value = normalize_code(deep_get(row, key) if "." in key else row.get(key))

        if len(value) == 2:
            return value

        if value in {"TOR", "I2P"}:
            return value

    network = clean(first_value(row, "network", "metadata.network")).lower()

    if (
        boolish(row.get("is_tor"))
        or boolish(row.get("suspected_tor"))
        or boolish(deep_get(row, "tor.is_tor"))
        or boolish(deep_get(row, "metadata.is_tor"))
        or boolish(deep_get(row, "metadata.tor.is_tor"))
        or network == "tor"
    ):
        return "TOR"

    if (
        boolish(row.get("is_i2p"))
        or boolish(row.get("suspected_i2p"))
        or boolish(deep_get(row, "i2p.is_i2p"))
        or boolish(deep_get(row, "metadata.is_i2p"))
        or boolish(deep_get(row, "metadata.i2p.is_i2p"))
        or network == "i2p"
    ):
        return "I2P"

    return ""


def row_lat_lon(row: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(
        row.get("latitude")
        or row.get("lat")
        or deep_get(row, "geoloc.latitude")
        or deep_get(row, "city_data.latitude")
        or deep_get(row, "postal_data.latitude")
        or deep_get(row, "zip_data.latitude")
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
        or deep_get(row, "zip_data.longitude")
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
        "zip_data.timezone",
        "zip_data.time_zone",
        "zip_data.tz",
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
        "metadata.iana_timezone",
    )

    return normalize_timezone(first(row, keys))


def load_timezone_index(country: str, timezone_dir: Path) -> dict[str, Any]:
    candidates: list[Path] = []

    if country:
        candidates.extend([
            timezone_dir / f"{country.upper()}.json",
            timezone_dir / f"{country.lower()}.json",
            timezone_dir / country.upper() / "timezones.json",
            timezone_dir / country.lower() / "timezones.json",
            timezone_dir / country.upper() / "timezone.json",
            timezone_dir / country.lower() / "timezone.json",
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
    for key in ("timezones", "zones", "iana_timezones", "tz", "rows", "data"):
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
    is_overlay: bool = False,
    overlay_network: str = "",
) -> dict[str, Any]:
    normalized = normalize_timezone(tz)

    return {
        "schema": SCHEMA,
        "timezone": normalized or "Unknown",
        "iana_timezone": normalized or "Unknown",
        "tz": normalized or "Unknown",
        "time_zone": normalized or "Unknown",
        "country_code": country or "Unknown",
        "utc_offset_hours": offset_hours,
        "timezone_source": source,
        "timezone_confidence": confidence,
        "nearest_distance_km": distance_km,
        "is_overlay": is_overlay,
        "overlay_network": overlay_network,
        "updated_at": utc_now(),
    }


def resolve_timezone(row: Mapping[str, Any], timezone_dir: Path) -> dict[str, Any]:
    country = country_code(row)

    if country == "TOR":
        return timezone_payload(
            "Etc/UTC",
            source="tor-overlay",
            confidence="high",
            country="TOR",
            offset_hours=0,
            distance_km=0.0,
            is_overlay=True,
            overlay_network="tor",
        )

    if country == "I2P":
        return timezone_payload(
            "Etc/UTC",
            source="i2p-overlay",
            confidence="high",
            country="I2P",
            offset_hours=0,
            distance_km=0.0,
            is_overlay=True,
            overlay_network="i2p",
        )

    tz = raw_timezone(row)

    if tz:
        return timezone_payload(
            tz,
            source="explicit",
            confidence="high",
            country=country,
            offset_hours=number(first_value(row, "utc_offset_hours", "metadata.utc_offset_hours")),
            distance_km=None,
        )

    lat, lon = row_lat_lon(row)
    index = load_timezone_index(country, timezone_dir)
    rows = timezone_rows(index)

    if lat is not None and lon is not None and rows:
        nearest, distance = nearest_timezone(rows, lat, lon)

        if nearest:
            timezone_name = normalize_timezone(
                nearest.get("timezone")
                or nearest.get("iana_timezone")
                or nearest.get("tz")
                or nearest.get("time_zone")
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


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any], timezone_dir: Path) -> MutableMapping[str, Any]:
    meta = resolve_timezone(node, timezone_dir)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["timezone_data"] = meta
    metadata["timezone_data"] = meta

    node["timezone"] = meta["timezone"]
    node["iana_timezone"] = meta["iana_timezone"]
    node["tz"] = meta["tz"]
    node["time_zone"] = meta["time_zone"]

    metadata["timezone"] = meta["timezone"]
    metadata["iana_timezone"] = meta["iana_timezone"]
    metadata["tz"] = meta["tz"]
    metadata["time_zone"] = meta["time_zone"]

    if meta.get("country_code") and meta["country_code"] != "Unknown":
        node.setdefault("country_code", meta["country_code"])
        metadata.setdefault("country_code", meta["country_code"])

    if meta.get("is_overlay"):
        node["is_overlay"] = True
        node["overlay_network"] = meta.get("overlay_network", "")
        metadata["is_overlay"] = True
        metadata["overlay_network"] = meta.get("overlay_network", "")

    enrichment["timezone"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "timezone_dir": str(timezone_dir),
        "timezone_source": meta["timezone_source"],
        "timezone_confidence": meta["timezone_confidence"],
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


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [dict(node) for node in payload if isinstance(node, Mapping)]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [dict(node) for node in nodes if isinstance(node, Mapping)]

    if isinstance(nodes, Mapping):
        output = []

        for address, value in nodes.items():
            if isinstance(value, Mapping):
                output.append({"address": str(address), **dict(value)})
            elif isinstance(value, list):
                padded = list(value) + [None] * max(0, 20 - len(value))
                metadata = padded[19] if isinstance(padded[19], Mapping) else {}
                output.append(
                    {
                        "address": str(address),
                        "protocol": padded[0],
                        "agent": padded[1],
                        "height": padded[4],
                        "hostname": padded[5],
                        "city": padded[6],
                        "country": padded[7],
                        "latitude": padded[8],
                        "longitude": padded[9],
                        "timezone": padded[10],
                        "asn": padded[11],
                        "organization": padded[12],
                        "provider": padded[13],
                        "metadata": dict(metadata),
                    }
                )

        return output

    for key in ("results", "data", "rows", "peers", "node_records", "reachable_nodes"):
        value = payload.get(key)

        if isinstance(value, list):
            return [dict(node) for node in value if isinstance(node, Mapping)]

        if isinstance(value, Mapping):
            return extract_nodes({"nodes": value})

    return []


def put_nodes(payload: Any, nodes: list[dict[str, Any]], context: dict[str, Any] | None = None) -> Any:
    context = context or {}

    if isinstance(payload, list):
        return nodes

    if not isinstance(payload, MutableMapping):
        return {"nodes": nodes}

    output = dict(payload)

    if isinstance(output.get("nodes"), Mapping):
        output["nodes"] = {
            str(node.get("canonical_address") or node.get("address") or index): node
            for index, node in enumerate(nodes)
        }
    else:
        output["nodes"] = nodes

    output.setdefault("metadata", {})

    if isinstance(output["metadata"], MutableMapping):
        output["metadata"]["timezone_enriched_at"] = utc_now()
        output["metadata"]["timezone_schema"] = SCHEMA
        output["metadata"]["timezone_dir"] = str(
            context.get("timezone_dir")
            or context.get("timezones_dir")
            or context.get("geo_timezone_dir")
            or DEFAULT_TIMEZONE_DIR
        )

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context), context)


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    countries: dict[str, int] = {}
    sources: dict[str, int] = {}
    confidence: dict[str, int] = {}

    tor_count = 0
    i2p_count = 0
    overlay_count = 0

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
        conf = clean(timezone_data.get("timezone_confidence")) or "none"
        overlay_network = clean(timezone_data.get("overlay_network")) or clean(node.get("overlay_network"))

        counts[tz] = counts.get(tz, 0) + 1
        countries[country] = countries.get(country, 0) + 1
        sources[source] = sources.get(source, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1

        if boolish(timezone_data.get("is_overlay")) or boolish(node.get("is_overlay")):
            overlay_count += 1

        if overlay_network == "tor" or clean(node.get("network")).lower() == "tor" or country == "TOR":
            tor_count += 1

        if overlay_network == "i2p" or clean(node.get("network")).lower() == "i2p" or country == "I2P":
            i2p_count += 1

    top_timezone = max(
        counts.items(),
        key=lambda item: item[1],
        default=("Unknown", 0),
    )

    return {
        "schema": "zzx-bitnodes-timezone-summary-v3",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "timezone_count": len(counts),
        "country_count": len(countries),
        "overlay_timezone_nodes": overlay_count,
        "tor_timezone_nodes": tor_count,
        "i2p_timezone_nodes": i2p_count,
        "timezones": dict(sorted(counts.items(), key=lambda item: (-item[1], item[0]))),
        "countries": dict(sorted(countries.items(), key=lambda item: (-item[1], item[0]))),
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))),
        "confidence": dict(sorted(confidence.items(), key=lambda item: (-item[1], item[0]))),
        "top_timezone": {
            "timezone": top_timezone[0],
            "count": top_timezone[1],
        },
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with timezone metadata.",
        allow_abbrev=False,
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
