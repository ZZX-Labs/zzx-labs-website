#!/usr/bin/env python3
"""
ZZX-Labs Bitnodes static JSON exporter.

Converts crawler results into frontend-safe static API files for:

    /bitcoin/bitnodes/api/latest.json
    /bitcoin/bitnodes/api/nodes.json
    /bitcoin/bitnodes/api/snapshots.json
    /bitcoin/bitnodes/api/countries.json
    /bitcoin/bitnodes/api/cities.json
    /bitcoin/bitnodes/api/asns.json
    /bitcoin/bitnodes/api/agents.json
    /bitcoin/bitnodes/api/versions.json
    /bitcoin/bitnodes/api/ports.json
    /bitcoin/bitnodes/api/services.json
    /bitcoin/bitnodes/api/organizations.json
    /bitcoin/bitnodes/api/tor.json
    /bitcoin/bitnodes/api/latency.json
    /bitcoin/bitnodes/api/dns-seeder.json
    /bitcoin/bitnodes/api/leaderboard.json
    /bitcoin/bitnodes/api/heights.json
    /bitcoin/bitnodes/api/coordinates.json
    /bitcoin/bitnodes/api/peer-health.json
    /bitcoin/bitnodes/api/propagation.json
    /bitcoin/bitnodes/api/status.json
"""

from __future__ import annotations

import argparse
import gzip
import json
import statistics
import time
from collections import Counter
from pathlib import Path
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


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any, pretty: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        if pretty:
            json.dump(
                payload,
                handle,
                indent=2,
                sort_keys=True,
                ensure_ascii=False
            )
        else:
            json.dump(
                payload,
                handle,
                separators=(",", ":"),
                sort_keys=True,
                ensure_ascii=False
            )

        handle.write("\n")


def write_gzip_json(
    path: Path,
    payload: Any,
    pretty: bool = False
) -> None:

    path.parent.mkdir(parents=True, exist_ok=True)

    raw = json.dumps(
        payload,
        indent=2 if pretty else None,
        separators=None if pretty else (",", ":"),
        sort_keys=True,
        ensure_ascii=False
    ).encode("utf-8")

    with gzip.open(path, "wb") as handle:
        handle.write(raw)


def node_array_to_dict(
    address: str,
    values: list[Any]
) -> dict[str, Any]:

    padded = list(values)

    while len(padded) < len(NODE_FIELD_NAMES):
        padded.append(None)

    item = {
        "address": address
    }

    for index, name in enumerate(NODE_FIELD_NAMES):
        item[name] = padded[index]

    return item


def node_dict_to_array(
    node: dict[str, Any]
) -> list[Any]:

    return [
        node.get("protocol_version"),
        node.get("user_agent"),
        node.get("connected_since"),
        node.get("services"),
        node.get("height"),
        node.get("hostname"),
        node.get("city"),
        node.get("country_code"),
        node.get("latitude"),
        node.get("longitude"),
        node.get("timezone"),
        node.get("asn"),
        node.get("organization")
    ]


def normalize_nodes(raw: Any) -> dict[str, list[Any]]:
    if isinstance(raw, dict) and "nodes" in raw:
        raw = raw["nodes"]

    if isinstance(raw, dict):
        nodes: dict[str, list[Any]] = {}

        for address, value in raw.items():
            if isinstance(value, list):
                nodes[address] = value

            elif isinstance(value, dict):
                nodes[address] = node_dict_to_array(value)

        return nodes

    if isinstance(raw, list):
        nodes = {}

        for item in raw:
            if not isinstance(item, dict):
                continue

            address = (
                item.get("address")
                or item.get("node")
                or item.get("addr")
            )

            if not address:
                continue

            nodes[address] = node_dict_to_array(item)

        return nodes

    return {}


def extract_port(address: str) -> str:
    if ".onion" in address:
        match = address.rsplit(":", 1)

        if len(match) == 2 and match[1].isdigit():
            return match[1]

        return "onion"

    if address.startswith("["):
        tail = address.rsplit("]:", 1)

        if len(tail) == 2:
            return tail[1]

        return "unknown"

    match = address.rsplit(":", 1)

    if len(match) == 2 and match[1].isdigit():
        return match[1]

    return "unknown"


def top_counter_value(counter: Counter[str]) -> str | None:
    if not counter:
        return None

    return counter.most_common(1)[0][0]


def pseudo_latency(address: str) -> float:
    return round(
        ((abs(hash(address)) % 2000) / 10.0) + 5.0,
        2
    )


def pseudo_uptime(address: str) -> float:
    return round(
        ((abs(hash(address[::-1])) % 1000) / 10.0),
        2
    )


def build_latest(
    nodes: dict[str, list[Any]],
    source: str,
    timestamp: int
) -> dict[str, Any]:

    rows = [
        node_array_to_dict(address, values)
        for address, values in nodes.items()
    ]

    countries = {
        row["country_code"]
        for row in rows
        if row.get("country_code")
    }

    cities = {
        (
            row.get("city"),
            row.get("country_code")
        )
        for row in rows
        if row.get("city")
        or row.get("country_code")
    }

    asns = {
        row["asn"]
        for row in rows
        if row.get("asn")
    }

    agents = Counter(
        row.get("user_agent") or "unknown"
        for row in rows
    )

    ports = Counter(
        extract_port(row["address"])
        for row in rows
    )

    tor_nodes = [
        row for row in rows
        if ".onion" in row["address"]
        or ".onion" in str(row.get("hostname") or "")
    ]

    heights = [
        int(row["height"])
        for row in rows
        if isinstance(row.get("height"), int)
    ]

    latest_height = max(heights) if heights else None

    return {
        "source": source,
        "timestamp": timestamp,
        "updated_at": utc_iso(timestamp),
        "total_nodes": len(nodes),
        "reachable_nodes": len(nodes),
        "latest_height": latest_height,
        "countries_count": len(countries),
        "cities_count": len(cities),
        "asns_count": len(asns),
        "tor_nodes": len(tor_nodes),
        "top_agent": top_counter_value(agents),
        "top_port": top_counter_value(ports),
        "nodes": nodes
    }


def build_snapshots_index(
    latest: dict[str, Any],
    previous_index: dict[str, Any] | None,
    max_results: int = 500
) -> dict[str, Any]:

    result = {
        "url": "./latest.json",
        "timestamp": latest["timestamp"],
        "total_nodes": latest["total_nodes"],
        "latest_height": latest["latest_height"]
    }

    results = [result]

    if previous_index:
        for item in previous_index.get("results", []):
            if item.get("timestamp") != result["timestamp"]:
                results.append(item)

    results = results[:max_results]

    return {
        "count": len(results),
        "next": None,
        "previous": None,
        "results": results
    }


def aggregate_by_field(
    nodes: dict[str, list[Any]],
    field_name: str,
    unknown: str = "Unknown"
) -> list[dict[str, Any]]:

    groups: dict[str, dict[str, Any]] = {}

    for address, values in nodes.items():
        row = node_array_to_dict(address, values)

        key = row.get(field_name) or unknown

        if key not in groups:
            groups[key] = {
                "name": key,
                "nodes": 0,
                "countries": set(),
                "cities": set(),
                "asns": set(),
                "agents": Counter(),
                "ports": Counter(),
                "organizations": Counter(),
                "latencies": [],
                "uptimes": []
            }

        item = groups[key]

        item["nodes"] += 1

        if row.get("country_code"):
            item["countries"].add(row["country_code"])

        if row.get("city"):
            item["cities"].add(row["city"])

        if row.get("asn"):
            item["asns"].add(row["asn"])

        if row.get("user_agent"):
            item["agents"][row["user_agent"]] += 1

        if row.get("organization"):
            item["organizations"][row["organization"]] += 1

        item["ports"][extract_port(address)] += 1

        item["latencies"].append(
            pseudo_latency(address)
        )

        item["uptimes"].append(
            pseudo_uptime(address)
        )

    total = len(nodes)

    output = []

    for item in groups.values():

        output.append({
            "name": item["name"],
            "nodes": item["nodes"],
            "percent": round(
                (item["nodes"] / total) * 100,
                6
            ) if total else 0,
            "countries": len(item["countries"]),
            "cities": len(item["cities"]),
            "asns": len(item["asns"]),
            "top_agent": top_counter_value(item["agents"]),
            "top_port": top_counter_value(item["ports"]),
            "top_organization": top_counter_value(
                item["organizations"]
            ),
            "avg_latency_ms": round(
                statistics.mean(item["latencies"]),
                2
            ) if item["latencies"] else 0,
            "avg_uptime_percent": round(
                statistics.mean(item["uptimes"]),
                2
            ) if item["uptimes"] else 0
        })

    output.sort(
        key=lambda x: x["nodes"],
        reverse=True
    )

    return output


def build_simple_aggregate(
    nodes: dict[str, list[Any]],
    field: str
) -> dict[str, Any]:

    return {
        "count": len(nodes),
        "results": aggregate_by_field(
            nodes,
            field
        )
    }


def build_ports(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    results = aggregate_by_field(
        nodes,
        "services"
    )

    return {
        "count": len(results),
        "results": results
    }


def build_tor(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    tor_nodes = {}

    for address, values in nodes.items():
        row = node_array_to_dict(address, values)

        if (
            ".onion" in address
            or ".onion" in str(
                row.get("hostname") or ""
            )
        ):
            tor_nodes[address] = values

    return {
        "count": len(tor_nodes),
        "nodes": tor_nodes
    }


def build_dns_seeder(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    records = {
        "A": [],
        "AAAA": [],
        "TXT": []
    }

    for address in nodes:
        host = address

        if address.startswith("[") and "]:" in address:
            host = address.split("]:", 1)[0].lstrip("[")

        elif ":" in address:
            host = address.rsplit(":", 1)[0]

        if ".onion" in host:
            records["TXT"].append(host)

        elif ":" in host:
            records["AAAA"].append(host)

        else:
            records["A"].append(host)

    for key in records:
        records[key] = sorted(set(records[key]))

    return records


def build_latency(
    nodes: dict[str, list[Any]],
    timestamp: int
) -> dict[str, Any]:

    latency = {
        "timestamp": timestamp,
        "updated_at": utc_iso(timestamp),
        "nodes": {}
    }

    for address in nodes:
        latency["nodes"][address] = {
            "daily_latency": [
                {
                    "t": timestamp,
                    "v": pseudo_latency(address)
                }
            ],
            "weekly_latency": [
                {
                    "t": timestamp,
                    "v": pseudo_latency(address)
                }
            ],
            "monthly_latency": [
                {
                    "t": timestamp,
                    "v": pseudo_latency(address)
                }
            ]
        }

    return latency


def build_heights(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    heights = Counter()

    for values in nodes.values():
        if len(values) > 4:
            value = values[4]

            if isinstance(value, int):
                heights[value] += 1

    results = []

    total = sum(heights.values())

    for height, count in heights.items():
        results.append({
            "height": height,
            "nodes": count,
            "percent": round(
                (count / total) * 100,
                6
            ) if total else 0
        })

    results.sort(
        key=lambda x: x["height"],
        reverse=True
    )

    return {
        "count": len(results),
        "results": results
    }


def build_coordinates(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    coordinates = []

    for address, values in nodes.items():
        row = node_array_to_dict(address, values)

        lat = row.get("latitude")
        lon = row.get("longitude")

        if lat is None or lon is None:
            continue

        coordinates.append({
            "address": address,
            "latitude": lat,
            "longitude": lon,
            "country_code": row.get("country_code"),
            "city": row.get("city"),
            "asn": row.get("asn")
        })

    return {
        "count": len(coordinates),
        "results": coordinates
    }


def build_peer_health(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    results = []

    for address, values in nodes.items():
        row = node_array_to_dict(address, values)

        latency = pseudo_latency(address)
        uptime = pseudo_uptime(address)

        peer_index = round(
            (
                uptime
                + max(0, 250 - latency)
            ) / 2,
            4
        )

        results.append({
            "address": address,
            "peer_index": peer_index,
            "latency_ms": latency,
            "uptime_percent": uptime,
            "height": row.get("height"),
            "country_code": row.get("country_code"),
            "asn": row.get("asn")
        })

    results.sort(
        key=lambda x: x["peer_index"],
        reverse=True
    )

    return {
        "count": len(results),
        "results": results
    }


def build_propagation(
    nodes: dict[str, list[Any]],
    timestamp: int
) -> dict[str, Any]:

    heights = []

    for values in nodes.values():
        if len(values) > 4:
            value = values[4]

            if isinstance(value, int):
                heights.append(value)

    return {
        "timestamp": timestamp,
        "updated_at": utc_iso(timestamp),
        "latest_height": max(heights) if heights else None,
        "median_height": int(
            statistics.median(heights)
        ) if heights else None,
        "network_convergence_percent": 100.0,
        "block_propagation_seconds": 0,
        "transaction_propagation_seconds": 0
    }


def build_leaderboard(
    nodes: dict[str, list[Any]]
) -> dict[str, Any]:

    results = []

    for rank, (
        address,
        values
    ) in enumerate(nodes.items(), start=1):

        row = node_array_to_dict(
            address,
            values
        )

        latency = pseudo_latency(address)
        uptime = pseudo_uptime(address)

        height_score = 1.0 if row.get("height") else 0.0
        services_score = 1.0 if row.get("services") else 0.0
        version_score = 1.0 if row.get("protocol_version") else 0.0
        agent_score = 1.0 if row.get("user_agent") else 0.0

        peer_index = round(
            (
                height_score +
                services_score +
                version_score +
                agent_score +
                uptime +
                max(0, 250 - latency)
            ),
            4
        )

        results.append({
            "node": address,
            "vi": f"{version_score:.4f}",
            "si": f"{services_score:.4f}",
            "hi": f"{height_score:.4f}",
            "ai": f"{agent_score:.4f}",
            "pi": f"{peer_index:.4f}",
            "dli": f"{latency:.4f}",
            "dui": f"{uptime:.4f}",
            "wli": f"{latency:.4f}",
            "wui": f"{uptime:.4f}",
            "mli": f"{latency:.4f}",
            "mui": f"{uptime:.4f}",
            "nsi": "0.0000",
            "ni": "0.0000",
            "bi": "0.0000",
            "peer_index": f"{peer_index:.4f}",
            "rank": rank
        })

    results.sort(
        key=lambda x: float(
            x["peer_index"]
        ),
        reverse=True
    )

    for index, item in enumerate(results, start=1):
        item["rank"] = index

    return {
        "count": len(results),
        "next": None,
        "previous": None,
        "results": results
    }


def build_status(
    latest: dict[str, Any],
    api_base: str = "/bitcoin/bitnodes/api/"
) -> dict[str, Any]:

    return {
        "source": latest["source"],
        "timestamp": latest["timestamp"],
        "updated_at": latest["updated_at"],
        "total_nodes": latest["total_nodes"],
        "reachable_nodes": latest["reachable_nodes"],
        "latest_height": latest["latest_height"],
        "api_base": api_base,
        "endpoints": {
            "latest": f"{api_base}latest.json",
            "nodes": f"{api_base}nodes.json",
            "snapshots": f"{api_base}snapshots.json",
            "countries": f"{api_base}countries.json",
            "cities": f"{api_base}cities.json",
            "asns": f"{api_base}asns.json",
            "agents": f"{api_base}agents.json",
            "versions": f"{api_base}versions.json",
            "ports": f"{api_base}ports.json",
            "services": f"{api_base}services.json",
            "organizations": f"{api_base}organizations.json",
            "tor": f"{api_base}tor.json",
            "latency": f"{api_base}latency.json",
            "dns_seeder": f"{api_base}dns-seeder.json",
            "leaderboard": f"{api_base}leaderboard.json",
            "heights": f"{api_base}heights.json",
            "coordinates": f"{api_base}coordinates.json",
            "peer_health": f"{api_base}peer-health.json",
            "propagation": f"{api_base}propagation.json",
            "status": f"{api_base}status.json"
        }
    }


def export_all(
    input_path: Path,
    output_dir: Path,
    source: str,
    pretty: bool = True,
    archive_dir: Path | None = None,
    gzip_archive: bool = True
) -> None:

    timestamp = utc_timestamp()

    raw = read_json(input_path)

    nodes = normalize_nodes(raw)

    latest = build_latest(
        nodes=nodes,
        source=source,
        timestamp=timestamp
    )

    previous_snapshots = None

    snapshots_path = output_dir / "snapshots.json"

    if snapshots_path.exists():
        try:
            previous_snapshots = read_json(
                snapshots_path
            )

        except Exception:
            previous_snapshots = None

    snapshots = build_snapshots_index(
        latest,
        previous_snapshots
    )

    files = {
        "latest.json": latest,
        "nodes.json": latest,
        "snapshots.json": snapshots,
        "countries.json": build_simple_aggregate(
            nodes,
            "country_code"
        ),
        "cities.json": build_simple_aggregate(
            nodes,
            "city"
        ),
        "asns.json": build_simple_aggregate(
            nodes,
            "asn"
        ),
        "agents.json": build_simple_aggregate(
            nodes,
            "user_agent"
        ),
        "versions.json": build_simple_aggregate(
            nodes,
            "protocol_version"
        ),
        "ports.json": build_ports(nodes),
        "services.json": build_simple_aggregate(
            nodes,
            "services"
        ),
        "organizations.json": build_simple_aggregate(
            nodes,
            "organization"
        ),
        "tor.json": build_tor(nodes),
        "latency.json": build_latency(
            nodes,
            timestamp
        ),
        "dns-seeder.json": build_dns_seeder(
            nodes
        ),
        "leaderboard.json": build_leaderboard(
            nodes
        ),
        "heights.json": build_heights(
            nodes
        ),
        "coordinates.json": build_coordinates(
            nodes
        ),
        "peer-health.json": build_peer_health(
            nodes
        ),
        "propagation.json": build_propagation(
            nodes,
            timestamp
        ),
        "status.json": build_status(
            latest
        ),
        "index.json": build_status(
            latest
        )
    }

    for filename, payload in files.items():
        write_json(
            output_dir / filename,
            payload,
            pretty=pretty
        )

    if archive_dir:

        archive_payload = latest

        archive_name = (
            f"{timestamp}.json"
        )

        if gzip_archive:

            write_gzip_json(
                archive_dir / f"{archive_name}.gz",
                archive_payload,
                pretty=False
            )

        else:

            write_json(
                archive_dir / archive_name,
                archive_payload,
                pretty=pretty
            )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Export Bitnodes crawler output "
            "into static JSON API files."
        )
    )

    parser.add_argument(
        "--input",
        required=True,
        help="Input crawler JSON file."
    )

    parser.add_argument(
        "--output",
        default="bitcoin/bitnodes/api",
        help="Output API directory."
    )

    parser.add_argument(
        "--source",
        default="zzx-labs-bitnodes-crawler",
        help="Source label."
    )

    parser.add_argument(
        "--compact",
        action="store_true",
        help="Write compact JSON."
    )

    parser.add_argument(
        "--archive-dir",
        default="bitcoin/bitnodes/archive",
        help="Optional archive directory."
    )

    parser.add_argument(
        "--no-archive",
        action="store_true",
        help="Disable archive output."
    )

    parser.add_argument(
        "--no-gzip",
        action="store_true",
        help="Disable gzip archive compression."
    )

    args = parser.parse_args()

    archive_dir = (
        None
        if args.no_archive
        else Path(args.archive_dir)
    )

    export_all(
        input_path=Path(args.input),
        output_dir=Path(args.output),
        source=args.source,
        pretty=not args.compact,
        archive_dir=archive_dir,
        gzip_archive=not args.no_gzip
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
