#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


DEFAULT_INPUT = Path("bitcoin/bitnodes/api/latest.json")
DEFAULT_OUTPUT = Path("bitcoin/bitnodes/api")


def utc_now() -> int:
    return int(time.time())


def utc_iso(ts: int | None = None) -> str:
    if ts is None:
        ts = utc_now()

    return time.strftime(
        "%Y-%m-%dT%H:%M:%SZ",
        time.gmtime(ts)
    )


def mkdir(path: Path) -> None:
    path.mkdir(
        parents=True,
        exist_ok=True
    )


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(
    path: Path,
    payload: Any,
    pretty: bool = True,
    sort_keys: bool = False
) -> None:
    mkdir(path.parent)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
            ensure_ascii=False,
            sort_keys=sort_keys
        )

        handle.write("\n")


def safe_number(value: Any) -> float | None:
    try:
        if value in ("", None):
            return None

        number = float(value)

        if math.isnan(number) or math.isinf(number):
            return None

        return number

    except Exception:
        return None


def safe_int(value: Any) -> int | None:
    try:
        if value in ("", None):
            return None

        return int(value)

    except Exception:
        return None


def average(values) -> float | None:
    numbers = [
        safe_number(value)
        for value in values
    ]

    numbers = [
        value
        for value in numbers
        if value is not None
    ]

    if not numbers:
        return None

    return round(
        statistics.mean(numbers),
        6
    )


def median(values) -> float | None:
    numbers = [
        safe_number(value)
        for value in values
    ]

    numbers = [
        value
        for value in numbers
        if value is not None
    ]

    if not numbers:
        return None

    return round(
        statistics.median(numbers),
        6
    )


def percentile(
    values,
    pct: float
) -> float | None:
    numbers = [
        safe_number(value)
        for value in values
    ]

    numbers = sorted(
        value
        for value in numbers
        if value is not None
    )

    if not numbers:
        return None

    if len(numbers) == 1:
        return round(numbers[0], 6)

    k = (len(numbers) - 1) * (pct / 100.0)
    floor = math.floor(k)
    ceil = math.ceil(k)

    if floor == ceil:
        return round(numbers[int(k)], 6)

    lower = numbers[floor] * (ceil - k)
    upper = numbers[ceil] * (k - floor)

    return round(lower + upper, 6)


def max_or_none(values) -> Any:
    items = [
        value
        for value in values
        if value not in ("", None)
    ]

    if not items:
        return None

    try:
        return max(items)
    except Exception:
        return None


def min_or_none(values) -> Any:
    items = [
        value
        for value in values
        if value not in ("", None)
    ]

    if not items:
        return None

    try:
        return min(items)
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


def counter_rows(
    values,
    limit: int | None = None
) -> list[dict[str, Any]]:
    counter = Counter()

    for value in values:
        if value in ("", None):
            value = "UNKNOWN"

        counter[str(value)] += 1

    rows = [
        {
            "value": key,
            "count": count
        }
        for key, count in counter.most_common(limit)
    ]

    return rows


def split_address(address: str) -> tuple[str, int | None]:
    value = str(address).strip()

    if value.startswith("[") and "]:" in value:
        host = value.split("]:", 1)[0].lstrip("[")

        try:
            port = int(value.rsplit(":", 1)[1])
        except Exception:
            port = None

        return host, port

    if ".onion:" in value:
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


def network_type(address: str) -> str:
    host, _port = split_address(address)

    if host.lower().endswith(".onion"):
        return "tor"

    if ":" in host:
        return "ipv6"

    return "ipv4"


def row_metadata(row: list[Any]) -> dict[str, Any]:
    if len(row) > 19 and isinstance(row[19], dict):
        return row[19]

    return {}


def normalize_node(
    address: str,
    row: list[Any],
    rank: int | None = None
) -> dict[str, Any]:
    values = list(row)

    while len(values) < 20:
        values.append(None)

    metadata = row_metadata(values)
    host, port = split_address(address)

    latency_ms = metadata.get("latency_ms")

    if latency_ms is None and not isinstance(values[19], dict):
        latency_ms = values[19]

    peer_index = metadata.get("peer_index")

    if peer_index is None:
        peer_index = calculate_peer_index(
            latency_ms=latency_ms,
            uptime_seconds=metadata.get("total_uptime"),
            height=values[4],
            services=values[3],
            success_count=metadata.get("success_count"),
            failure_count=metadata.get("failure_count")
        )

    return {
        "rank": rank,
        "address": address,
        "host": host,
        "port": port,
        "network": network_type(address),
        "protocol": values[0],
        "agent": values[1],
        "connected_since": values[2],
        "services": values[3],
        "height": values[4],
        "hostname": values[5],
        "city": values[6],
        "country": values[7],
        "latitude": values[8],
        "longitude": values[9],
        "timezone": values[10],
        "asn": values[11],
        "organization": values[12],
        "provider": values[13],
        "county": values[14],
        "zip": values[15],
        "w3w": values[16],
        "geohash": values[17],
        "asn_location": values[18],
        "latency_ms": latency_ms,
        "uptime_human": metadata.get("uptime_human"),
        "uptime_seconds": metadata.get("total_uptime"),
        "reachable": metadata.get("reachable"),
        "peer_index": peer_index,
        "tor": bool(metadata.get("tor")) or ".onion" in address.lower(),
        "success_count": metadata.get("success_count"),
        "failure_count": metadata.get("failure_count"),
        "first_seen": metadata.get("first_seen"),
        "last_seen": metadata.get("last_seen")
    }


def load_nodes(payload: dict[str, Any]) -> dict[str, list[Any]]:
    if isinstance(payload.get("nodes"), dict):
        raw_nodes = payload["nodes"]

        cleaned = {}

        for address, row in raw_nodes.items():
            if isinstance(row, list):
                cleaned[address] = row
            elif isinstance(row, dict):
                cleaned[address] = dict_node_to_row(row)

        return cleaned

    if isinstance(payload.get("results"), list):
        cleaned = {}

        for item in payload["results"]:
            if not isinstance(item, dict):
                continue

            address = item.get("address") or item.get("node")

            if not address:
                continue

            cleaned[address] = dict_node_to_row(item)

        return cleaned

    if isinstance(payload.get("rows"), list):
        cleaned = {}

        for item in payload["rows"]:
            if not isinstance(item, dict):
                continue

            address = item.get("address") or item.get("node")

            if not address:
                continue

            cleaned[address] = dict_node_to_row(item)

        return cleaned

    return {}


def dict_node_to_row(item: dict[str, Any]) -> list[Any]:
    metadata = {
        "latency_ms": item.get("latency_ms"),
        "uptime_human": item.get("uptime_human"),
        "total_uptime": item.get("uptime_seconds"),
        "reachable": item.get("reachable"),
        "peer_index": item.get("peer_index"),
        "tor": item.get("tor"),
        "success_count": item.get("success_count"),
        "failure_count": item.get("failure_count"),
        "first_seen": item.get("first_seen"),
        "last_seen": item.get("last_seen")
    }

    return [
        item.get("protocol"),
        item.get("agent"),
        item.get("connected_since"),
        item.get("services"),
        item.get("height"),
        item.get("hostname"),
        item.get("city"),
        item.get("country"),
        item.get("latitude"),
        item.get("longitude"),
        item.get("timezone"),
        item.get("asn"),
        item.get("organization"),
        item.get("provider"),
        item.get("county"),
        item.get("zip"),
        item.get("w3w"),
        item.get("geohash"),
        item.get("asn_location"),
        metadata
    ]


def normalize_rows(nodes: dict[str, list[Any]]) -> list[dict[str, Any]]:
    rows = [
        normalize_node(address, row)
        for address, row in nodes.items()
    ]

    rows.sort(
        key=lambda item: (
            safe_number(item.get("peer_index")) or 0,
            safe_int(item.get("height")) or 0,
            item.get("address") or ""
        ),
        reverse=True
    )

    for index, row in enumerate(rows, start=1):
        row["rank"] = index

    return rows


def calculate_peer_index(
    latency_ms: Any,
    uptime_seconds: Any,
    height: Any,
    services: Any,
    success_count: Any,
    failure_count: Any
) -> float:
    latency = safe_number(latency_ms)
    uptime = safe_number(uptime_seconds) or 0.0
    successes = safe_number(success_count) or 0.0
    failures = safe_number(failure_count) or 0.0

    latency_score = 0.0

    if latency is not None:
        latency_score = max(
            0.0,
            100.0 - min(100.0, latency / 5.0)
        )

    uptime_score = min(
        100.0,
        uptime / 3600.0
    )

    total_attempts = successes + failures
    reliability_score = 0.0

    if total_attempts > 0:
        reliability_score = (
            successes / total_attempts
        ) * 100.0

    height_score = 50.0 if height not in ("", None, 0) else 0.0
    services_score = 25.0 if services not in ("", None, 0) else 0.0

    return round(
        latency_score
        + uptime_score
        + reliability_score
        + height_score
        + services_score,
        6
    )


def aggregate_summary(
    payload: dict[str, Any],
    rows: list[dict[str, Any]]
) -> dict[str, Any]:
    reachable_rows = [
        row for row in rows
        if row.get("reachable") is True
    ]

    unreachable_rows = [
        row for row in rows
        if row.get("reachable") is False
    ]

    tor_rows = [
        row for row in rows
        if row.get("tor")
    ]

    ipv4_rows = [
        row for row in rows
        if row.get("network") == "ipv4"
    ]

    ipv6_rows = [
        row for row in rows
        if row.get("network") == "ipv6"
    ]

    heights = [
        safe_int(row.get("height"))
        for row in rows
    ]

    heights = [
        height
        for height in heights
        if height is not None
    ]

    latest_height = max(heights) if heights else None

    nodes_at_tip = 0

    if latest_height is not None:
        nodes_at_tip = sum(
            1 for height in heights
            if height == latest_height
        )

    countries = {
        row.get("country")
        for row in rows
        if row.get("country")
    }

    cities = {
        f"{row.get('city')}, {row.get('country')}"
        for row in rows
        if row.get("city")
    }

    asns = {
        row.get("asn")
        for row in rows
        if row.get("asn")
    }

    organizations = {
        row.get("organization")
        for row in rows
        if row.get("organization")
    }

    providers = {
        row.get("provider")
        for row in rows
        if row.get("provider")
    }

    return {
        "source": payload.get("source", "zzx-labs-bitnodes-aggregate"),
        "timestamp": payload.get("timestamp", utc_now()),
        "updated_at": payload.get("updated_at", utc_iso()),
        "total_nodes": len(rows),
        "reachable_nodes": len(reachable_rows),
        "unreachable_nodes": len(unreachable_rows),
        "ipv4_nodes": len(ipv4_rows),
        "ipv6_nodes": len(ipv6_rows),
        "tor_nodes": len(tor_rows),
        "countries_count": len(countries),
        "cities_count": len(cities),
        "asns_count": len(asns),
        "organizations_count": len(organizations),
        "providers_count": len(providers),
        "latest_height": latest_height,
        "median_height": median(heights),
        "nodes_at_tip": nodes_at_tip,
        "tip_convergence_percent": round(
            (nodes_at_tip / len(heights)) * 100.0,
            6
        ) if heights else 0.0,
        "avg_latency_ms": average(
            row.get("latency_ms")
            for row in rows
        ),
        "median_latency_ms": median(
            row.get("latency_ms")
            for row in rows
        ),
        "p90_latency_ms": percentile(
            (row.get("latency_ms") for row in rows),
            90
        ),
        "p95_latency_ms": percentile(
            (row.get("latency_ms") for row in rows),
            95
        ),
        "top_agent": most_common(
            row.get("agent")
            for row in rows
        ),
        "top_protocol": most_common(
            row.get("protocol")
            for row in rows
        ),
        "top_services": most_common(
            row.get("services")
            for row in rows
        ),
        "top_port": most_common(
            row.get("port")
            for row in rows
        ),
        "top_country": most_common(
            row.get("country")
            for row in rows
        ),
        "top_asn": most_common(
            row.get("asn")
            for row in rows
        ),
        "top_organization": most_common(
            row.get("organization")
            for row in rows
        ),
        "changes": payload.get("changes", {})
    }


def group_by(
    rows: list[dict[str, Any]],
    key: str,
    unknown: str = "UNKNOWN"
) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for row in rows:
        name = row.get(key)

        if name in ("", None):
            name = unknown

        grouped[str(name)].append(row)

    output = []

    for name, entries in grouped.items():
        output.append({
            "name": name,
            key: name,
            "total_nodes": len(entries),
            "reachable_nodes": sum(
                1 for item in entries
                if item.get("reachable") is True
            ),
            "unreachable_nodes": sum(
                1 for item in entries
                if item.get("reachable") is False
            ),
            "tor_nodes": sum(
                1 for item in entries
                if item.get("tor")
            ),
            "ipv4_nodes": sum(
                1 for item in entries
                if item.get("network") == "ipv4"
            ),
            "ipv6_nodes": sum(
                1 for item in entries
                if item.get("network") == "ipv6"
            ),
            "latest_height": max_or_none(
                item.get("height")
                for item in entries
            ),
            "avg_latency_ms": average(
                item.get("latency_ms")
                for item in entries
            ),
            "median_latency_ms": median(
                item.get("latency_ms")
                for item in entries
            ),
            "top_agent": most_common(
                item.get("agent")
                for item in entries
            ),
            "top_asn": most_common(
                item.get("asn")
                for item in entries
            ),
            "top_organization": most_common(
                item.get("organization")
                for item in entries
            ),
            "top_port": most_common(
                item.get("port")
                for item in entries
            ),
            "nodes": entries
        })

    output.sort(
        key=lambda item: item["total_nodes"],
        reverse=True
    )

    return output


def group_cities(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for row in rows:
        city = row.get("city") or "Unknown"
        country = row.get("country") or "??"
        key = f"{city}, {country}"
        grouped[key].append(row)

    output = []

    for key, entries in grouped.items():
        city, country = key.rsplit(", ", 1)

        output.append({
            "name": key,
            "city": city,
            "country": country,
            "total_nodes": len(entries),
            "reachable_nodes": sum(
                1 for item in entries
                if item.get("reachable") is True
            ),
            "unreachable_nodes": sum(
                1 for item in entries
                if item.get("reachable") is False
            ),
            "tor_nodes": sum(
                1 for item in entries
                if item.get("tor")
            ),
            "latest_height": max_or_none(
                item.get("height")
                for item in entries
            ),
            "avg_latency_ms": average(
                item.get("latency_ms")
                for item in entries
            ),
            "top_agent": most_common(
                item.get("agent")
                for item in entries
            ),
            "top_asn": most_common(
                item.get("asn")
                for item in entries
            ),
            "top_organization": most_common(
                item.get("organization")
                for item in entries
            ),
            "nodes": entries
        })

    output.sort(
        key=lambda item: item["total_nodes"],
        reverse=True
    )

    return output


def build_histogram(
    rows: list[dict[str, Any]],
    key: str
) -> dict[str, Any]:
    return {
        "updated_at": utc_iso(),
        "field": key,
        "total_values": len(rows),
        "results": counter_rows(
            row.get(key)
            for row in rows
        )
    }


def build_height_distribution(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counter = Counter()

    for row in rows:
        height = safe_int(row.get("height"))

        if height is not None:
            counter[height] += 1

    results = [
        {
            "height": height,
            "nodes": count
        }
        for height, count in counter.items()
    ]

    results.sort(
        key=lambda item: item["height"],
        reverse=True
    )

    return {
        "updated_at": utc_iso(),
        "latest_height": results[0]["height"] if results else None,
        "total_heights": len(results),
        "results": results
    }


def build_latency_distribution(rows: list[dict[str, Any]]) -> dict[str, Any]:
    buckets = {
        "0-25ms": 0,
        "25-50ms": 0,
        "50-100ms": 0,
        "100-250ms": 0,
        "250-500ms": 0,
        "500-1000ms": 0,
        "1000ms+": 0,
        "unknown": 0
    }

    for row in rows:
        latency = safe_number(row.get("latency_ms"))

        if latency is None:
            buckets["unknown"] += 1
        elif latency < 25:
            buckets["0-25ms"] += 1
        elif latency < 50:
            buckets["25-50ms"] += 1
        elif latency < 100:
            buckets["50-100ms"] += 1
        elif latency < 250:
            buckets["100-250ms"] += 1
        elif latency < 500:
            buckets["250-500ms"] += 1
        elif latency < 1000:
            buckets["500-1000ms"] += 1
        else:
            buckets["1000ms+"] += 1

    return {
        "updated_at": utc_iso(),
        "results": [
            {
                "bucket": bucket,
                "nodes": count
            }
            for bucket, count in buckets.items()
        ]
    }


def build_coordinate_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []

    for row in rows:
        lat = safe_number(row.get("latitude"))
        lon = safe_number(row.get("longitude"))

        if lat is None or lon is None:
            continue

        output.append({
            "address": row.get("address"),
            "host": row.get("host"),
            "port": row.get("port"),
            "network": row.get("network"),
            "country": row.get("country"),
            "city": row.get("city"),
            "latitude": lat,
            "longitude": lon,
            "timezone": row.get("timezone"),
            "asn": row.get("asn"),
            "organization": row.get("organization"),
            "provider": row.get("provider"),
            "geohash": row.get("geohash"),
            "w3w": row.get("w3w"),
            "tor": row.get("tor")
        })

    return output


def build_aggregates(
    payload: dict[str, Any],
    rows: list[dict[str, Any]]
) -> dict[str, Any]:
    summary = aggregate_summary(payload, rows)

    leaderboard = sorted(
        rows,
        key=lambda item: (
            safe_number(item.get("peer_index")) or 0
        ),
        reverse=True
    )

    for index, row in enumerate(leaderboard, start=1):
        row["rank"] = index
        row["node"] = row.get("address")

    coordinates = build_coordinate_rows(rows)

    return {
        "summary": summary,
        "nodes": {
            "updated_at": utc_iso(),
            "total_nodes": len(rows),
            "results": rows
        },
        "reachable": {
            "updated_at": utc_iso(),
            "total_nodes": sum(
                1 for row in rows
                if row.get("reachable") is True
            ),
            "results": [
                row for row in rows
                if row.get("reachable") is True
            ]
        },
        "unreachable": {
            "updated_at": utc_iso(),
            "total_nodes": sum(
                1 for row in rows
                if row.get("reachable") is False
            ),
            "results": [
                row for row in rows
                if row.get("reachable") is False
            ]
        },
        "countries": {
            "updated_at": utc_iso(),
            "total_countries": len({
                row.get("country")
                for row in rows
                if row.get("country")
            }),
            "results": group_by(
                rows,
                "country",
                unknown="??"
            )
        },
        "cities": {
            "updated_at": utc_iso(),
            "total_cities": len({
                f"{row.get('city')}, {row.get('country')}"
                for row in rows
                if row.get("city")
            }),
            "results": group_cities(rows)
        },
        "asns": {
            "updated_at": utc_iso(),
            "total_asns": len({
                row.get("asn")
                for row in rows
                if row.get("asn")
            }),
            "results": group_by(
                rows,
                "asn",
                unknown="UNKNOWN"
            )
        },
        "organizations": {
            "updated_at": utc_iso(),
            "total_organizations": len({
                row.get("organization")
                for row in rows
                if row.get("organization")
            }),
            "results": group_by(
                rows,
                "organization",
                unknown="UNKNOWN"
            )
        },
        "providers": {
            "updated_at": utc_iso(),
            "total_providers": len({
                row.get("provider")
                for row in rows
                if row.get("provider")
            }),
            "results": group_by(
                rows,
                "provider",
                unknown="UNKNOWN"
            )
        },
        "agents": {
            "updated_at": utc_iso(),
            "total_agents": len({
                row.get("agent")
                for row in rows
                if row.get("agent")
            }),
            "results": group_by(
                rows,
                "agent",
                unknown="UNKNOWN"
            )
        },
        "versions": {
            "updated_at": utc_iso(),
            "total_versions": len({
                row.get("protocol")
                for row in rows
                if row.get("protocol")
            }),
            "results": group_by(
                rows,
                "protocol",
                unknown="UNKNOWN"
            )
        },
        "ports": {
            "updated_at": utc_iso(),
            "total_ports": len({
                row.get("port")
                for row in rows
                if row.get("port")
            }),
            "results": group_by(
                rows,
                "port",
                unknown="UNKNOWN"
            )
        },
        "services": {
            "updated_at": utc_iso(),
            "total_service_sets": len({
                row.get("services")
                for row in rows
                if row.get("services") is not None
            }),
            "results": group_by(
                rows,
                "services",
                unknown="UNKNOWN"
            )
        },
        "tor": {
            "updated_at": utc_iso(),
            "total_tor_nodes": sum(
                1 for row in rows
                if row.get("tor")
            ),
            "results": [
                row for row in rows
                if row.get("tor")
            ]
        },
        "coordinates": {
            "updated_at": utc_iso(),
            "total_coordinates": len(coordinates),
            "results": coordinates
        },
        "leaderboard": {
            "updated_at": utc_iso(),
            "count": len(leaderboard),
            "results": leaderboard
        },
        "heights": build_height_distribution(rows),
        "latency_distribution": build_latency_distribution(rows),
        "histograms": {
            "agents": build_histogram(rows, "agent"),
            "versions": build_histogram(rows, "protocol"),
            "ports": build_histogram(rows, "port"),
            "services": build_histogram(rows, "services"),
            "countries": build_histogram(rows, "country"),
            "asns": build_histogram(rows, "asn"),
            "organizations": build_histogram(rows, "organization"),
            "providers": build_histogram(rows, "provider")
        }
    }


def write_aggregate_files(
    aggregates: dict[str, Any],
    output_dir: Path,
    pretty: bool
) -> None:
    mapping = {
        "summary": "aggregate-summary.json",
        "nodes": "aggregate-nodes.json",
        "reachable": "aggregate-reachable.json",
        "unreachable": "aggregate-unreachable.json",
        "countries": "aggregate-countries.json",
        "cities": "aggregate-cities.json",
        "asns": "aggregate-asns.json",
        "organizations": "aggregate-organizations.json",
        "providers": "aggregate-providers.json",
        "agents": "aggregate-agents.json",
        "versions": "aggregate-versions.json",
        "ports": "aggregate-ports.json",
        "services": "aggregate-services.json",
        "tor": "aggregate-tor.json",
        "coordinates": "aggregate-coordinates.json",
        "leaderboard": "aggregate-leaderboard.json",
        "heights": "aggregate-heights.json",
        "latency_distribution": "aggregate-latency-distribution.json",
        "histograms": "aggregate-histograms.json"
    }

    for key, filename in mapping.items():
        write_json(
            output_dir / filename,
            aggregates[key],
            pretty=pretty
        )

    write_json(
        output_dir / "aggregate.json",
        aggregates,
        pretty=pretty
    )


def aggregate_file(
    input_path: Path,
    output_dir: Path,
    pretty: bool = True
) -> dict[str, Any]:
    payload = read_json(input_path)
    nodes = load_nodes(payload)
    rows = normalize_rows(nodes)
    aggregates = build_aggregates(payload, rows)

    write_aggregate_files(
        aggregates,
        output_dir,
        pretty=pretty
    )

    return aggregates


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build ZZX-Labs Bitnodes aggregate JSON indexes."
    )

    parser.add_argument(
        "--input",
        default=str(DEFAULT_INPUT)
    )

    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT)
    )

    parser.add_argument(
        "--compact",
        action="store_true"
    )

    args = parser.parse_args()

    aggregates = aggregate_file(
        input_path=Path(args.input),
        output_dir=Path(args.output),
        pretty=not args.compact
    )

    summary = aggregates["summary"]

    print(
        f"aggregated {summary['total_nodes']} nodes, "
        f"{summary['reachable_nodes']} reachable, "
        f"{summary['unreachable_nodes']} unreachable, "
        f"{summary['countries_count']} countries, "
        f"{summary['asns_count']} ASNs"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())