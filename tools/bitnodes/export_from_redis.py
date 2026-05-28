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


DEFAULT_OUTPUT = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_ARCHIVE = APP_ROOT / "bitcoin" / "bitnodes" / "archive"


def utc_now() -> int:
    return int(time.time())


def utc_iso(ts: int | None = None) -> str:
    if ts is None:
        ts = utc_now()

    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def redis_client():
    try:
        import redis
    except ImportError as exc:
        raise SystemExit("Missing dependency: redis. Install with: python -m pip install redis") from exc

    password = os.environ.get("REDIS_PASSWORD") or None
    redis_url = os.environ.get("REDIS_URL")

    if redis_url:
        return redis.Redis.from_url(redis_url, decode_responses=True)

    socket_path = os.environ.get("REDIS_SOCKET")

    if socket_path and os.name != "nt":
        return redis.Redis(
            unix_socket_path=socket_path,
            password=password,
            decode_responses=True,
        )

    return redis.Redis(
        host=os.environ.get("REDIS_HOST", "127.0.0.1"),
        port=int(os.environ.get("REDIS_PORT", "6379")),
        db=int(os.environ.get("REDIS_DB", "0")),
        password=password,
        decode_responses=True,
    )


def try_json(value: Any) -> Any:
    if value is None or isinstance(value, (dict, list)):
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


def safe_int(value: Any, default: int | None = None) -> int | None:
    try:
        if value in ("", None):
            return default

        return int(value)
    except Exception:
        return default


def dict_to_node_array(value: dict[str, Any]) -> list[Any]:
    metadata = dict(value.get("metadata", {})) if isinstance(value.get("metadata"), dict) else {}

    reachable = value.get("reachable")

    if reachable is None:
        reachable = value.get("connected")

    metadata.setdefault("reachable", reachable)
    metadata.setdefault("latency_ms", value.get("latency_ms"))
    metadata.setdefault("total_uptime", value.get("uptime_seconds") or value.get("uptime"))
    metadata.setdefault("success_count", value.get("success_count"))
    metadata.setdefault("failure_count", value.get("failure_count"))
    metadata.setdefault("first_seen", value.get("first_seen"))
    metadata.setdefault("last_seen", value.get("last_seen"))
    metadata.setdefault("tor", bool(value.get("is_tor")))

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


def normalize_nodes_object(raw: Any) -> dict[str, list[Any]]:
    nodes: dict[str, list[Any]] = {}

    if isinstance(raw, dict):
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

            address = item.get("address") or item.get("node") or item.get("addr")

            if address:
                nodes[str(address)] = dict_to_node_array(item)

    return nodes


def normalize_node_array(row: list[Any]) -> list[Any]:
    output = list(row)

    while len(output) < 20:
        output.append(None)

    if output[19] is None:
        output[19] = {}

    return output


def extract_nodes_from_known_keys(r) -> dict[str, list[Any]]:
    candidate_keys = [
        "nodes",
        "bitnodes:nodes",
        "snapshot:nodes",
        "latest:nodes",
        "latest",
        "snapshot",
        "bitnodes:latest",
        "bitnodes:snapshot",
        "crawler:nodes",
        "crawler:latest",
    ]

    for key in candidate_keys:
        if not r.exists(key):
            continue

        key_type = redis_type(r, key)

        if key_type == "hash":
            raw = r.hgetall(key)
            nodes: dict[str, list[Any]] = {}

            for address, value in raw.items():
                parsed = try_json(value)

                if isinstance(parsed, list):
                    nodes[str(address)] = normalize_node_array(parsed)
                elif isinstance(parsed, dict):
                    node_address = parsed.get("address") or parsed.get("node") or parsed.get("addr") or address
                    nodes[str(node_address)] = dict_to_node_array(parsed)

            if nodes:
                return nodes

        elif key_type == "string":
            parsed = try_json(r.get(key))

            if isinstance(parsed, dict) and "nodes" in parsed:
                nodes = normalize_nodes_object(parsed["nodes"])

                if nodes:
                    return nodes

            if isinstance(parsed, dict):
                nodes = normalize_nodes_object(parsed)

                if nodes:
                    return nodes

        elif key_type in {"set", "zset", "list"}:
            values = []

            if key_type == "set":
                values = list(r.smembers(key))
            elif key_type == "zset":
                values = list(r.zrange(key, 0, -1))
            elif key_type == "list":
                values = list(r.lrange(key, 0, -1))

            nodes = normalize_nodes_object([try_json(item) for item in values])

            if nodes:
                return nodes

    return {}


def extract_nodes_by_scan(r, scan_pattern: str = "*", scan_limit: int = 250000) -> dict[str, list[Any]]:
    nodes: dict[str, list[Any]] = {}
    scanned = 0

    for key in r.scan_iter(scan_pattern):
        scanned += 1

        if scanned > scan_limit:
            break

        key_type = redis_type(r, key)

        if key_type == "hash":
            raw = r.hgetall(key)

            for address, value in raw.items():
                parsed = try_json(value)

                if isinstance(parsed, list):
                    nodes[str(address)] = normalize_node_array(parsed)
                elif isinstance(parsed, dict):
                    node_address = parsed.get("address") or parsed.get("node") or parsed.get("addr") or address
                    nodes[str(node_address)] = dict_to_node_array(parsed)

        elif key_type == "string":
            parsed = try_json(r.get(key))

            if isinstance(parsed, dict) and "nodes" in parsed:
                nodes.update(normalize_nodes_object(parsed["nodes"]))

            elif isinstance(parsed, dict):
                address = parsed.get("address") or parsed.get("node") or parsed.get("addr")

                if address:
                    nodes[str(address)] = dict_to_node_array(parsed)

        elif key_type in {"set", "zset", "list"}:
            if key_type == "set":
                values = list(r.smembers(key))
            elif key_type == "zset":
                values = list(r.zrange(key, 0, -1))
            else:
                values = list(r.lrange(key, 0, -1))

            nodes.update(normalize_nodes_object([try_json(item) for item in values]))

    return nodes


def extract_nodes_from_redis(r, scan_pattern: str = "*", scan_limit: int = 250000) -> dict[str, list[Any]]:
    nodes = extract_nodes_from_known_keys(r)

    if nodes:
        return nodes

    return extract_nodes_by_scan(r, scan_pattern=scan_pattern, scan_limit=scan_limit)


def latest_height(nodes: dict[str, list[Any]]) -> int | None:
    heights = [
        safe_int(row[4])
        for row in nodes.values()
        if len(row) > 4 and safe_int(row[4]) is not None
    ]

    return max(heights) if heights else None


def reachable_count(nodes: dict[str, list[Any]]) -> int:
    total = 0

    for row in nodes.values():
        row = normalize_node_array(row)
        metadata = row[19] if isinstance(row[19], dict) else {}
        reachable = metadata.get("reachable")

        if reachable is False:
            continue

        total += 1

    return total


def build_latest_payload(nodes: dict[str, list[Any]], source: str) -> dict[str, Any]:
    timestamp = utc_now()

    return {
        "schema": "zzx-bitnodes-redis-export-v2",
        "source": source,
        "timestamp": timestamp,
        "updated_at": utc_iso(timestamp),
        "total_nodes": len(nodes),
        "known_nodes": len(nodes),
        "reachable_nodes": reachable_count(nodes),
        "unreachable_nodes": max(0, len(nodes) - reachable_count(nodes)),
        "latest_height": latest_height(nodes),
        "nodes": nodes,
    }


def export_empty_api(output: Path, archive_dir: Path, *, compact: bool = False, no_gzip: bool = False) -> None:
    latest = build_latest_payload(
        {},
        source="zzx-labs-bitnodes-redis-export-empty",
    )

    output.mkdir(parents=True, exist_ok=True)

    temp = output / "_empty_latest_raw.json"
    write_json(temp, latest, pretty=not compact)

    export_all(
        input_path=temp,
        output_dir=output,
        source="zzx-labs-bitnodes-redis-export-empty",
        pretty=not compact,
        archive_dir=archive_dir,
        gzip_archive=not no_gzip,
    )

    try:
        temp.unlink()
    except FileNotFoundError:
        pass

    print(f"exported 0 nodes to {output}")


def export_static_api(
    output: Path,
    *,
    archive_dir: Path,
    scan_pattern: str = "*",
    scan_limit: int = 250000,
    compact: bool = False,
    no_gzip: bool = False,
    empty_on_failure: bool = True,
) -> int:
    try:
        r = redis_client()
        r.ping()
    except Exception as exc:
        print(f"Redis unavailable: {exc}")

        if empty_on_failure:
            export_empty_api(output, archive_dir, compact=compact, no_gzip=no_gzip)
            return 0

        return 1

    nodes = extract_nodes_from_redis(
        r,
        scan_pattern=scan_pattern,
        scan_limit=scan_limit,
    )

    latest = build_latest_payload(
        nodes,
        source="zzx-labs-bitnodes-redis-export",
    )

    output.mkdir(parents=True, exist_ok=True)

    temp = output / "_redis_latest_raw.json"
    write_json(temp, latest, pretty=not compact)

    export_all(
        input_path=temp,
        output_dir=output,
        source="zzx-labs-bitnodes-redis-export",
        pretty=not compact,
        archive_dir=archive_dir,
        gzip_archive=not no_gzip,
    )

    try:
        temp.unlink()
    except FileNotFoundError:
        pass

    print(
        "redis export complete: "
        f"{len(nodes)} nodes, "
        f"reachable={latest['reachable_nodes']}, "
        f"latest_height={latest['latest_height']}, "
        f"output={output}"
    )

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export classic Redis-backed Bitnodes crawler data to static JSON API."
    )

    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE))
    parser.add_argument("--scan-pattern", default="*")
    parser.add_argument("--scan-limit", type=int, default=250000)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--no-gzip", action="store_true")
    parser.add_argument("--fail-empty", action="store_true")

    args = parser.parse_args()

    return export_static_api(
        Path(args.output).resolve(),
        archive_dir=Path(args.archive_dir).resolve(),
        scan_pattern=args.scan_pattern,
        scan_limit=args.scan_limit,
        compact=args.compact,
        no_gzip=args.no_gzip,
        empty_on_failure=not args.fail_empty,
    )


if __name__ == "__main__":
    raise SystemExit(main())
