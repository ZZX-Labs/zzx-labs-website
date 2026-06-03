#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
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

POLICY_RESTRICTED_COUNTRIES = {
    "CU", "CUBA",
    "IR", "IRAN",
    "KP", "NORTH KOREA", "KOREA, DEMOCRATIC PEOPLE'S REPUBLIC OF",
    "SY", "SYRIA",
}

POLICY_WATCH_COUNTRIES = {
    "RU", "RUSSIA", "RUSSIAN FEDERATION",
    "BY", "BELARUS",
    "CN", "CHINA",
    "HK", "HONG KONG",
    "MO", "MACAO", "MACAU",
    "VE", "VENEZUELA",
}

POLICY_RESTRICTED_REGIONS = {
    "CRIMEA",
    "DONETSK",
    "LUHANSK",
    "SEVASTOPOL",
}

VPN_SCORE_THRESHOLD = 35.0
PROXY_SCORE_THRESHOLD = 0.35


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def unix_now() -> int:
    return int(time.time())


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return re.sub(r"\s+", " ", text)


def clean_upper(value: Any) -> str:
    return clean(value).upper()


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
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


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
        or record.get("hostname")
        or ""
    )

    record["address"] = str(address)

    metadata = record.get("metadata")
    if isinstance(metadata, dict):
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
            "suspected_vpn",
            "is_proxy",
            "suspected_proxy",
            "network",
            "first_seen",
            "last_seen",
            "success_count",
            "failure_count",
            "country",
            "country_code",
            "region",
            "territory",
            "city",
            "latitude",
            "longitude",
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

    if not value:
        return "", default_port

    if value.startswith("[") and "]:" in value:
        host, port = value.split("]:", 1)
        return host[1:], int(port) if port.isdigit() else default_port

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

    return value, default_port


def node_address(row: dict[str, Any]) -> str:
    return clean(row.get("address") or row.get("node") or row.get("addr") or row.get("host") or row.get("hostname"))


def node_host(row: dict[str, Any]) -> str:
    address = node_address(row)

    try:
        host, _port = split_host_port(address)
        return host.lower().strip()
    except Exception:
        return address.lower().strip()


def node_port(row: dict[str, Any]) -> int:
    try:
        _host, port = split_host_port(node_address(row))
        return int(row.get("port") or port)
    except Exception:
        return int(number(row.get("port"), 8333) or 8333)


def parsed_ip(row: dict[str, Any]) -> ipaddress._BaseAddress | None:
    host = node_host(row)

    if not host or ".onion" in host or ".i2p" in host:
        return None

    try:
        return ipaddress.ip_address(host)
    except ValueError:
        return None


def nested_bool(row: dict[str, Any], *keys: str) -> bool:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)
        parsed = boolish(value)

        if parsed is True:
            return True

    return False


def nested_score(row: dict[str, Any], *keys: str) -> float:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)
        parsed = number(value)

        if parsed is not None:
            return float(parsed)

    return 0.0


def is_tor(row: dict[str, Any]) -> bool:
    address = node_address(row).lower()
    host = node_host(row)

    return bool(
        ".onion" in address
        or host.endswith(".onion")
        or nested_bool(
            row,
            "is_tor",
            "tor.is_tor",
            "tor.suspected_tor",
            "metadata.is_tor",
            "metadata.tor",
            "enrichment.tor.is_tor",
            "enrichment.tor.suspected_tor",
        )
    )


def is_i2p(row: dict[str, Any]) -> bool:
    address = node_address(row).lower()
    host = node_host(row)

    return bool(
        ".i2p" in address
        or host.endswith(".i2p")
        or nested_bool(
            row,
            "is_i2p",
            "i2p.is_i2p",
            "i2p.suspected_i2p",
            "metadata.is_i2p",
            "metadata.i2p",
            "enrichment.i2p.is_i2p",
            "enrichment.i2p.suspected_i2p",
        )
    )


def is_ipv4(row: dict[str, Any]) -> bool:
    if is_tor(row) or is_i2p(row):
        return False

    ip = parsed_ip(row)

    if ip is not None:
        return ip.version == 4

    explicit = nested_bool(row, "is_ipv4", "ipv4.is_ipv4", "metadata.is_ipv4", "enrichment.ipv4.is_ipv4")

    if explicit and not nested_bool(row, "is_ipv6", "ipv6.is_ipv6", "metadata.is_ipv6", "enrichment.ipv6.is_ipv6"):
        return True

    return False


def is_ipv6(row: dict[str, Any]) -> bool:
    if is_tor(row) or is_i2p(row):
        return False

    ip = parsed_ip(row)

    if ip is not None:
        return ip.version == 6

    explicit = nested_bool(row, "is_ipv6", "ipv6.is_ipv6", "metadata.is_ipv6", "enrichment.ipv6.is_ipv6")

    if explicit and not nested_bool(row, "is_ipv4", "ipv4.is_ipv4", "metadata.is_ipv4", "enrichment.ipv4.is_ipv4"):
        return True

    return False


def network_class(row: dict[str, Any]) -> str:
    if is_tor(row):
        return "tor"
    if is_i2p(row):
        return "i2p"
    if is_ipv6(row):
        return "ipv6"
    if is_ipv4(row):
        return "ipv4"

    value = clean(row.get("network") or deep_get(row, "metadata.network", "network.type")).lower()

    if value in {"ipv4", "ipv6", "tor", "i2p"}:
        return value

    return "unknown"


def is_proxy(row: dict[str, Any]) -> bool:
    if nested_bool(
        row,
        "suspected_proxy",
        "is_proxy",
        "proxy.suspected_proxy",
        "proxy.is_proxy",
        "metadata.suspected_proxy",
        "metadata.is_proxy",
        "metadata.proxy",
        "enrichment.proxy.suspected_proxy",
        "enrichment.proxy.is_proxy",
    ):
        return True

    score = nested_score(row, "proxy_score", "proxy.proxy_score", "metadata.proxy_score")

    return score >= PROXY_SCORE_THRESHOLD


def is_vpn(row: dict[str, Any]) -> bool:
    if nested_bool(
        row,
        "suspected_vpn",
        "is_vpn",
        "vpn.suspected_vpn",
        "vpn.is_vpn",
        "metadata.suspected_vpn",
        "metadata.is_vpn",
        "metadata.vpn",
        "enrichment.vpn.suspected_vpn",
        "enrichment.vpn.is_vpn",
    ):
        return True

    score = nested_score(row, "vpn_score", "vpn.vpn_score", "metadata.vpn_score")

    return score >= VPN_SCORE_THRESHOLD


def country_values(row: dict[str, Any]) -> set[str]:
    values = {
        clean_upper(row.get("country")),
        clean_upper(row.get("country_code")),
        clean_upper(row.get("country_name")),
        clean_upper(deep_get(row, "geoip.country")),
        clean_upper(deep_get(row, "geoip.country_code")),
        clean_upper(deep_get(row, "geoip.country_name")),
        clean_upper(deep_get(row, "geo.country")),
        clean_upper(deep_get(row, "geo.country_code")),
        clean_upper(deep_get(row, "country_data.country")),
        clean_upper(deep_get(row, "country_data.country_code")),
        clean_upper(deep_get(row, "geoip_data.country")),
        clean_upper(deep_get(row, "geoip_data.country_code")),
    }

    return {value for value in values if value}


def region_values(row: dict[str, Any]) -> set[str]:
    values = {
        clean_upper(row.get("region")),
        clean_upper(row.get("territory")),
        clean_upper(row.get("admin1")),
        clean_upper(row.get("state")),
        clean_upper(row.get("province")),
        clean_upper(deep_get(row, "geoip.region")),
        clean_upper(deep_get(row, "geoip.territory")),
        clean_upper(deep_get(row, "geo.region")),
        clean_upper(deep_get(row, "territory_data.territory")),
        clean_upper(deep_get(row, "territory_data.admin1")),
        clean_upper(deep_get(row, "sanctions_data.region")),
    }

    return {value for value in values if value}


def is_policy_restricted(row: dict[str, Any]) -> bool:
    if nested_bool(
        row,
        "is_policy_restricted_node",
        "policy_restricted",
        "sanctioned",
        "sanctions_data.is_policy_restricted",
        "sanctions_data.sanctioned",
        "metadata.is_policy_restricted",
        "metadata.policy_restricted",
        "enrichment.sanctioned_nodes.is_policy_restricted",
        "enrichment.sanctioned_nodes.policy_restricted",
    ):
        return True

    countries = country_values(row)
    regions = region_values(row)

    if countries & POLICY_RESTRICTED_COUNTRIES:
        return True

    if regions & POLICY_RESTRICTED_REGIONS:
        return True

    return False


def is_policy_watch(row: dict[str, Any]) -> bool:
    if is_policy_restricted(row):
        return False

    if nested_bool(
        row,
        "policy_watch",
        "is_policy_watch_node",
        "sanctions_data.is_policy_watch",
        "metadata.policy_watch",
        "enrichment.sanctioned_nodes.is_policy_watch",
    ):
        return True

    return bool(country_values(row) & POLICY_WATCH_COUNTRIES)


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

    ipv4 = sum(1 for row in nodes if network_class(row) == "ipv4")
    ipv6 = sum(1 for row in nodes if network_class(row) == "ipv6")
    tor = sum(1 for row in nodes if network_class(row) == "tor")
    i2p = sum(1 for row in nodes if network_class(row) == "i2p")
    unknown_network = sum(1 for row in nodes if network_class(row) == "unknown")

    proxy = sum(1 for row in nodes if is_proxy(row))
    vpn = sum(1 for row in nodes if is_vpn(row))
    policy_restricted = sum(1 for row in nodes if is_policy_restricted(row))
    policy_watch = sum(1 for row in nodes if is_policy_watch(row))

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
    vpn_confidence_counts = Counter()
    proxy_confidence_counts = Counter()
    policy_counts = Counter()

    for row in nodes:
        network = network_class(row)
        network_counts[network] += 1

        if is_vpn(row):
            vpn_confidence_counts[field(row, "vpn_confidence", "vpn.vpn_confidence") or "unknown"] += 1

        if is_proxy(row):
            proxy_confidence_counts[field(row, "proxy_confidence", "proxy.proxy_confidence") or "unknown"] += 1

        if is_policy_restricted(row):
            policy_counts["restricted"] += 1
        elif is_policy_watch(row):
            policy_counts["watch"] += 1
        else:
            policy_counts["clear"] += 1

        country_counts[field(row, "country_code", "country", "country_data.country_code", "geoip_data.country_code", "geoip.country_code") or "Unknown"] += 1
        city_counts[field(row, "city", "city_data.city", "geoip_data.city", "geoip.city") or "Unknown"] += 1
        territory_counts[field(row, "territory", "admin1", "state", "province", "territory_data.territory", "geoip.region") or "Unknown"] += 1
        county_counts[field(row, "county", "admin2", "county_data.county") or "Unknown"] += 1
        continent_counts[field(row, "continent", "continent_data.continent", "geoip.continent") or "Unknown"] += 1
        region_counts[field(row, "region", "region_data.region", "geoip.region") or "Unknown"] += 1
        agent_counts[field(row, "agent", "user_agent") or "Unknown"] += 1
        version_counts[str(row.get("protocol_version") or row.get("protocol") or row.get("version") or "Unknown")] += 1
        service_counts[str(service_value(row))] += 1
        port_counts[str(node_port(row))] += 1
        asn_counts[field(row, "asn", "isp.asn", "isp_data.asn", "geoip_data.asn", "geoip.asn") or "Unknown"] += 1
        provider_counts[field(row, "provider", "org", "organization", "isp.provider", "isp_data.provider", "geoip_data.provider", "geoip.provider") or "Unknown"] += 1
        timezone_counts[field(row, "timezone", "timezone_data.timezone", "geoip_data.timezone", "geoip.timezone") or "Unknown"] += 1

    duplicates = duplicate_groups(nodes)

    def ratio(value: int) -> float:
        return round(value / total, 8) if total else 0

    return {
        "schema": "zzx-bitnodes-aggregate-v3",
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
            "unknown_network": unknown_network,
            "proxy": proxy,
            "suspected_proxy": proxy,
            "vpn": vpn,
            "suspected_vpn": vpn,
            "policy_restricted": policy_restricted,
            "policy_watch": policy_watch,
            "synced": synced,
            "not_synced": not_synced,
            "duplicates": len(duplicates),
        },
        "ratios": {
            "reachable": ratio(reachable),
            "reachable_now": ratio(reachable_now),
            "reachable_24h": ratio(reachable_24h),
            "unreachable": ratio(unreachable),
            "ipv4": ratio(ipv4),
            "ipv6": ratio(ipv6),
            "tor": ratio(tor),
            "i2p": ratio(i2p),
            "unknown_network": ratio(unknown_network),
            "vpn": ratio(vpn),
            "suspected_vpn": ratio(vpn),
            "proxy": ratio(proxy),
            "suspected_proxy": ratio(proxy),
            "policy_restricted": ratio(policy_restricted),
            "policy_watch": ratio(policy_watch),
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
            "vpn_confidence": top_counter(vpn_confidence_counts),
            "proxy_confidence": top_counter(proxy_confidence_counts),
            "policy": top_counter(policy_counts),
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
        f"ipv4={summary['counts']['ipv4']}, "
        f"ipv6={summary['counts']['ipv6']}, "
        f"tor={summary['counts']['tor']}, "
        f"i2p={summary['counts']['i2p']}, "
        f"vpn={summary['counts']['suspected_vpn']}, "
        f"proxy={summary['counts']['suspected_proxy']}, "
        f"policy_restricted={summary['counts']['policy_restricted']}, "
        f"known={summary['counts']['known']}, "
        f"output={output_path}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
