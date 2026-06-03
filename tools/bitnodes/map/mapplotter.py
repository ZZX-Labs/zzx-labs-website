#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import time
from collections import Counter
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


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


def num(value: Any) -> float | None:
    try:
        n = float(value)
    except Exception:
        return None

    if math.isnan(n) or math.isinf(n):
        return None

    return n


def boolish(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    text = str(value or "").strip().lower()

    if text in {"true", "yes", "ok", "reachable", "connected", "online", "success"}:
        return True

    if text in {"false", "no", "unreachable", "failed", "offline", "timeout", "error"}:
        return False

    return None


def split_host(address: str) -> str:
    text = str(address or "").strip()

    if text.startswith("[") and "]" in text:
        return text[1:text.index("]")]

    if ".onion:" in text.lower() or ".i2p:" in text.lower():
        return text.rsplit(":", 1)[0]

    if text.count(":") == 1:
        return text.rsplit(":", 1)[0]

    return text


def network_for(row: dict[str, Any]) -> str:
    address = str(row.get("address") or "").lower()
    host = split_host(address).lower()

    if row.get("is_tor") or row.get("tor") or ".onion" in address:
        return "tor"

    if row.get("is_i2p") or row.get("i2p") or ".i2p" in address:
        return "i2p"

    if row.get("is_ipv6") or ":" in host:
        return "ipv6"

    if row.get("is_ipv4") or host.count(".") == 3:
        return "ipv4"

    return str(row.get("network") or "unknown")


def status_for(row: dict[str, Any]) -> str:
    if boolish(row.get("reachable_now")) is True:
        return "reachable_now"

    if boolish(row.get("reachable_24h")) is True:
        return "reachable_24h"

    if boolish(row.get("reachable")) is True:
        return "reachable"

    if boolish(row.get("reachable")) is False:
        return "unreachable"

    return "unknown"


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in ("rows", "results", "data", "node_records", "reachable", "unreachable", "peers"):
        value = payload.get(key)

        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [item for item in nodes if isinstance(item, dict)]

    if isinstance(nodes, dict):
        output = []

        for address, value in nodes.items():
            if isinstance(value, dict):
                record = dict(value)
                record.setdefault("address", address)
                output.append(record)

        return output

    return []


def point_from_node(row: dict[str, Any]) -> dict[str, Any] | None:
    lat = num(row.get("latitude") or row.get("lat"))
    lon = num(row.get("longitude") or row.get("lon") or row.get("lng"))

    if lat is None or lon is None:
        return None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None

    address = str(row.get("address") or row.get("node") or row.get("addr") or row.get("host") or "")

    return {
        "address": address,
        "host": split_host(address),
        "latitude": lat,
        "longitude": lon,
        "network": network_for(row),
        "status": status_for(row),
        "country": row.get("country") or row.get("country_code"),
        "city": row.get("city"),
        "region": row.get("region"),
        "territory": row.get("territory"),
        "county": row.get("county"),
        "zip": row.get("zip") or row.get("postal_code"),
        "asn": row.get("asn"),
        "organization": row.get("organization") or row.get("org"),
        "provider": row.get("provider"),
        "agent": row.get("agent") or row.get("user_agent"),
        "height": row.get("height"),
        "latency_ms": row.get("latency_ms"),
        "peer_index": row.get("peer_index"),
        "reachable": boolish(row.get("reachable")),
        "reachable_now": boolish(row.get("reachable_now")),
        "reachable_24h": boolish(row.get("reachable_24h")),
        "tor": bool(row.get("tor") or row.get("is_tor")),
        "i2p": bool(row.get("i2p") or row.get("is_i2p")),
        "vpn": bool(row.get("vpn") or row.get("is_vpn")),
        "proxy": bool(row.get("proxy") or row.get("is_proxy")),
        "geohash": row.get("geohash") or row.get("geohashid"),
        "w3w": row.get("w3w") or row.get("what3words"),
    }


def build_geojson(points: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "updated_at": utc_now(),
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        point["longitude"],
                        point["latitude"],
                    ],
                },
                "properties": {
                    key: value
                    for key, value in point.items()
                    if key not in {"latitude", "longitude"}
                },
            }
            for point in points
        ],
    }


def build_index(points: list[dict[str, Any]], source: str) -> dict[str, Any]:
    networks = Counter(point["network"] for point in points)
    statuses = Counter(point["status"] for point in points)
    countries = Counter(point.get("country") or "Unknown" for point in points)

    return {
        "schema": "zzx-bitnodes-mapplotter-index-v1",
        "source": source,
        "updated_at": utc_now(),
        "total_points": len(points),
        "networks": dict(networks),
        "statuses": dict(statuses),
        "countries": dict(countries.most_common(100)),
        "files": {
            "points": "./points.json",
            "geojson": "./nodes.geojson",
            "live_map": "./live-map.json",
            "index": "./index.json",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Create OSM-ready Bitnodes node map point files.")

    parser.add_argument("--input", required=True)
    parser.add_argument("--aggregate", default="")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--live-output-dir", required=True)
    parser.add_argument("--source", default="zzxbitnodes")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = extract_nodes(payload)

    points = []

    for row in nodes:
        point = point_from_node(row)

        if point:
            points.append(point)

    points.sort(
        key=lambda point: (
            point.get("country") or "",
            point.get("city") or "",
            point.get("address") or "",
        )
    )

    output_dir = Path(args.output_dir)
    live_output_dir = Path(args.live_output_dir)

    index = build_index(points, args.source)
    geojson = build_geojson(points)

    for target in (output_dir, live_output_dir):
        write_json(target / "points.json", {
            "schema": "zzx-bitnodes-map-points-v1",
            "source": args.source,
            "updated_at": utc_now(),
            "total_points": len(points),
            "results": points,
        })

        write_json(target / "nodes.geojson", geojson)
        write_json(target / "live-map.json", {
            "schema": "zzx-bitnodes-live-map-v1",
            "source": args.source,
            "updated_at": utc_now(),
            "total_points": len(points),
            "points": points,
        })

        write_json(target / "index.json", index)

    print(
        f"mapplotter complete: source={args.source}, "
        f"points={len(points)}, output={output_dir}, live={live_output_dir}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
