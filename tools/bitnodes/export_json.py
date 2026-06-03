#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import ipaddress
import json
import math
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Callable


APP_ROOT = Path(__file__).resolve().parents[2]


def utc_now() -> int:
    return int(time.time())


def utc_iso(ts: int | None = None) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts or utc_now()))


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any, pretty: bool = True, sort_keys: bool = False) -> None:
    mkdir(path.parent)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
            ensure_ascii=False,
            sort_keys=sort_keys,
        )
        handle.write("\n")


def write_gzip_json(path: Path, payload: Any, pretty: bool = False, sort_keys: bool = False) -> None:
    mkdir(path.parent)

    with gzip.open(path, "wt", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
            ensure_ascii=False,
            sort_keys=sort_keys,
        )
        handle.write("\n")


def safe_number(value: Any) -> float | None:
    try:
        n = float(value)
    except Exception:
        return None

    if math.isnan(n) or math.isinf(n):
        return None

    return n


def safe_int(value: Any) -> int | None:
    try:
        if value in ("", None):
            return None
        return int(value)
    except Exception:
        return None


def boolish(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    text = str(value or "").strip().lower()

    if text in {"true", "yes", "y", "on", "ok", "up", "online", "reachable", "connected", "success"}:
        return True

    if text in {"false", "no", "n", "off", "down", "offline", "unreachable", "failed", "fail", "timeout", "error"}:
        return False

    return None


def truthy(value: Any) -> bool:
    return boolish(value) is True


def safe_name(value: Any) -> str:
    text = str(value or "unknown").strip() or "unknown"

    for char in ['/', '\\', ':', '*', '?', '"', '<', '>', '|', ' ', '[', ']']:
        text = text.replace(char, "_")

    while "__" in text:
        text = text.replace("__", "_")

    return text.strip("_") or "unknown"


def deep_get(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if "." not in key:
            if key in row:
                return row.get(key)
            continue

        current: Any = row
        ok = True

        for part in key.split("."):
            if not isinstance(current, dict) or part not in current:
                ok = False
                break
            current = current.get(part)

        if ok:
            return current

    return None


def first_value(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = deep_get(row, key)
        if value not in ("", None, [], {}):
            return value
    return None


def split_address(address: str) -> tuple[str, int | None]:
    value = str(address or "").strip()

    if value.startswith("[") and "]:" in value:
        host = value.split("]:", 1)[0].lstrip("[")
        return host, safe_int(value.rsplit(":", 1)[1])

    if value.startswith("[") and value.endswith("]"):
        return value[1:-1], None

    lower = value.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        host, port_text = value.rsplit(":", 1)
        return host, safe_int(port_text)

    if value.count(":") == 1 and "." in value:
        host, port_text = value.rsplit(":", 1)
        return host, safe_int(port_text)

    if value.count(":") > 1:
        possible_host, possible_port = value.rsplit(":", 1)

        if possible_port.isdigit():
            try:
                ipaddress.ip_address(possible_host.strip("[]"))
                return possible_host.strip("[]"), int(possible_port)
            except ValueError:
                pass

    return value.strip("[]"), None


def classify_network(address: str, metadata: dict[str, Any] | None = None) -> str:
    metadata = metadata or {}
    host, _port = split_address(address)
    host = str(host or "").strip().lower()

    network = metadata.get("network")
    if network in {"ipv4", "ipv6", "tor", "i2p", "cjdns", "dns"}:
        return str(network)

    if metadata.get("is_tor") or metadata.get("tor") or host.endswith(".onion"):
        return "tor"

    if metadata.get("is_i2p") or metadata.get("i2p") or host.endswith(".i2p"):
        return "i2p"

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        if metadata.get("is_ipv6"):
            return "ipv6"
        if metadata.get("is_ipv4"):
            return "ipv4"
        return "dns" if host else "unknown"

    if ip.version == 4:
        return "ipv4"

    if ip.version == 6:
        if ip in ipaddress.ip_network("fc00::/8"):
            return "cjdns"
        return "ipv6"

    return "unknown"


def metadata_from_row(row: list[Any]) -> dict[str, Any]:
    if len(row) > 19 and isinstance(row[19], dict):
        return dict(row[19])

    return {}


def normalize_node_array(row: list[Any]) -> list[Any]:
    output = list(row)

    while len(output) < 20:
        output.append(None)

    if not isinstance(output[19], dict):
        output[19] = {}

    return output


def normalize_reachable(row: dict[str, Any]) -> bool | None:
    for key in ("reachable", "reachable_now", "connected", "online", "success"):
        value = boolish(row.get(key))
        if value is not None:
            return value

    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}

    for key in ("reachable", "reachable_now", "connected", "success"):
        value = boolish(metadata.get(key))
        if value is not None:
            return value

    peer_health = row.get("peer_health") if isinstance(row.get("peer_health"), dict) else {}

    value = boolish(peer_health.get("reachable"))
    if value is not None:
        return value

    if row.get("last_seen") or metadata.get("last_seen"):
        return True

    if row.get("height") is not None and row.get("agent"):
        return True

    return None


def dict_to_node_array(value: dict[str, Any]) -> list[Any]:
    metadata = dict(value.get("metadata", {})) if isinstance(value.get("metadata"), dict) else {}

    for key in (
        "reachable",
        "reachable_now",
        "reachable_24h",
        "latency_ms",
        "uptime_seconds",
        "total_uptime",
        "daily_latency_ms",
        "weekly_latency_ms",
        "monthly_latency_ms",
        "daily_uptime_seconds",
        "weekly_uptime_seconds",
        "monthly_uptime_seconds",
        "success_count",
        "failure_count",
        "first_seen",
        "last_seen",
        "last_failure",
        "peer_index",
        "peer_health",
        "is_proxy",
        "suspected_proxy",
        "is_vpn",
        "suspected_vpn",
        "is_tor",
        "suspected_tor",
        "is_i2p",
        "suspected_i2p",
        "is_ipv4",
        "is_ipv6",
        "is_cjdns",
        "proxy",
        "vpn",
        "tor",
        "i2p",
        "network",
        "is_sanctioned_node",
        "is_policy_restricted_node",
        "policy_restricted",
        "policy_watch",
        "jurisdiction_risk_level",
        "continent",
        "region",
        "territory",
        "county",
        "city",
        "zip",
        "postal_code",
        "timezone",
        "provider_kind",
        "network_classification",
        "organization_type",
        "suspected_government",
        "suspected_military",
        "suspected_datacenter",
        "suspected_apt_related",
        "suspected_threat_actor_group_related",
        "suspected_known_malicious_actor",
    ):
        if key in value and key not in metadata:
            metadata[key] = value.get(key)

    for nested_key in (
        "ip",
        "ipv4",
        "ipv6",
        "tor",
        "i2p",
        "proxy",
        "vpn",
        "isp",
        "provider_data",
        "asn_data",
        "organization_data",
        "government",
        "military",
        "datacenter",
        "apt_attribution",
        "tag_attribution",
        "known_malactor",
    ):
        if nested_key in value and nested_key not in metadata:
            metadata[nested_key] = value.get(nested_key)

    return [
        value.get("protocol_version") or value.get("protocol") or value.get("version"),
        value.get("user_agent") or value.get("agent") or value.get("subver") or "unknown",
        value.get("connected_since") or value.get("timestamp") or value.get("seen_at") or value.get("last_seen") or utc_now(),
        value.get("services") or value.get("service_bits"),
        value.get("height") or value.get("start_height") or value.get("latest_height"),
        value.get("hostname") or value.get("host"),
        value.get("city") or metadata.get("city"),
        value.get("country_code") or value.get("country"),
        value.get("latitude") or value.get("lat"),
        value.get("longitude") or value.get("lon") or value.get("lng"),
        value.get("timezone") or value.get("tz") or metadata.get("timezone"),
        value.get("asn"),
        value.get("organization") or value.get("org"),
        value.get("provider"),
        value.get("county") or metadata.get("county"),
        value.get("zip") or value.get("postal_code") or metadata.get("zip"),
        value.get("w3w") or value.get("what3words"),
        value.get("geohash") or value.get("geohashid"),
        value.get("asn_location"),
        metadata,
    ]


def normalize_nodes_object(raw: Any) -> dict[str, list[Any]]:
    nodes: dict[str, list[Any]] = {}

    if isinstance(raw, dict):
        if isinstance(raw.get("nodes"), dict):
            raw = raw["nodes"]

        for address, value in raw.items():
            if isinstance(value, list):
                nodes[str(address)] = normalize_node_array(value)
            elif isinstance(value, dict):
                node_address = value.get("address") or value.get("node") or value.get("addr") or address
                nodes[str(node_address)] = dict_to_node_array(value)

    elif isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue

            address = item.get("address") or item.get("node") or item.get("addr") or item.get("host")

            if address:
                nodes[str(address)] = dict_to_node_array(item)

    return {
        str(address).strip(): normalize_node_array(row)
        for address, row in nodes.items()
        if str(address).strip()
    }


def load_snapshot(input_path: Path) -> dict[str, Any]:
    payload = read_json(input_path)

    if not isinstance(payload, dict):
        raise ValueError("Bitnodes export input must be a JSON object.")

    nodes = payload.get("nodes")

    if isinstance(nodes, (list, dict)):
        payload["nodes"] = normalize_nodes_object(nodes)
    else:
        for key in ("rows", "results", "data", "node_records", "reachable", "unreachable", "peers"):
            if isinstance(payload.get(key), list):
                payload["nodes"] = normalize_nodes_object(payload[key])
                break
        else:
            payload["nodes"] = {}

    return payload


def normalize_node(address: str, values: list[Any], rank: int | None = None) -> dict[str, Any]:
    row = normalize_node_array(values)
    metadata = metadata_from_row(row)
    host, port = split_address(address)
    network = classify_network(address, metadata)

    item = {
        "rank": rank,
        "address": address,
        "host": host,
        "port": port,
        "network": network,
        "protocol": row[0],
        "protocol_version": row[0],
        "agent": row[1],
        "user_agent": row[1],
        "connected_since": row[2],
        "services": row[3],
        "height": row[4],
        "hostname": row[5],
        "city": row[6] or metadata.get("city"),
        "country": row[7],
        "country_code": row[7],
        "latitude": row[8],
        "longitude": row[9],
        "timezone": row[10] or metadata.get("timezone"),
        "asn": row[11],
        "organization": row[12],
        "provider": row[13],
        "county": row[14] or metadata.get("county"),
        "zip": row[15] or metadata.get("zip"),
        "postal_code": row[15] or metadata.get("postal_code") or metadata.get("zip"),
        "w3w": row[16],
        "what3words": row[16],
        "geohash": row[17],
        "geohashid": row[17] or metadata.get("geohashid"),
        "asn_location": row[18],
        "latency_ms": metadata.get("latency_ms"),
        "uptime_human": metadata.get("uptime_human"),
        "uptime_seconds": metadata.get("total_uptime") or metadata.get("uptime_seconds"),
        "total_uptime": metadata.get("total_uptime") or metadata.get("uptime_seconds"),
        "daily_latency_ms": metadata.get("daily_latency_ms"),
        "weekly_latency_ms": metadata.get("weekly_latency_ms"),
        "monthly_latency_ms": metadata.get("monthly_latency_ms"),
        "daily_uptime_seconds": metadata.get("daily_uptime_seconds"),
        "weekly_uptime_seconds": metadata.get("weekly_uptime_seconds"),
        "monthly_uptime_seconds": metadata.get("monthly_uptime_seconds"),
        "peer_index": metadata.get("peer_index"),
        "peer_health": metadata.get("peer_health"),
        "reachable_now": boolish(metadata.get("reachable_now")),
        "reachable_24h": boolish(metadata.get("reachable_24h")),
        "tor": truthy(metadata.get("tor")) or truthy(metadata.get("is_tor")) or network == "tor",
        "i2p": truthy(metadata.get("i2p")) or truthy(metadata.get("is_i2p")) or network == "i2p",
        "is_tor": truthy(metadata.get("is_tor")) or truthy(metadata.get("tor")) or network == "tor",
        "is_i2p": truthy(metadata.get("is_i2p")) or truthy(metadata.get("i2p")) or network == "i2p",
        "is_ipv4": truthy(metadata.get("is_ipv4")) or network == "ipv4",
        "is_ipv6": truthy(metadata.get("is_ipv6")) or network == "ipv6",
        "is_cjdns": truthy(metadata.get("is_cjdns")) or network == "cjdns",
        "is_proxy": truthy(metadata.get("proxy")) or truthy(metadata.get("is_proxy")) or truthy(metadata.get("suspected_proxy")),
        "suspected_proxy": truthy(metadata.get("proxy")) or truthy(metadata.get("is_proxy")) or truthy(metadata.get("suspected_proxy")),
        "is_vpn": truthy(metadata.get("vpn")) or truthy(metadata.get("is_vpn")) or truthy(metadata.get("suspected_vpn")),
        "suspected_vpn": truthy(metadata.get("vpn")) or truthy(metadata.get("is_vpn")) or truthy(metadata.get("suspected_vpn")),
        "is_sanctioned_node": truthy(metadata.get("is_sanctioned_node")),
        "is_policy_restricted_node": truthy(metadata.get("is_policy_restricted_node")) or truthy(metadata.get("policy_restricted")),
        "policy_restricted": truthy(metadata.get("policy_restricted")) or truthy(metadata.get("is_policy_restricted_node")),
        "policy_watch": truthy(metadata.get("policy_watch")),
        "jurisdiction_risk_level": metadata.get("jurisdiction_risk_level"),
        "continent": metadata.get("continent"),
        "region": metadata.get("region"),
        "territory": metadata.get("territory"),
        "success_count": metadata.get("success_count"),
        "failure_count": metadata.get("failure_count"),
        "first_seen": metadata.get("first_seen"),
        "last_seen": metadata.get("last_seen"),
        "last_failure": metadata.get("last_failure"),
        "provider_kind": metadata.get("provider_kind") or deep_get(metadata, "provider_data.provider_kind"),
        "network_classification": metadata.get("network_classification") or deep_get(metadata, "isp.network_classification"),
        "organization_type": metadata.get("organization_type") or deep_get(metadata, "organization_data.organization_type"),
        "suspected_government": truthy(metadata.get("suspected_government")) or truthy(deep_get(metadata, "government.suspected_government")),
        "suspected_military": truthy(metadata.get("suspected_military")) or truthy(deep_get(metadata, "military.suspected_military")),
        "suspected_datacenter": truthy(metadata.get("suspected_datacenter")) or truthy(deep_get(metadata, "datacenter.suspected_datacenter")),
        "suspected_apt_related": truthy(metadata.get("suspected_apt_related")) or truthy(deep_get(metadata, "apt_attribution.suspected_apt_related")),
        "apt_attribution_score": metadata.get("apt_attribution_score") or deep_get(metadata, "apt_attribution.apt_attribution_score"),
        "apt_attribution_confidence": metadata.get("apt_attribution_confidence") or deep_get(metadata, "apt_attribution.apt_attribution_confidence"),
        "suspected_threat_actor_group_related": truthy(metadata.get("suspected_threat_actor_group_related")) or truthy(deep_get(metadata, "tag_attribution.suspected_threat_actor_group_related")),
        "tag_attribution_score": metadata.get("tag_attribution_score") or deep_get(metadata, "tag_attribution.tag_attribution_score"),
        "tag_attribution_confidence": metadata.get("tag_attribution_confidence") or deep_get(metadata, "tag_attribution.tag_attribution_confidence"),
        "suspected_known_malicious_actor": truthy(metadata.get("suspected_known_malicious_actor")) or truthy(deep_get(metadata, "known_malactor.suspected_known_malicious_actor")),
        "known_malactor_score": metadata.get("known_malactor_score") or deep_get(metadata, "known_malactor.known_malactor_score"),
        "known_malactor_confidence": metadata.get("known_malactor_confidence") or deep_get(metadata, "known_malactor.known_malactor_confidence"),
        "metadata": metadata,
    }

    item["reachable"] = normalize_reachable(item)

    return item


def node_rows(nodes: dict[str, list[Any]]) -> list[dict[str, Any]]:
    rows = [normalize_node(address, values) for address, values in nodes.items()]

    rows.sort(
        key=lambda row: (
            row.get("peer_index") or 0,
            row.get("height") or 0,
            row.get("address") or "",
        ),
        reverse=True,
    )

    for index, row in enumerate(rows, start=1):
        row["rank"] = index

    return rows


def average(values) -> float | None:
    numbers = [safe_number(value) for value in values]
    numbers = [value for value in numbers if value is not None]

    if not numbers:
        return None

    return round(statistics.mean(numbers), 4)


def max_or_none(values) -> Any:
    items = [value for value in values if value not in ("", None)]

    if not items:
        return None

    try:
        return max(items)
    except Exception:
        return None


def most_common(values) -> Any:
    counter = Counter()

    for value in values:
        if value not in ("", None):
            counter[str(value)] += 1

    if not counter:
        return None

    return counter.most_common(1)[0][0]


def counter_top(values, limit: int = 25) -> list[dict[str, Any]]:
    counter = Counter()

    for value in values:
        if value not in ("", None):
            counter[str(value)] += 1

    return [{"value": key, "count": count} for key, count in counter.most_common(limit)]


def group_rows(rows: list[dict[str, Any]], key_name: str, unknown: str = "Unknown") -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for row in rows:
        key = row.get(key_name) or unknown
        grouped[str(key)].append(row)

    return grouped


def summarize_group(name: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "name": name,
        "total_nodes": len(rows),
        "reachable_nodes": sum(1 for row in rows if row.get("reachable") is True),
        "reachable_now": sum(1 for row in rows if row.get("reachable_now") is True),
        "reachable_24h": sum(1 for row in rows if row.get("reachable_24h") is True),
        "unreachable_nodes": sum(1 for row in rows if row.get("reachable") is False),
        "known_nodes": len(rows),
        "tor_nodes": sum(1 for row in rows if row.get("tor")),
        "i2p_nodes": sum(1 for row in rows if row.get("i2p")),
        "ipv4_nodes": sum(1 for row in rows if row.get("network") == "ipv4"),
        "ipv6_nodes": sum(1 for row in rows if row.get("network") == "ipv6"),
        "cjdns_nodes": sum(1 for row in rows if row.get("network") == "cjdns"),
        "vpn_nodes": sum(1 for row in rows if row.get("is_vpn")),
        "proxy_nodes": sum(1 for row in rows if row.get("is_proxy")),
        "sanctioned_nodes": sum(1 for row in rows if row.get("is_sanctioned_node")),
        "policy_restricted_nodes": sum(1 for row in rows if row.get("is_policy_restricted_node")),
        "government_nodes": sum(1 for row in rows if row.get("suspected_government")),
        "military_nodes": sum(1 for row in rows if row.get("suspected_military")),
        "datacenter_nodes": sum(1 for row in rows if row.get("suspected_datacenter")),
        "apt_related_nodes": sum(1 for row in rows if row.get("suspected_apt_related")),
        "threat_actor_group_related_nodes": sum(1 for row in rows if row.get("suspected_threat_actor_group_related")),
        "known_malactor_nodes": sum(1 for row in rows if row.get("suspected_known_malicious_actor")),
        "avg_latency_ms": average(row.get("latency_ms") for row in rows),
        "latest_height": max_or_none(row.get("height") for row in rows),
        "top_agent": most_common(row.get("agent") for row in rows),
        "top_asn": most_common(row.get("asn") for row in rows),
        "top_organization": most_common(row.get("organization") for row in rows),
        "top_provider": most_common(row.get("provider") for row in rows),
        "top_port": most_common(row.get("port") for row in rows),
    }


def build_group_payload(rows: list[dict[str, Any]], key_name: str, total_name: str, unknown: str = "Unknown") -> dict[str, Any]:
    grouped = group_rows(rows, key_name, unknown=unknown)

    results = [
        {
            **summarize_group(name, entries),
            key_name: name,
            "nodes": entries,
        }
        for name, entries in grouped.items()
    ]

    results.sort(key=lambda item: item["total_nodes"], reverse=True)

    return {
        "updated_at": utc_iso(),
        total_name: len(results),
        "total_nodes": len(rows),
        "results": results,
    }


def build_city_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for row in rows:
        city = row.get("city") or "Unknown"
        country = row.get("country") or "??"
        grouped[f"{city}, {country}"].append(row)

    results = []

    for key, entries in grouped.items():
        city, country = key.rsplit(", ", 1)

        results.append({
            **summarize_group(key, entries),
            "city": city,
            "country": country,
            "nodes": entries,
        })

    results.sort(key=lambda item: item["total_nodes"], reverse=True)

    return {
        "updated_at": utc_iso(),
        "total_cities": len(results),
        "total_nodes": len(rows),
        "results": results,
    }


def build_subset_payload(rows: list[dict[str, Any]], predicate: Callable[[dict[str, Any]], bool], total_key: str) -> dict[str, Any]:
    selected = [row for row in rows if predicate(row)]

    return {
        "updated_at": utc_iso(),
        total_key: len(selected),
        "total_nodes": len(selected),
        "results": selected,
    }


def build_coordinates_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    selected = []

    for row in rows:
        lat = safe_number(row.get("latitude"))
        lon = safe_number(row.get("longitude"))

        if lat is None or lon is None:
            continue

        selected.append({
            "address": row.get("address"),
            "host": row.get("host"),
            "port": row.get("port"),
            "network": row.get("network"),
            "country": row.get("country"),
            "continent": row.get("continent"),
            "region": row.get("region"),
            "territory": row.get("territory"),
            "city": row.get("city"),
            "county": row.get("county"),
            "zip": row.get("zip"),
            "latitude": lat,
            "longitude": lon,
            "asn": row.get("asn"),
            "organization": row.get("organization"),
            "provider": row.get("provider"),
            "geohash": row.get("geohash"),
            "geohashid": row.get("geohashid"),
            "w3w": row.get("w3w"),
            "tor": row.get("tor"),
            "i2p": row.get("i2p"),
            "reachable": row.get("reachable"),
            "reachable_now": row.get("reachable_now"),
            "reachable_24h": row.get("reachable_24h"),
            "peer_index": row.get("peer_index"),
        })

    return {
        "updated_at": utc_iso(),
        "total_coordinates": len(selected),
        "results": selected,
    }


def build_geojson_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    features = []

    for row in rows:
        lat = safe_number(row.get("latitude"))
        lon = safe_number(row.get("longitude"))

        if lat is None or lon is None:
            continue

        properties = dict(row)
        properties.pop("metadata", None)

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat],
            },
            "properties": properties,
        })

    return {
        "type": "FeatureCollection",
        "schema": "zzx-bitnodes-map-points-v1",
        "generated_at": utc_iso(),
        "source": "zzxbitnodes",
        "node_count": len(rows),
        "feature_count": len(features),
        "features": features,
    }


def build_latency_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "updated_at": utc_iso(),
        "nodes": {
            row["address"]: {
                "daily_latency": [{"t": utc_iso(), "v": row.get("latency_ms")}],
                "latency_ms": row.get("latency_ms"),
                "daily_latency_ms": row.get("daily_latency_ms"),
                "weekly_latency_ms": row.get("weekly_latency_ms"),
                "monthly_latency_ms": row.get("monthly_latency_ms"),
            }
            for row in rows
        },
    }


def calculate_peer_index(row: dict[str, Any]) -> float:
    latency = safe_number(row.get("latency_ms"))
    success_count = safe_number(row.get("success_count")) or 0
    failure_count = safe_number(row.get("failure_count")) or 0

    latency_score = 0.0

    if latency is not None:
        latency_score = max(0.0, 100.0 - min(100.0, latency / 5.0))

    reliability_total = success_count + failure_count
    reliability_score = (success_count / reliability_total) * 100.0 if reliability_total > 0 else 0.0
    height_score = 25.0 if row.get("height") else 0.0
    services_score = 25.0 if row.get("services") else 0.0
    reachable_score = 50.0 if row.get("reachable") is True else 0.0

    return round(latency_score + reliability_score + height_score + services_score + reachable_score, 4)


def build_peer_health_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    results = []

    for row in rows:
        peer_index = row.get("peer_index")

        if peer_index is None:
            peer_index = calculate_peer_index(row)

        item = dict(row)
        item["peer_index"] = peer_index
        results.append(item)

    results.sort(key=lambda item: item.get("peer_index") or 0, reverse=True)

    return {
        "updated_at": utc_iso(),
        "results": results,
    }


def build_leaderboard_payload(peer_health: dict[str, Any], limit: int | None = None) -> dict[str, Any]:
    rows = []

    source_rows = peer_health.get("results", [])

    if limit:
        source_rows = source_rows[:limit]

    for index, entry in enumerate(source_rows, start=1):
        item = dict(entry)
        item["rank"] = index
        item["node"] = item.get("address")
        rows.append(item)

    return {
        "updated_at": utc_iso(),
        "count": len(rows),
        "results": rows,
    }


def build_heights_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counter = Counter()

    for row in rows:
        height = row.get("height")

        if height is not None:
            counter[str(height)] += 1

    results = [{"height": safe_int(height), "nodes": count} for height, count in counter.most_common()]
    results.sort(key=lambda item: item["height"] or 0, reverse=True)

    return {
        "updated_at": utc_iso(),
        "count": len(results),
        "latest_height": results[0]["height"] if results else None,
        "results": results,
    }


def build_dns_seeder_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    records = {"A": [], "AAAA": [], "TXT": []}

    for row in rows:
        host = row.get("host")

        if not host:
            continue

        if row.get("tor") or row.get("i2p"):
            records["TXT"].append(host)
        elif row.get("network") in {"ipv6", "cjdns"}:
            records["AAAA"].append(host)
        elif row.get("network") == "ipv4":
            records["A"].append(host)

    for key in records:
        records[key] = sorted(set(records[key]))

    return {
        "updated_at": utc_iso(),
        "records": records,
        "counts": {key: len(value) for key, value in records.items()},
    }


def build_propagation_payload(payload: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    heights = [safe_int(row.get("height")) for row in rows]
    heights = [height for height in heights if height is not None]

    latest_height = max(heights) if heights else None
    median_height = statistics.median(heights) if heights else None
    at_tip = sum(1 for height in heights if height == latest_height) if latest_height is not None else 0

    return {
        "updated_at": utc_iso(),
        "latest_height": latest_height,
        "median_height": median_height,
        "nodes_at_tip": at_tip,
        "total_height_samples": len(heights),
        "tip_convergence_percent": round((at_tip / len(heights)) * 100.0, 6) if heights else 0.0,
        "changes": payload.get("changes", {}),
    }


def build_counts(rows: list[dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
    reachable = sum(1 for row in rows if row.get("reachable") is True)
    unreachable = sum(1 for row in rows if row.get("reachable") is False)
    reachable_now = sum(1 for row in rows if row.get("reachable_now") is True)
    reachable_24h = sum(1 for row in rows if row.get("reachable_24h") is True)

    return {
        "total": len(rows),
        "known": len(rows),
        "reachable": payload.get("reachable_nodes", reachable),
        "reachable_now": payload.get("reachable_now", reachable_now),
        "reachable_24h": payload.get("reachable_24h", reachable_24h),
        "unreachable": payload.get("unreachable_nodes", unreachable),
        "ambiguous": max(0, len(rows) - reachable - unreachable),
        "ipv4": sum(1 for row in rows if row.get("network") == "ipv4"),
        "ipv6": sum(1 for row in rows if row.get("network") == "ipv6"),
        "cjdns": sum(1 for row in rows if row.get("network") == "cjdns"),
        "tor": sum(1 for row in rows if row.get("tor")),
        "i2p": sum(1 for row in rows if row.get("i2p")),
        "vpn": sum(1 for row in rows if row.get("is_vpn")),
        "proxy": sum(1 for row in rows if row.get("is_proxy")),
        "sanctioned": sum(1 for row in rows if row.get("is_sanctioned_node")),
        "policy_restricted": sum(1 for row in rows if row.get("is_policy_restricted_node")),
        "government": sum(1 for row in rows if row.get("suspected_government")),
        "military": sum(1 for row in rows if row.get("suspected_military")),
        "datacenter": sum(1 for row in rows if row.get("suspected_datacenter")),
        "apt_related": sum(1 for row in rows if row.get("suspected_apt_related")),
        "threat_actor_group_related": sum(1 for row in rows if row.get("suspected_threat_actor_group_related")),
        "known_malactor": sum(1 for row in rows if row.get("suspected_known_malicious_actor")),
        "countries": len({row.get("country") for row in rows if row.get("country")}),
        "cities": len({row.get("city") for row in rows if row.get("city")}),
        "asns": len({row.get("asn") for row in rows if row.get("asn")}),
        "agents": len({row.get("agent") for row in rows if row.get("agent")}),
        "organizations": len({row.get("organization") for row in rows if row.get("organization")}),
        "providers": len({row.get("provider") for row in rows if row.get("provider")}),
    }


def build_registry_statistics(rows: list[dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
    counts = build_counts(rows, payload)

    return {
        "schema": "zzx-bitnodes-registry-statistics-v2",
        "updated_at": utc_iso(),
        "known_nodes": counts["known"],
        "reachable_nodes": counts["reachable"],
        "reachable_now": counts["reachable_now"],
        "reachable_24h": counts["reachable_24h"],
        "unreachable_nodes": counts["unreachable"],
        "ipv4_nodes": counts["ipv4"],
        "ipv6_nodes": counts["ipv6"],
        "cjdns_nodes": counts["cjdns"],
        "tor_nodes": counts["tor"],
        "i2p_nodes": counts["i2p"],
        "vpn_nodes": counts["vpn"],
        "proxy_nodes": counts["proxy"],
        "sanctioned_nodes": counts["sanctioned"],
        "policy_restricted_nodes": counts["policy_restricted"],
        "government_nodes": counts["government"],
        "military_nodes": counts["military"],
        "datacenter_nodes": counts["datacenter"],
        "apt_related_nodes": counts["apt_related"],
        "threat_actor_group_related_nodes": counts["threat_actor_group_related"],
        "known_malactor_nodes": counts["known_malactor"],
        "countries": counts["countries"],
        "cities": counts["cities"],
        "asns": counts["asns"],
        "agents": counts["agents"],
        "organizations": counts["organizations"],
        "providers": counts["providers"],
    }


def build_networks_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped = group_rows(rows, "network", unknown="unknown")

    results = [
        {
            **summarize_group(network, entries),
            "network": network,
            "nodes": entries,
        }
        for network, entries in grouped.items()
    ]

    results.sort(key=lambda item: item["total_nodes"], reverse=True)

    return {
        "updated_at": utc_iso(),
        "total_networks": len(results),
        "total_nodes": len(rows),
        "results": results,
    }


def build_status_payload(payload: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts = build_counts(rows, payload)
    registry_statistics = build_registry_statistics(rows, payload)

    return {
        "schema": "zzx-bitnodes-static-api-status-v5",
        "source": payload.get("source"),
        "timestamp": payload.get("timestamp"),
        "updated_at": payload.get("updated_at") or utc_iso(),
        "mode": payload.get("mode"),
        "total_nodes": payload.get("total_nodes", len(rows)),
        "known_nodes": payload.get("known_nodes", counts["known"]),
        "reachable_nodes": payload.get("reachable_nodes", counts["reachable"]),
        "unreachable_nodes": payload.get("unreachable_nodes", counts["unreachable"]),
        "reachable_now": counts["reachable_now"],
        "reachable_24h": counts["reachable_24h"],
        "stale_nodes": payload.get("stale_nodes"),
        "latest_height": payload.get("latest_height"),
        "countries_count": counts["countries"],
        "cities_count": counts["cities"],
        "asns_count": counts["asns"],
        "tor_nodes": counts["tor"],
        "i2p_nodes": counts["i2p"],
        "vpn_nodes": counts["vpn"],
        "proxy_nodes": counts["proxy"],
        "sanctioned_nodes": counts["sanctioned"],
        "policy_restricted_nodes": counts["policy_restricted"],
        "government_nodes": counts["government"],
        "military_nodes": counts["military"],
        "datacenter_nodes": counts["datacenter"],
        "apt_related_nodes": counts["apt_related"],
        "threat_actor_group_related_nodes": counts["threat_actor_group_related"],
        "known_malactor_nodes": counts["known_malactor"],
        "rows_exported": len(rows),
        "summary": payload.get("summary", {}),
        "counts": counts,
        "registry_statistics": registry_statistics,
        "top": {
            "countries": counter_top(row.get("country") for row in rows),
            "cities": counter_top(row.get("city") for row in rows),
            "agents": counter_top(row.get("agent") for row in rows),
            "asns": counter_top(row.get("asn") for row in rows),
            "organizations": counter_top(row.get("organization") for row in rows),
            "providers": counter_top(row.get("provider") for row in rows),
            "ports": counter_top(row.get("port") for row in rows),
            "networks": counter_top(row.get("network") for row in rows),
            "provider_kinds": counter_top(row.get("provider_kind") for row in rows),
            "organization_types": counter_top(row.get("organization_type") for row in rows),
            "network_classifications": counter_top(row.get("network_classification") for row in rows),
        },
        "changes": payload.get("changes", {}),
        "api": {
            "latest": "./latest.json",
            "nodes": "./nodes.json",
            "reachable": "./reachable.json",
            "unreachable": "./unreachable.json",
            "reachable_now": "./reachable-now.json",
            "reachable_24h": "./reachable-24h.json",
            "countries": "./countries.json",
            "continents": "./continents.json",
            "regions": "./regions.json",
            "territories": "./territories.json",
            "counties": "./counties.json",
            "cities": "./cities.json",
            "zipcodes": "./zipcodes.json",
            "timezones": "./timezones.json",
            "asns": "./asns.json",
            "agents": "./agents.json",
            "versions": "./versions.json",
            "ports": "./ports.json",
            "services": "./services.json",
            "organizations": "./organizations.json",
            "providers": "./providers.json",
            "provider_kinds": "./provider-kinds.json",
            "organization_types": "./organization-types.json",
            "network_classifications": "./network-classifications.json",
            "networks": "./networks.json",
            "ipv4": "./ipv4.json",
            "ipv6": "./ipv6.json",
            "cjdns": "./cjdns.json",
            "tor": "./tor.json",
            "i2p": "./i2p.json",
            "vpn": "./vpn.json",
            "proxy": "./proxy.json",
            "sanctioned": "./sanctioned.json",
            "policy_restricted": "./policy-restricted.json",
            "government": "./government.json",
            "military": "./military.json",
            "datacenter": "./datacenter.json",
            "apt_attribution": "./apt-attribution.json",
            "tag_attribution": "./tag-attribution.json",
            "known_malactor": "./known-malactor.json",
            "coordinates": "./coordinates.json",
            "geojson": "./maps/nodes.geojson",
            "latency": "./latency.json",
            "peer_health": "./peer-health.json",
            "leaderboard": "./leaderboard.json",
            "heights": "./heights.json",
            "dns_seeder": "./dns-seeder.json",
            "propagation": "./propagation.json",
            "registry_statistics": "./registry-statistics.json",
            "status": "./status.json",
        },
    }


def build_latest_payload(payload: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    latest = dict(payload)
    latest["rows"] = rows
    latest["counts"] = build_counts(rows, payload)
    latest["registry_statistics"] = build_registry_statistics(rows, payload)
    return latest


def write_node_files(output_dir: Path, rows: list[dict[str, Any]], pretty: bool) -> None:
    node_dir = output_dir / "nodes"
    mkdir(node_dir)

    for row in rows:
        host = row.get("host") or "unknown"
        port = row.get("port") or "unknown"
        write_json(node_dir / f"{safe_name(host)}-{safe_name(port)}.json", row, pretty=pretty)


def write_group_files(output_dir: Path, group_name: str, group_payload: dict[str, Any], pretty: bool) -> None:
    group_dir = output_dir / group_name
    mkdir(group_dir)

    singular = {
        "countries": "country",
        "continents": "continent",
        "regions": "region",
        "territories": "territory",
        "counties": "county",
        "cities": "city",
        "zipcodes": "zip",
        "timezones": "timezone",
        "asns": "asn",
        "agents": "agent",
        "versions": "protocol",
        "ports": "port",
        "services": "services",
        "organizations": "organization",
        "providers": "provider",
        "provider-kinds": "provider_kind",
        "organization-types": "organization_type",
        "network-classifications": "network_classification",
        "networks": "network",
        "geohashes": "geohash",
        "what3words": "w3w",
    }.get(group_name, "name")

    for item in group_payload.get("results", []):
        name = item.get(singular) or item.get("name") or "unknown"
        write_json(group_dir / f"{safe_name(name)}.json", item, pretty=pretty)


def build_widget_payloads(rows: list[dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
    counts = build_counts(rows, payload)

    return {
        "widget-node-counts.json": {
            "updated_at": utc_iso(),
            "known": counts["known"],
            "reachable": counts["reachable"],
            "reachable_now": counts["reachable_now"],
            "reachable_24h": counts["reachable_24h"],
            "unreachable": counts["unreachable"],
        },
        "widget-network-counts.json": {
            "updated_at": utc_iso(),
            "ipv4": counts["ipv4"],
            "ipv6": counts["ipv6"],
            "cjdns": counts["cjdns"],
            "tor": counts["tor"],
            "i2p": counts["i2p"],
            "vpn": counts["vpn"],
            "proxy": counts["proxy"],
        },
        "widget-risk-counts.json": {
            "updated_at": utc_iso(),
            "government": counts["government"],
            "military": counts["military"],
            "datacenter": counts["datacenter"],
            "apt_related": counts["apt_related"],
            "threat_actor_group_related": counts["threat_actor_group_related"],
            "known_malactor": counts["known_malactor"],
            "policy_restricted": counts["policy_restricted"],
        },
        "widget-heights.json": build_heights_payload(rows),
        "widget-countries.json": build_group_payload(rows, "country", "total_countries", unknown="??"),
        "widget-agents.json": build_group_payload(rows, "agent", "total_agents", unknown="UNKNOWN"),
    }


def export_all(
    input_path: Path,
    output_dir: Path,
    source: str | None = None,
    pretty: bool = True,
    archive_dir: Path | None = None,
    gzip_archive: bool = True,
) -> None:
    payload = load_snapshot(input_path)

    if source:
        payload["source"] = source

    mkdir(output_dir)

    nodes = payload.get("nodes", {})
    rows = node_rows(nodes)

    peer_health = build_peer_health_payload(rows)
    leaderboard = build_leaderboard_payload(peer_health)

    exports = {
        "latest.json": build_latest_payload(payload, rows),
        "nodes.json": {
            "updated_at": utc_iso(),
            "total_nodes": len(rows),
            "results": rows,
            "nodes": nodes,
        },
        "reachable.json": build_subset_payload(rows, lambda row: row.get("reachable") is True, "total_reachable_nodes"),
        "unreachable.json": build_subset_payload(rows, lambda row: row.get("reachable") is False, "total_unreachable_nodes"),
        "reachable-now.json": build_subset_payload(rows, lambda row: row.get("reachable_now") is True, "total_reachable_now_nodes"),
        "reachable-24h.json": build_subset_payload(rows, lambda row: row.get("reachable_24h") is True, "total_reachable_24h_nodes"),
        "countries.json": build_group_payload(rows, "country", "total_countries", unknown="??"),
        "continents.json": build_group_payload(rows, "continent", "total_continents"),
        "regions.json": build_group_payload(rows, "region", "total_regions"),
        "territories.json": build_group_payload(rows, "territory", "total_territories"),
        "counties.json": build_group_payload(rows, "county", "total_counties"),
        "cities.json": build_city_payload(rows),
        "zipcodes.json": build_group_payload(rows, "zip", "total_zipcodes"),
        "timezones.json": build_group_payload(rows, "timezone", "total_timezones"),
        "asns.json": build_group_payload(rows, "asn", "total_asns", unknown="UNKNOWN"),
        "agents.json": build_group_payload(rows, "agent", "total_agents", unknown="UNKNOWN"),
        "versions.json": build_group_payload(rows, "protocol", "total_versions", unknown="UNKNOWN"),
        "ports.json": build_group_payload(rows, "port", "total_ports", unknown="UNKNOWN"),
        "services.json": build_group_payload(rows, "services", "total_service_sets", unknown="UNKNOWN"),
        "organizations.json": build_group_payload(rows, "organization", "total_organizations", unknown="UNKNOWN"),
        "providers.json": build_group_payload(rows, "provider", "total_providers", unknown="UNKNOWN"),
        "provider-kinds.json": build_group_payload(rows, "provider_kind", "total_provider_kinds", unknown="unknown"),
        "organization-types.json": build_group_payload(rows, "organization_type", "total_organization_types", unknown="unknown"),
        "network-classifications.json": build_group_payload(rows, "network_classification", "total_network_classifications", unknown="unknown"),
        "networks.json": build_networks_payload(rows),
        "ipv4.json": build_subset_payload(rows, lambda row: row.get("network") == "ipv4", "total_ipv4_nodes"),
        "ipv6.json": build_subset_payload(rows, lambda row: row.get("network") == "ipv6", "total_ipv6_nodes"),
        "cjdns.json": build_subset_payload(rows, lambda row: row.get("network") == "cjdns", "total_cjdns_nodes"),
        "tor.json": build_subset_payload(rows, lambda row: row.get("tor"), "total_tor_nodes"),
        "i2p.json": build_subset_payload(rows, lambda row: row.get("i2p"), "total_i2p_nodes"),
        "vpn.json": build_subset_payload(rows, lambda row: row.get("is_vpn"), "total_vpn_nodes"),
        "proxy.json": build_subset_payload(rows, lambda row: row.get("is_proxy"), "total_proxy_nodes"),
        "sanctioned.json": build_subset_payload(rows, lambda row: row.get("is_sanctioned_node"), "total_sanctioned_nodes"),
        "policy-restricted.json": build_subset_payload(rows, lambda row: row.get("is_policy_restricted_node"), "total_policy_restricted_nodes"),
        "government.json": build_subset_payload(rows, lambda row: row.get("suspected_government"), "total_government_nodes"),
        "military.json": build_subset_payload(rows, lambda row: row.get("suspected_military"), "total_military_nodes"),
        "datacenter.json": build_subset_payload(rows, lambda row: row.get("suspected_datacenter"), "total_datacenter_nodes"),
        "apt-attribution.json": build_subset_payload(rows, lambda row: row.get("suspected_apt_related"), "total_apt_related_nodes"),
        "tag-attribution.json": build_subset_payload(rows, lambda row: row.get("suspected_threat_actor_group_related"), "total_threat_actor_group_related_nodes"),
        "known-malactor.json": build_subset_payload(rows, lambda row: row.get("suspected_known_malicious_actor"), "total_known_malactor_nodes"),
        "geohashes.json": build_group_payload(rows, "geohash", "total_geohashes"),
        "what3words.json": build_group_payload(rows, "w3w", "total_what3words"),
        "coordinates.json": build_coordinates_payload(rows),
        "latency.json": build_latency_payload(rows),
        "peer-health.json": peer_health,
        "leaderboard.json": leaderboard,
        "leaderboard-top-100.json": build_leaderboard_payload(peer_health, 100),
        "leaderboard-top-1000.json": build_leaderboard_payload(peer_health, 1000),
        "leaderboard-top-10000.json": build_leaderboard_payload(peer_health, 10000),
        "heights.json": build_heights_payload(rows),
        "dns-seeder.json": build_dns_seeder_payload(rows),
        "propagation.json": build_propagation_payload(payload, rows),
        "registry-statistics.json": build_registry_statistics(rows, payload),
    }

    exports.update(build_widget_payloads(rows, payload))
    exports["status.json"] = build_status_payload(payload, rows)
    exports["index.json"] = exports["status.json"]

    exports["snapshots.json"] = {
        "source": payload.get("source"),
        "timestamp": payload.get("timestamp"),
        "updated_at": payload.get("updated_at"),
        "latest": "./latest.json",
        "count": 1,
        "results": [
            {
                "timestamp": payload.get("timestamp"),
                "updated_at": payload.get("updated_at"),
                "url": "./latest.json",
                "total_nodes": payload.get("total_nodes", len(rows)),
                "reachable_nodes": payload.get("reachable_nodes"),
                "reachable_now": payload.get("reachable_now"),
                "reachable_24h": payload.get("reachable_24h"),
                "latest_height": payload.get("latest_height"),
            }
        ],
    }

    for filename, export_payload in exports.items():
        write_json(output_dir / filename, export_payload, pretty=pretty)

    maps_dir = output_dir / "maps"
    mkdir(maps_dir)
    write_json(maps_dir / "nodes.geojson", build_geojson_payload(rows), pretty=pretty)
    write_json(maps_dir / "coordinates.json", build_coordinates_payload(rows), pretty=pretty)
    write_json(maps_dir / "live-map.json", build_coordinates_payload(rows), pretty=pretty)

    write_node_files(output_dir, rows, pretty=pretty)

    for group_name in [
        "countries",
        "continents",
        "regions",
        "territories",
        "counties",
        "cities",
        "zipcodes",
        "timezones",
        "asns",
        "agents",
        "versions",
        "ports",
        "services",
        "organizations",
        "providers",
        "provider-kinds",
        "organization-types",
        "network-classifications",
        "networks",
        "geohashes",
        "what3words",
    ]:
        write_group_files(output_dir, group_name, exports[f"{group_name}.json"], pretty=pretty)

    if archive_dir:
        mkdir(archive_dir)

        timestamp = payload.get("timestamp", utc_now())
        archive_payload = build_latest_payload(payload, rows)
        archive_path = archive_dir / f"{timestamp}.json"

        write_json(archive_path, archive_payload, pretty=pretty)

        if gzip_archive:
            write_gzip_json(archive_path.with_suffix(".json.gz"), archive_payload, pretty=False)


def main() -> int:
    parser = argparse.ArgumentParser(description="Export ZZX-Labs Bitnodes static API JSON files.")

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="bitcoin/bitnodes/api")
    parser.add_argument("--source", default=None)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--archive-dir", default="bitcoin/bitnodes/archive")
    parser.add_argument("--no-archive", action="store_true")
    parser.add_argument("--no-gzip", action="store_true")

    args = parser.parse_args()

    export_all(
        input_path=Path(args.input),
        output_dir=Path(args.output),
        source=args.source,
        pretty=not args.compact,
        archive_dir=None if args.no_archive else Path(args.archive_dir),
        gzip_archive=not args.no_gzip,
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
