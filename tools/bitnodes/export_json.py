#!/usr/bin/env python3
from __future__ import annotations

import gzip
import json
import math
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def utc_iso(ts: int | None = None) -> str:
    if ts is None:
        ts = int(time.time())

    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


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
            ensure_ascii=False,
            sort_keys=sort_keys
        )

        handle.write("\n")


def write_gzip_json(
    path: Path,
    payload: Any,
    pretty: bool = True,
    sort_keys: bool = False
) -> None:
    mkdir(path.parent)

    with gzip.open(path, "wt", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            indent=2 if pretty else None,
            ensure_ascii=False,
            sort_keys=sort_keys
        )

        handle.write("\n")


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def safe_number(value: Any) -> float | None:
    try:
        n = float(value)

        if math.isnan(n) or math.isinf(n):
            return None

        return n

    except Exception:
        return None


def normalize_node(address: str, values: list[Any]) -> dict[str, Any]:
    row = list(values) + [None] * max(0, 20 - len(values))

    return {
        "address": address,
        "host": address.split(":")[0].replace("[", "").replace("]", ""),
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
        "w3w": row[16],
        "geohash": row[17],
        "asn_location": row[18],
        "latency_ms": row[19],
        "port": extract_port(address),
        "tor": ".onion" in address.lower()
    }


def extract_port(address: str) -> int | None:
    try:
        if address.startswith("[") and "]:" in address:
            return int(address.rsplit(":", 1)[1])

        if address.count(":") == 1:
            return int(address.rsplit(":", 1)[1])

        if ".onion:" in address:
            return int(address.rsplit(":", 1)[1])

    except Exception:
        return None

    return None


def load_snapshot(input_path: Path) -> dict[str, Any]:
    payload = load_json(input_path)

    if "nodes" not in payload:
        payload["nodes"] = {}

    return payload


def build_country_payload(nodes: dict[str, list[Any]]) -> dict[str, Any]:
    grouped = defaultdict(list)

    for address, values in nodes.items():
        node = normalize_node(address, values)

        code = node["country"] or "??"
        grouped[code].append(node)

    rows = []

    for country, entries in grouped.items():
        rows.append({
            "country": country,
            "reachable_nodes": len(entries),
            "tor_nodes": sum(1 for e in entries if e["tor"]),
            "avg_latency_ms": average(
                e["latency_ms"] for e in entries
            ),
            "latest_height": max_or_none(
                e["height"] for e in entries
            ),
            "top_agents": counter_top(
                e["agent"] for e in entries
            ),
            "top_asns": counter_top(
                e["asn"] for e in entries
            )
        })

    rows.sort(
        key=lambda row: row["reachable_nodes"],
        reverse=True
    )

    return {
        "updated_at": utc_iso(),
        "total_countries": len(rows),
        "results": rows
    }


def build_city_payload(nodes: dict[str, list[Any]]) -> dict[str, Any]:
    grouped = defaultdict(list)

    for address, values in nodes.items():
        node = normalize_node(address, values)

        key = (
            node["country"] or "??",
            node["city"] or "Unknown"
        )

        grouped[key].append(node)

    rows = []

    for (country, city), entries in grouped.items():
        rows.append({
            "country": country,
            "city": city,
            "reachable_nodes": len(entries),
            "avg_latency_ms": average(
                e["latency_ms"] for e in entries
            ),
            "latest_height": max_or_none(
                e["height"] for e in entries
            )
        })

    rows.sort(
        key=lambda row: row["reachable_nodes"],
        reverse=True
    )

    return {
        "updated_at": utc_iso(),
        "total_cities": len(rows),
        "results": rows
    }


def build_asn_payload(nodes: dict[str, list[Any]]) -> dict[str, Any]:
    grouped = defaultdict(list)

    for address, values in nodes.items():
        node = normalize_node(address, values)

        key = node["asn"] or "UNKNOWN"
        grouped[key].append(node)

    rows = []

    for asn, entries in grouped.items():
        org = most_common(
            e["organization"] for e in entries
        )

        rows.append({
            "asn": asn,
            "organization": org,
            "reachable_nodes": len(entries),
            "countries": sorted({
                e["country"]
                for e in entries
                if e["country"]
            }),
            "avg_latency_ms": average(
                e["latency_ms"] for e in entries
            )
        })

    rows.sort(
        key=lambda row: row["reachable_nodes"],
        reverse=True
    )

    return {
        "updated_at": utc_iso(),
        "total_asns": len(rows),
        "results": rows
    }


def build_agent_payload(nodes: dict[str, list[Any]]) -> dict[str, Any]:
    counter = Counter()

    for address, values in nodes.items():
        node = normalize_node(address, values)

        counter[node["agent"] or "UNKNOWN"] += 1

    rows = [
        {
            "agent": key,
            "reachable_nodes": value
        }
        for key, value in counter.most_common()
    ]

    return {
        "updated_at": utc_iso(),
        "total_agents": len(rows),
        "results": rows
    }


def build_version_payload(nodes: dict[str, list[Any]]) -> dict[str, Any]:
    counter = Counter()

    for address, values in nodes.items():
        node = normalize_node(address, values)

        counter[str(node["protocol"])] += 1

    rows = [
        {
            "protocol": key,
            "reachable_nodes": value
        }
        for key, value in counter.most_common()
    ]

    return {
        "updated_at": utc_iso(),
        "total_versions": len(rows),
        "results": rows
    }


def build_port_payload(nodes: dict[str, list[Any]]) -> dict[str, Any]:
    counter = Counter()

    for address, values in nodes.items():
        node = normalize_node(address, values)

        counter[str(node["port"])] += 1

    rows = [
        {
            "port": key,
            "reachable_nodes": value
        }
        for key, value in counter.most_common()
    ]

    return {
        "updated_at": utc_iso(),
        "total_ports": len(rows),
        "results": rows
    }


def build_services_payload(nodes: dict[str, list[Any]]) -> dict[str, Any]:
    counter = Counter()

    for address, values in nodes.items():
        node = normalize_node(address, values)

        counter[str(node["services"])] += 1

    rows = [
        {
            "services": key,
            "reachable_nodes": value
        }
        for key, value in counter.most_common()
    ]

    return {
        "updated_at": utc_iso(),
        "total_service_sets": len(rows),
        "results": rows
    }


def build_tor_payload(nodes: dict[str, list[Any]]) -> dict[str, Any]:
    rows = []

    for address, values in nodes.items():
        node = normalize_node(address, values)

        if not node["tor"]:
            continue

        rows.append(node)

    return {
        "updated_at": utc_iso(),
        "total_tor_nodes": len(rows),
        "results": rows
    }


def build_coordinates_payload(nodes: dict[str, list[Any]]) -> dict[str, Any]:
    rows = []

    for address, values in nodes.items():
        node = normalize_node(address, values)

        if node["latitude"] is None:
            continue

        rows.append({
            "address": address,
            "country": node["country"],
            "city": node["city"],
            "latitude": node["latitude"],
            "longitude": node["longitude"],
            "asn": node["asn"],
            "organization": node["organization"]
        })

    return {
        "updated_at": utc_iso(),
        "total_coordinates": len(rows),
        "results": rows
    }


def build_latency_payload(
    nodes: dict[str, list[Any]],
    latency_map: dict[str, float] | None = None
) -> dict[str, Any]:
    latency_map = latency_map or {}

    results = {}

    for address, values in nodes.items():
        node = normalize_node(address, values)

        latency = latency_map.get(address)

        if latency is None:
            latency = node["latency_ms"]

        results[address] = {
            "daily_latency": [
                {
                    "t": utc_iso(),
                    "v": latency
                }
            ]
        }

    return {
        "updated_at": utc_iso(),
        "nodes": results
    }


def build_peer_health_payload(
    nodes: dict[str, list[Any]],
    latency_map: dict[str, float] | None = None,
    uptime_map: dict[str, float] | None = None
) -> dict[str, Any]:
    latency_map = latency_map or {}
    uptime_map = uptime_map or {}

    results = []

    for address, values in nodes.items():
        node = normalize_node(address, values)

        latency = latency_map.get(address)
        uptime = uptime_map.get(address, 0)

        if latency is None:
            latency = node["latency_ms"] or 0

        peer_index = calculate_peer_index(
            latency_ms=latency,
            uptime_seconds=uptime,
            height=node["height"]
        )

        results.append({
            "address": address,
            "latency_ms": latency,
            "uptime_seconds": uptime,
            "peer_index": peer_index
        })

    results.sort(
        key=lambda row: row["peer_index"],
        reverse=True
    )

    return {
        "updated_at": utc_iso(),
        "results": results
    }


def build_leaderboard_payload(
    peer_health: dict[str, Any]
) -> dict[str, Any]:
    rows = []

    for idx, entry in enumerate(
        peer_health["results"],
        start=1
    ):
        rows.append({
            "rank": idx,
            "node": entry["address"],
            "peer_index": entry["peer_index"]
        })

    return {
        "updated_at": utc_iso(),
        "results": rows
    }


def calculate_peer_index(
    latency_ms: float | None,
    uptime_seconds: float | None,
    height: int | None
) -> float:
    latency_score = 0.0
    uptime_score = 0.0
    height_score = 0.0

    if latency_ms is not None:
        latency_score = max(0.0, 100.0 - min(100.0, latency_ms / 5.0))

    if uptime_seconds is not None:
        uptime_score = min(
            100.0,
            uptime_seconds / 3600.0
        )

    if height:
        height_score = 50.0

    return round(
        latency_score + uptime_score + height_score,
        2
    )


def average(values) -> float | None:
    numbers = [
        safe_number(v)
        for v in values
    ]

    numbers = [
        n for n in numbers
        if n is not None
    ]

    if not numbers:
        return None

    return round(statistics.mean(numbers), 2)


def max_or_none(values):
    numbers = [
        v for v in values
        if isinstance(v, int)
    ]

    return max(numbers) if numbers else None


def most_common(values):
    counter = Counter()

    for value in values:
        if value:
            counter[value] += 1

    if not counter:
        return None

    return counter.most_common(1)[0][0]


def counter_top(values, limit: int = 10):
    counter = Counter()

    for value in values:
        if value:
            counter[str(value)] += 1

    return [
        {
            "value": key,
            "count": value
        }
        for key, value in counter.most_common(limit)
    ]


def export_all(
    input_path: Path,
    output_dir: Path,
    source: str | None = None,
    pretty: bool = True,
    archive_dir: Path | None = None,
    gzip_archive: bool = True
) -> None:
    payload = load_snapshot(input_path)

    if source:
        payload["source"] = source

    mkdir(output_dir)

    nodes = payload.get("nodes", {})
    latency = payload.get("latency", {})
    uptime = payload.get("uptime", {})

    peer_health = build_peer_health_payload(
        nodes,
        latency_map=latency,
        uptime_map=uptime
    )

    leaderboard = build_leaderboard_payload(peer_health)

    exports = {
        "latest.json": payload,
        "nodes.json": {
            "updated_at": utc_iso(),
            "total_nodes": len(nodes),
            "nodes": nodes
        },
        "countries.json": build_country_payload(nodes),
        "cities.json": build_city_payload(nodes),
        "asns.json": build_asn_payload(nodes),
        "agents.json": build_agent_payload(nodes),
        "versions.json": build_version_payload(nodes),
        "ports.json": build_port_payload(nodes),
        "services.json": build_services_payload(nodes),
        "tor.json": build_tor_payload(nodes),
        "coordinates.json": build_coordinates_payload(nodes),
        "latency.json": build_latency_payload(
            nodes,
            latency_map=latency
        ),
        "peer-health.json": peer_health,
        "leaderboard.json": leaderboard
    }

    for filename, export_payload in exports.items():
        write_json(
            output_dir / filename,
            export_payload,
            pretty=pretty
        )

    snapshots_payload = {
        "updated_at": utc_iso(),
        "results": [
            {
                "timestamp": payload.get("timestamp"),
                "url": "./latest.json",
                "reachable_nodes": payload.get("reachable_nodes")
            }
        ]
    }

    write_json(
        output_dir / "snapshots.json",
        snapshots_payload,
        pretty=pretty
    )

    if archive_dir:
        mkdir(archive_dir)

        archive_name = (
            f"{payload.get('timestamp', int(time.time()))}.json"
        )

        archive_path = archive_dir / archive_name

        write_json(
            archive_path,
            payload,
            pretty=pretty
        )

        if gzip_archive:
            write_gzip_json(
                archive_path.with_suffix(".json.gz"),
                payload,
                pretty=pretty
            )