#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import ipaddress
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


SCHEMA = "zzx-bitnodes-map-vectors-v4"

STATUS_ORDER = [
    "sanctioned-node",
    "policy-restricted-node",
    "high-threat-infrastructure",
    "duplicate-location",
    "unreachable",
    "reachable-now",
    "reachable-24h",
    "not-yet-synced",
    "stable-1w-plus",
    "stable-48h-plus",
    "synced-10m-plus",
    "synced",
    "unknown",
]

NETWORK_ORDER = ["ipv4", "ipv6", "cjdns", "tor", "i2p", "dns", "unknown"]

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}

BITNODES_ROW_FIELDS = [
    "protocol_version",
    "user_agent",
    "connected_since",
    "services",
    "height",
    "hostname",
    "city",
    "country",
    "latitude",
    "longitude",
    "timezone",
    "asn",
    "organization",
    "provider",
    "county",
    "zip",
    "w3w",
    "geohash",
    "asn_location",
    "metadata",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback

        if path.name.endswith(".gz"):
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

    return " ".join(text.split())


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        if value in ("", None):
            return fallback
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if not math.isfinite(n):
        return fallback

    return n


def integer(value: Any, fallback: int = 0) -> int:
    n = number(value)
    return fallback if n is None else int(n)


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
        "listed",
        "hit",
        "confirmed",
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


def flag(point: Mapping[str, Any], keys: tuple[str, ...]) -> bool:
    return any(boolish(first(point, (key,))) is True for key in keys)


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


def split_port(address: Any, fallback: int = 8333) -> int:
    text = str(address or "").strip()

    if text.startswith("[") and "]" in text:
        rest = text[text.index("]") + 1:]
        if rest.startswith(":") and rest[1:].isdigit():
            return int(rest[1:])

    lower = text.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        port = text.rsplit(":", 1)[1]
        return int(port) if port.isdigit() else fallback

    if text.count(":") == 1:
        port = text.rsplit(":", 1)[1]
        return int(port) if port.isdigit() else fallback

    return fallback


def row_to_point(address: str, row: Any) -> dict[str, Any] | None:
    if isinstance(row, Mapping):
        point = dict(row)
        point.setdefault("address", address)
        return point

    if not isinstance(row, list):
        return None

    padded = list(row) + [None] * max(0, len(BITNODES_ROW_FIELDS) - len(row))
    metadata = padded[19] if isinstance(padded[19], Mapping) else {}

    point = {
        "address": address,
        "protocol_version": padded[0],
        "protocol": padded[0],
        "user_agent": padded[1],
        "agent": padded[1],
        "connected_since": padded[2],
        "services": padded[3],
        "height": padded[4],
        "hostname": padded[5],
        "host": padded[5],
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

    for key, value in metadata.items():
        point.setdefault(key, value)

    return point


def extract_points_from_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        output = []
        for index, item in enumerate(payload):
            point = row_to_point(str(index), item)
            if point:
                output.append(point)
        return output

    if not isinstance(payload, Mapping):
        return []

    vectors = payload.get("vectors")
    if isinstance(vectors, Mapping):
        nested = extract_points_from_payload(vectors)
        if nested:
            return nested

    for key in ("points", "rows", "results", "data", "peers", "node_records", "reachable_nodes"):
        value = payload.get(key)

        if isinstance(value, list):
            output = []
            for index, item in enumerate(value):
                point = row_to_point(str(index), item)
                if point:
                    output.append(point)
            if output:
                return output

        if isinstance(value, Mapping):
            return extract_points_from_payload({"nodes": value})

    nodes = payload.get("nodes")

    if isinstance(nodes, Mapping):
        output = []
        for address, row in nodes.items():
            point = row_to_point(str(address), row)
            if point:
                output.append(point)
        return output

    if isinstance(nodes, list):
        return extract_points_from_payload(nodes)

    features = payload.get("features")
    if isinstance(features, list):
        output = []
        for index, feature in enumerate(features):
            if not isinstance(feature, Mapping):
                continue

            props = feature.get("properties") if isinstance(feature.get("properties"), Mapping) else {}
            geom = feature.get("geometry") if isinstance(feature.get("geometry"), Mapping) else {}
            coords = geom.get("coordinates") if isinstance(geom.get("coordinates"), list) else []

            row = dict(props)
            row.setdefault("address", props.get("address") or feature.get("id") or f"feature-{index:08d}")

            if len(coords) >= 2:
                row.setdefault("longitude", coords[0])
                row.setdefault("latitude", coords[1])

            output.append(row)

        return output

    return []


def color_for_status(status: str) -> str:
    return {
        "sanctioned-node": "#ff0000",
        "policy-restricted-node": "#ff3b30",
        "high-threat-infrastructure": "#ff0000",
        "duplicate-location": "#d95c5c",
        "unreachable": "#d95c5c",
        "reachable-now": "#c0d674",
        "reachable-24h": "#e6a42b",
        "not-yet-synced": "#9d67ad",
        "stable-1w-plus": "#9fdb6d",
        "stable-48h-plus": "#c0d674",
        "synced-10m-plus": "#e6a42b",
        "synced": "#edf7b9",
        "unknown": "#8c927e",
    }.get(status, "#8c927e")


def color_for_network(network: str) -> str:
    return {
        "ipv4": "#c0d674",
        "ipv6": "#70b7ff",
        "cjdns": "#00d1b2",
        "tor": "#9d67ad",
        "i2p": "#b889ff",
        "dns": "#edf7b9",
        "unknown": "#8c927e",
    }.get(network, "#8c927e")


def priority_for_status(status: str) -> int:
    return {
        "sanctioned-node": 120,
        "policy-restricted-node": 115,
        "high-threat-infrastructure": 110,
        "duplicate-location": 95,
        "unreachable": 85,
        "not-yet-synced": 75,
        "reachable-now": 70,
        "stable-1w-plus": 68,
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
        "address_family",
    ))).lower()

    if network:
        return network if network in NETWORK_ORDER else "unknown"

    address = clean(first(point, ("address", "node", "addr", "host", "hostname", "ip"))).lower()
    host = split_host(address)

    if ".onion" in address or boolish(first(point, ("is_tor", "tor", "tor.is_tor", "metadata.is_tor", "metadata.tor"))) is True:
        return "tor"

    if ".i2p" in address or boolish(first(point, ("is_i2p", "i2p", "i2p.is_i2p", "metadata.is_i2p", "metadata.i2p"))) is True:
        return "i2p"

    if boolish(first(point, ("is_cjdns", "cjdns", "ipv6.is_cjdns_ipv6", "metadata.is_cjdns"))) is True:
        return "cjdns"

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

    if boolish(first(point, ("is_ipv6", "metadata.is_ipv6"))) is True or ":" in host:
        return "ipv6"

    if boolish(first(point, ("is_ipv4", "metadata.is_ipv4"))) is True or host.count(".") == 3:
        return "ipv4"

    return "dns" if host else "unknown"


def threat_level(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "threat_level",
        "tag_threat_level",
        "threat_infrastructure.threat_level",
        "tag_attribution.threat_level",
        "metadata.threat_level",
    ))).lower() or "none"


def normalize_status(point: Mapping[str, Any]) -> str:
    raw_status = clean(first(point, ("status", "metadata.status"))).lower().replace("_", "-")

    if raw_status in STATUS_ORDER:
        return raw_status

    if flag(point, ("is_sanctioned_node", "is_sanctioned", "sanctions_data.is_sanctioned", "metadata.is_sanctioned_node")):
        return "sanctioned-node"

    if flag(point, ("is_policy_restricted_node", "policy_restricted", "sanctions_data.is_policy_restricted")):
        return "policy-restricted-node"

    if flag(point, ("is_threat_infrastructure", "suspected_threat_infrastructure", "threat_infrastructure.is_threat_infrastructure")) or threat_level(point) in {"confirmed", "high"}:
        return "high-threat-infrastructure"

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


def row_lat_lon(point: Mapping[str, Any], network: str) -> tuple[float | None, float | None, str]:
    candidates = (
        (
            first(point, ("latitude", "lat", "geo_lat", "dbip_latitude")),
            first(point, ("longitude", "lon", "lng", "geo_lon", "dbip_longitude")),
            "direct",
        ),
        (
            first(point, ("geoloc.latitude", "geoloc.lat")),
            first(point, ("geoloc.longitude", "geoloc.lon", "geoloc.lng")),
            "geoloc",
        ),
        (
            first(point, ("geoip.latitude", "geoip.lat")),
            first(point, ("geoip.longitude", "geoip.lon", "geoip.lng")),
            "geoip",
        ),
        (
            first(point, ("geoip_data.latitude", "geoip_data.lat")),
            first(point, ("geoip_data.longitude", "geoip_data.lon", "geoip_data.lng")),
            "geoip_data",
        ),
        (
            first(point, ("geo.latitude", "geo.lat")),
            first(point, ("geo.longitude", "geo.lon", "geo.lng")),
            "geo",
        ),
        (
            first(point, ("location.latitude", "location.lat")),
            first(point, ("location.longitude", "location.lon", "location.lng")),
            "location",
        ),
        (
            first(point, ("metadata.latitude", "metadata.lat")),
            first(point, ("metadata.longitude", "metadata.lon", "metadata.lng")),
            "metadata",
        ),
        (
            first(point, ("metadata.geoip.latitude", "metadata.geoip.lat")),
            first(point, ("metadata.geoip.longitude", "metadata.geoip.lon", "metadata.geoip.lng")),
            "metadata.geoip",
        ),
        (
            first(point, ("enrichment.geoip.latitude", "enrichment.geoip.lat")),
            first(point, ("enrichment.geoip.longitude", "enrichment.geoip.lon", "enrichment.geoip.lng")),
            "enrichment.geoip",
        ),
    )

    for lat_raw, lon_raw, source in candidates:
        lat = number(lat_raw)
        lon = number(lon_raw)

        if lat is None or lon is None:
            continue

        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return lat, lon, source

    if network == "tor":
        return 0.0, -32.0, "symbolic.tor_atlantic_channel"

    if network == "i2p":
        return 0.0, 32.0, "symbolic.i2p_indian_ocean_channel"

    return None, None, ""


def normalize_point(point: Mapping[str, Any]) -> dict[str, Any] | None:
    network = normalize_network(point)
    lat, lon, coord_source = row_lat_lon(point, network)

    if lat is None or lon is None:
        return None

    status = normalize_status(point)
    address = clean(first(point, ("address", "node", "addr", "host", "hostname", "ip")))
    host = clean(first(point, ("host", "hostname"))) or split_host(address)

    is_sanctioned = flag(point, (
        "is_sanctioned",
        "is_sanctioned_node",
        "sanctions_data.is_sanctioned",
        "metadata.is_sanctioned",
        "metadata.is_sanctioned_node",
    ))

    is_policy_restricted = flag(point, (
        "policy_restricted",
        "is_policy_restricted_node",
        "sanctions_data.is_policy_restricted",
        "metadata.is_policy_restricted_node",
    ))

    is_threat_infrastructure = flag(point, (
        "is_threat_infrastructure",
        "suspected_threat_infrastructure",
        "threat_infrastructure.is_threat_infrastructure",
        "metadata.is_threat_infrastructure",
    ))

    level = threat_level(point)
    marker_color = clean(first(point, ("marker_color", "color", "threat_color", "tag_threat_color", "threat_infrastructure.map.threat_color")))

    if not marker_color:
        marker_color = color_for_status(status) if status in STATUS_ORDER else color_for_network(network)

    output = dict(point)
    output["id"] = clean(first(point, ("id", "node_id"))) or address or f"{lat:.6f},{lon:.6f}"
    output["address"] = address
    output["host"] = host
    output["port"] = integer(first(point, ("port", "metadata.port")), split_port(address))
    output["latitude"] = lat
    output["longitude"] = lon
    output["lat"] = lat
    output["lon"] = lon
    output["coordinate_source"] = coord_source
    output["network"] = network
    output["status"] = status
    output["status_label"] = clean(point.get("status_label")) or status.replace("-", " ").title()
    output["color"] = marker_color
    output["marker_color"] = marker_color
    output["priority"] = integer(point.get("priority"), priority_for_status(status))
    output["duplicate_count"] = integer(point.get("duplicate_count"), 1)

    output["country"] = clean(first(point, ("country", "country_code", "country_data.country_code", "geoip.country_code"))) or "Unknown"
    output["country_code"] = clean(first(point, ("country_code", "country_data.country_code", "geoip.country_code"))) or output["country"]
    output["country_name"] = clean(first(point, ("country_name", "country_data.country_name", "geoip.country_name")))
    output["continent"] = clean(first(point, ("continent", "continent_data.continent")))
    output["region"] = clean(first(point, ("region", "region_data.region")))
    output["territory"] = clean(first(point, ("territory", "territory_data.territory", "state", "province")))
    output["county"] = clean(first(point, ("county", "county_data.county")))
    output["city"] = clean(first(point, ("city", "city_data.city")))
    output["zip"] = clean(first(point, ("zip", "postal_code", "postal_data.postal_code")))
    output["postal_code"] = clean(first(point, ("postal_code", "zip", "postal_data.postal_code")))
    output["timezone"] = clean(first(point, ("timezone", "iana_timezone", "timezone_data.timezone")))

    output["asn"] = clean(first(point, ("asn", "asn_data.asn", "geoip.asn")))
    output["organization"] = clean(first(point, ("organization", "org", "organization_data.organization", "geoip.organization")))
    output["provider"] = clean(first(point, ("provider", "provider_data.provider", "geoip.provider")))
    output["agent"] = clean(first(point, ("agent", "user_agent", "subver")))

    output["height"] = first(point, ("height", "block_height"))
    output["latency_ms"] = first(point, ("latency_ms", "metadata.latency_ms"))
    output["peer_index"] = first(point, ("peer_index", "metadata.peer_index"))
    output["services"] = first(point, ("services",))
    output["protocol"] = first(point, ("protocol", "protocol_version", "version"))

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

    output["is_vpn"] = flag(point, ("is_vpn", "vpn", "suspected_vpn", "vpn_data.is_vpn", "vpn_data.suspected_vpn", "metadata.is_vpn", "metadata.suspected_vpn"))
    output["is_proxy"] = flag(point, ("is_proxy", "proxy", "suspected_proxy", "proxy_data.is_proxy", "proxy_data.suspected_proxy", "metadata.is_proxy", "metadata.suspected_proxy"))
    output["is_datacenter"] = flag(point, ("is_datacenter", "datacenter", "datacenter_data.is_datacenter", "provider_data.is_datacenter", "metadata.is_datacenter"))
    output["is_government"] = flag(point, ("is_government", "government", "government_data.is_government", "organization_data.is_government", "metadata.is_government"))
    output["is_military"] = flag(point, ("is_military", "military", "military_data.is_military", "organization_data.is_military", "metadata.is_military"))

    output["is_sanctioned"] = is_sanctioned
    output["is_sanctioned_node"] = is_sanctioned
    output["is_policy_restricted_node"] = is_policy_restricted
    output["is_threat_infrastructure"] = is_threat_infrastructure
    output["confirmed_intelligence_match"] = flag(point, ("confirmed_intelligence_match", "threat_infrastructure.confirmed_intelligence_match", "metadata.confirmed_intelligence_match"))
    output["suspected_threat_actor_group_related"] = flag(point, ("suspected_threat_actor_group_related", "tag_attribution.suspected_threat_actor_group_related"))
    output["is_known_malactor"] = flag(point, ("is_known_malactor", "knownmalactor.is_known_malactor", "known_malactor_data.is_known_malactor", "metadata.is_known_malactor"))

    output["threat_level"] = level
    output["threat_color"] = clean(first(point, ("threat_color", "tag_threat_color", "threat_infrastructure.map.threat_color"))) or marker_color

    output["marker_ring"] = (
        boolish(point.get("marker_ring")) is True
        or is_sanctioned
        or is_policy_restricted
        or is_threat_infrastructure
        or level in {"confirmed", "high"}
    )

    output["geohash"] = clean(first(point, ("geohash", "geohashid_data.geohash", "metadata.geohash")))
    output["geohashid"] = clean(first(point, ("geohashid", "geohashid_data.geohashid", "metadata.geohashid")))
    output["w3w"] = clean(first(point, ("w3w", "what3words", "w3w_data.w3w", "metadata.w3w")))
    output["what3words"] = clean(first(point, ("what3words", "w3w", "w3w_data.words")))
    output["zzxgcs"] = clean(first(point, ("zzxgcs", "zzxgcs_data.zzxgcs", "metadata.zzxgcs")))

    return output


def point_key(point: Mapping[str, Any], precision: int = 4) -> str:
    return f"{float(point['latitude']):.{precision}f},{float(point['longitude']):.{precision}f}"


def sorted_counts(counter: Counter[str]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))


def count_by(points: list[dict[str, Any]], key: str) -> dict[str, int]:
    return sorted_counts(Counter(clean(point.get(key)) or "Unknown" for point in points))


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

        clusters.append(
            {
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
                "marker_ring": any(row.get("marker_ring") for row in rows),
                "statuses": statuses,
                "networks": networks,
                "countries": countries,
            }
        )

    return sorted(
        clusters,
        key=lambda item: (-int(item["point_count"]), -int(item["priority"]), item["id"]),
    )


def build_bounds(points: list[dict[str, Any]]) -> dict[str, Any]:
    if not points:
        return {
            "has_bounds": False,
            "south": None,
            "west": None,
            "north": None,
            "east": None,
            "center": {"latitude": 20.0, "longitude": 0.0},
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
        "center": {"latitude": (south + north) / 2.0, "longitude": (west + east) / 2.0},
    }


def build_heatmap(points: list[dict[str, Any]]) -> list[list[float]]:
    heat = []

    for point in points:
        duplicate_count = number(point.get("duplicate_count"), 1) or 1
        priority = number(point.get("priority"), 10) or 10

        if point.get("marker_ring"):
            priority += 40

        intensity = max(0.2, min(1.0, (duplicate_count / 8.0) + (priority / 180.0)))

        heat.append([float(point["latitude"]), float(point["longitude"]), round(float(intensity), 4)])

    return heat


def build_legend() -> dict[str, dict[str, Any]]:
    return {
        "sanctioned-node": {
            "color": "#ff0000",
            "label": "Sanctioned / Restricted Nation Node",
            "description": "Local sanctioned-jurisdiction policy classifier. Red marker ring.",
            "marker_ring": True,
        },
        "policy-restricted-node": {
            "color": "#ff3b30",
            "label": "Policy Restricted Node",
            "description": "Local policy-restricted classification. Red-orange marker ring.",
            "marker_ring": True,
        },
        "high-threat-infrastructure": {
            "color": "#ff0000",
            "label": "Confirmed / High Threat Infrastructure",
            "description": "Defensive threat-infrastructure correlation. Not country-to-APT attribution.",
            "marker_ring": True,
        },
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
        "stable-1w-plus": {
            "color": "#9fdb6d",
            "label": "Synced / Uptime Over 1 Week",
            "description": "Synced node with long observed uptime.",
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


def annotate_duplicates(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    location_counts: dict[str, int] = {}

    for point in points:
        key = point_key(point, precision=4)
        location_counts[key] = location_counts.get(key, 0) + 1

    output = []

    for point in points:
        item = dict(point)
        key = point_key(point, precision=4)
        duplicate_count = max(integer(item.get("duplicate_count"), 1), location_counts.get(key, 1))
        item["duplicate_count"] = duplicate_count

        if duplicate_count > 1 and item.get("status") not in {
            "sanctioned-node",
            "policy-restricted-node",
            "high-threat-infrastructure",
            "unreachable",
        }:
            item["status"] = "duplicate-location"
            item["status_label"] = "Duplicate Location"
            item["color"] = color_for_status("duplicate-location")
            item["marker_color"] = color_for_status("duplicate-location")
            item["priority"] = priority_for_status("duplicate-location")

        output.append(item)

    return output


def build_vectors(vectors: dict[str, Any]) -> dict[str, Any]:
    raw_points = extract_points_from_payload(vectors)

    points = [
        normalized
        for point in raw_points
        if isinstance(point, Mapping)
        for normalized in [normalize_point(point)]
        if normalized is not None
    ]

    points = annotate_duplicates(points)

    points = sorted(
        points,
        key=lambda item: (
            -int(bool(item.get("marker_ring"))),
            -int(item.get("priority", 0)),
            item.get("network", ""),
            item.get("country", ""),
            item.get("city", ""),
            item.get("address", ""),
        ),
    )

    return {
        **vectors,
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "updated_at": utc_now(),
        "point_count": len(points),
        "bounds": build_bounds(points),
        "network_counts": count_by(points, "network"),
        "status_counts": count_by(points, "status"),
        "country_counts": count_by(points, "country"),
        "agent_counts": count_by(points, "agent"),
        "provider_counts": count_by(points, "provider"),
        "asn_counts": count_by(points, "asn"),
        "organization_counts": count_by(points, "organization"),
        "intelligence_counts": {
            "vpn_nodes": count_flag(points, "is_vpn"),
            "proxy_nodes": count_flag(points, "is_proxy"),
            "datacenter_nodes": count_flag(points, "is_datacenter"),
            "government_nodes": count_flag(points, "is_government"),
            "military_nodes": count_flag(points, "is_military"),
            "sanctioned_nodes": count_flag(points, "is_sanctioned_node"),
            "policy_restricted_nodes": count_flag(points, "is_policy_restricted_node"),
            "threat_infrastructure_nodes": count_flag(points, "is_threat_infrastructure"),
            "confirmed_intelligence_match_nodes": count_flag(points, "confirmed_intelligence_match"),
            "threat_actor_nodes": count_flag(points, "suspected_threat_actor_group_related"),
            "known_malactor_nodes": count_flag(points, "is_known_malactor"),
        },
        "clusters": {
            "precision_1": cluster_points(points, precision=1),
            "precision_2": cluster_points(points, precision=2),
            "precision_3": cluster_points(points, precision=3),
        },
        "heatmap": build_heatmap(points),
        "legend": build_legend(),
        "red_ring_semantics": {
            "is_sanctioned_node": "red marker ring",
            "is_policy_restricted_node": "red-orange marker ring",
            "confirmed_or_high_threat": "red marker/ring",
        },
        "false_positive_control": {
            "threat_infrastructure": "defensive infrastructure correlation only",
            "threat_actor_labels": "explicit trusted metadata/feed labels only",
            "no_country_to_apt_inference": True,
        },
        "points": points,
        "vectors": {"points": points},
    }


def build_geojson(vectors: Mapping[str, Any]) -> dict[str, Any]:
    points = vectors.get("points", [])

    if not isinstance(points, list):
        points = []

    return {
        "type": "FeatureCollection",
        "schema": "zzx-bitnodes-map-vectors-geojson-v4",
        "name": "ZZX Bitnodes Map Vectors",
        "generated_at": utc_now(),
        "updated_at": utc_now(),
        "source": vectors.get("source", "zzxbitnodes"),
        "features": [
            {
                "type": "Feature",
                "id": point.get("id") or point.get("address"),
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(point["longitude"]), float(point["latitude"])],
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
    vectors_payload = output.get("vectors", payload)

    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    built = build_vectors(vectors_payload)

    output["vectors"] = built
    output["geojson"] = build_geojson(built)

    return output


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return build(payload, context)


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
        payload = {"points": extract_points_from_payload(payload)}

    vectors_payload = payload.get("vectors", payload)

    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    vectors_payload.setdefault("source", source)

    if "points" not in vectors_payload:
        generated_points = extract_points_from_payload(payload)
        vectors_payload["points"] = generated_points

    built = build_vectors(vectors_payload)
    built["source"] = source

    geojson = build_geojson(built)

    write_json(output_path, built, compact=compact)
    write_json(geojson_path, geojson, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapvectors-build-report-v4",
        "generated_at": utc_now(),
        "input": str(input_path),
        "output": str(output_path),
        "geojson": str(geojson_path),
        "point_count": built["point_count"],
        "source": source,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map vector, cluster, heatmap, and GeoJSON payloads.",
        allow_abbrev=False,
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
