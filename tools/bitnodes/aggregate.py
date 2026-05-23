#!/usr/bin/env python3
"""
ZZX-Labs Bitnodes aggregation helpers.

Consumes canonical Bitnodes-compatible node dictionaries:

{
    "host:port": [
        protocol_version,
        user_agent,
        connected_since,
        services,
        height,
        hostname,
        city,
        country_code,
        latitude,
        longitude,
        timezone,
        asn,
        organization
    ]
}

Produces aggregate JSON structures for frontend pages and static API endpoints.
"""

from __future__ import annotations

import math
import statistics
import time
from collections import Counter, defaultdict
from typing import Any


NODE_FIELD_NAMES = [
    "protocol_version",
    "user_agent",
    "connected_since",
    "services",
    "height",
    "hostname",
    "city",
    "country_code",
    "latitude",
    "longitude",
    "timezone",
    "asn",
    "organization"
]


def utc_timestamp() -> int:
    return int(time.time())


def utc_iso(ts: int | None = None) -> str:
    if ts is None:
        ts = utc_timestamp()

    return time.strftime(
        "%Y-%m-%dT%H:%M:%SZ",
        time.gmtime(ts)
    )


def fmt_percent(part: int | float, total: int | float) -> float:
    if not total:
        return 0.0

    return round((part / total) * 100.0, 6)


def safe_int(value: Any, default: int | None = None) -> int | None:
    try:
        if value in ("", None):
            return default

        return int(value)
    except (TypeError, ValueError):
        return default


def safe_float(value: Any, default: float | None = None) -> float | None:
    try:
        if value in ("", None):
            return default

        return float(value)
    except (TypeError, ValueError):
        return default


def top_counter_value(counter: Counter[Any]) -> Any:
    if not counter:
        return None

    return counter.most_common(1)[0][0]


def top_counter_count(counter: Counter[Any]) -> int:
    if not counter:
        return 0

    return counter.most_common(1)[0][1]


def top_counter_rows(
    counter: Counter[Any],
    limit: int = 25
) -> list[dict[str, Any]]:

    total = sum(counter.values())

    return [
        {
            "name": name,
            "count": count,
            "percent": fmt_percent(count, total)
        }
        for name, count in counter.most_common(limit)
    ]


def extract_port(address: str) -> str:
    if ".onion" in address:
        parts = address.rsplit(":", 1)

        if len(parts) == 2 and parts[1].isdigit():
            return parts[1]

        return "onion"

    if address.startswith("[") and "]:" in address:
        return address.rsplit("]:", 1)[1]

    parts = address.rsplit(":", 1)

    if len(parts) == 2 and parts[1].isdigit():
        return parts[1]

    return "unknown"


def extract_host(address: str) -> str:
    if address.startswith("[") and "]:" in address:
        return address.split("]:", 1)[0].lstrip("[")

    if ".onion" in address:
        return address.rsplit(":", 1)[0]

    parts = address.rsplit(":", 1)

    if len(parts) == 2 and parts[1].isdigit():
        return parts[0]

    return address


def is_tor_node(address: str, values: list[Any]) -> bool:
    hostname = values[5] if len(values) > 5 else None

    return (
        ".onion" in str(address).lower() or
        ".onion" in str(hostname or "").lower()
    )


def node_array_to_dict(
    address: str,
    values: list[Any]
) -> dict[str, Any]:

    padded = list(values) + [None] * max(
        0,
        len(NODE_FIELD_NAMES) - len(values)
    )

    item = {
        "address": address
    }

    for index, field_name in enumerate(NODE_FIELD_NAMES):
        item[field_name] = padded[index]

    item["port"] = extract_port(address)
    item["host"] = extract_host(address)
    item["is_tor"] = is_tor_node(address, padded)

    return item


def nodes_to_rows(
    nodes: dict[str, list[Any]]
) -> list[dict[str, Any]]:

    return [
        node_array_to_dict(address, values)
        for address, values in nodes.items()
    ]


def make_group_shell(name: str) -> dict[str, Any]:
    return {
        "name": name,
        "nodes": 0,
        "countries": set(),
        "cities": set(),
        "asns": set(),
        "agents": Counter(),
        "versions": Counter(),
        "ports": Counter(),
        "services": Counter(),
        "organizations": Counter(),
        "heights": [],
        "latitudes": [],
        "longitudes": [],
        "tor_nodes": 0
    }


def finalize_group(
    group: dict[str, Any],
    total_nodes: int
) -> dict[str, Any]:

    heights = [
        h for h in group["heights"]
        if isinstance(h, int)
    ]

    latitudes = [
        x for x in group["latitudes"]
        if isinstance(x, (int, float))
    ]

    longitudes = [
        x for x in group["longitudes"]
        if isinstance(x, (int, float))
    ]

    return {
        "name": group["name"],
        "nodes": group["nodes"],
        "percent": fmt_percent(group["nodes"], total_nodes),
        "countries": len(group["countries"]),
        "cities": len(group["cities"]),
        "asns": len(group["asns"]),
        "tor_nodes": group["tor_nodes"],
        "top_agent": top_counter_value(group["agents"]),
        "top_agent_count": top_counter_count(group["agents"]),
        "top_port": top_counter_value(group["ports"]),
        "top_port_count": top_counter_count(group["ports"]),
        "top_service": top_counter_value(group["services"]),
        "top_service_count": top_counter_count(group["services"]),
        "top_organization": top_counter_value(group["organizations"]),
        "top_organization_count": top_counter_count(group["organizations"]),
        "min_height": min(heights) if heights else None,
        "max_height": max(heights) if heights else None,
        "avg_height": round(statistics.mean(heights), 2) if heights else None,
        "avg_latitude": round(statistics.mean(latitudes), 6) if latitudes else None,
        "avg_longitude": round(statistics.mean(longitudes), 6) if longitudes else None
    }


def add_row_to_group(
    group: dict[str, Any],
    row: dict[str, Any]
) -> None:

    group["nodes"] += 1

    country = row.get("country_code")
    city = row.get("city")
    asn = row.get("asn")
    agent = row.get("user_agent")
    port = row.get("port")
    services = row.get("services")
    organization = row.get("organization")
    height = safe_int(row.get("height"))
    latitude = safe_float(row.get("latitude"))
    longitude = safe_float(row.get("longitude"))

    if country:
        group["countries"].add(country)

    if city:
        group["cities"].add(city)

    if asn:
        group["asns"].add(asn)

    if agent:
        group["agents"][agent] += 1
        group["versions"][agent] += 1

    if port:
        group["ports"][port] += 1

    if services is not None:
        group["services"][str(services)] += 1

    if organization:
        group["organizations"][organization] += 1

    if height is not None:
        group["heights"].append(height)

    if latitude is not None:
        group["latitudes"].append(latitude)

    if longitude is not None:
        group["longitudes"].append(longitude)

    if row.get("is_tor"):
        group["tor_nodes"] += 1


def aggregate_by_key(
    nodes: dict[str, list[Any]],
    key_func,
    unknown: str = "Unknown"
) -> list[dict[str, Any]]:

    rows = nodes_to_rows(nodes)
    groups: dict[str, dict[str, Any]] = {}

    for row in rows:
        key = key_func(row) or unknown

        if key not in groups:
            groups[key] = make_group_shell(key)

        add_row_to_group(
            groups[key],
            row
        )

    total = len(rows)

    results = [
        finalize_group(group, total)
        for group in groups.values()
    ]

    results.sort(
        key=lambda item: item["nodes"],
        reverse=True
    )

    return results


def aggregate_countries(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    results = aggregate_by_key(
        nodes,
        lambda row: row.get("country_code")
    )

    return {
        "count": len(results),
        "total_nodes": len(nodes),
        "results": results
    }


def aggregate_cities(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    def key_func(row: dict[str, Any]) -> str:
        city = row.get("city") or "Unknown"
        country = row.get("country_code") or "Unknown"

        return f"{city}, {country}"

    results = aggregate_by_key(
        nodes,
        key_func
    )

    for result in results:
        if ", " in result["name"]:
            city, country = result["name"].rsplit(", ", 1)
        else:
            city, country = result["name"], "Unknown"

        result["city"] = city
        result["country_code"] = country

    return {
        "count": len(results),
        "total_nodes": len(nodes),
        "results": results
    }


def aggregate_asns(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    results = aggregate_by_key(
        nodes,
        lambda row: row.get("asn")
    )

    return {
        "count": len(results),
        "total_nodes": len(nodes),
        "results": results
    }


def aggregate_agents(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    results = aggregate_by_key(
        nodes,
        lambda row: row.get("user_agent")
    )

    return {
        "count": len(results),
        "total_nodes": len(nodes),
        "results": results
    }


def aggregate_versions(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    return aggregate_agents(nodes)


def aggregate_ports(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    results = aggregate_by_key(
        nodes,
        lambda row: row.get("port")
    )

    for result in results:
        result["port"] = result["name"]

    return {
        "count": len(results),
        "total_nodes": len(nodes),
        "results": results
    }


def aggregate_services(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    results = aggregate_by_key(
        nodes,
        lambda row: str(row.get("services"))
        if row.get("services") is not None
        else None
    )

    return {
        "count": len(results),
        "total_nodes": len(nodes),
        "results": results
    }


def aggregate_organizations(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    results = aggregate_by_key(
        nodes,
        lambda row: row.get("organization")
    )

    return {
        "count": len(results),
        "total_nodes": len(nodes),
        "results": results
    }


def aggregate_tor(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    tor_nodes = {
        address: values
        for address, values in nodes.items()
        if is_tor_node(address, values)
    }

    return {
        "count": len(tor_nodes),
        "total_nodes": len(nodes),
        "percent": fmt_percent(len(tor_nodes), len(nodes)),
        "nodes": tor_nodes
    }


def aggregate_dns_seeder(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    records = {
        "A": [],
        "AAAA": [],
        "TXT": []
    }

    for address in nodes:
        host = extract_host(address)

        if ".onion" in host:
            records["TXT"].append(host)
        elif ":" in host:
            records["AAAA"].append(host)
        else:
            records["A"].append(host)

    for key in records:
        records[key] = sorted(set(records[key]))

    return records


def aggregate_heights(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    heights = Counter()

    for _address, values in nodes.items():
        row_height = safe_int(values[4] if len(values) > 4 else None)

        if row_height is not None:
            heights[row_height] += 1

    total = sum(heights.values())

    rows = [
        {
            "height": height,
            "nodes": count,
            "percent": fmt_percent(count, total)
        }
        for height, count in heights.most_common()
    ]

    rows.sort(
        key=lambda item: item["height"],
        reverse=True
    )

    return {
        "count": len(rows),
        "total_nodes": len(nodes),
        "results": rows,
        "latest_height": rows[0]["height"] if rows else None
    }


def aggregate_coordinates(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    seen = set()
    coordinates = []

    for address, values in nodes.items():
        row = node_array_to_dict(address, values)

        latitude = safe_float(row.get("latitude"))
        longitude = safe_float(row.get("longitude"))

        if latitude is None or longitude is None:
            continue

        key = (latitude, longitude)

        if key in seen:
            continue

        seen.add(key)

        coordinates.append([
            latitude,
            longitude
        ])

    return {
        "count": len(coordinates),
        "coordinates": coordinates
    }


def aggregate_snapshot_summary(
    nodes: dict[str, list[Any]],
    timestamp: int | None = None,
    source: str = "zzx-labs-bitnodes-crawler"
) -> dict[str, Any]:

    if timestamp is None:
        timestamp = utc_timestamp()

    rows = nodes_to_rows(nodes)

    countries = {
        row.get("country_code")
        for row in rows
        if row.get("country_code")
    }

    cities = {
        (row.get("city"), row.get("country_code"))
        for row in rows
        if row.get("city") or row.get("country_code")
    }

    asns = {
        row.get("asn")
        for row in rows
        if row.get("asn")
    }

    agents = Counter(
        row.get("user_agent") or "unknown"
        for row in rows
    )

    ports = Counter(
        row.get("port") or "unknown"
        for row in rows
    )

    services = Counter(
        str(row.get("services"))
        for row in rows
        if row.get("services") is not None
    )

    heights = [
        safe_int(row.get("height"))
        for row in rows
        if safe_int(row.get("height")) is not None
    ]

    tor_count = sum(
        1 for row in rows
        if row.get("is_tor")
    )

    return {
        "source": source,
        "timestamp": timestamp,
        "updated_at": utc_iso(timestamp),
        "total_nodes": len(nodes),
        "reachable_nodes": len(nodes),
        "latest_height": max(heights) if heights else None,
        "countries_count": len(countries),
        "cities_count": len(cities),
        "asns_count": len(asns),
        "agents_count": len(agents),
        "ports_count": len(ports),
        "services_count": len(services),
        "tor_nodes": tor_count,
        "tor_percent": fmt_percent(tor_count, len(nodes)),
        "top_agent": top_counter_value(agents),
        "top_port": top_counter_value(ports),
        "top_service": top_counter_value(services)
    }


def aggregate_all(
    nodes: dict[str, list[Any]],
    timestamp: int | None = None,
    source: str = "zzx-labs-bitnodes-crawler"
) -> dict[str, Any]:

    summary = aggregate_snapshot_summary(
        nodes,
        timestamp=timestamp,
        source=source
    )

    return {
        "summary": summary,
        "countries": aggregate_countries(nodes),
        "cities": aggregate_cities(nodes),
        "asns": aggregate_asns(nodes),
        "agents": aggregate_agents(nodes),
        "versions": aggregate_versions(nodes),
        "ports": aggregate_ports(nodes),
        "services": aggregate_services(nodes),
        "organizations": aggregate_organizations(nodes),
        "tor": aggregate_tor(nodes),
        "dns_seeder": aggregate_dns_seeder(nodes),
        "heights": aggregate_heights(nodes),
        "coordinates": aggregate_coordinates(nodes)
    }
