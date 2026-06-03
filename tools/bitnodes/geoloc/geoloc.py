#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-geoloc-v2"


UNKNOWN_VALUES = {
    "",
    "unknown",
    "none",
    "null",
    "undefined",
    "n/a",
    "na",
    "-",
    "—",
}


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

    if compact:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)

    path.write_text(text + "\n", encoding="utf-8")


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return text


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if math.isnan(n) or math.isinf(n):
        return fallback

    return n


def valid_lat_lon(lat: Any, lon: Any) -> bool:
    latitude = number(lat)
    longitude = number(lon)

    return (
        latitude is not None
        and longitude is not None
        and -90 <= latitude <= 90
        and -180 <= longitude <= 180
    )


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return row.get(key)

    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None

        current = current.get(part)

    return current


def pick_first(row: Mapping[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = deep_get(row, key)

        if clean(value):
            return value

    return None


def coordinate_candidates(row: Mapping[str, Any]) -> list[tuple[Any, Any, str]]:
    candidates: list[tuple[Any, Any, str]] = []

    direct_lat = pick_first(row, ("latitude", "lat", "geo_lat", "dbip_latitude"))
    direct_lon = pick_first(row, ("longitude", "lon", "lng", "geo_lon", "dbip_longitude"))
    candidates.append((direct_lat, direct_lon, "direct"))

    for prefix in ("geo", "geoip", "geoip_data", "location", "coordinates", "metadata", "ip.geoip"):
        lat = pick_first(row, (f"{prefix}.latitude", f"{prefix}.lat", f"{prefix}.geo_lat"))
        lon = pick_first(row, (f"{prefix}.longitude", f"{prefix}.lon", f"{prefix}.lng", f"{prefix}.geo_lon"))
        candidates.append((lat, lon, prefix))

    return candidates


def geoloc_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    chosen_lat = None
    chosen_lon = None
    chosen_source = ""

    for lat, lon, source in coordinate_candidates(row):
        if valid_lat_lon(lat, lon):
            chosen_lat = number(lat)
            chosen_lon = number(lon)
            chosen_source = source
            break

    has_coordinates = valid_lat_lon(chosen_lat, chosen_lon)

    precision = pick_first(
        row,
        (
            "geo_precision",
            "accuracy_radius",
            "accuracy_km",
            "location_accuracy",
            "geoip.accuracy_radius",
            "geoip.accuracy_km",
            "location.accuracy_radius",
            "metadata.accuracy_radius",
        ),
    )

    country = pick_first(
        row,
        (
            "country_code",
            "country",
            "geoip.country_code",
            "geoip.country",
            "geoip_data.country_code",
            "geoip_data.country",
            "location.country_code",
            "location.country",
        ),
    )

    region = pick_first(
        row,
        (
            "region",
            "state",
            "province",
            "territory",
            "geoip.region",
            "geoip.state",
            "geoip.province",
            "location.region",
        ),
    )

    city = pick_first(
        row,
        (
            "city",
            "geoip.city",
            "geoip_data.city",
            "location.city",
            "metadata.city",
        ),
    )

    timezone_name = pick_first(
        row,
        (
            "timezone",
            "tz",
            "geoip.timezone",
            "location.timezone",
            "metadata.timezone",
        ),
    )

    return {
        "schema": SCHEMA,
        "has_coordinates": has_coordinates,
        "latitude": chosen_lat if has_coordinates else None,
        "longitude": chosen_lon if has_coordinates else None,
        "coordinate_pair": (
            f"{chosen_lat:.6f},{chosen_lon:.6f}"
            if has_coordinates and chosen_lat is not None and chosen_lon is not None
            else ""
        ),
        "precision": precision,
        "country": country.upper() if isinstance(country, str) and len(country) == 2 else country,
        "region": region,
        "city": city,
        "timezone": timezone_name,
        "source": pick_first(row, ("geo_source", "geolocation_source", "source")) or chosen_source or "crawler",
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = geoloc_metadata(node)

    node["geoloc"] = meta
    node["has_geoloc"] = meta["has_coordinates"]

    if meta["has_coordinates"]:
        node["latitude"] = meta["latitude"]
        node["longitude"] = meta["longitude"]
        node["lat"] = meta["latitude"]
        node["lon"] = meta["longitude"]

    if meta["country"] and not node.get("country"):
        node["country"] = meta["country"]
        node["country_code"] = meta["country"]

    if meta["region"] and not node.get("region"):
        node["region"] = meta["region"]

    if meta["city"] and not node.get("city"):
        node["city"] = meta["city"]

    if meta["timezone"] and not node.get("timezone"):
        node["timezone"] = meta["timezone"]

    node.setdefault("enrichment", {})
    node["enrichment"]["geoloc"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    if isinstance(nodes, list):
        return [
            enrich_node(dict(node)) if isinstance(node, Mapping) else node
            for node in nodes
        ]

    if isinstance(nodes, Mapping):
        return {
            key: enrich_node(dict(value)) if isinstance(value, Mapping) else value
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
        payload["metadata"]["geoloc_enriched_at"] = utc_now()

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
    geocoded = [
        node for node in nodes
        if node.get("has_geoloc") or (
            isinstance(node.get("geoloc"), Mapping)
            and node.get("geoloc", {}).get("has_coordinates")
        )
    ]

    country_counts: dict[str, int] = {}

    for node in geocoded:
        geo = node.get("geoloc", {})
        country = ""

        if isinstance(geo, Mapping):
            country = clean(geo.get("country"))

        country = country or clean(node.get("country_code")) or clean(node.get("country")) or "Unknown"
        country_counts[country] = country_counts.get(country, 0) + 1

    return {
        "schema": "zzx-bitnodes-geoloc-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "geocoded_nodes": len(geocoded),
        "missing_geoloc_nodes": max(0, len(nodes) - len(geocoded)),
        "country_counts": dict(sorted(country_counts.items(), key=lambda item: (-item[1], item[0]))),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Normalize Bitnodes geolocation coordinate fields."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload)

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"geoloc enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
