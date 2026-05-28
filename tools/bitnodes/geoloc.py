#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    return n


def valid_lat_lon(lat: Any, lon: Any) -> bool:
    latitude = number(lat)
    longitude = number(lon)

    return (
        latitude is not None and
        longitude is not None and
        -90 <= latitude <= 90 and
        -180 <= longitude <= 180
    )


def pick_first(row: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = row.get(key)

        if value not in (None, "", "Unknown", "—"):
            return value

    return None


def geoloc_metadata(row: dict[str, Any]) -> dict[str, Any]:
    lat = pick_first(row, ("latitude", "lat", "geo_lat", "dbip_latitude"))
    lon = pick_first(row, ("longitude", "lon", "lng", "geo_lon", "dbip_longitude"))

    if not valid_lat_lon(lat, lon):
        geo = row.get("geo") if isinstance(row.get("geo"), dict) else {}
        location = row.get("location") if isinstance(row.get("location"), dict) else {}

        lat = pick_first(geo, ("latitude", "lat"))
        lon = pick_first(geo, ("longitude", "lon", "lng"))

        if not valid_lat_lon(lat, lon):
            lat = pick_first(location, ("latitude", "lat"))
            lon = pick_first(location, ("longitude", "lon", "lng"))

    latitude = number(lat)
    longitude = number(lon)

    has_coordinates = valid_lat_lon(latitude, longitude)

    precision = pick_first(
        row,
        (
            "geo_precision",
            "accuracy_radius",
            "accuracy_km",
            "location_accuracy",
        ),
    )

    return {
        "has_coordinates": has_coordinates,
        "latitude": latitude if has_coordinates else None,
        "longitude": longitude if has_coordinates else None,
        "coordinate_pair": (
            f"{latitude:.6f},{longitude:.6f}"
            if has_coordinates and latitude is not None and longitude is not None
            else ""
        ),
        "precision": precision,
        "source": pick_first(row, ("geo_source", "geolocation_source", "source")) or "crawler",
    }


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    for node in nodes:
        meta = geoloc_metadata(node)

        node["geoloc"] = meta
        node["has_geoloc"] = meta["has_coordinates"]

        if meta["has_coordinates"]:
            node["latitude"] = meta["latitude"]
            node["longitude"] = meta["longitude"]
            node["lat"] = meta["latitude"]
            node["lon"] = meta["longitude"]

        node.setdefault("enrichment", {})
        node["enrichment"]["geoloc"] = {
            "status": "ok",
            "updated_at": utc_now(),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    geocoded = [
        node for node in nodes
        if node.get("has_geoloc") or node.get("geoloc", {}).get("has_coordinates")
    ]

    return {
        "schema": "zzx-bitnodes-geoloc-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "geocoded_nodes": len(geocoded),
        "missing_geoloc_nodes": max(0, len(nodes) - len(geocoded)),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Normalize Bitnodes geolocation coordinate fields."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    enriched = enrich_nodes(nodes)

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["geoloc_enriched_at"] = utc_now()
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"geoloc enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
