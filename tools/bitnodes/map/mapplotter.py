#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
import json
import math
import time
from collections import Counter
from pathlib import Path
from typing import Any, Mapping


SCHEMA = "zzx-bitnodes-mapplotter-v3"


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback
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
        if value in ("", None):
            return None
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

    if text in {"true", "yes", "ok", "reachable", "connected", "online", "success", "up"}:
        return True

    if text in {"false", "no", "unreachable", "failed", "offline", "timeout", "error", "down"}:
        return False

    return None


def split_host(address: Any) -> str:
    text = str(address or "").strip()

    if not text:
        return ""

    if text.startswith("[") and "]" in text:
        return text[1:text.index("]")].lower()

    lower = text.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        return text.rsplit(":", 1)[0].strip("[]").lower()

    if lower.endswith(".onion") or lower.endswith(".i2p"):
        return text.strip("[]").lower()

    if text.count(":") == 1 and "." in text:
        host, port = text.rsplit(":", 1)
        if port.isdigit():
            return host.strip("[]").lower()

    if text.count(":") > 1:
        possible_host, possible_port = text.rsplit(":", 1)
        if possible_port.isdigit():
            try:
                ipaddress.ip_address(possible_host.strip("[]"))
                return possible_host.strip("[]").lower()
            except Exception:
                pass

    return text.strip("[]").lower()


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    cur: Any = row

    for part in key.split("."):
        if not isinstance(cur, Mapping):
            return None
        cur = cur.get(part)

    return cur


def first(row: Mapping[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = deep_get(row, key)
        if value not in ("", None):
            return value
    return None


def array_node_to_dict(address: str, row: list[Any]) -> dict[str, Any]:
    padded = list(row) + [None] * max(0, 20 - len(row))
    metadata = padded[19] if isinstance(padded[19], Mapping) else {}

    record = {
        "address": address,
        "protocol": padded[0],
        "protocol_version": padded[0],
        "agent": padded[1],
        "user_agent": padded[1],
        "connected_since": padded[2],
        "services": padded[3],
        "height": padded[4],
        "hostname": padded[5],
        "city": padded[6],
        "country": padded[7],
        "country_code": padded[7],
        "latitude": padded[8],
        "longitude": padded[9],
        "timezone": padded[10],
        "asn": padded[11],
        "organization": padded[12],
        "provider": padded[13],
        "county": padded[14],
        "zip": padded[15],
        "postal_code": padded[15],
        "w3w": padded[16],
        "what3words": padded[16],
        "geohash": padded[17],
        "geohashid": padded[17],
        "asn_location": padded[18],
        "metadata": dict(metadata),
    }

    for key, value in dict(metadata).items():
        record.setdefault(key, value)

    return record


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        out = []
        for index, item in enumerate(payload):
            if isinstance(item, Mapping):
                out.append(dict(item))
            elif isinstance(item, list):
                out.append(array_node_to_dict(str(index), item))
        return out

    if not isinstance(payload, Mapping):
        return []

    for key in (
        "nodes",
        "reachable_nodes",
        "rows",
        "results",
        "data",
        "node_records",
        "reachable",
        "unreachable",
        "peers",
        "points",
    ):
        value = payload.get(key)

        if isinstance(value, Mapping):
            out = []
            for address, item in value.items():
                if isinstance(item, Mapping):
                    row = dict(item)
                    row.setdefault("address", str(address))
                    out.append(row)
                elif isinstance(item, list):
                    out.append(array_node_to_dict(str(address), item))
            if out:
                return out

        if isinstance(value, list):
            out = []
            for index, item in enumerate(value):
                if isinstance(item, Mapping):
                    out.append(dict(item))
                elif isinstance(item, list):
                    out.append(array_node_to_dict(str(index), item))
            if out:
                return out

    for key in ("latest", "snapshot", "payload", "vectors"):
        nested = payload.get(key)
        out = extract_nodes(nested)
        if out:
            return out

    features = payload.get("features")
    if isinstance(features, list):
        out = []
        for index, feature in enumerate(features):
            if not isinstance(feature, Mapping):
                continue
            props = feature.get("properties") if isinstance(feature.get("properties"), Mapping) else {}
            geom = feature.get("geometry") if isinstance(feature.get("geometry"), Mapping) else {}
            coords = geom.get("coordinates") if isinstance(geom.get("coordinates"), list) else []
            row = dict(props)
            if len(coords) >= 2:
                row.setdefault("longitude", coords[0])
                row.setdefault("latitude", coords[1])
            row.setdefault("address", str(index))
            out.append(row)
        return out

    return []


def network_for(row: Mapping[str, Any]) -> str:
    network = str(first(row, (
        "network",
        "metadata.network",
        "network_type",
        "geoip.network_type",
        "geoip_data.network_type",
        "metadata.geoip.network_type",
        "metadata.geoip_data.network_type",
    )) or "").strip().lower()

    if network:
        return network

    address = str(first(row, ("address", "node", "addr", "host", "hostname", "ip")) or "").lower()
    host = split_host(address)

    if boolish(first(row, ("is_tor", "tor", "metadata.is_tor", "metadata.tor"))) or ".onion" in address:
        return "tor"

    if boolish(first(row, ("is_i2p", "i2p", "metadata.is_i2p", "metadata.i2p"))) or ".i2p" in address:
        return "i2p"

    try:
        ip = ipaddress.ip_address(host)
        if ip.version == 4:
            return "ipv4"
        if ip.version == 6:
            if ip in ipaddress.ip_network("fc00::/8"):
                return "cjdns"
            return "ipv6"
    except Exception:
        pass

    return "dns" if host else "unknown"


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


def coordinate_pair(row: Mapping[str, Any]) -> tuple[float | None, float | None, str]:
    candidates = (
        (
            first(row, ("latitude", "lat", "geo_lat", "dbip_latitude")),
            first(row, ("longitude", "lon", "lng", "geo_lon", "dbip_longitude")),
            "direct",
        ),
        (
            first(row, ("geoloc.latitude", "geoloc.lat")),
            first(row, ("geoloc.longitude", "geoloc.lon", "geoloc.lng")),
            "geoloc",
        ),
        (
            first(row, ("geoip.latitude", "geoip.lat")),
            first(row, ("geoip.longitude", "geoip.lon", "geoip.lng")),
            "geoip",
        ),
        (
            first(row, ("geoip_data.latitude", "geoip_data.lat")),
            first(row, ("geoip_data.longitude", "geoip_data.lon", "geoip_data.lng")),
            "geoip_data",
        ),
        (
            first(row, ("geo.latitude", "geo.lat")),
            first(row, ("geo.longitude", "geo.lon", "geo.lng")),
            "geo",
        ),
        (
            first(row, ("location.latitude", "location.lat")),
            first(row, ("location.longitude", "location.lon", "location.lng")),
            "location",
        ),
        (
            first(row, ("coordinates.latitude", "coordinates.lat")),
            first(row, ("coordinates.longitude", "coordinates.lon", "coordinates.lng")),
            "coordinates",
        ),
        (
            first(row, ("metadata.latitude", "metadata.lat")),
            first(row, ("metadata.longitude", "metadata.lon", "metadata.lng")),
            "metadata",
        ),
        (
            first(row, ("metadata.geoip.latitude", "metadata.geoip.lat")),
            first(row, ("metadata.geoip.longitude", "metadata.geoip.lon", "metadata.geoip.lng")),
            "metadata.geoip",
        ),
        (
            first(row, ("metadata.geoip_data.latitude", "metadata.geoip_data.lat")),
            first(row, ("metadata.geoip_data.longitude", "metadata.geoip_data.lon", "metadata.geoip_data.lng")),
            "metadata.geoip_data",
        ),
        (
            first(row, ("enrichment.geoip.latitude", "enrichment.geoip.lat")),
            first(row, ("enrichment.geoip.longitude", "enrichment.geoip.lon", "enrichment.geoip.lng")),
            "enrichment.geoip",
        ),
    )

    for lat_raw, lon_raw, source in candidates:
        lat = num(lat_raw)
        lon = num(lon_raw)

        if lat is None or lon is None:
            continue

        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return lat, lon, source

    return None, None, ""


def point_from_node(row: Mapping[str, Any]) -> dict[str, Any] | None:
    lat, lon, coord_source = coordinate_pair(row)

    if lat is None or lon is None:
        return None

    address = str(first(row, ("address", "node", "addr", "host", "hostname", "ip")) or "")
    network = network_for(row)

    return {
        "address": address,
        "host": split_host(address),
        "latitude": lat,
        "longitude": lon,
        "coordinate_source": coord_source,
        "network": network,
        "status": status_for(row),
        "country": first(row, (
            "country",
            "country_code",
            "country_data.country_code",
            "geoip.country_code",
            "geoip_data.country_code",
            "metadata.geoip.country_code",
        )),
        "country_name": first(row, (
            "country_name",
            "country_data.country_name",
            "geoip.country_name",
            "geoip_data.country_name",
            "metadata.geoip.country_name",
        )),
        "continent": first(row, ("continent", "continent_data.continent")),
        "region": first(row, ("region", "region_data.region", "geoip.region", "metadata.geoip.region")),
        "territory": first(row, ("territory", "territory_data.territory", "state", "province")),
        "county": first(row, ("county", "county_data.county")),
        "city": first(row, ("city", "city_data.city", "geoip.city", "geoip_data.city", "metadata.geoip.city")),
        "zip": first(row, ("zip", "postal_code", "postal_data.postal_code")),
        "timezone": first(row, (
            "timezone",
            "timezone_data.timezone",
            "geoip.timezone",
            "geoip_data.timezone",
            "metadata.geoip.timezone",
        )),
        "asn": first(row, ("asn", "asn_data.asn", "geoip.asn", "geoip_data.asn", "metadata.geoip.asn")),
        "organization": first(row, (
            "organization",
            "org",
            "organization_data.organization",
            "geoip.organization",
            "geoip_data.organization",
            "metadata.geoip.organization",
        )),
        "provider": first(row, (
            "provider",
            "provider_data.provider",
            "geoip.provider",
            "geoip_data.provider",
            "metadata.geoip.provider",
        )),
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


def build_geojson(points: list[dict[str, Any]], source: str) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "schema": "zzx-bitnodes-map-points-geojson-v3",
        "source": source,
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


def build_index(points: list[dict[str, Any]], source: str, input_path: str) -> dict[str, Any]:
    networks = Counter(point["network"] for point in points)
    statuses = Counter(point["status"] for point in points)
    countries = Counter(point.get("country") or "Unknown" for point in points)
    coord_sources = Counter(point.get("coordinate_source") or "unknown" for point in points)

    return {
        "schema": "zzx-bitnodes-mapplotter-index-v3",
        "source": source,
        "input": input_path,
        "updated_at": utc_now(),
        "total_points": len(points),
        "networks": dict(networks),
        "statuses": dict(statuses),
        "countries": dict(countries.most_common(250)),
        "coordinate_sources": dict(coord_sources),
        "files": {
            "points": "./points.json",
            "geojson": "./nodes.geojson",
            "map_points_geojson": "./map-points.geojson",
            "live_map": "./live-map.json",
            "vectors": "./map-vectors.json",
            "index": "./index.json",
        },
    }


def build_vector_payload(points: list[dict[str, Any]], source: str) -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-map-vectors-v3",
        "source": source,
        "updated_at": utc_now(),
        "point_count": len(points),
        "points": points,
        "network_counts": dict(Counter(point["network"] for point in points)),
        "status_counts": dict(Counter(point["status"] for point in points)),
        "country_counts": dict(Counter(point.get("country") or "Unknown" for point in points).most_common(250)),
    }


def write_outputs(
    target: Path,
    source: str,
    points: list[dict[str, Any]],
    index: dict[str, Any],
    geojson: dict[str, Any],
    compact: bool,
) -> None:
    vector_payload = build_vector_payload(points, source)

    write_json(target / "points.json", {
        "schema": "zzx-bitnodes-map-points-v3",
        "source": source,
        "updated_at": utc_now(),
        "total_points": len(points),
        "points": points,
        "results": points,
    }, compact=compact)

    write_json(target / "map-vectors.json", vector_payload, compact=compact)
    write_json(target / "nodes.geojson", geojson, compact=compact)
    write_json(target / "map-points.geojson", geojson, compact=compact)

    write_json(target / "live-map.json", {
        "schema": "zzx-bitnodes-live-map-v3",
        "source": source,
        "updated_at": utc_now(),
        "total_points": len(points),
        "point_count": len(points),
        "points": points,
    }, compact=compact)

    write_json(target / "index.json", index, compact=compact)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create OSM-ready Bitnodes node map point files.",
        allow_abbrev=False,
    )

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

    if args.aggregate:
        aggregate_payload = read_json(Path(args.aggregate), fallback={})
        aggregate_nodes = extract_nodes(aggregate_payload)
        if aggregate_nodes:
            nodes.extend(aggregate_nodes)

    seen = set()
    points = []

    for row in nodes:
        point = point_from_node(row)

        if not point:
            continue

        key = (
            point.get("address"),
            point.get("latitude"),
            point.get("longitude"),
        )

        if key in seen:
            continue

        seen.add(key)
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

    index = build_index(points, args.source, str(args.input))
    geojson = build_geojson(points, args.source)

    for target in (output_dir, live_output_dir):
        write_outputs(target, args.source, points, index, geojson, args.compact)

    if args.fail_empty and not points:
        raise SystemExit(
            f"mapplotter produced zero points from {len(nodes)} input nodes"
        )

    print(
        f"mapplotter complete: source={args.source}, "
        f"nodes={len(nodes)}, points={len(points)}, output={output_dir}, live={live_output_dir}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
