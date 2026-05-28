#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"

STATUS_ORDER = [
    "duplicate-location",
    "not-yet-synced",
    "stable-48h-plus",
    "synced-10m-plus",
    "synced",
    "unknown",
]

NETWORK_ORDER = [
    "ipv4",
    "ipv6",
    "tor",
    "i2p",
    "unknown",
]


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

    if text.lower() in {
        "",
        "unknown",
        "none",
        "null",
        "undefined",
        "—",
        "-",
        "n/a",
        "na",
    }:
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


def nested_dict(row: dict[str, Any], key: str) -> dict[str, Any]:
    value = row.get(key)

    return value if isinstance(value, dict) else {}


def normalize_point(point: dict[str, Any]) -> dict[str, Any] | None:
    lat = number(point.get("latitude") or point.get("lat"))
    lon = number(point.get("longitude") or point.get("lon") or point.get("lng"))

    if lat is None or lon is None:
        return None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None

    network = clean(point.get("network")) or "unknown"
    status = clean(point.get("status")) or "unknown"

    output = dict(point)
    output["latitude"] = lat
    output["longitude"] = lon
    output["lat"] = lat
    output["lon"] = lon
    output["network"] = network if network in NETWORK_ORDER else "unknown"
    output["status"] = status if status in STATUS_ORDER else "unknown"
    output["status_label"] = clean(point.get("status_label")) or output["status"].replace("-", " ").title()
    output["color"] = clean(point.get("color")) or color_for_status(output["status"])
    output["priority"] = int(number(point.get("priority"), priority_for_status(output["status"])) or 0)
    output["duplicate_count"] = int(number(point.get("duplicate_count"), 1) or 1)

    return output


def color_for_status(status: str) -> str:
    return {
        "duplicate-location": "#d95c5c",
        "not-yet-synced": "#9d67ad",
        "stable-48h-plus": "#c0d674",
        "synced-10m-plus": "#e6a42b",
        "synced": "#edf7b9",
        "unknown": "#8c927e",
    }.get(status, "#8c927e")


def priority_for_status(status: str) -> int:
    return {
        "duplicate-location": 90,
        "not-yet-synced": 75,
        "stable-48h-plus": 65,
        "synced-10m-plus": 55,
        "synced": 45,
        "unknown": 10,
    }.get(status, 10)


def point_key(point: dict[str, Any], precision: int = 4) -> str:
    return f"{float(point['latitude']):.{precision}f},{float(point['longitude']):.{precision}f}"


def count_by(points: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}

    for point in points:
        value = clean(point.get(key)) or "Unknown"
        counts[value] = counts.get(value, 0) + 1

    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def cluster_points(points: list[dict[str, Any]], precision: int = 2) -> list[dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = {}

    for point in points:
        key = point_key(point, precision=precision)
        buckets.setdefault(key, []).append(point)

    clusters = []

    for key, rows in buckets.items():
        lat = sum(float(row["latitude"]) for row in rows) / len(rows)
        lon = sum(float(row["longitude"]) for row in rows) / len(rows)

        statuses = count_by(rows, "status")
        networks = count_by(rows, "network")
        countries = count_by(rows, "country")

        dominant_status = next(iter(statuses), "unknown")
        dominant_network = next(iter(networks), "unknown")

        clusters.append({
            "id": f"cluster:{key}",
            "latitude": lat,
            "longitude": lon,
            "lat": lat,
            "lon": lon,
            "point_count": len(rows),
            "status": dominant_status,
            "status_label": dominant_status.replace("-", " ").title(),
            "network": dominant_network,
            "color": color_for_status(dominant_status),
            "priority": priority_for_status(dominant_status),
            "statuses": statuses,
            "networks": networks,
            "countries": countries,
        })

    return sorted(
        clusters,
        key=lambda item: (
            -int(item["point_count"]),
            -int(item["priority"]),
            item["id"],
        ),
    )


def build_bounds(points: list[dict[str, Any]]) -> dict[str, Any]:
    if not points:
        return {
            "has_bounds": False,
            "south": None,
            "west": None,
            "north": None,
            "east": None,
            "center": {
                "latitude": 20.0,
                "longitude": 0.0,
            },
        }

    lats = [float(point["latitude"]) for point in points]
    lons = [float(point["longitude"]) for point in points]

    south = min(lats)
    north = max(lats)
    west = min(lons)
    east = max(lons)

    return {
        "has_bounds": True,
        "south": south,
        "west": west,
        "north": north,
        "east": east,
        "center": {
            "latitude": (south + north) / 2.0,
            "longitude": (west + east) / 2.0,
        },
    }


def build_heatmap(points: list[dict[str, Any]]) -> list[list[float]]:
    heat = []

    for point in points:
        duplicate_count = number(point.get("duplicate_count"), 1) or 1
        priority = number(point.get("priority"), 10) or 10
        intensity = max(0.2, min(1.0, (duplicate_count / 8.0) + (priority / 140.0)))

        heat.append([
            float(point["latitude"]),
            float(point["longitude"]),
            round(float(intensity), 4),
        ])

    return heat


def build_vectors(vectors: dict[str, Any]) -> dict[str, Any]:
    points = [
        normalized
        for point in vectors.get("points", [])
        if isinstance(point, dict)
        for normalized in [normalize_point(point)]
        if normalized is not None
    ]

    location_counts: dict[str, int] = {}

    for point in points:
        key = point_key(point, precision=4)
        location_counts[key] = location_counts.get(key, 0) + 1

    for point in points:
        key = point_key(point, precision=4)
        duplicate_count = max(int(point.get("duplicate_count", 1)), location_counts.get(key, 1))
        point["duplicate_count"] = duplicate_count

        if duplicate_count > 1 and point.get("status") != "duplicate-location":
            point["status"] = "duplicate-location"
            point["status_label"] = "Duplicate Location"
            point["color"] = color_for_status("duplicate-location")
            point["priority"] = priority_for_status("duplicate-location")

    points = sorted(
        points,
        key=lambda item: (
            -int(item.get("priority", 0)),
            item.get("network", ""),
            item.get("country", ""),
            item.get("city", ""),
            item.get("address", ""),
        ),
    )

    network_counts = count_by(points, "network")
    status_counts = count_by(points, "status")
    country_counts = count_by(points, "country")
    agent_counts = count_by(points, "agent")
    provider_counts = count_by(points, "provider")
    asn_counts = count_by(points, "asn")

    return {
        **vectors,
        "schema": "zzx-bitnodes-map-vectors-v2",
        "generated_at": utc_now(),
        "point_count": len(points),
        "bounds": build_bounds(points),
        "network_counts": network_counts,
        "status_counts": status_counts,
        "country_counts": country_counts,
        "agent_counts": agent_counts,
        "provider_counts": provider_counts,
        "asn_counts": asn_counts,
        "clusters": {
            "precision_1": cluster_points(points, precision=1),
            "precision_2": cluster_points(points, precision=2),
            "precision_3": cluster_points(points, precision=3),
        },
        "heatmap": build_heatmap(points),
        "legend": {
            "duplicate-location": {
                "color": "#d95c5c",
                "label": "Duplicate IP / Multiple Nodes at Location",
                "description": "Two or more advertised nodes share a rounded map coordinate.",
            },
            "not-yet-synced": {
                "color": "#9d67ad",
                "label": "Not Yet Synced",
                "description": "Node reports a height below the current observed chain tip.",
            },
            "stable-48h-plus": {
                "color": "#c0d674",
                "label": "Synced / Uptime Over 48h",
                "description": "Synced node with long observed uptime.",
            },
            "synced-10m-plus": {
                "color": "#e6a42b",
                "label": "Synced / Uptime Over 10m",
                "description": "Synced node with short but meaningful uptime.",
            },
            "synced": {
                "color": "#edf7b9",
                "label": "Synced",
                "description": "Synced node without enough uptime metadata for a higher tier.",
            },
            "unknown": {
                "color": "#8c927e",
                "label": "Unknown / Unclassified",
                "description": "Incomplete or ambiguous telemetry.",
            },
        },
        "points": points,
    }


def build_geojson(vectors: dict[str, Any]) -> dict[str, Any]:
    points = vectors.get("points", [])

    return {
        "type": "FeatureCollection",
        "name": "ZZX Bitnodes Map Vectors",
        "generated_at": utc_now(),
        "source": vectors.get("source", "zzxbitnodes"),
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        float(point["longitude"]),
                        float(point["latitude"]),
                    ],
                },
                "properties": {
                    key: value
                    for key, value in point.items()
                    if key not in {
                        "latitude",
                        "longitude",
                        "lat",
                        "lon",
                    }
                },
            }
            for point in points
            if number(point.get("latitude")) is not None
            and number(point.get("longitude")) is not None
        ],
    }


def build(
    payload: dict[str, Any],
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    output = dict(payload)
    vectors = output.get("vectors", {})

    if not isinstance(vectors, dict):
        vectors = {}

    vectors = build_vectors(vectors)
    output["vectors"] = vectors
    output["geojson"] = build_geojson(vectors)

    return output


def build_standalone(
    *,
    input_path: Path,
    output_path: Path,
    geojson_path: Path,
    source: str,
) -> dict[str, Any]:
    payload = read_json(input_path, fallback={})

    vectors = payload.get("vectors", payload)

    if not isinstance(vectors, dict):
        vectors = {
            "source": source,
            "points": [],
        }

    vectors.setdefault("source", source)

    built = build_vectors(vectors)
    geojson = build_geojson(built)

    write_json(output_path, built)
    write_json(geojson_path, geojson)

    return {
        "schema": "zzx-bitnodes-mapvectors-build-report-v1",
        "generated_at": utc_now(),
        "input": str(input_path),
        "output": str(output_path),
        "geojson": str(geojson_path),
        "point_count": built["point_count"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map vector, cluster, heatmap, and GeoJSON payloads."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--geojson", required=True)
    parser.add_argument("--source", default="zzxbitnodes")
    parser.add_argument("--report", default="")

    args = parser.parse_args()

    report = build_standalone(
        input_path=Path(args.input).resolve(),
        output_path=Path(args.output).resolve(),
        geojson_path=Path(args.geojson).resolve(),
        source=args.source,
    )

    if args.report:
        write_json(Path(args.report), report)

    print(
        "map vectors complete: "
        f"{report['point_count']} points, "
        f"output={report['output']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
