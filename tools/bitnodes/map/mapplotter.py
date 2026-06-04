#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import time
from collections import Counter
from pathlib import Path
from typing import Any, Mapping


SCHEMA = "zzx-bitnodes-mapplotter-v2"


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


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

    return text.strip("[]")


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


def array_node_to_dict(address: str, row: list[Any]) -> dict[str, Any]:
    metadata = row[19] if len(row) > 19 and isinstance(row[19], dict) else {}

    return {
        "address": address,
        "protocol": row[0] if len(row) > 0 else None,
        "agent": row[1] if len(row) > 1 else None,
        "connected_since": row[2] if len(row) > 2 else None,
        "services": row[3] if len(row) > 3 else None,
        "height": row[4] if len(row) > 4 else None,
        "hostname": row[5] if len(row) > 5 else None,
        "city": row[6] if len(row) > 6 else None,
        "country": row[7] if len(row) > 7 else None,
        "country_code": row[7] if len(row) > 7 else None,
        "latitude": row[8] if len(row) > 8 else None,
        "longitude": row[9] if len(row) > 9 else None,
        "timezone": row[10] if len(row) > 10 else None,
        "asn": row[11] if len(row) > 11 else None,
        "organization": row[12] if len(row) > 12 else None,
        "provider": row[13] if len(row) > 13 else None,
        "county": row[14] if len(row) > 14 else None,
        "zip": row[15] if len(row) > 15 else None,
        "postal_code": row[15] if len(row) > 15 else None,
        "w3w": row[16] if len(row) > 16 else None,
        "what3words": row[16] if len(row) > 16 else None,
        "geohash": row[17] if len(row) > 17 else None,
        "geohashid": row[17] if len(row) > 17 else None,
        "asn_location": row[18] if len(row) > 18 else None,
        "metadata": metadata,
        "latency_ms": metadata.get("latency_ms"),
        "peer_index": metadata.get("peer_index"),
        "reachable": metadata.get("reachable"),
        "reachable_now": metadata.get("reachable_now"),
        "reachable_24h": metadata.get("reachable_24h"),
        "network": metadata.get("network"),
        "is_tor": metadata.get("is_tor") or metadata.get("tor"),
        "is_i2p": metadata.get("is_i2p") or metadata.get("i2p"),
        "is_ipv4": metadata.get("is_ipv4"),
        "is_ipv6": metadata.get("is_ipv6"),
        "is_vpn": metadata.get("is_vpn") or metadata.get("suspected_vpn"),
        "is_proxy": metadata.get("is_proxy") or metadata.get("suspected_proxy"),
    }


def network_for(row: Mapping[str, Any]) -> str:
    address = str(first(row, ("address", "node", "addr", "host")) or "").lower()
    host = split_host(address).lower()

    network = str(first(row, ("network", "metadata.network", "network_type", "geoip.network_type")) or "").lower()

    if network:
        return network

    if boolish(first(row, ("is_tor", "tor", "metadata.is_tor", "metadata.tor"))) or ".onion" in address:
        return "tor"

    if boolish(first(row, ("is_i2p", "i2p", "metadata.is_i2p", "metadata.i2p"))) or ".i2p" in address:
        return "i2p"

    if boolish(first(row, ("is_ipv6", "metadata.is_ipv6"))) or ":" in host:
        return "ipv6"

    if boolish(first(row, ("is_ipv4", "metadata.is_ipv4"))) or host.count(".") == 3:
        return "ipv4"

    return "unknown"


def status_for(row: Mapping[str, Any]) -> str:
    if boolish(first(row, ("reachable_now", "metadata.reachable_now"))) is True:
        return "reachable_now"

    if boolish(first(row, ("reachable_24h", "metadata.reachable_24h"))) is True:
        return "reachable_24h"

    if boolish(first(row, ("reachable", "metadata.reachable"))) is True:
        return "reachable"

    if boolish(first(row, ("reachable", "metadata.reachable"))) is False:
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
        output: list[dict[str, Any]] = []

        for address, value in nodes.items():
            if isinstance(value, dict):
                record = dict(value)
                record.setdefault("address", address)
                output.append(record)

            elif isinstance(value, list):
                output.append(array_node_to_dict(str(address), value))

        return output

    return []


def point_from_node(row: Mapping[str, Any]) -> dict[str, Any] | None:
    lat = num(first(row, (
        "latitude",
        "lat",
        "geoloc.latitude",
        "geo.latitude",
        "geo.lat",
        "geoip.latitude",
        "geoip.lat",
        "geoip_data.latitude",
        "location.latitude",
        "metadata.latitude",
    )))

    lon = num(first(row, (
        "longitude",
        "lon",
        "lng",
        "geoloc.longitude",
        "geoloc.lon",
        "geo.longitude",
        "geo.lon",
        "geo.lng",
        "geoip.longitude",
        "geoip.lon",
        "geoip_data.longitude",
        "location.longitude",
        "metadata.longitude",
    )))

    network = network_for(row)

    if lat is None or lon is None:
        if network == "tor":
            lat, lon = 0.0, -32.0
        elif network == "i2p":
            lat, lon = 0.0, 32.0
        else:
            return None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None

    address = str(first(row, ("address", "node", "addr", "host", "hostname")) or "")

    return {
        "address": address,
        "host": split_host(address),
        "latitude": lat,
        "longitude": lon,
        "network": network,
        "status": status_for(row),
        "country": first(row, ("country", "country_code", "country_data.country_code", "geoip.country_code")),
        "country_name": first(row, ("country_name", "country_data.country_name", "geoip.country_name")),
        "continent": first(row, ("continent", "continent_data.continent")),
        "region": first(row, ("region", "region_data.region")),
        "territory": first(row, ("territory", "territory_data.territory")),
        "county": first(row, ("county", "county_data.county")),
        "city": first(row, ("city", "city_data.city")),
        "zip": first(row, ("zip", "postal_code", "postal_data.postal_code")),
        "timezone": first(row, ("timezone", "timezone_data.timezone")),
        "asn": first(row, ("asn", "asn_data.asn")),
        "organization": first(row, ("organization", "org", "organization_data.organization")),
        "provider": first(row, ("provider", "provider_data.provider")),
        "agent": first(row, ("agent", "user_agent")),
        "height": first(row, ("height",)),
        "latency_ms": first(row, ("latency_ms", "metadata.latency_ms")),
        "peer_index": first(row, ("peer_index", "metadata.peer_index")),
        "reachable": boolish(first(row, ("reachable", "metadata.reachable"))),
        "reachable_now": boolish(first(row, ("reachable_now", "metadata.reachable_now"))),
        "reachable_24h": boolish(first(row, ("reachable_24h", "metadata.reachable_24h"))),
        "tor": network == "tor",
        "i2p": network == "i2p",
        "vpn": boolish(first(row, ("vpn", "is_vpn", "suspected_vpn", "metadata.is_vpn", "metadata.suspected_vpn"))) is True,
        "proxy": boolish(first(row, ("proxy", "is_proxy", "suspected_proxy", "metadata.is_proxy", "metadata.suspected_proxy"))) is True,
        "geohash": first(row, ("geohash", "geohashid", "geohashid_data.geohashid")),
        "w3w": first(row, ("w3w", "what3words", "w3w_data.w3w")),
        "zzxgcs": first(row, ("zzxgcs", "zzxgcs_data.zzxgcs")),
    }


def build_geojson(points: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "schema": "zzx-bitnodes-map-points-geojson-v2",
        "updated_at": utc_now(),
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [point["longitude"], point["latitude"]],
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
        "schema": "zzx-bitnodes-mapplotter-index-v2",
        "source": source,
        "updated_at": utc_now(),
        "total_points": len(points),
        "networks": dict(networks),
        "statuses": dict(statuses),
        "countries": dict(countries.most_common(250)),
        "files": {
            "points": "./points.json",
            "geojson": "./nodes.geojson",
            "map_points_geojson": "./map-points.geojson",
            "live_map": "./live-map.json",
            "index": "./index.json",
        },
    }


def write_outputs(target: Path, source: str, points: list[dict[str, Any]], index: dict[str, Any], geojson: dict[str, Any], compact: bool) -> None:
    write_json(target / "points.json", {
        "schema": "zzx-bitnodes-map-points-v2",
        "source": source,
        "updated_at": utc_now(),
        "total_points": len(points),
        "results": points,
    }, compact=compact)

    write_json(target / "nodes.geojson", geojson, compact=compact)
    write_json(target / "map-points.geojson", geojson, compact=compact)

    write_json(target / "live-map.json", {
        "schema": "zzx-bitnodes-live-map-v2",
        "source": source,
        "updated_at": utc_now(),
        "total_points": len(points),
        "points": points,
    }, compact=compact)

    write_json(target / "index.json", index, compact=compact)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create OSM-ready Bitnodes node map point files.")

    parser.add_argument("--input", required=True)
    parser.add_argument("--aggregate", default="")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--live-output-dir", required=True)
    parser.add_argument("--source", default="zzxbitnodes")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--fail-empty", action="store_true")

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
            str(point.get("country") or ""),
            str(point.get("city") or ""),
            str(point.get("address") or ""),
        )
    )

    output_dir = Path(args.output_dir)
    live_output_dir = Path(args.live_output_dir)

    index = build_index(points, args.source)
    geojson = build_geojson(points)

    for target in (output_dir, live_output_dir):
        write_outputs(target, args.source, points, index, geojson, args.compact)

    if args.fail_empty and not points:
        raise SystemExit("mapplotter produced zero points")

    print(
        f"mapplotter complete: source={args.source}, "
        f"nodes={len(nodes)}, points={len(points)}, output={output_dir}, live={live_output_dir}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
