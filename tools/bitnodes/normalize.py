#!/usr/bin/env python3
from __future__ import annotations

import ipaddress
import math
import re
import time
from dataclasses import dataclass
from typing import Any, Mapping


DEFAULT_PORT = 8333

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
    "organization",
    "provider",
    "county",
    "zip",
    "w3w",
    "geohash",
    "asn_location",
    "metadata",
]

NODE_CONTAINER_KEYS = (
    "nodes",
    "reachable_nodes",
    "data",
    "results",
    "rows",
    "peers",
    "node_records",
)

FIELD_ALIASES = {
    "protocol_version": ["protocol_version", "protocol", "version", "version_protocol"],
    "user_agent": ["user_agent", "agent", "subver", "client", "client_user_agent"],
    "connected_since": ["connected_since", "seen_at", "first_seen", "last_seen", "timestamp", "connected"],
    "services": ["services", "service_bits", "n_services"],
    "height": ["height", "latest_height", "start_height", "block_height", "blocks"],
    "hostname": ["hostname", "host", "dns", "name", "ip"],
    "city": ["city", "city_name", "city_data.city", "geoip.city", "metadata.city"],
    "country_code": ["country_code", "country", "cc", "country_iso", "iso_code", "geoip.country_code", "metadata.country"],
    "latitude": ["latitude", "lat", "geoloc.latitude", "geo.latitude", "geoip.latitude", "geoip.lat", "location.latitude", "metadata.latitude"],
    "longitude": ["longitude", "lon", "lng", "geoloc.longitude", "geo.longitude", "geoip.longitude", "geoip.lon", "geoip.lng", "location.longitude", "metadata.longitude"],
    "timezone": ["timezone", "time_zone", "tz", "timezone_data.timezone", "geoip.timezone", "metadata.timezone"],
    "asn": ["asn", "as", "autonomous_system", "autonomous_system_number", "isp.asn", "geoip.asn", "metadata.asn"],
    "organization": ["organization", "org", "as_org", "autonomous_system_organization", "isp", "isp.organization", "geoip.organization", "metadata.organization"],
    "provider": ["provider", "isp_provider", "hosting_provider", "isp.provider", "geoip.provider", "metadata.provider"],
    "county": ["county", "county_name", "admin2", "county_data.county", "metadata.county"],
    "zip": ["zip", "postal", "postal_code", "postcode", "zip_code", "postal_data.postal_code", "metadata.zip"],
    "w3w": ["w3w", "what3words", "w3w_data.words", "w3w_data.w3w", "metadata.w3w"],
    "geohash": ["geohash", "geohashid", "geohashid_data.geohash", "geohashid_data.geohashid", "metadata.geohash"],
    "asn_location": ["asn_location", "as_location", "metadata.asn_location"],
}

METADATA_KEYS = (
    "reachable",
    "reachable_now",
    "reachable_24h",
    "latency_ms",
    "uptime_seconds",
    "total_uptime",
    "success_count",
    "failure_count",
    "first_seen",
    "last_seen",
    "last_success",
    "last_failure",
    "peer_index",
    "network",
    "is_tor",
    "tor",
    "is_i2p",
    "i2p",
    "is_ipv4",
    "is_ipv6",
    "is_cjdns",
    "is_vpn",
    "suspected_vpn",
    "vpn",
    "vpn_score",
    "vpn_confidence",
    "is_proxy",
    "suspected_proxy",
    "proxy",
    "proxy_score",
    "proxy_confidence",
    "policy_restricted",
    "is_policy_restricted_node",
    "policy_watch",
    "is_policy_watch_node",
)


@dataclass(frozen=True)
class NormalizedNode:
    address: str
    values: list[Any]

    def as_pair(self) -> tuple[str, list[Any]]:
        return self.address, self.values


def now_ts() -> int:
    return int(time.time())


def deep_get(data: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return data.get(key)

    cur: Any = data

    for part in key.split("."):
        if not isinstance(cur, Mapping):
            return None
        cur = cur.get(part)

    return cur


def first_present(data: Mapping[str, Any], aliases: list[str], default: Any = None) -> Any:
    for key in aliases:
        value = deep_get(data, key)
        if value not in ("", None):
            return value
    return default


def to_int(value: Any, default: int | None = None) -> int | None:
    try:
        if value in ("", None):
            return default
        parsed = int(float(value))
    except Exception:
        return default

    return parsed


def to_float(value: Any, default: float | None = None) -> float | None:
    try:
        if value in ("", None):
            return default
        parsed = float(value)
    except Exception:
        return default

    if not math.isfinite(parsed):
        return default

    return parsed


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    text = str(value or "").strip().lower()

    return text in {"true", "yes", "y", "ok", "up", "online", "reachable", "success"}


def normalize_country(value: Any) -> str | None:
    text = str(value or "").strip()

    if not text:
        return None

    return text.upper() if len(text) == 2 else text


def normalize_asn(value: Any) -> str | None:
    text = str(value or "").strip().upper()

    if not text:
        return None

    if text.startswith("AS"):
        return text

    if text.isdigit():
        return f"AS{text}"

    return text


def valid_lat(value: Any) -> float | None:
    lat = to_float(value)

    if lat is None:
        return None

    if -90 <= lat <= 90:
        return lat

    return None


def valid_lon(value: Any) -> float | None:
    lon = to_float(value)

    if lon is None:
        return None

    if -180 <= lon <= 180:
        return lon

    return None


def strip_ipv6_brackets(host: str) -> str:
    host = str(host or "").strip()

    if host.startswith("[") and "]" in host:
        return host[1:host.index("]")]

    return host.strip("[]")


def parse_ip(host: str) -> ipaddress._BaseAddress | None:
    try:
        return ipaddress.ip_address(strip_ipv6_brackets(host))
    except ValueError:
        return None


def is_ipv6_literal(host: str) -> bool:
    return isinstance(parse_ip(host), ipaddress.IPv6Address)


def parse_address_port(value: Any, default_port: int = DEFAULT_PORT) -> tuple[str | None, int]:
    raw = str(value or "").strip()

    if not raw:
        return None, default_port

    if raw.startswith("["):
        match = re.match(r"^\[([^\]]+)\](?::(\d+))?$", raw)
        if match:
            return match.group(1), to_int(match.group(2), default_port) or default_port

    lower = raw.lower()

    if lower.endswith(".onion") or lower.endswith(".i2p"):
        return raw, default_port

    if ".onion:" in lower or ".i2p:" in lower:
        host, port_text = raw.rsplit(":", 1)
        return host, to_int(port_text, default_port) or default_port

    if raw.count(":") == 0:
        return raw, default_port

    if raw.count(":") == 1:
        host, port_text = raw.rsplit(":", 1)
        return host, to_int(port_text, default_port) or default_port

    possible_host, possible_port = raw.rsplit(":", 1)

    if possible_port.isdigit():
        return possible_host, to_int(possible_port, default_port) or default_port

    return raw, default_port


def format_address(host: str, port: int = DEFAULT_PORT) -> str:
    host = strip_ipv6_brackets(host).strip().lower()

    if not host:
        return ""

    if is_ipv6_literal(host):
        return f"[{host}]:{port}"

    return f"{host}:{port}"


def normalize_address(
    address: Any = None,
    host: Any = None,
    port: Any = None,
    default_port: int = DEFAULT_PORT,
) -> str | None:
    parsed_host = None
    parsed_port = default_port

    if address not in ("", None):
        parsed_host, parsed_port = parse_address_port(address, default_port)

    if parsed_host is None and host not in ("", None):
        parsed_host, parsed_port = parse_address_port(host, default_port)

    if port not in ("", None):
        parsed_port = to_int(port, parsed_port) or parsed_port

    if not parsed_host:
        return None

    if parsed_port <= 0 or parsed_port > 65535:
        parsed_port = default_port

    normalized = format_address(parsed_host, parsed_port)

    return normalized or None


def classify_network(address: str) -> str:
    host, _port = parse_address_port(address)
    host = strip_ipv6_brackets(host or "").lower()

    if host.endswith(".onion"):
        return "tor"

    if host.endswith(".i2p"):
        return "i2p"

    ip = parse_ip(host)

    if ip is None:
        return "dns" if host else "unknown"

    if ip.version == 4:
        return "ipv4"

    if ip.version == 6:
        if ip in ipaddress.ip_network("fc00::/8"):
            return "cjdns"
        return "ipv6"

    return "unknown"


def normalize_metadata(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def metadata_from_dict(data: Mapping[str, Any]) -> dict[str, Any]:
    metadata = normalize_metadata(data.get("metadata"))

    for key in METADATA_KEYS:
        value = deep_get(data, key)
        if value is not None and key not in metadata:
            metadata[key] = value

    candidate_address = data.get("address") or data.get("node") or data.get("addr") or data.get("host") or data.get("hostname")
    normalized_address = normalize_address(
        address=candidate_address,
        host=data.get("host") or data.get("hostname") or data.get("ip"),
        port=data.get("port") or data.get("listen_port"),
    )

    if normalized_address:
        metadata["network"] = metadata.get("network") or classify_network(normalized_address)

    lat = valid_lat(first_present(data, FIELD_ALIASES["latitude"]))
    lon = valid_lon(first_present(data, FIELD_ALIASES["longitude"]))

    if lat is not None and "latitude" not in metadata:
        metadata["latitude"] = lat

    if lon is not None and "longitude" not in metadata:
        metadata["longitude"] = lon

    return metadata


def normalize_node_array(values: list[Any], timestamp: int | None = None) -> list[Any]:
    padded = list(values) + [None] * max(0, len(NODE_FIELD_NAMES) - len(values))
    metadata = normalize_metadata(padded[19])

    lat = valid_lat(padded[8])
    lon = valid_lon(padded[9])

    if lat is not None:
        metadata.setdefault("latitude", lat)

    if lon is not None:
        metadata.setdefault("longitude", lon)

    return [
        to_int(padded[0]),
        padded[1] if padded[1] not in ("", None) else "unknown",
        to_int(padded[2], timestamp or now_ts()),
        to_int(padded[3]),
        to_int(padded[4]),
        padded[5] if padded[5] not in ("", None) else None,
        padded[6] if padded[6] not in ("", None) else None,
        normalize_country(padded[7]),
        lat,
        lon,
        padded[10] if padded[10] not in ("", None) else None,
        normalize_asn(padded[11]),
        padded[12] if padded[12] not in ("", None) else None,
        padded[13] if padded[13] not in ("", None) else None,
        padded[14] if padded[14] not in ("", None) else None,
        padded[15] if padded[15] not in ("", None) else None,
        padded[16] if padded[16] not in ("", None) else None,
        padded[17] if padded[17] not in ("", None) else None,
        padded[18] if padded[18] not in ("", None) else None,
        metadata,
    ]


def normalize_node_dict(data: Mapping[str, Any], timestamp: int | None = None) -> list[Any]:
    metadata = metadata_from_dict(data)

    lat = valid_lat(first_present(data, FIELD_ALIASES["latitude"]))
    lon = valid_lon(first_present(data, FIELD_ALIASES["longitude"]))

    return [
        to_int(first_present(data, FIELD_ALIASES["protocol_version"])),
        first_present(data, FIELD_ALIASES["user_agent"], "unknown"),
        to_int(first_present(data, FIELD_ALIASES["connected_since"]), timestamp or now_ts()),
        to_int(first_present(data, FIELD_ALIASES["services"])),
        to_int(first_present(data, FIELD_ALIASES["height"])),
        first_present(data, FIELD_ALIASES["hostname"]),
        first_present(data, FIELD_ALIASES["city"]),
        normalize_country(first_present(data, FIELD_ALIASES["country_code"])),
        lat,
        lon,
        first_present(data, FIELD_ALIASES["timezone"]),
        normalize_asn(first_present(data, FIELD_ALIASES["asn"])),
        first_present(data, FIELD_ALIASES["organization"]),
        first_present(data, FIELD_ALIASES["provider"]),
        first_present(data, FIELD_ALIASES["county"]),
        first_present(data, FIELD_ALIASES["zip"]),
        first_present(data, FIELD_ALIASES["w3w"]),
        first_present(data, FIELD_ALIASES["geohash"]),
        first_present(data, FIELD_ALIASES["asn_location"]),
        metadata,
    ]


def normalize_node_item(
    address: str | None,
    value: Any,
    timestamp: int | None = None,
    default_port: int = DEFAULT_PORT,
) -> NormalizedNode | None:
    if isinstance(value, list):
        normalized_address = normalize_address(address=address, default_port=default_port)

        if not normalized_address:
            return None

        row = normalize_node_array(value, timestamp)
        row[19]["network"] = row[19].get("network") or classify_network(normalized_address)

        return NormalizedNode(normalized_address, row)

    if isinstance(value, Mapping):
        candidate_address = address or value.get("address") or value.get("node") or value.get("addr")
        candidate_host = value.get("host") or value.get("hostname") or value.get("ip")
        candidate_port = value.get("port") or value.get("listen_port")

        normalized_address = normalize_address(
            address=candidate_address,
            host=candidate_host,
            port=candidate_port,
            default_port=default_port,
        )

        if not normalized_address:
            return None

        values = normalize_node_dict(value, timestamp)
        values[19]["network"] = values[19].get("network") or classify_network(normalized_address)

        return NormalizedNode(normalized_address, values)

    return None


def unwrap_node_payload(raw: Any) -> Any:
    if not isinstance(raw, Mapping):
        return raw

    for key in NODE_CONTAINER_KEYS:
        value = raw.get(key)

        if isinstance(value, (Mapping, list)):
            return value

    return raw


def normalize_nodes(
    raw: Any,
    timestamp: int | None = None,
    default_port: int = DEFAULT_PORT,
) -> dict[str, list[Any]]:
    timestamp = timestamp or now_ts()
    raw = unwrap_node_payload(raw)

    output: dict[str, list[Any]] = {}

    if isinstance(raw, Mapping):
        for address, value in raw.items():
            item = normalize_node_item(str(address), value, timestamp, default_port)
            if item:
                output[item.address] = item.values
        return output

    if isinstance(raw, list):
        for index, value in enumerate(raw):
            item = normalize_node_item(None, value, timestamp, default_port)

            if item is None and isinstance(value, Mapping):
                item = normalize_node_item(str(index), value, timestamp, default_port)

            if item:
                output[item.address] = item.values

        return output

    return output


def node_array_to_dict(address: str, values: list[Any]) -> dict[str, Any]:
    padded = normalize_node_array(values)
    network = classify_network(address)

    item: dict[str, Any] = {
        "address": address,
        "network": network,
    }

    for index, name in enumerate(NODE_FIELD_NAMES):
        item[name] = padded[index]

    metadata = normalize_metadata(item.get("metadata"))
    item["metadata"] = metadata

    item["reachable"] = metadata.get("reachable")
    item["reachable_now"] = metadata.get("reachable_now")
    item["reachable_24h"] = metadata.get("reachable_24h")
    item["latency_ms"] = metadata.get("latency_ms")
    item["uptime_seconds"] = metadata.get("uptime_seconds") or metadata.get("total_uptime")
    item["total_uptime"] = metadata.get("total_uptime")
    item["peer_index"] = metadata.get("peer_index")

    item["is_tor"] = network == "tor" or boolish(metadata.get("is_tor") or metadata.get("tor"))
    item["is_i2p"] = network == "i2p" or boolish(metadata.get("is_i2p") or metadata.get("i2p"))
    item["is_ipv4"] = network == "ipv4"
    item["is_ipv6"] = network == "ipv6"
    item["is_cjdns"] = network == "cjdns"

    item["suspected_vpn"] = boolish(metadata.get("suspected_vpn") or metadata.get("is_vpn") or metadata.get("vpn"))
    item["is_vpn"] = item["suspected_vpn"]
    item["vpn_score"] = metadata.get("vpn_score")
    item["vpn_confidence"] = metadata.get("vpn_confidence")

    item["suspected_proxy"] = boolish(metadata.get("suspected_proxy") or metadata.get("is_proxy") or metadata.get("proxy"))
    item["is_proxy"] = item["suspected_proxy"]
    item["proxy_score"] = metadata.get("proxy_score")
    item["proxy_confidence"] = metadata.get("proxy_confidence")

    item["policy_restricted"] = boolish(metadata.get("policy_restricted") or metadata.get("is_policy_restricted_node"))
    item["is_policy_restricted_node"] = item["policy_restricted"]
    item["policy_watch"] = boolish(metadata.get("policy_watch") or metadata.get("is_policy_watch_node"))

    return item


def nodes_to_dicts(nodes: dict[str, list[Any]]) -> list[dict[str, Any]]:
    return [
        node_array_to_dict(address, values)
        for address, values in nodes.items()
    ]


def filter_reachable(nodes: dict[str, list[Any]]) -> dict[str, list[Any]]:
    output: dict[str, list[Any]] = {}

    for address, values in nodes.items():
        row = normalize_node_array(values)
        metadata = normalize_metadata(row[19])
        reachable = boolish(metadata.get("reachable"))

        if reachable is False:
            continue

        output[address] = row

    return output


def filter_plottable(nodes: dict[str, list[Any]]) -> dict[str, list[Any]]:
    output: dict[str, list[Any]] = {}

    for address, values in nodes.items():
        row = normalize_node_array(values)

        if row[8] is None or row[9] is None:
            continue

        output[address] = row

    return output


def split_nodes_by_network(nodes: dict[str, list[Any]]) -> dict[str, dict[str, list[Any]]]:
    groups: dict[str, dict[str, list[Any]]] = {
        "ipv4": {},
        "ipv6": {},
        "tor": {},
        "i2p": {},
        "cjdns": {},
        "dns": {},
        "unknown": {},
    }

    for address, values in nodes.items():
        network = classify_network(address)
        groups.setdefault(network, {})[address] = normalize_node_array(values)

    return groups


def node_quality(row: list[Any]) -> int:
    row = normalize_node_array(row)
    metadata = normalize_metadata(row[19])

    score = sum(1 for value in row[:19] if value not in ("", None))

    if row[4]:
        score += 10

    if row[8] is not None and row[9] is not None:
        score += 30

    if boolish(metadata.get("reachable")) is True:
        score += 20

    if boolish(metadata.get("reachable_now")) is True:
        score += 20

    if boolish(metadata.get("reachable_24h")) is True:
        score += 10

    if metadata.get("last_seen") or metadata.get("last_success"):
        score += 10

    if metadata.get("peer_index"):
        score += 5

    return score


def merge_node_sets(*sets: dict[str, list[Any]]) -> dict[str, list[Any]]:
    merged: dict[str, list[Any]] = {}

    for node_set in sets:
        for address, values in node_set.items():
            normalized_address = normalize_address(address=address)

            if not normalized_address:
                continue

            candidate = normalize_node_array(values)
            existing = merged.get(normalized_address)

            if existing is None or node_quality(candidate) >= node_quality(existing):
                merged[normalized_address] = candidate

    return merged


def validate_node_array(values: list[Any]) -> bool:
    if not isinstance(values, list):
        return False

    if len(values) < len(NODE_FIELD_NAMES):
        return False

    row = normalize_node_array(values)

    if not isinstance(row[19], dict):
        return False

    return True


def validate_nodes(nodes: dict[str, list[Any]]) -> tuple[dict[str, list[Any]], list[str]]:
    valid: dict[str, list[Any]] = {}
    errors: list[str] = []

    for address, values in nodes.items():
        normalized_address = normalize_address(address=address)

        if not normalized_address:
            errors.append(f"Invalid address: {address}")
            continue

        if not validate_node_array(values):
            errors.append(f"Invalid node array: {address}")
            continue

        valid[normalized_address] = normalize_node_array(values)

    return valid, errors
