#!/usr/bin/env python3
import argparse
import json
import socket
import time
from pathlib import Path

import dns.resolver


DNS_SEEDS = [
    "seed.bitcoin.sipa.be",
    "dnsseed.bluematt.me",
    "dnsseed.bitcoin.dashjr.org",
    "seed.bitcoinstats.com",
    "seed.bitcoin.jonasschnelli.ch",
    "seed.btc.petertodd.net",
    "seed.bitcoin.sprovoost.nl",
    "dnsseed.emzy.de",
]

DEFAULT_PORT = 8333


def utc_now() -> int:
    return int(time.time())


def resolve_seed(seed: str) -> list[str]:
    results = []

    for record_type in ("A", "AAAA"):
        try:
            answers = dns.resolver.resolve(seed, record_type, lifetime=5)
            for answer in answers:
                results.append(str(answer))
        except Exception:
            pass

    return results


def can_connect(host: str, port: int, timeout: float) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def node_key(host: str, port: int) -> str:
    if ":" in host and not host.endswith(".onion"):
        return f"[{host}]:{port}"
    return f"{host}:{port}"


def build_snapshot(limit: int, timeout: float) -> dict:
    timestamp = utc_now()
    candidates = []

    for seed in DNS_SEEDS:
        candidates.extend(resolve_seed(seed))

    unique_hosts = sorted(set(candidates))[:limit]

    nodes = {}

    for host in unique_hosts:
        reachable = can_connect(host, DEFAULT_PORT, timeout)

        if not reachable:
            continue

        nodes[node_key(host, DEFAULT_PORT)] = [
            None,
            "unknown",
            timestamp,
            1,
            None,
            host,
            None,
            None,
            None,
            None,
            None,
            None,
            None
        ]

    return {
        "source": "zzx-labs-bitnodes-static-crawler",
        "timestamp": timestamp,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(timestamp)),
        "total_nodes": len(nodes),
        "latest_height": None,
        "nodes": nodes
    }


def write_json(path: Path, payload: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)


def build_indexes(snapshot: dict) -> dict:
    nodes = snapshot["nodes"]

    snapshots_index = {
        "count": 1,
        "next": None,
        "previous": None,
        "results": [
            {
                "url": "./latest.json",
                "timestamp": snapshot["timestamp"],
                "total_nodes": snapshot["total_nodes"],
                "latest_height": snapshot["latest_height"]
            }
        ]
    }

    dns_seeder = {
        "A": [],
        "AAAA": [],
        "TXT": []
    }

    for node in nodes:
        host = node.rsplit(":", 1)[0].strip("[]")

        if ".onion" in host:
            dns_seeder["TXT"].append(host)
        elif ":" in host:
            dns_seeder["AAAA"].append(host)
        else:
            dns_seeder["A"].append(host)

    leaderboard = {
        "count": len(nodes),
        "next": None,
        "previous": None,
        "results": []
    }

    for index, node in enumerate(nodes.keys(), start=1):
        leaderboard["results"].append({
            "node": node,
            "rank": index,
            "peer_index": "0.0000",
            "vi": "0.0000",
            "si": "0.0000",
            "hi": "0.0000",
            "ai": "0.0000",
            "pi": "0.0000",
            "dli": "0.0000",
            "dui": "0.0000",
            "wli": "0.0000",
            "wui": "0.0000",
            "mli": "0.0000",
            "mui": "0.0000",
            "nsi": "0.0000",
            "ni": "0.0000",
            "bi": "0.0000"
        })

    return {
        "snapshots": snapshots_index,
        "dns_seeder": dns_seeder,
        "leaderboard": leaderboard
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--timeout", type=float, default=3)
    parser.add_argument("--limit", type=int, default=500)

    args = parser.parse_args()

    output = Path(args.output)
    snapshot = build_snapshot(args.limit, args.timeout)
    indexes = build_indexes(snapshot)

    write_json(output / "latest.json", snapshot)
    write_json(output / "nodes.json", snapshot)
    write_json(output / "snapshots.json", indexes["snapshots"])
    write_json(output / "dns-seeder.json", indexes["dns_seeder"])
    write_json(output / "leaderboard.json", indexes["leaderboard"])

    write_json(output / "status.json", {
        "source": snapshot["source"],
        "updated_at": snapshot["updated_at"],
        "total_nodes": snapshot["total_nodes"],
        "api_base": "/bitcoin/bitnodes/api/"
    })

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
