#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from export_json import export_all, write_json


def utc_now() -> int:
    return int(time.time())


def redis_client():
    try:
        import redis
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: redis. Install with: python -m pip install redis"
        ) from exc

    password = os.environ.get("REDIS_PASSWORD") or None

    redis_url = os.environ.get("REDIS_URL")
    if redis_url:
        return redis.Redis.from_url(
            redis_url,
            decode_responses=True
        )

    socket_path = os.environ.get("REDIS_SOCKET")

    if socket_path and os.name != "nt":
        return redis.Redis(
            unix_socket_path=socket_path,
            password=password,
            decode_responses=True
        )

    host = os.environ.get("REDIS_HOST", "127.0.0.1")
    port = int(os.environ.get("REDIS_PORT", "6379"))
    db = int(os.environ.get("REDIS_DB", "0"))

    return redis.Redis(
        host=host,
        port=port,
        db=db,
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


def redis_type(r, key: str) -> str:
    value = r.type(key)

    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")

    return str(value)


def extract_nodes_from_known_keys(r) -> dict[str, list[Any]]:
    candidate_keys = [
        "nodes",
        "bitnodes:nodes",
        "snapshot:nodes",
        "latest:nodes",
        "latest",
        "snapshot",
        "bitnodes:latest"
    ]

    for key in candidate_keys:
        if not r.exists(key):
            continue

        key_type = redis_type(r, key)

        if key_type == "hash":
            raw = r.hgetall(key)
            nodes = {}

            for address, value in raw.items():
                parsed = try_json(value)

                if isinstance(parsed, list):
                    nodes[address] = parsed

                elif isinstance(parsed, dict):
                    nodes[address] = dict_to_node_array(parsed)

            if nodes:
                return nodes

        if key_type == "string":
            parsed = try_json(r.get(key))

            if isinstance(parsed, dict) and "nodes" in parsed:
                return normalize_nodes_object(parsed["nodes"])

            if isinstance(parsed, dict):
                possible = normalize_nodes_object(parsed)

                if possible:
                    return possible

    return {}


def dict_to_node_array(value: dict[str, Any]) -> list[Any]:
    return [
        value.get("protocol_version") or value.get("protocol") or value.get("version"),
        value.get("user_agent") or value.get("agent") or value.get("subver") or "unknown",
        value.get("connected_since") or value.get("timestamp") or value.get("seen_at") or utc_now(),
        value.get("services") or value.get("service_bits"),
        value.get("height") or value.get("start_height") or value.get("latest_height"),
        value.get("hostname") or value.get("host"),
        value.get("city"),
        value.get("country_code") or value.get("country"),
        value.get("latitude") or value.get("lat"),
        value.get("longitude") or value.get("lon") or value.get("lng"),
        value.get("timezone") or value.get("tz"),
        value.get("asn"),
        value.get("organization") or value.get("org")
    ]


def normalize_nodes_object(raw: Any) -> dict[str, list[Any]]:
    nodes = {}

    if isinstance(raw, dict):
        for address, value in raw.items():
            if isinstance(value, list):
                nodes[address] = value
            elif isinstance(value, dict):
                nodes[address] = dict_to_node_array(value)

    elif isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue

            address = item.get("address") or item.get("node") or item.get("addr")

            if not address:
                continue

            nodes[address] = dict_to_node_array(item)

    return nodes


def extract_nodes_by_scan(r) -> dict[str, list[Any]]:
    nodes = {}

    for key in r.scan_iter("*"):
        key_type = redis_type(r, key)

        if key_type == "hash":
            raw = r.hgetall(key)

            for address, value in raw.items():
                parsed = try_json(value)

                if isinstance(parsed, list):
                    nodes[address] = parsed
                elif isinstance(parsed, dict):
                    node_address = parsed.get("address") or parsed.get("node") or address
                    nodes[node_address] = dict_to_node_array(parsed)

        elif key_type == "string":
            parsed = try_json(r.get(key))

            if isinstance(parsed, dict) and "nodes" in parsed:
                nodes.update(normalize_nodes_object(parsed["nodes"]))

            elif isinstance(parsed, dict):
                address = parsed.get("address") or parsed.get("node") or parsed.get("addr")

                if address:
                    nodes[address] = dict_to_node_array(parsed)

    return nodes


def extract_nodes_from_redis(r) -> dict[str, list[Any]]:
    nodes = extract_nodes_from_known_keys(r)

    if nodes:
        return nodes

    return extract_nodes_by_scan(r)


def export_empty_api(output: Path) -> None:
    timestamp = utc_now()

    latest = {
        "source": "zzx-labs-bitnodes-redis-export-empty",
        "timestamp": timestamp,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(timestamp)),
        "total_nodes": 0,
        "reachable_nodes": 0,
        "latest_height": None,
        "nodes": {}
    }

    output.mkdir(parents=True, exist_ok=True)

    temp = output / "_empty_latest_raw.json"
    write_json(temp, latest)

    export_all(
        input_path=temp,
        output_dir=output,
        source="zzx-labs-bitnodes-redis-export-empty",
        pretty=True,
        archive_dir=APP_ROOT / "bitcoin" / "bitnodes" / "archive",
        gzip_archive=True
    )

    try:
        temp.unlink()
    except FileNotFoundError:
        pass

    print(f"exported 0 nodes to {output}")


def export_static_api(output: Path) -> None:
    try:
        r = redis_client()
        r.ping()
    except Exception as exc:
        print(f"Redis unavailable: {exc}")
        export_empty_api(output)
        return

    nodes = extract_nodes_from_redis(r)
    timestamp = utc_now()

    latest = {
        "source": "zzx-labs-bitnodes-redis-export",
        "timestamp": timestamp,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(timestamp)),
        "total_nodes": len(nodes),
        "reachable_nodes": len(nodes),
        "latest_height": max(
            [
                row[4]
                for row in nodes.values()
                if len(row) > 4 and isinstance(row[4], int)
            ],
            default=None
        ),
        "nodes": nodes
    }

    output.mkdir(parents=True, exist_ok=True)

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
    parser = argparse.ArgumentParser(
        description="Export original Bitnodes Redis data to static JSON API."
    )

    parser.add_argument(
        "--output",
        default="bitcoin/bitnodes/api"
    )

    args = parser.parse_args()

    export_static_api(Path(args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
