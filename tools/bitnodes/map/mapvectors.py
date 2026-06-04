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


STATUS_ORDER = [
    "duplicate-location",
    "unreachable",
    "reachable-now",
    "reachable-24h",
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
    "cjdns",
    "dns",
    "unknown",
]


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


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
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


def boolish(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    text = str(value or "").strip().lower()

    if text in {
        "true",
        "yes",
        "y",
        "ok",
        "1",
        "reachable",
        "connected",
        "online",
        "success",
        "flagged",
        "matched",
    }:
        return True

    if text in {
        "false",
        "no",
        "n",
        "0",
        "unreachable",
        "failed",
        "offline",
        "timeout",
        "error",
        "clear",
        "none",
    }:
        return False

    return None


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


def nested_dict(row: Mapping[str, Any], key: str) -> dict[str, Any]:
    value = row.get(key)
    return value if isinstance(value, dict) else {}


def split_host(address: str) -> str:
    text = str(address or "").strip()

    if text.startswith("[") and "]" in text:
        return text[1:text.index("]")]

    lower = text.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        return text.rsplit(":", 1)[0]

    if text.count(":") == 1:
        return text.rsplit(":", 1)[0]

    return text.strip("[]")


def color_for_status(status: str) -> str:
    return {
        "duplicate-location": "#d95c5c",
        "unreachable": "#d95c5c",
        "reachable-now": "#c0d674",
        "reachable-24h": "#e6a42b",
        "not-yet-synced": "#9d67ad",
        "stable-48h-plus": "#c0d674",
        "synced-10m-plus": "#e6a42b",
        "synced": "#edf7b9",
        "unknown": "#8c927e",
    }.get(status, "#8c927e")


def priority_for_status(status: str) -> int:
    return {
        "duplicate-location": 95,
        "unreachable": 85,
        "not-yet-synced": 75,
        "reachable-now": 70,
        "stable-48h-plus": 65,
        "synced-10m-plus": 55,
        "reachable-24h": 50,
        "synced": 45,
        "unknown": 10,
    }.get(status, 10)


def normalize_network(point: Mapping[str, Any]) -> str:
    network = clean(first(point, (
        "network",
        "metadata.network",
        "network_type",
        "geoip.network_type",
    ))).lower()

    if network:
        return network if network in NETWORK_ORDER else "unknown"

    address = clean(first(point, ("address", "node", "addr", "host", "hostname"))).lower()
    host = split_host(address).lower()

    if ".onion" in address or boolish(first(point, ("is_tor", "tor", "metadata.is_tor", "metadata.tor"))) is True:
        return "tor"

    if ".i2p" in address or boolish(first(point, ("is_i2p", "i2p", "metadata.is_i2p", "metadata.i2p"))) is True:
        return "i2p"

    if boolish(first(point, ("is_cjdns", "cjdns", "metadata.is_cjdns"))) is True:
        return "cjdns"

    if boolish(first(point, ("is_ipv6", "metadata.is_ipv6"))) is True or ":" in host:
        return "ipv6"

    if boolish(first(point, ("is_ipv4", "metadata.is_ipv4"))) is True or host.count(".") == 3:
        return "ipv4"

    return "unknown"


def normalize_status(point: Mapping[str, Any]) -> str:
    raw_status = clean(first(point, ("status", "metadata.status"))).lower().replace("_", "-")

    if raw_status in STATUS_ORDER:
        return raw_status

    reachable_now = boolish(first(point, ("reachable_now", "metadata.reachable_now")))
    reachable_24h = boolish(first(point, ("reachable_24h", "metadata.reachable_24h")))
    reachable = boolish(first(point, ("reachable", "metadata.reachable")))

    if reachable_now is True:
        return "reachable-now"

    if reachable_24h is True:
        return "reachable-24h"

    if reachable is True:
        return "synced"

    if reachable is False:
        return "unreachable"

    return "unknown"


def flag(point: Mapping[str, Any], keys: tuple[str, ...]) -> bool:
    return any(boolish(first(point, (key,))) is True for key in keys)


def row_lat_lon(point: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(first(point, (
        "latitude",
        "lat",
        "geoloc.latitude",
        "city_data.latitude",
        "postal_data.latitude",
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
        "city_data.longitude",
        "postal_data.longitude",
        "geo.longitude",
        "geo.lon",
        "geo.lng",
        "geoip.longitude",
        "geoip.lon",
        "geoip_data.longitude",
        "location.longitude",
        "metadata.longitude",
    )))

    network = normalize_network(point)

    if lat is None or lon is None:
        if network == "tor":
            return 0.0, -32.0

        if network == "i2p":
            return 0.0, 32.0

        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def normalize_point(point: Mapping[str, Any]) -> dict[str, Any] | None:
    lat, lon = row_lat_lon(point)

    if lat is None or lon is None:
        return None

    network = normalize_network(point)
    status = normalize_status(point)

    address = clean(first(point, ("address", "node", "addr", "host", "hostname")))

    output = dict(point)
    output["address"] = address
    output["host"] = clean(first(point, ("host", "hostname"))) or split_host(address)
    output["latitude"] = lat
    output["longitude"] = lon
    output["lat"] = lat
    output["lon"] = lon
    output["network"] = network
    output["status"] = status
    output["status_label"] = clean(point.get("status_label")) or status.replace("-", " ").title()
    output["color"] = clean(point.get("color")) or color_for_status(status)
    output["priority"] = int(number(point.get("priority"), priority_for_status(status)) or 0)
    output["duplicate_count"] = int(number(point.get("duplicate_count"), 1) or 1)

    output["country"] = clean(first(point, ("country", "country_code", "country_data.country_code", "geoip.country_code"))) or "Unknown"
    output["country_name"] = clean(first(point, ("country_name", "country_data.country_name", "geoip.country_name")))
    output["continent"] = clean(first(point, ("continent", "continent_data.continent")))
    output["region"] = clean(first(point, ("region", "region_data.region")))
    output["territory"] = clean(first(point, ("territory", "territory_data.territory")))
    output["county"] = clean(first(point, ("county", "county_data.county")))
    output["city"] = clean(first(point, ("city", "city_data.city")))
    output["zip"] = clean(first(point, ("zip", "postal_code", "postal_data.postal_code")))
    output["postal_code"] = clean(first(point, ("postal_code", "zip", "postal_data.postal_code")))
    output["timezone"] = clean(first(point, ("timezone", "iana_timezone", "timezone_data.timezone")))

    output["asn"] = clean(first(point, ("asn", "asn_data.asn", "geoip.asn")))
    output["organization"] = clean(first(point, ("organization", "org", "organization_data.organization", "geoip.organization")))
    output["provider"] = clean(first(point, ("provider", "provider_data.provider", "geoip.provider")))
    output["agent"] = clean(first(point, ("agent", "user_agent")))

    output["height"] = first(point, ("height",))
    output["latency_ms"] = first(point, ("latency_ms", "metadata.latency_ms"))
    output["peer_index"] = first(point, ("peer_index", "metadata.peer_index"))

    output["reachable"] = boolish(first(point, ("reachable", "metadata.reachable")))
    output["reachable_now"] = boolish(first(point, ("reachable_now", "metadata.reachable_now")))
    output["reachable_24h"] = boolish(first(point, ("reachable_24h", "metadata.reachable_24h")))

    output["is_tor"] = network == "tor"
    output["tor"] = network == "tor"
    output["is_i2p"] = network == "i2p"
    output["i2p"] = network == "i2p"
    output["is_ipv4"] = network == "ipv4"
    output["is_ipv6"] = network == "ipv6"
    output["is_cjdns"] = network == "cjdns"

    output["is_vpn"] = flag(point, (
        "is_vpn",
        "vpn",
        "suspected_vpn",
        "vpn_data.is_vpn",
        "vpn_data.suspected_vpn",
        "metadata.is_vpn",
        "metadata.suspected_vpn",
    ))

    output["is_proxy"] = flag(point, (
        "is_proxy",
        "proxy",
        "suspected_proxy",
        "proxy_data.is_proxy",
        "proxy_data.suspected_proxy",
        "metadata.is_proxy",
        "metadata.suspected_proxy",
    ))

    output["is_datacenter"] = flag(point, (
        "is_datacenter",
        "datacenter",
        "datacenter_data.is_datacenter",
        "provider_data.is_datacenter",
        "metadata.is_datacenter",
    ))

    output["is_government"] = flag(point, (
        "is_government",
        "government",
        "government_data.is_government",
        "organization_data.is_government",
        "metadata.is_government",
    ))

    output["is_military"] = flag(point, (
        "is_military",
        "military",
        "military_data.is_military",
        "organization_data.is_military",
        "metadata.is_military",
    ))

    output["is_sanctioned"] = flag(point, (
        "is_sanctioned",
        "is_sanctioned_node",
        "policy_restricted",
        "is_policy_restricted_node",
        "sanctions_data.is_sanctioned",
        "sanctions_data.is_policy_restricted",
        "metadata.is_sanctioned",
    ))

    output["is_apt"] = flag(point, (
        "is_apt",
        "apt",
        "apt_data.is_apt",
        "aptattribution.is_apt",
        "apt_attribution.is_apt",
        "metadata.is_apt",
    ))

    output["is_threat_actor"] = flag(point, (
        "is_threat_actor",
        "threat_actor",
        "tagattribution.is_threat_actor",
        "tag_attribution.is_threat_actor",
        "threat_actor_data.is_threat_actor",
        "metadata.is_threat_actor",
    ))

    output["is_known_malactor"] = flag(point, (
        "is_known_malactor",
        "known_malactor",
        "knownmalactor.is_known_malactor",
        "known_malactor_data.is_known_malactor",
        "metadata.is_known_malactor",
    ))

    output["geohash"] = clean(first(point, ("geohash", "geohashid", "geohashid_data.geohashid")))
    output["geohashid"] = clean(first(point, ("geohashid", "geohashid_data.geohashid")))
    output["w3w"] = clean(first(point, ("w3w", "what3words", "w3w_data.w3w")))
    output["what3words"] = clean(first(point, ("what3words", "w3w", "w3w_data.words")))
    output["zzxgcs"] = clean(first(point, ("zzxgcs", "zzxgcs_data.zzxgcs")))

    return output


def point_key(point: Mapping[str, Any], precision: int = 4) -> str:
    return f"{float(point['latitude']):.{precision}f},{float(point['longitude']):.{precision}f}"


def count_by(points: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}

    for point in points:
        value = clean(point.get(key)) or "Unknown"
        counts[value] = counts.get(value, 0) + 1

    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def count_flag(points: list[dict[str, Any]], key: str) -> int:
    return sum(1 for point in points if boolish(point.get(key)) is True)


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


def build_legend() -> dict[str, dict[str, str]]:
    return {
        "duplicate-location": {
            "color": "#d95c5c",
            "label": "Duplicate IP / Multiple Nodes at Location",
            "description": "Two or more advertised nodes share a rounded map coordinate.",
        },
        "unreachable": {
            "color": "#d95c5c",
            "label": "Unreachable",
            "description": "Node failed the latest reachability check.",
        },
        "reachable-now": {
            "color": "#c0d674",
            "label": "Reachable Now",
            "description": "Node was reachable in the latest crawl.",
        },
        "reachable-24h": {
            "color": "#e6a42b",
            "label": "Reachable Within 24H",
            "description": "Node was seen during the 24-hour rolling window.",
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
    }


def build_vectors(vectors: dict[str, Any]) -> dict[str, Any]:
    raw_points = vectors.get("points", [])

    if not isinstance(raw_points, list):
        raw_points = []

    points = [
        normalized
        for point in raw_points
        if isinstance(point, Mapping)
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

        if duplicate_count > 1 and point.get("status") not in {"duplicate-location", "unreachable"}:
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
    organization_counts = count_by(points, "organization")

    intelligence_counts = {
        "vpn_nodes": count_flag(points, "is_vpn"),
        "proxy_nodes": count_flag(points, "is_proxy"),
        "datacenter_nodes": count_flag(points, "is_datacenter"),
        "government_nodes": count_flag(points, "is_government"),
        "military_nodes": count_flag(points, "is_military"),
        "sanctioned_nodes": count_flag(points, "is_sanctioned"),
        "apt_nodes": count_flag(points, "is_apt"),
        "threat_actor_nodes": count_flag(points, "is_threat_actor"),
        "known_malactor_nodes": count_flag(points, "is_known_malactor"),
    }

    return {
        **vectors,
        "schema": "zzx-bitnodes-map-vectors-v3",
        "generated_at": utc_now(),
        "point_count": len(points),
        "bounds": build_bounds(points),
        "network_counts": network_counts,
        "status_counts": status_counts,
        "country_counts": country_counts,
        "agent_counts": agent_counts,
        "provider_counts": provider_counts,
        "asn_counts": asn_counts,
        "organization_counts": organization_counts,
        "intelligence_counts": intelligence_counts,
        "clusters": {
            "precision_1": cluster_points(points, precision=1),
            "precision_2": cluster_points(points, precision=2),
            "precision_3": cluster_points(points, precision=3),
        },
        "heatmap": build_heatmap(points),
        "legend": build_legend(),
        "points": points,
    }


def build_geojson(vectors: Mapping[str, Any]) -> dict[str, Any]:
    points = vectors.get("points", [])

    if not isinstance(points, list):
        points = []

    return {
        "type": "FeatureCollection",
        "schema": "zzx-bitnodes-map-vectors-geojson-v3",
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
                    if key not in {"latitude", "longitude", "lat", "lon"}
                },
            }
            for point in points
            if isinstance(point, Mapping)
            and number(point.get("latitude")) is not None
            and number(point.get("longitude")) is not None
        ],
    }


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    output = dict(payload)
    vectors_payload = output.get("vectors", {})

    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    vectors_payload = build_vectors(vectors_payload)
    output["vectors"] = vectors_payload
    output["geojson"] = build_geojson(vectors_payload)

    return output


def build_standalone(
    *,
    input_path: Path,
    output_path: Path,
    geojson_path: Path,
    source: str,
    compact: bool = False,
) -> dict[str, Any]:
    payload = read_json(input_path, fallback={})

    if not isinstance(payload, dict):
        payload = {}

    vectors_payload = payload.get("vectors", payload)

    if not isinstance(vectors_payload, dict):
        vectors_payload = {
            "source": source,
            "points": [],
        }

    vectors_payload.setdefault("source", source)

    built = build_vectors(vectors_payload)
    geojson = build_geojson(built)

    write_json(output_path, built, compact=compact)
    write_json(geojson_path, geojson, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapvectors-build-report-v3",
        "generated_at": utc_now(),
        "input": str(input_path),
        "output": str(output_path),
        "geojson": str(geojson_path),
        "point_count": built["point_count"],
        "source": source,
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
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        input_path=Path(args.input).resolve(),
        output_path=Path(args.output).resolve(),
        geojson_path=Path(args.geojson).resolve(),
        source=args.source,
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map vectors complete: "
        f"{report['point_count']} points, "
        f"output={report['output']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
