#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import socket
import time
from pathlib import Path

import dns.resolver

from bitcoin_p2p import handshake, version_info_to_bitnodes_array
from export_json import export_all, write_json


DNS_SEEDS = [
    "seed.bitcoin.sipa.be",
    "dnsseed.bluematt.me",
    "seed.bitcoinstats.com",
    "seed.bitcoin.jonasschnelli.ch",
    "seed.btc.petertodd.net",
    "seed.bitcoin.sprovoost.nl",
    "dnsseed.emzy.de"
]


def utc_now() -> int:
    return int(time.time())


def resolve_seed(seed: str) -> list[str]:
    out = []

    for record_type in ("A", "AAAA"):
        try:
            answers = dns.resolver.resolve(seed, record_type, lifetime=5)
            out.extend(str(a) for a in answers)
        except Exception:
            pass

    return out


def discover(limit: int) -> list[str]:
    hosts = []

    for seed in DNS_SEEDS:
        hosts.extend(resolve_seed(seed))

    unique = sorted(set(hosts))

    return [f"{host}:8333" if ":" not in host else f"[{host}]:8333" for host in unique[:limit]]


def crawl(addresses: list[str], timeout: float) -> dict[str, list]:
    nodes = {}

    for address in addresses:
        info = handshake(address, timeout=timeout)

        if info.connected:
            nodes[info.address] = version_info_to_bitnodes_array(info)

    return nodes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="bitcoin/bitnodes/api")
    parser.add_argument("--raw-output", default="")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--timeout", type=float, default=5)

    args = parser.parse_args()

    timestamp = utc_now()
    addresses = discover(args.limit)
    nodes = crawl(addresses, args.timeout)

    payload = {
        "source": "zzx-labs-native-bitnodes-p2p-crawler",
        "timestamp": timestamp,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(timestamp)),
        "total_nodes": len(nodes),
        "reachable_nodes": len(nodes),
        "latest_height": max(
            [row[4] for row in nodes.values() if len(row) > 4 and isinstance(row[4], int)],
            default=None
        ),
        "nodes": nodes
    }

    if args.raw_output:
        write_json(Path(args.raw_output), payload)

    temp = Path(args.output) / "_native_latest_raw.json"
    write_json(temp, payload)

    export_all(
        input_path=temp,
        output_dir=Path(args.output),
        source="zzx-labs-native-bitnodes-p2p-crawler",
        pretty=True,
        archive_dir=Path("bitcoin/bitnodes/archive"),
        gzip_archive=True
    )

    try:
        temp.unlink()
    except FileNotFoundError:
        pass

    print(f"native crawler exported {len(nodes)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
