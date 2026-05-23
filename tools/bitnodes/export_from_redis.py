#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any

from export_json import write_json


APP_ROOT = Path(__file__).resolve().parents[2]


def utc_now() -> int:
    return int(time.time())


def redis_client():
    try:
        import redis
    except ImportError as exc:
        raise SystemExit("Missing dependency: redis. Install with: python -m pip install redis") from exc

    socket_path = os.environ.get("REDIS_SOCKET", "/tmp/redis.sock")
    password = os.environ.get("REDIS_PASSWORD")

    return redis.Redis(
        unix_socket_path=socket_path,
        password=password,
        decode_responses=True
    )


def try_json(value: Any) -> Any:
    if value is None:
        return None

    if isinstance(value, (dict, list)):
        return value

    try:
        return json.loads(value)
    except Exception:
        return value


def extract_nodes_from_redis(r) -> dict[str, list[Any]]:
    candidate_keys = [
        "nodes",
        "bitnodes:nodes",
        "snapshot:nodes",
        "latest:nodes"
    ]

    for key in candidate_keys:
        if not r.exists(key):
            continue

        key_type = r.type(key)

        if key_type == "hash":
            raw = r.hgetall(key)
            nodes = {}

            for address, value in raw.items():
                parsed = try_json(value)

                if isinstance(parsed, list):
                    nodes[address] = parsed

            if nodes:
                return nodes

        if key_type == "string":
            parsed = try_json(r.get(key))

            if isinstance(parsed, dict) and "nodes" in parsed:
                return parsed["nodes"]

            if isinstance(parsed, dict):
                return parsed

    nodes = {}

    for key in r.scan_iter("*"):
        if "node" not in key.lower():
            continue

        value = try_json(r.get(key)) if r.type(key) == "string" else None

        if isinstance(value, dict):
            address = value.get("address") or value.get("node") or key

            nodes[address] = [
                value.get("protocol_version") or value.get("protocol"),
                value.get("user_agent") or value.get("agent") or "unknown",
                value.get("connected_since") or value.get("timestamp") or utc_now(),
                value.get("services"),
                value.get("height"),
                value.get("hostname"),
                value.get("city"),
                value.get("country_code") or value.get("country"),
                value.get("latitude") or value.get("lat"),
                value.get("longitude") or value.get("lon"),
                value.get("timezone"),
                value.get("asn"),
                value.get("organization") or value.get("org")
            ]

    return nodes


def export_static_api(output: Path) -> None:
    r = redis_client()
    nodes = extract_nodes_from_redis(r)
    timestamp = utc_now()

    latest = {
        "source": "zzx-labs-bitnodes-redis-export",
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

    output.mkdir(parents=True, exist_ok=True)

    write_json(output / "latest.json", latest)
    write_json(output / "nodes.json", latest)

    from export_json import export_all

    temp = output / "_redis_latest_raw.json"
    write_json(temp, latest)

    export_all(
        input_path=temp,
        output_dir=output,
        source="zzx-labs-bitnodes-redis-export",
        pretty=True,
        archive_dir=APP_ROOT / "bitcoin" / "bitnodes" / "archive",
        gzip_archive=True
    )

    try:
        temp.unlink()
    except FileNotFoundError:
        pass

    print(f"exported {len(nodes)} nodes to {output}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Export original Bitnodes Redis data to static JSON API.")
    parser.add_argument("--output", default="bitcoin/bitnodes/api")

    args = parser.parse_args()

    export_static_api(Path(args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
