#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_STATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state"
DEFAULT_AGGREGATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api" / "aggregate"

UNKNOWN_VALUES = {
    "",
    "unknown",
    "none",
    "null",
    "undefined",
    "—",
    "-",
    "n/a",
    "na",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def unix_now() -> int:
    return int(time.time())


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return re.sub(r"\s+", " ", text)


def boolish(value: Any) -> bool | None:
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

    return None


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if not math.isfinite(n):
        return fallback

    return n


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return fallback


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def nested_dict(row: dict[str, Any], key: str) -> dict[str, Any]:
    value = row.get(key)
    return value if isinstance(value, dict) else {}


def deep_get(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if "." not in key:
            if key in row:
                return row.get(key)
            continue

        current: Any = row
        ok = True

        for part in key.split("."):
            if not isinstance(current, dict) or part not in current:
                ok = False
                break
            current = current.get(part)

        if ok:
            return current

    return None


def normalize_node_record(node: Any) -> dict[str, Any]:
    if isinstance(node, dict):
        record = dict(node)
    else:
        record = {"address": str(node)}

    address = (
        record.get("address")
        or record.get("node")
        or record.get("addr")
        or record.get("host")
        or ""
    )

    record["address"] = str(address)

    if "metadata" in record and isinstance(record["metadata"], dict):
        metadata = record["metadata"]

        for key in (
            "reachable",
            "reachable_now",
            "reachable_24h",
            "latency_ms",
            "uptime_seconds",
            "total_uptime",
            "peer_index",
            "is_tor",
            "is_i2p",
            "is_ipv4",
            "is_ipv6",
            "is_vpn",
            "is_proxy",
            "network",
            "first_seen",
            "last_seen",
            "success_count",
            "failure_count",
        ):
            if key not in record and key in metadata:
                record[key] = metadata.get(key)

    return record


def node_array_to_record(address: str, data: list[Any]) -> dict[str, Any]:
    row = list(data)

    while len(row) < 20:
        row.append(None)

    metadata = row[19] if isinstance(row[19], dict) else {}

    record = {
        "address": address,
        "protocol_version": row[0],
        "protocol": row[0],
        "agent": row[1],
        "user_agent": row[1],
        "connected_since": row[2],
        "services": row[3],
        "height": row[4],
        "hostname": row[5],
        "city": row[6],
        "country": row[7],
        "country_code": row[7],
        "latitude": row[8],
        "longitude": row[9],
        "timezone": row[10],
        "asn": row[11],
        "organization": row[12],
        "provider": row[13],
        "county": row[14],
        "zip": row[15],
        "postal_code": row[15],
        "w3w": row[16],
        "what3words": row[16],
        "geohash": row[17],
        "geohashid": row[17],
        "asn_location": row[18],
        "metadata": metadata,
    }

    if isinstance(metadata, dict):
        for key, value in metadata.items():
            record.setdefault(key, value)

    return normalize_node_record(record)


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [normalize_node_record(item) for item in payload]

    if not isinstance(payload, dict):
        return []

    for key in (
        "rows",
        "results",
        "data",
        "reachable",
        "unreachable",
        "node_records",
        "peers",
    ):
        value = payload.get(key)

        if isinstance(value, list):
            return [normalize_node_record(item) for item in value]

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [normalize_node_record(item) for item in nodes]

    if isinstance(nodes, dict):
        output = []

        for address, data in nodes.items():
            if isinstance(data, dict):
                output.append(normalize_node_record({"address": address, **data}))
            elif isinstance(data, list):
                output.append(node_array_to_record(str(address), data))
            else:
                output.append(normalize_node_record({"address": address, "value": data}))

        return output

    for key in ("latest", "snapshot", "payload"):
        value = payload.get(key)
        extracted = extract_nodes(value)
        if extracted:
            return extracted

    return []


def split_host_port(address: str, default_port: int = 8333) -> tuple[str, int]:
    value = str(address or "").strip()

    if value.startswith("[") and "]:" in value:
        return value.split("]:", 1)[0][1:], int(value.rsplit(":", 1)[1])

    if value.startswith("[") and value.endswith("]"):
        return value[1:-1], default_port

    lower = value.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        host, port = value.rsplit(":", 1)
        return host, int(port) if port.isdigit() else default_port

    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)

        if port.isdigit():
            return host, int(port)

    if value.count(":") > 1:
        return value, default_port

    if ":" not in value and value:
        return value, default_port

    return value, default_port


def node_address(row: dict[str, Any]) -> str:
    return clean(row.get("address") or row.get("node") or row.get("addr") or row.get("host"))


def node_host(row: dict[str, Any]) -> str:
    address = node_address(row)

    try:
        host, _port = split_host_port(address)
        return host.lower()
    except Exception:
        return address.lower()


def node_port(row: dict[str, Any]) -> int:
    try:
        _host, port = split_host_port(node_address(row))
        return int(row.get("port") or port)
    except Exception:
        return int(number(row.get("port"), 8333) or 8333)


def is_tor(row: dict[str, Any]) -> bool:
    address = node_address(row).lower()
    return bool(
        row.get("is_tor")
        or row.get("tor") is True
        or deep_get(row, "tor.is_tor", "metadata.is_tor", "metadata.tor", "enrichment.tor.is_tor")
        or ".onion" in address
    )


def is_i2p(row: dict[str, Any]) -> bool:
    address = node_address(row).lower()
    return bool(
        row.get("is_i2p")
        or row.get("i2p") is True
        or deep_get(row, "i2p.is_i2p", "metadata.is_i2p", "metadata.i2p", "enrichment.i2p.is_i2p")
        or ".i2p" in address
    )


def is_ipv6(row: dict[str, Any]) -> bool:
    address = node_address(row).lower()
    host = node_host(row)
    return bool(
        row.get("is_ipv6")
        or deep_get(row, "metadata.is_ipv6", "ipv6.is_ipv6", "enrichment.ipv6.is_ipv6")
        or (":" in host and ".onion" not in address and ".i2p" not in address)
    )


def is_ipv4(row: dict[str, Any]) -> bool:
    host = node_host(row)
    return bool(
        row.get("is_ipv4")
        or deep_get(row, "metadata.is_ipv4", "ipv4.is_ipv4", "enrichment.ipv4.is_ipv4")
        or (host.count(".") == 3 and ":" not in host)
    )


def is_proxy(row: dict[str, Any]) -> bool:
    return bool(
        row.get("is_proxy")
        or row.get("proxy") is True
        or deep_get(row, "proxy.is_proxy", "metadata.is_proxy", "metadata.proxy", "enrichment.proxy.is_proxy")
    )


def is_vpn(row: dict[str, Any]) -> bool:
    return bool(
        row.get("is_vpn")
        or row.get("vpn") is True
        or deep_get(row, "vpn.is_vpn", "metadata.is_vpn", "metadata.vpn", "enrichment.vpn.is_vpn")
    )


def is_policy_restricted(row: dict[str, Any]) -> bool:
    return bool(
        row.get("is_policy_restricted_node")
        or row.get("policy_restricted")
        or deep_get(row, "sanctions_data.is_policy_restricted", "metadata.is_policy_restricted", "enrichment.sanctioned_nodes.is_policy_restricted")
    )


def is_reachable(row: dict[str, Any]) -> bool:
    for key in (
        "reachable",
        "reachable_now",
        "reachable_24h",
        "connected",
        "online",
        "success",
    ):
        value = boolish(row.get(key))

        if value is True:
            return True

    for key in (
        "metadata.reachable",
        "metadata.reachable_now",
        "metadata.reachable_24h",
        "peer_health.reachable",
        "peer_health.reachable_now",
        "enrichment.peer_health.reachable",
    ):
        value = boolish(deep_get(row, key))

        if value is True:
            return True

    status = str(row.get("status", "")).strip().lower()

    if status in {"1", "true", "ok", "reachable", "connected", "success", "online", "up"}:
        return True

    if row.get("last_success") or deep_get(row, "metadata.last_seen", "metadata.last_success"):
        return True

    if row.get("height") is not None and (row.get("agent") or row.get("user_agent")):
        return True

    return False


def is_unreachable(row: dict[str, Any]) -> bool:
    if is_reachable(row):
        return False

    for key in ("reachable", "reachable_now", "connected", "online", "success"):
        value = boolish(row.get(key))

        if value is False:
            return True

    for key in (
        "metadata.reachable",
        "metadata.reachable_now",
        "peer_health.reachable",
        "peer_health.reachable_now",
        "enrichment.peer_health.reachable",
    ):
        value = boolish(deep_get(row, key))

        if value is False:
            return True

    status = str(row.get("status", "")).strip().lower()

    if status in {"0", "false", "fail", "failed", "unreachable", "timeout", "error", "offline", "down", "refused"}:
        return True

    if row.get("error") or row.get("last_failure") or deep_get(row, "metadata.last_failure"):
        return True

    return False


def is_known(row: dict[str, Any]) -> bool:
    return bool(node_address(row) or row.get("host") or row.get("hostname"))


def service_value(row: dict[str, Any]) -> int:
    return int(number(row.get("services"), 0) or 0)


def height_value(row: dict[str, Any]) -> int:
    return int(number(row.get("height"), 0) or 0)


def latency_value(row: dict[str, Any]) -> float | None:
    for key in (
        "latency_ms",
        "latency",
        "ping_ms",
        "rtt_ms",
        "metadata.latency_ms",
        "peer_health.latency_ms",
    ):
        value = deep_get(row, key) if "." in key else row.get(key)
        parsed = number(value)

        if parsed is not None:
            return parsed

    return None


def uptime_value(row: dict[str, Any]) -> float:
    for key in (
        "uptime_seconds",
        "total_uptime",
        "uptime",
        "age_seconds",
        "last_seen_duration",
        "metadata.uptime_seconds",
        "metadata.total_uptime",
    ):
        value = deep_get(row, key) if "." in key else row.get(key)
        parsed = number(value)

        if parsed is not None:
            return float(parsed)

    first_seen = number(row.get("first_seen") or deep_get(row, "metadata.first_seen"))
    last_seen = number(row.get("last_seen") or row.get("timestamp") or deep_get(row, "metadata.last_seen"))

    if first_seen is not None and last_seen is not None and last_seen >= first_seen:
        return float(last_seen - first_seen)

    return 0.0


def field(row: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)
        text = clean(value)

        if text:
            return text

    return ""


def top_counter(counter: Counter, limit: int = 100) -> list[dict[str, Any]]:
    return [{"name": name, "count": count} for name, count in counter.most_common(limit)]


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None

    sorted_values = sorted(values)
    idx = (len(sorted_values) - 1) * pct
    low = math.floor(idx)
    high = math.ceil(idx)

    if low == high:
        return round(sorted_values[int(idx)], 4)

    return round(sorted_values[low] * (high - idx) + sorted_values[high] * (idx - low), 4)


def numeric_summary(values: list[float]) -> dict[str, Any]:
    values = [value for value in values if isinstance(value, (int, float)) and math.isfinite(value)]

    if not values:
        return {
            "count": 0,
            "min": None,
            "max": None,
            "avg": None,
            "p50": None,
            "p90": None,
            "p95": None,
            "p99": None,
        }

    return {
        "count": len(values),
        "min": round(min(values), 4),
        "max": round(max(values), 4),
        "avg": round(sum(values) / len(values), 4),
        "p50": percentile(values, 0.50),
        "p90": percentile(values, 0.90),
        "p95": percentile(values, 0.95),
        "p99": percentile(values, 0.99),
    }


def duplicate_groups(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for row in nodes:
        host = node_host(row)

        if host:
            groups[host].append(row)

    output = []

    for host, rows in groups.items():
        if len(rows) <= 1:
            continue

        output.append({
            "host": host,
            "count": len(rows),
            "ports": sorted({node_port(row) for row in rows}),
            "addresses": sorted({node_address(row) for row in rows}),
            "agents": sorted({field(row, "agent", "user_agent") for row in rows if field(row, "agent", "user_agent")}),
        })

    return sorted(output, key=lambda item: (-item["count"], item["host"]))


def count_flag(nodes: list[dict[str, Any]], *keys: str) -> int:
    total = 0

    for row in nodes:
        for key in keys:
            value = deep_get(row, key) if "." in key else row.get(key)

            if boolish(value) is True:
                total += 1
                break

    return total


def aggregate(nodes: list[dict[str, Any]], *, source: str = "zzxbitnodes") -> dict[str, Any]:
    total = len(nodes)
    known = sum(1 for row in nodes if is_known(row))
    reachable = sum(1 for row in nodes if is_reachable(row))
    unreachable = sum(1 for row in nodes if is_unreachable(row))
    ambiguous = max(0, total - reachable - unreachable)

    reachable_now = count_flag(nodes, "reachable_now", "metadata.reachable_now")
    reachable_24h = count_flag(nodes, "reachable_24h", "metadata.reachable_24h")

    ipv4 = sum(1 for row in nodes if is_ipv4(row))
    ipv6 = sum(1 for row in nodes if is_ipv6(row))
    tor = sum(1 for row in nodes if is_tor(row))
    i2p = sum(1 for row in nodes if is_i2p(row))
    proxy = sum(1 for row in nodes if is_proxy(row))
    vpn = sum(1 for row in nodes if is_vpn(row))
    policy_restricted = sum(1 for row in nodes if is_policy_restricted(row))

    heights = [height_value(row) for row in nodes if height_value(row) > 0]
    latencies = [latency_value(row) for row in nodes if latency_value(row) is not None]
    uptimes = [uptime_value(row) for row in nodes if uptime_value(row) > 0]

    max_height = max(heights) if heights else 0
    min_height = min(heights) if heights else 0

    synced = sum(1 for row in nodes if height_value(row) >= max_height - 2 and max_height > 0)
    not_synced = sum(1 for row in nodes if 0 < height_value(row) < max_height - 2)

    country_counts = Counter()
    city_counts = Counter()
    territory_counts = Counter()
    county_counts = Counter()
    continent_counts = Counter()
    region_counts = Counter()
    agent_counts = Counter()
    version_counts = Counter()
    service_counts = Counter()
    port_counts = Counter()
    asn_counts = Counter()
    provider_counts = Counter()
    timezone_counts = Counter()
    network_counts = Counter()

    for row in nodes:
        network = (
            "tor" if is_tor(row)
            else "i2p" if is_i2p(row)
            else "ipv6" if is_ipv6(row)
            else "ipv4" if is_ipv4(row)
            else clean(row.get("network") or deep_get(row, "metadata.network")) or "unknown"
        )

        network_counts[network] += 1

        country_counts[field(row, "country_code", "country", "country_data.country_code", "geoip_data.country_code") or "Unknown"] += 1
        city_counts[field(row, "city", "city_data.city", "geoip_data.city") or "Unknown"] += 1
        territory_counts[field(row, "territory", "admin1", "territory_data.territory") or "Unknown"] += 1
        county_counts[field(row, "county", "admin2", "county_data.county") or "Unknown"] += 1
        continent_counts[field(row, "continent", "continent_data.continent") or "Unknown"] += 1
        region_counts[field(row, "region", "region_data.region") or "Unknown"] += 1
        agent_counts[field(row, "agent", "user_agent") or "Unknown"] += 1
        version_counts[str(row.get("protocol_version") or row.get("protocol") or row.get("version") or "Unknown")] += 1
        service_counts[str(service_value(row))] += 1
        port_counts[str(node_port(row))] += 1
        asn_counts[field(row, "asn", "isp.asn", "isp_data.asn", "geoip_data.asn") or "Unknown"] += 1
        provider_counts[field(row, "provider", "org", "organization", "isp.provider", "isp_data.provider", "geoip_data.provider") or "Unknown"] += 1
        timezone_counts[field(row, "timezone", "timezone_data.timezone", "geoip_data.timezone") or "Unknown"] += 1

    duplicates = duplicate_groups(nodes)

    return {
        "schema": "zzx-bitnodes-aggregate-v2",
        "generated_at": utc_now(),
        "generated_unix": unix_now(),
        "source": source,
        "counts": {
            "total": total,
            "known": known,
            "reachable": reachable,
            "reachable_now": reachable_now,
            "reachable_24h": reachable_24h,
            "unreachable": unreachable,
            "ambiguous": ambiguous,
            "ipv4": ipv4,
            "ipv6": ipv6,
            "tor": tor,
            "i2p": i2p,
            "proxy": proxy,
            "vpn": vpn,
            "policy_restricted": policy_restricted,
            "synced": synced,
            "not_synced": not_synced,
            "duplicates": len(duplicates),
        },
        "ratios": {
            "reachable": round(reachable / total, 8) if total else 0,
            "reachable_now": round(reachable_now / total, 8) if total else 0,
            "reachable_24h": round(reachable_24h / total, 8) if total else 0,
            "unreachable": round(unreachable / total, 8) if total else 0,
            "ipv4": round(ipv4 / total, 8) if total else 0,
            "ipv6": round(ipv6 / total, 8) if total else 0,
            "tor": round(tor / total, 8) if total else 0,
            "i2p": round(i2p / total, 8) if total else 0,
            "vpn": round(vpn / total, 8) if total else 0,
            "proxy": round(proxy / total, 8) if total else 0,
        },
        "height": {
            "min": min_height,
            "max": max_height,
            "spread": max(0, max_height - min_height),
            "summary": numeric_summary([float(value) for value in heights]),
        },
        "latency_ms": numeric_summary([float(value) for value in latencies]),
        "uptime_seconds": numeric_summary([float(value) for value in uptimes]),
        "top": {
            "networks": top_counter(network_counts),
            "countries": top_counter(country_counts),
            "continents": top_counter(continent_counts),
            "regions": top_counter(region_counts),
            "territories": top_counter(territory_counts),
            "counties": top_counter(county_counts),
            "cities": top_counter(city_counts),
            "agents": top_counter(agent_counts),
            "versions": top_counter(version_counts),
            "services": top_counter(service_counts),
            "ports": top_counter(port_counts),
            "asns": top_counter(asn_counts),
            "providers": top_counter(provider_counts),
            "timezones": top_counter(timezone_counts),
        },
        "duplicates": duplicates[:500],
    }


def find_input(api_dir: Path, state_dir: Path, explicit_input: str = "") -> Path:
    if explicit_input:
        path = Path(explicit_input).resolve()

        if path.exists():
            return path

    candidates = [
        api_dir / "enriched" / "latest.json",
        api_dir / "enriched" / "zzxbitnodes" / "latest.json",
        api_dir / "enriched" / "originalbitnodes" / "latest.json",
        api_dir / "zzxbitnodes" / "latest.json",
        api_dir / "zzxbitnodes" / "nodes.json",
        api_dir / "originalbitnodes" / "latest.json",
        api_dir / "originalbitnodes" / "nodes.json",
        api_dir / "latest.json",
        api_dir / "nodes.json",
        state_dir / "latest.json",
        state_dir / "nodes.json",
        state_dir / "registry.json",
    ]

    for path in candidates:
        if path.exists():
            return path

    return candidates[0]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Aggregate ZZX Bitnodes crawler/enrichment node output into summary JSON."
    )

    parser.add_argument("--input", default="")
    parser.add_argument("--output", default=str(DEFAULT_AGGREGATE_DIR / "latest.json"))
    parser.add_argument("--api-dir", default=str(DEFAULT_API_DIR))
    parser.add_argument("--state-dir", default=str(DEFAULT_STATE_DIR))
    parser.add_argument("--source", default="zzxbitnodes")

    args = parser.parse_args()

    api_dir = Path(args.api_dir).resolve()
    state_dir = Path(args.state_dir).resolve()
    input_path = find_input(api_dir, state_dir, args.input)

    payload = read_json(input_path, fallback={})
    nodes = extract_nodes(payload)
    summary = aggregate(nodes, source=args.source)

    summary["input"] = str(input_path)
    summary["node_count"] = len(nodes)

    output_path = Path(args.output).resolve()
    write_json(output_path, summary)

    print(
        "aggregate complete: "
        f"{len(nodes)} nodes, "
        f"reachable={summary['counts']['reachable']}, "
        f"reachable_now={summary['counts']['reachable_now']}, "
        f"reachable_24h={summary['counts']['reachable_24h']}, "
        f"known={summary['counts']['known']}, "
        f"output={output_path}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
