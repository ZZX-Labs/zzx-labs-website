#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))


DEFAULT_OUTPUT = APP_ROOT / "bitcoin" / "bitnodes" / "api" / "originalbitnodes"
DEFAULT_ARCHIVE = APP_ROOT / "bitcoin" / "bitnodes" / "archive" / "originalbitnodes"
DEFAULT_DATAPLANE = APP_ROOT / "bitcoin" / "bitnodes" / "api" / "data"
DEFAULT_DATABASE = "zzx_bitnodes"
DEFAULT_MAX_BYTES = 24_000_000

EXPORT = TOOLS_DIR / "export.py"


def utc_now() -> int:
    return int(time.time())


def utc_iso(ts: int | None = None) -> str:
    if ts is None:
        ts = utc_now()

    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def write_json(path: Path, payload: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
            default=str,
        )
        + "\n",
        encoding="utf-8",
    )


def run(command: list[str]) -> int:
    print("$ " + " ".join(str(part) for part in command), flush=True)

    result = subprocess.run(
        command,
        cwd=str(APP_ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    if result.stdout.strip():
        print(result.stdout.strip(), flush=True)

    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr, flush=True)

    return result.returncode


def py(script: Path, *args: str) -> list[str]:
    return [sys.executable, str(script), *args]


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

        return int(float(value))
    except Exception:
        return default


def safe_bool(value: Any, default: bool | None = None) -> bool | None:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    text = str(value or "").strip().lower()

    if text in {"true", "yes", "y", "on", "ok", "up", "online", "reachable", "connected", "success"}:
        return True

    if text in {"false", "no", "n", "off", "down", "offline", "unreachable", "failed", "fail", "timeout", "error"}:
        return False

    return default


def clean_address(value: Any) -> str:
    return str(value or "").strip()


def address_network(address: str) -> str:
    text = clean_address(address).lower()

    if text.endswith(".onion") or ".onion:" in text:
        return "tor"

    if text.endswith(".i2p") or ".i2p:" in text:
        return "i2p"

    host = text

    if text.startswith("[") and "]" in text:
        host = text[1:text.index("]")]
    elif text.count(":") == 1:
        host = text.rsplit(":", 1)[0]

    if host.count(".") == 3 and ":" not in host:
        return "ipv4"

    if ":" in host:
        return "ipv6"

    return "dns" if host else "unknown"


def normalize_node_array(row: list[Any], *, source: str) -> list[Any]:
    output = list(row)

    while len(output) < 20:
        output.append(None)

    if not isinstance(output[19], dict):
        output[19] = {}

    metadata = output[19]
    metadata.setdefault("source", source)
    metadata.setdefault("crawler", source)
    metadata.setdefault("source_type", "original-bitnodes-redis")
    metadata.setdefault("redis_exported_at", utc_iso())

    return output


def pick(value: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in value and value[key] not in ("", None):
            return value[key]

    return default


def dict_to_node_array(value: dict[str, Any], *, source: str) -> list[Any]:
    metadata = dict(value.get("metadata", {})) if isinstance(value.get("metadata"), dict) else {}

    address = clean_address(
        pick(value, "address", "node", "addr", "host", default="")
    )

    reachable = pick(value, "reachable", "reachable_now", "connected", "success", default=None)

    metadata.setdefault("reachable", safe_bool(reachable, reachable))
    metadata.setdefault("reachable_now", safe_bool(pick(value, "reachable_now", default=reachable), None))
    metadata.setdefault("reachable_24h", safe_bool(pick(value, "reachable_24h", default=None), None))

    metadata.setdefault("latency_ms", pick(value, "latency_ms", "latency", "ping_ms", "rtt_ms"))
    metadata.setdefault("total_uptime", pick(value, "total_uptime", "uptime_seconds", "uptime"))
    metadata.setdefault("uptime_seconds", pick(value, "uptime_seconds", "total_uptime", "uptime"))
    metadata.setdefault("success_count", value.get("success_count"))
    metadata.setdefault("failure_count", value.get("failure_count"))
    metadata.setdefault("first_seen", value.get("first_seen"))
    metadata.setdefault("last_seen", value.get("last_seen"))
    metadata.setdefault("last_failure", value.get("last_failure"))

    network = pick(value, "network", "network_type", default=address_network(address))
    metadata.setdefault("network", network)

    metadata.setdefault("is_tor", bool(value.get("is_tor") or value.get("tor") or network == "tor"))
    metadata.setdefault("tor", bool(value.get("tor") or value.get("is_tor") or network == "tor"))
    metadata.setdefault("is_i2p", bool(value.get("is_i2p") or value.get("i2p") or network == "i2p"))
    metadata.setdefault("i2p", bool(value.get("i2p") or value.get("is_i2p") or network == "i2p"))
    metadata.setdefault("is_ipv4", bool(value.get("is_ipv4") or network == "ipv4"))
    metadata.setdefault("is_ipv6", bool(value.get("is_ipv6") or network == "ipv6"))
    metadata.setdefault("is_vpn", bool(value.get("is_vpn") or value.get("vpn")))
    metadata.setdefault("vpn", bool(value.get("vpn") or value.get("is_vpn")))
    metadata.setdefault("is_proxy", bool(value.get("is_proxy") or value.get("proxy")))
    metadata.setdefault("proxy", bool(value.get("proxy") or value.get("is_proxy")))

    metadata.setdefault("is_sanctioned_node", value.get("is_sanctioned_node"))
    metadata.setdefault("is_policy_restricted_node", value.get("is_policy_restricted_node"))
    metadata.setdefault("jurisdiction_risk_level", value.get("jurisdiction_risk_level"))

    metadata.setdefault("peer_health", value.get("peer_health"))
    metadata.setdefault("peer_index", value.get("peer_index"))
    metadata.setdefault("daily_latency_ms", value.get("daily_latency_ms"))
    metadata.setdefault("weekly_latency_ms", value.get("weekly_latency_ms"))
    metadata.setdefault("monthly_latency_ms", value.get("monthly_latency_ms"))
    metadata.setdefault("daily_uptime_seconds", value.get("daily_uptime_seconds"))
    metadata.setdefault("weekly_uptime_seconds", value.get("weekly_uptime_seconds"))
    metadata.setdefault("monthly_uptime_seconds", value.get("monthly_uptime_seconds"))

    metadata.setdefault("continent", value.get("continent"))
    metadata.setdefault("region", value.get("region"))
    metadata.setdefault("territory", value.get("territory"))
    metadata.setdefault("county", value.get("county"))
    metadata.setdefault("city", value.get("city"))
    metadata.setdefault("zip", value.get("zip") or value.get("postal_code"))
    metadata.setdefault("timezone", value.get("timezone"))

    metadata.setdefault("source", source)
    metadata.setdefault("crawler", source)
    metadata.setdefault("source_type", "original-bitnodes-redis")
    metadata.setdefault("redis_exported_at", utc_iso())

    return [
        pick(value, "protocol_version", "protocol", "version"),
        pick(value, "user_agent", "agent", "subver", default="unknown"),
        pick(value, "connected_since", "timestamp", "seen_at", "last_seen", default=utc_now()),
        pick(value, "services", "service_bits"),
        pick(value, "height", "start_height", "latest_height"),
        pick(value, "hostname", "host"),
        pick(value, "city", default=metadata.get("city")),
        pick(value, "country_code", "country"),
        pick(value, "latitude", "lat"),
        pick(value, "longitude", "lon", "lng"),
        pick(value, "timezone", "tz", default=metadata.get("timezone")),
        value.get("asn"),
        pick(value, "organization", "org"),
        value.get("provider"),
        pick(value, "county", default=metadata.get("county")),
        pick(value, "zip", "postal_code", default=metadata.get("zip")),
        pick(value, "w3w", "what3words"),
        pick(value, "geohash", "geohashid"),
        value.get("asn_location"),
        metadata,
    ]


def normalize_nodes_object(raw: Any, *, source: str) -> dict[str, list[Any]]:
    nodes: dict[str, list[Any]] = {}

    if isinstance(raw, dict):
        if isinstance(raw.get("nodes"), dict):
            raw = raw["nodes"]

        for address, value in raw.items():
            if isinstance(value, list):
                nodes[str(address)] = normalize_node_array(value, source=source)
            elif isinstance(value, dict):
                node_address = value.get("address") or value.get("node") or value.get("addr") or address
                nodes[str(node_address)] = dict_to_node_array(value, source=source)

    elif isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue

            address = item.get("address") or item.get("node") or item.get("addr") or item.get("host")

            if address:
                nodes[str(address)] = dict_to_node_array(item, source=source)

    return {
        clean_address(address): normalize_node_array(row, source=source)
        for address, row in nodes.items()
        if clean_address(address)
    }


def extract_nodes_from_known_keys(r, *, source: str) -> dict[str, list[Any]]:
    candidate_keys = [
        "nodes",
        "nodes:latest",
        "nodes:snapshot",
        "bitnodes",
        "bitnodes:nodes",
        "bitnodes:nodes:latest",
        "bitnodes:latest",
        "bitnodes:snapshot",
        "snapshot:nodes",
        "latest:nodes",
        "latest",
        "snapshot",
        "crawler",
        "crawler:nodes",
        "crawler:latest",
        "reachable",
        "reachable_nodes",
        "known_nodes",
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
                    nodes[str(address)] = normalize_node_array(parsed, source=source)
                elif isinstance(parsed, dict):
                    node_address = parsed.get("address") or parsed.get("node") or parsed.get("addr") or address
                    nodes[str(node_address)] = dict_to_node_array(parsed, source=source)

            if nodes:
                return nodes

        elif key_type == "string":
            parsed = try_json(r.get(key))

            if isinstance(parsed, dict) and "nodes" in parsed:
                nodes = normalize_nodes_object(parsed["nodes"], source=source)

                if nodes:
                    return nodes

            if isinstance(parsed, dict):
                nodes = normalize_nodes_object(parsed, source=source)

                if nodes:
                    return nodes

        elif key_type in {"set", "zset", "list"}:
            if key_type == "set":
                values = list(r.smembers(key))
            elif key_type == "zset":
                values = list(r.zrange(key, 0, -1))
            else:
                values = list(r.lrange(key, 0, -1))

            nodes = normalize_nodes_object([try_json(item) for item in values], source=source)

            if nodes:
                return nodes

    return {}


def extract_nodes_by_scan(
    r,
    *,
    source: str,
    scan_pattern: str = "*",
    scan_limit: int = 1000000,
) -> dict[str, list[Any]]:
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
                    nodes[str(address)] = normalize_node_array(parsed, source=source)
                elif isinstance(parsed, dict):
                    node_address = parsed.get("address") or parsed.get("node") or parsed.get("addr") or address
                    nodes[str(node_address)] = dict_to_node_array(parsed, source=source)

        elif key_type == "string":
            parsed = try_json(r.get(key))

            if isinstance(parsed, dict) and "nodes" in parsed:
                nodes.update(normalize_nodes_object(parsed["nodes"], source=source))

            elif isinstance(parsed, dict):
                address = parsed.get("address") or parsed.get("node") or parsed.get("addr") or parsed.get("host")

                if address:
                    nodes[str(address)] = dict_to_node_array(parsed, source=source)

        elif key_type in {"set", "zset", "list"}:
            if key_type == "set":
                values = list(r.smembers(key))
            elif key_type == "zset":
                values = list(r.zrange(key, 0, -1))
            else:
                values = list(r.lrange(key, 0, -1))

            nodes.update(normalize_nodes_object([try_json(item) for item in values], source=source))

    return {
        clean_address(address): normalize_node_array(row, source=source)
        for address, row in nodes.items()
        if clean_address(address)
    }


def extract_nodes_from_redis(
    r,
    *,
    source: str,
    scan_pattern: str = "*",
    scan_limit: int = 1000000,
) -> dict[str, list[Any]]:
    nodes = extract_nodes_from_known_keys(r, source=source)

    if nodes:
        return nodes

    return extract_nodes_by_scan(
        r,
        source=source,
        scan_pattern=scan_pattern,
        scan_limit=scan_limit,
    )


def latest_height(nodes: dict[str, list[Any]]) -> int | None:
    heights = [
        safe_int(row[4])
        for row in nodes.values()
        if len(row) > 4 and safe_int(row[4]) is not None
    ]

    return max(heights) if heights else None


def metadata_of(row: list[Any]) -> dict[str, Any]:
    row = normalize_node_array(row, source="originalbitnodes")
    return row[19] if isinstance(row[19], dict) else {}


def reachable_count(nodes: dict[str, list[Any]]) -> int:
    total = 0

    for row in nodes.values():
        metadata = metadata_of(row)
        reachable = safe_bool(metadata.get("reachable"))

        if reachable is False:
            continue

        if reachable is True:
            total += 1
            continue

        if metadata.get("last_seen") or metadata.get("last_success"):
            total += 1
            continue

        total += 1

    return total


def flag_count(nodes: dict[str, list[Any]], key: str) -> int:
    return sum(
        1
        for row in nodes.values()
        if safe_bool(metadata_of(row).get(key)) is True
    )


def network_counts(nodes: dict[str, list[Any]]) -> Counter:
    counter: Counter = Counter()

    for address, row in nodes.items():
        metadata = metadata_of(row)
        network = metadata.get("network") or address_network(address)

        if metadata.get("is_tor") or metadata.get("tor"):
            network = "tor"
        elif metadata.get("is_i2p") or metadata.get("i2p"):
            network = "i2p"
        elif metadata.get("is_ipv6"):
            network = "ipv6"
        elif metadata.get("is_ipv4"):
            network = "ipv4"

        counter[str(network or "unknown")] += 1

    return counter


def build_latest_payload(nodes: dict[str, list[Any]], source: str) -> dict[str, Any]:
    timestamp = utc_now()
    reachable = reachable_count(nodes)
    networks = network_counts(nodes)

    statistics = {
        "reachable": reachable,
        "unreachable": max(0, len(nodes) - reachable),
        "reachable_now": flag_count(nodes, "reachable_now"),
        "reachable_24h": flag_count(nodes, "reachable_24h"),
        "ipv4": networks.get("ipv4", 0),
        "ipv6": networks.get("ipv6", 0),
        "tor": networks.get("tor", 0),
        "i2p": networks.get("i2p", 0),
        "vpn": flag_count(nodes, "is_vpn"),
        "proxy": flag_count(nodes, "is_proxy"),
    }

    return {
        "schema": "zzx-bitnodes-redis-ingest-v5",
        "source": source,
        "crawler": {
            "engine": source,
            "generated_at": utc_iso(timestamp),
            "generator": "export_from_redis.py",
            "schema_version": 5,
        },
        "timestamp": timestamp,
        "updated_at": utc_iso(timestamp),
        "total_nodes": len(nodes),
        "known_nodes": len(nodes),
        "reachable_nodes": reachable,
        "unreachable_nodes": max(0, len(nodes) - reachable),
        "latest_height": latest_height(nodes),
        "statistics": statistics,
        "network_counts": dict(networks),
        "dataplane": {
            "enabled": True,
            "canonical_output": "bitcoin/bitnodes/api/data",
            "policy": "Redis is ingest only. export_redis.py handles Redis rebuild exports. DB/dataplane artifacts are canonical.",
        },
        "nodes": nodes,
    }


def run_dataplane(
    *,
    input_path: Path,
    output_dir: Path,
    database: str,
    max_bytes: int,
    compact: bool,
    strict: bool,
) -> int:
    if not EXPORT.exists():
        print(f"Missing export wrapper: {EXPORT}", file=sys.stderr)
        return 1

    command = py(
        EXPORT,
        "dataplane",
        "--input",
        str(input_path),
        "--output-dir",
        str(output_dir),
        "--database",
        database,
        "--max-bytes",
        str(max_bytes),
    )

    if compact:
        command.append("--compact")

    if strict:
        command.append("--strict")

    return run(command)


def export_empty_api(
    output: Path,
    archive_dir: Path,
    *,
    dataplane_dir: Path,
    database: str,
    max_bytes: int,
    source: str,
    compact: bool = False,
    strict: bool = False,
) -> int:
    latest = build_latest_payload({}, source=f"{source}-redis-empty")

    output.mkdir(parents=True, exist_ok=True)
    archive_dir.mkdir(parents=True, exist_ok=True)

    latest_path = output / "latest.json"
    write_json(latest_path, latest, compact=compact)

    pointer = {
        "schema": "zzx-bitnodes-redis-empty-pointer-v2",
        "source": latest["source"],
        "generated_at": utc_iso(),
        "latest": str(latest_path),
        "dataplane": str(dataplane_dir),
        "node_count": 0,
        "policy": "Empty Redis ingest. No full snapshot fan-out written.",
    }

    write_json(archive_dir / "latest.json", pointer, compact=compact)

    if strict:
        return run_dataplane(
            input_path=latest_path,
            output_dir=dataplane_dir,
            database=database,
            max_bytes=max_bytes,
            compact=compact,
            strict=strict,
        )

    print(f"exported 0 nodes to {output}")
    return 0


def export_static_api(
    output: Path,
    *,
    archive_dir: Path,
    dataplane_dir: Path,
    database: str,
    max_bytes: int,
    source: str,
    scan_pattern: str = "*",
    scan_limit: int = 1000000,
    compact: bool = False,
    empty_on_failure: bool = True,
    strict: bool = False,
) -> int:
    try:
        r = redis_client()
        r.ping()
    except Exception as exc:
        print(f"Redis unavailable: {exc}")

        if empty_on_failure:
            return export_empty_api(
                output,
                archive_dir,
                dataplane_dir=dataplane_dir,
                database=database,
                max_bytes=max_bytes,
                source=source,
                compact=compact,
                strict=strict,
            )

        return 1

    nodes = extract_nodes_from_redis(
        r,
        source=source,
        scan_pattern=scan_pattern,
        scan_limit=scan_limit,
    )

    latest = build_latest_payload(nodes, source=source)

    output.mkdir(parents=True, exist_ok=True)
    archive_dir.mkdir(parents=True, exist_ok=True)

    latest_path = output / "latest.json"
    write_json(latest_path, latest, compact=compact)

    archive_pointer = {
        "schema": "zzx-bitnodes-redis-ingest-pointer-v2",
        "source": latest["source"],
        "generated_at": utc_iso(),
        "latest": str(latest_path),
        "dataplane": str(dataplane_dir),
        "node_count": len(nodes),
        "reachable_nodes": latest["reachable_nodes"],
        "latest_height": latest["latest_height"],
        "policy": "Redis ingest writes latest.json for interchange only. Dataplane is canonical.",
    }

    write_json(archive_dir / "latest.json", archive_pointer, compact=compact)

    code = run_dataplane(
        input_path=latest_path,
        output_dir=dataplane_dir,
        database=database,
        max_bytes=max_bytes,
        compact=compact,
        strict=strict,
    )

    if code != 0:
        return code

    print(
        "redis ingest complete: "
        f"{len(nodes)} nodes, "
        f"reachable={latest['reachable_nodes']}, "
        f"latest_height={latest['latest_height']}, "
        f"output={output}, "
        f"dataplane={dataplane_dir}"
    )

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Ingest classic Redis-backed Bitnodes crawler data into ZZX Bitnodes. "
            "This reads Redis and writes latest.json plus DB-first dataplane artifacts. "
            "Use export_redis.py for exporting dataplane data back into Redis rebuild files."
        )
    )

    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE))
    parser.add_argument("--dataplane-dir", default=str(DEFAULT_DATAPLANE))
    parser.add_argument("--database", default=DEFAULT_DATABASE)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--source", default="originalbitnodes")
    parser.add_argument("--scan-pattern", default="*")
    parser.add_argument("--scan-limit", type=int, default=1000000)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--fail-empty", action="store_true")
    parser.add_argument("--strict", action="store_true")

    args = parser.parse_args()

    return export_static_api(
        Path(args.output).resolve(),
        archive_dir=Path(args.archive_dir).resolve(),
        dataplane_dir=Path(args.dataplane_dir).resolve(),
        database=str(args.database),
        max_bytes=int(args.max_bytes),
        source=str(args.source),
        scan_pattern=args.scan_pattern,
        scan_limit=args.scan_limit,
        compact=args.compact,
        empty_on_failure=not args.fail_empty,
        strict=args.strict,
    )


if __name__ == "__main__":
    raise SystemExit(main())
