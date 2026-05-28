#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import math
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]

NODE_FIELDS = [
    "protocol",
    "agent",
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


def safe_name(value: Any) -> str:
    text = str(value or "unknown").strip() or "unknown"

    for char in ['/', '\\', ':', '*', '?', '"', '<', '>', '|', ' ', '[', ']']:
        text = text.replace(char, "_")

    while "__" in text:
        text = text.replace("__", "_")

    return text.strip("_") or "unknown"


def split_address(address: str) -> tuple[str, int | None]:
    value = str(address or "").strip()

    if value.startswith("[") and "]:" in value:
        host = value.split("]:", 1)[0].lstrip("[")

        try:
            port = int(value.rsplit(":", 1)[1])
        except Exception:
            port = None

        return host, port

    if value.startswith("[") and value.endswith("]"):
        return value[1:-1], None

    if ".onion:" in value or ".i2p:" in value:
        host, port_text = value.rsplit(":", 1)

        try:
            port = int(port_text)
        except Exception:
            port = None

        return host, port

    if value.count(":") == 1:
        host, port_text = value.rsplit(":", 1)

        try:
            port = int(port_text)
        except Exception:
            port = None

        return host, port

    return value, None


def classify_network(address: str) -> str:
    host, _port = split_address(address)
    host = str(host or "").lower()

    if host.endswith(".onion"):
        return "tor"

    if host.endswith(".i2p"):
        return "i2p"

    if ":" in host:
        return "ipv6"

    if host.count(".") == 3:
        return "ipv4"

    return "dns"


def metadata_from_row(row: list[Any]) -> dict[str, Any]:
    if len(row) > 19 and isinstance(row[19], dict):
        return row[19]

    return {}


def normalize_reachable(value: Any, metadata: dict[str, Any]) -> bool | None:
    reachable = metadata.get("reachable")

    if isinstance(reachable, bool):
        return reachable

    if value in {True, 1, "1", "ok", "reachable", "connected", "success"}:
        return True

    if value in {False, 0, "0", "fail", "failed", "unreachable", "timeout", "error"}:
        return False

    return None


def normalize_node(address: str, values: list[Any], rank: int | None = None) -> dict[str, Any]:
    row = list(values)

    while len(row) < 20:
        row.append(None)

    metadata = metadata_from_row(row)
    host, port = split_address(address)

    latency_ms = metadata.get("latency_ms")

    if latency_ms is None and not isinstance(row[19], dict):
        latency_ms = row[19]

    reachable = normalize_reachable(metadata.get("reachable"), metadata)

    is_tor = bool(metadata.get("tor")) or ".onion" in address.lower()
    is_i2p = bool(metadata.get("i2p")) or ".i2p" in address.lower()
    network = classify_network(address)

    return {
        "rank": rank,
        "address": address,
        "host": host,
        "port": port,
        "network": network,
        "reachable": reachable,
        "protocol": row[0],
        "agent": row[1],
        "connected_since": row[2],
        "services": row[3],
        "height": row[4],
        "hostname": row[5],
        "city": row[6],
        "country": row[7],
        "latitude": row[8],
        "longitude": row[9],
        "timezone": row[10],
        "asn": row[11],
        "organization": row[12],
        "provider": row[13],
        "county": row[14],
        "zip": row[15],
        "postal_code": row[15],
        "w3w": row[16],
        "what3words": row[16],
        "geohash": row[17],
        "geohashid": row[17],
        "asn_location": row[18],
        "latency_ms": latency_ms,
        "uptime_human": metadata.get("uptime_human"),
        "uptime_seconds": metadata.get("total_uptime") or metadata.get("uptime_seconds"),
        "peer_index": metadata.get("peer_index"),
        "tor": is_tor,
        "i2p": is_i2p,
        "is_tor": is_tor,
        "is_i2p": is_i2p,
        "is_ipv4": network == "ipv4",
        "is_ipv6": network == "ipv6",
        "is_proxy": bool(metadata.get("proxy") or metadata.get("is_proxy")),
        "is_vpn": bool(metadata.get("vpn") or metadata.get("is_vpn")),
        "success_count": metadata.get("success_count"),
        "failure_count": metadata.get("failure_count"),
        "first_seen": metadata.get("first_seen"),
        "last_seen": metadata.get("last_seen"),
        "metadata": metadata,
    }


def normalize_nodes_object(raw: Any) -> dict[str, list[Any]]:
    nodes: dict[str, list[Any]] = {}

    if isinstance(raw, dict):
        for address, value in raw.items():
            if isinstance(value, list):
                nodes[str(address)] = value
            elif isinstance(value, dict):
                node_address = value.get("address") or value.get("node") or value.get("addr") or address
                nodes[str(node_address)] = dict_to_node_array(value)

    elif isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue

            address = item.get("address") or item.get("node") or item.get("addr")

            if address:
                nodes[str(address)] = dict_to_node_array(item)

    return nodes


def dict_to_node_array(value: dict[str, Any]) -> list[Any]:
    metadata = dict(value.get("metadata", {})) if isinstance(value.get("metadata"), dict) else {}

    for key in (
        "reachable",
        "latency_ms",
        "uptime_seconds",
        "success_count",
        "failure_count",
        "first_seen",
        "last_seen",
        "peer_index",
        "is_proxy",
        "is_vpn",
        "is_tor",
        "is_i2p",
    ):
        if key in value and key not in metadata:
            metadata[key] = value.get(key)

    return [
        value.get("protocol_version") or value.get("protocol") or value.get("version"),
        value.get("user_agent") or value.get("agent") or value.get("subver") or "unknown",
        value.get("connected_since") or value.get("timestamp") or value.get("seen_at") or value.get("last_seen") or utc_now(),
        value.get("services") or value.get("service_bits"),
        value.get("height") or value.get("start_height") or value.get("latest_height"),
        value.get("hostname") or value.get("host"),
        value.get("city"),
        value.get("country_code") or value.get("country"),
        value.get("latitude") or value.get("lat"),
        value.get("longitude") or value.get("lon") or value.get("lng"),
        value.get("timezone") or value.get("tz"),
        value.get("asn"),
        value.get("organization") or value.get("org"),
        value.get("provider"),
        value.get("county"),
        value.get("zip") or value.get("postal_code"),
        value.get("w3w") or value.get("what3words"),
        value.get("geohash") or value.get("geohashid"),
        value.get("asn_location"),
        metadata,
    ]


def load_snapshot(input_path: Path) -> dict[str, Any]:
    payload = read_json(input_path)

    if not isinstance(payload, dict):
        raise ValueError("Bitnodes export input must be a JSON object.")

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        payload["nodes"] = normalize_nodes_object(nodes)

    elif isinstance(nodes, dict):
        payload["nodes"] = normalize_nodes_object(nodes)

    else:
        for key in ("rows", "results", "data", "node_records"):
            if isinstance(payload.get(key), list):
                payload["nodes"] = normalize_nodes_object(payload[key])
                break
        else:
            payload["nodes"] = {}

    return payload


def node_rows(nodes: dict[str, list[Any]]) -> list[dict[str, Any]]:
    rows = [
        normalize_node(address, values)
        for address, values in nodes.items()
    ]

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
    numbers = [
        safe_number(value)
        for value in values
    ]
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

    return [
        {
            "value": key,
            "count": count,
        }
        for key, count in counter.most_common(limit)
    ]


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
        "unreachable_nodes": sum(1 for row in rows if row.get("reachable") is False),
        "known_nodes": len(rows),
        "tor_nodes": sum(1 for row in rows if row.get("tor")),
        "i2p_nodes": sum(1 for row in rows if row.get("i2p")),
        "ipv4_nodes": sum(1 for row in rows if row.get("network") == "ipv4"),
        "ipv6_nodes": sum(1 for row in rows if row.get("network") == "ipv6"),
        "vpn_nodes": sum(1 for row in rows if row.get("is_vpn")),
        "proxy_nodes": sum(1 for row in rows if row.get("is_proxy")),
        "avg_latency_ms": average(row.get("latency_ms") for row in rows),
        "latest_height": max_or_none(row.get("height") for row in rows),
        "top_agent": most_common(row.get("agent") for row in rows),
        "top_asn": most_common(row.get("asn") for row in rows),
        "top_organization": most_common(row.get("organization") for row in rows),
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


def build_country_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return build_group_payload(rows, "country", "total_countries", unknown="??")


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


def build_asn_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return build_group_payload(rows, "asn", "total_asns", unknown="UNKNOWN")


def build_agent_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return build_group_payload(rows, "agent", "total_agents", unknown="UNKNOWN")


def build_version_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return build_group_payload(rows, "protocol", "total_versions", unknown="UNKNOWN")


def build_port_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return build_group_payload(rows, "port", "total_ports", unknown="UNKNOWN")


def build_services_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return build_group_payload(rows, "services", "total_service_sets", unknown="UNKNOWN")


def build_organization_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return build_group_payload(rows, "organization", "total_organizations", unknown="UNKNOWN")


def build_provider_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return build_group_payload(rows, "provider", "total_providers", unknown="UNKNOWN")


def build_subset_payload(rows: list[dict[str, Any]], predicate, total_key: str) -> dict[str, Any]:
    selected = [row for row in rows if predicate(row)]

    return {
        "updated_at": utc_iso(),
        total_key: len(selected),
        "total_nodes": len(selected),
        "results": selected,
    }


def build_coordinates_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    selected = [
        {
            "address": row.get("address"),
            "host": row.get("host"),
            "port": row.get("port"),
            "country": row.get("country"),
            "city": row.get("city"),
            "county": row.get("county"),
            "zip": row.get("zip"),
            "latitude": row.get("latitude"),
            "longitude": row.get("longitude"),
            "asn": row.get("asn"),
            "organization": row.get("organization"),
            "provider": row.get("provider"),
            "geohash": row.get("geohash"),
            "geohashid": row.get("geohashid"),
            "w3w": row.get("w3w"),
            "tor": row.get("tor"),
            "i2p": row.get("i2p"),
        }
        for row in rows
        if row.get("latitude") is not None
        and row.get("longitude") is not None
    ]

    return {
        "updated_at": utc_iso(),
        "total_coordinates": len(selected),
        "results": selected,
    }


def build_latency_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "updated_at": utc_iso(),
        "nodes": {
            row["address"]: {
                "daily_latency": [
                    {
                        "t": utc_iso(),
                        "v": row.get("latency_ms"),
                    }
                ],
                "latency_ms": row.get("latency_ms"),
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
    reliability_score = 0.0

    if reliability_total > 0:
        reliability_score = (success_count / reliability_total) * 100.0

    height_score = 25.0 if row.get("height") else 0.0
    services_score = 25.0 if row.get("services") else 0.0

    return round(latency_score + reliability_score + height_score + services_score, 4)


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


def build_leaderboard_payload(peer_health: dict[str, Any]) -> dict[str, Any]:
    rows = []

    for index, entry in enumerate(peer_health.get("results", []), start=1):
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

    results = [
        {
            "height": safe_int(height),
            "nodes": count,
        }
        for height, count in counter.most_common()
    ]

    results.sort(key=lambda item: item["height"] or 0, reverse=True)

    return {
        "updated_at": utc_iso(),
        "count": len(results),
        "latest_height": results[0]["height"] if results else None,
        "results": results,
    }


def build_dns_seeder_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    records = {
        "A": [],
        "AAAA": [],
        "TXT": [],
    }

    for row in rows:
        host = row.get("host")

        if not host:
            continue

        if row.get("tor") or row.get("i2p"):
            records["TXT"].append(host)
        elif ":" in host:
            records["AAAA"].append(host)
        else:
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

    at_tip = 0

    if latest_height is not None:
        at_tip = sum(1 for height in heights if height == latest_height)

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

    return {
        "total": len(rows),
        "known": len(rows),
        "reachable": payload.get("reachable_nodes", reachable),
        "unreachable": payload.get("unreachable_nodes", unreachable),
        "ambiguous": max(0, len(rows) - reachable - unreachable),
        "ipv4": sum(1 for row in rows if row.get("network") == "ipv4"),
        "ipv6": sum(1 for row in rows if row.get("network") == "ipv6"),
        "tor": sum(1 for row in rows if row.get("tor")),
        "i2p": sum(1 for row in rows if row.get("i2p")),
        "vpn": sum(1 for row in rows if row.get("is_vpn")),
        "proxy": sum(1 for row in rows if row.get("is_proxy")),
    }


def build_status_payload(payload: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts = build_counts(rows, payload)

    return {
        "schema": "zzx-bitnodes-static-api-status-v2",
        "source": payload.get("source"),
        "timestamp": payload.get("timestamp"),
        "updated_at": payload.get("updated_at") or utc_iso(),
        "mode": payload.get("mode"),
        "total_nodes": payload.get("total_nodes", len(rows)),
        "known_nodes": payload.get("known_nodes", counts["known"]),
        "reachable_nodes": payload.get("reachable_nodes", counts["reachable"]),
        "unreachable_nodes": payload.get("unreachable_nodes", counts["unreachable"]),
        "reachable_24h": payload.get("reachable_24h"),
        "stale_nodes": payload.get("stale_nodes"),
        "latest_height": payload.get("latest_height"),
        "countries_count": payload.get("countries_count"),
        "cities_count": payload.get("cities_count"),
        "asns_count": payload.get("asns_count"),
        "tor_nodes": payload.get("tor_nodes", counts["tor"]),
        "i2p_nodes": counts["i2p"],
        "vpn_nodes": counts["vpn"],
        "proxy_nodes": counts["proxy"],
        "rows_exported": len(rows),
        "summary": payload.get("summary", {}),
        "counts": counts,
        "top": {
            "countries": counter_top(row.get("country") for row in rows),
            "cities": counter_top(row.get("city") for row in rows),
            "agents": counter_top(row.get("agent") for row in rows),
            "asns": counter_top(row.get("asn") for row in rows),
            "organizations": counter_top(row.get("organization") for row in rows),
            "providers": counter_top(row.get("provider") for row in rows),
            "ports": counter_top(row.get("port") for row in rows),
        },
        "changes": payload.get("changes", {}),
        "api": {
            "latest": "./latest.json",
            "nodes": "./nodes.json",
            "reachable": "./reachable.json",
            "unreachable": "./unreachable.json",
            "countries": "./countries.json",
            "cities": "./cities.json",
            "asns": "./asns.json",
            "agents": "./agents.json",
            "versions": "./versions.json",
            "ports": "./ports.json",
            "services": "./services.json",
            "organizations": "./organizations.json",
            "providers": "./providers.json",
            "tor": "./tor.json",
            "i2p": "./i2p.json",
            "vpn": "./vpn.json",
            "proxy": "./proxy.json",
            "coordinates": "./coordinates.json",
            "latency": "./latency.json",
            "peer_health": "./peer-health.json",
            "leaderboard": "./leaderboard.json",
            "heights": "./heights.json",
            "dns_seeder": "./dns-seeder.json",
            "propagation": "./propagation.json",
            "status": "./status.json",
        },
    }


def build_latest_payload(payload: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    latest = dict(payload)
    latest["rows"] = rows
    latest["counts"] = build_counts(rows, payload)

    return latest


def write_node_files(output_dir: Path, rows: list[dict[str, Any]], pretty: bool) -> None:
    node_dir = output_dir / "nodes"
    mkdir(node_dir)

    for row in rows:
        host = row.get("host") or "unknown"
        port = row.get("port") or "unknown"

        write_json(
            node_dir / f"{safe_name(host)}-{safe_name(port)}.json",
            row,
            pretty=pretty,
        )


def write_group_files(output_dir: Path, group_name: str, group_payload: dict[str, Any], pretty: bool) -> None:
    group_dir = output_dir / group_name
    mkdir(group_dir)

    for item in group_payload.get("results", []):
        name = (
            item.get(group_name[:-1])
            or item.get("name")
            or item.get("country")
            or item.get("city")
            or item.get("asn")
            or item.get("agent")
            or item.get("protocol")
            or item.get("port")
            or item.get("services")
            or item.get("organization")
            or item.get("provider")
            or "unknown"
        )

        write_json(
            group_dir / f"{safe_name(name)}.json",
            item,
            pretty=pretty,
        )


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
        "countries.json": build_country_payload(rows),
        "cities.json": build_city_payload(rows),
        "asns.json": build_asn_payload(rows),
        "agents.json": build_agent_payload(rows),
        "versions.json": build_version_payload(rows),
        "ports.json": build_port_payload(rows),
        "services.json": build_services_payload(rows),
        "organizations.json": build_organization_payload(rows),
        "providers.json": build_provider_payload(rows),
        "tor.json": build_subset_payload(rows, lambda row: row.get("tor"), "total_tor_nodes"),
        "i2p.json": build_subset_payload(rows, lambda row: row.get("i2p"), "total_i2p_nodes"),
        "vpn.json": build_subset_payload(rows, lambda row: row.get("is_vpn"), "total_vpn_nodes"),
        "proxy.json": build_subset_payload(rows, lambda row: row.get("is_proxy"), "total_proxy_nodes"),
        "coordinates.json": build_coordinates_payload(rows),
        "latency.json": build_latency_payload(rows),
        "peer-health.json": peer_health,
        "leaderboard.json": leaderboard,
        "heights.json": build_heights_payload(rows),
        "dns-seeder.json": build_dns_seeder_payload(rows),
        "propagation.json": build_propagation_payload(payload, rows),
    }

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
                "reachable_24h": payload.get("reachable_24h"),
                "latest_height": payload.get("latest_height"),
            }
        ],
    }

    for filename, export_payload in exports.items():
        write_json(output_dir / filename, export_payload, pretty=pretty)

    write_node_files(output_dir, rows, pretty=pretty)

    for group_name in [
        "countries",
        "cities",
        "asns",
        "agents",
        "versions",
        "ports",
        "services",
        "organizations",
        "providers",
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
    parser = argparse.ArgumentParser(
        description="Export ZZX-Labs Bitnodes static API JSON files."
    )

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
