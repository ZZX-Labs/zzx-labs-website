#!/usr/bin/env python3
"""
ZZX-Labs Bitnodes normalization helpers.

This module converts mixed crawler, seed, Bitnodes-compatible, and frontend
JSON shapes into one canonical Bitnodes-compatible node dictionary:

{
    "host:port": [
        protocol_version,
        user_agent,
        connected_since,
        services,
        height,
        hostname,
        city,
        country_code,
        latitude,
        longitude,
        timezone,
        asn,
        organization
    ]
}
"""

from __future__ import annotations

import ipaddress
import re
import time
from dataclasses import dataclass
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


FIELD_ALIASES = {
    "protocol_version": [
        "protocol_version",
        "protocol",
        "version",
        "version_protocol"
    ],
    "user_agent": [
        "user_agent",
        "agent",
        "subver",
        "client",
        "client_user_agent"
    ],
    "connected_since": [
        "connected_since",
        "seen_at",
        "first_seen",
        "last_seen",
        "timestamp",
        "connected"
    ],
    "services": [
        "services",
        "service_bits",
        "n_services"
    ],
    "height": [
        "height",
        "latest_height",
        "start_height",
        "block_height",
        "blocks"
    ],
    "hostname": [
        "hostname",
        "host",
        "dns",
        "name"
    ],
    "city": [
        "city",
        "city_name"
    ],
    "country_code": [
        "country_code",
        "country",
        "cc",
        "country_iso",
        "iso_code"
    ],
    "latitude": [
        "latitude",
        "lat"
    ],
    "longitude": [
        "longitude",
        "lon",
        "lng"
    ],
    "timezone": [
        "timezone",
        "time_zone",
        "tz"
    ],
    "asn": [
        "asn",
        "as",
        "autonomous_system",
        "autonomous_system_number"
    ],
    "organization": [
        "organization",
        "org",
        "as_org",
        "autonomous_system_organization",
        "isp"
    ]
}


DEFAULT_PORT = 8333


@dataclass(frozen=True)
class NormalizedNode:
    address: str
    values: list[Any]

    def as_pair(self) -> tuple[str, list[Any]]:
        return self.address, self.values


def now_ts() -> int:
    return int(time.time())


def first_present(data: dict[str, Any], aliases: list[str], default: Any = None) -> Any:
    for key in aliases:
        if key in data and data[key] not in ("", None):
            return data[key]

    return default


def to_int(value: Any, default: int | None = None) -> int | None:
    if value in ("", None):
        return default

    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def to_float(value: Any, default: float | None = None) -> float | None:
    if value in ("", None):
        return default

    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_country(value: Any) -> str | None:
    if not value:
        return None

    text = str(value).strip()

    if not text:
        return None

    if len(text) == 2:
        return text.upper()

    return text


def normalize_asn(value: Any) -> str | None:
    if value in ("", None):
        return None

    text = str(value).strip().upper()

    if not text:
        return None

    if text.startswith("AS"):
        return text

    if text.isdigit():
        return f"AS{text}"

    return text


def is_ipv6_literal(host: str) -> bool:
    try:
        return isinstance(ipaddress.ip_address(host), ipaddress.IPv6Address)
    except ValueError:
        return False


def is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def strip_ipv6_brackets(host: str) -> str:
    host = host.strip()

    if host.startswith("[") and "]" in host:
        return host[1:host.index("]")]

    return host


def normalize_host(host: Any) -> str | None:
    if host in ("", None):
        return None

    text = str(host).strip()

    if not text:
        return None

    if text.startswith("[") and "]" in text:
        return strip_ipv6_brackets(text)

    return text


def parse_address_port(value: Any, default_port: int = DEFAULT_PORT) -> tuple[str | None, int]:
    if value in ("", None):
        return None, default_port

    raw = str(value).strip()

    if not raw:
        return None, default_port

    if raw.startswith("["):
        match = re.match(r"^\[([^\]]+)\](?::(\d+))?$", raw)

        if match:
            host = match.group(1)
            port = int(match.group(2) or default_port)
            return host, port

    if raw.endswith(".onion"):
        return raw, default_port

    if ".onion:" in raw:
        host, port_text = raw.rsplit(":", 1)
        return host, to_int(port_text, default_port) or default_port

    colon_count = raw.count(":")

    if colon_count == 0:
        return raw, default_port

    if colon_count == 1:
        host, port_text = raw.rsplit(":", 1)
        return host, to_int(port_text, default_port) or default_port

    if colon_count > 1:
        possible_host, possible_port = raw.rsplit(":", 1)

        if possible_port.isdigit():
            return possible_host, int(possible_port)

        return raw, default_port

    return raw, default_port


def format_address(host: str, port: int = DEFAULT_PORT) -> str:
    host = strip_ipv6_brackets(host)

    if is_ipv6_literal(host):
        return f"[{host}]:{port}"

    return f"{host}:{port}"


def normalize_address(
    address: Any = None,
    host: Any = None,
    port: Any = None,
    default_port: int = DEFAULT_PORT
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

    return format_address(parsed_host, parsed_port)


def normalize_node_array(values: list[Any], timestamp: int | None = None) -> list[Any]:
    padded = list(values) + [None] * max(0, len(NODE_FIELD_NAMES) - len(values))

    protocol_version = to_int(padded[0])
    user_agent = padded[1] if padded[1] not in ("", None) else "unknown"
    connected_since = to_int(padded[2], timestamp or now_ts())
    services = to_int(padded[3])
    height = to_int(padded[4])
    hostname = padded[5] if padded[5] not in ("", None) else None
    city = padded[6] if padded[6] not in ("", None) else None
    country_code = normalize_country(padded[7])
    latitude = to_float(padded[8])
    longitude = to_float(padded[9])
    timezone = padded[10] if padded[10] not in ("", None) else None
    asn = normalize_asn(padded[11])
    organization = padded[12] if padded[12] not in ("", None) else None

    return [
        protocol_version,
        user_agent,
        connected_since,
        services,
        height,
        hostname,
        city,
        country_code,
        latitude,
        longitude,
        timezone,
        asn,
        organization
    ]


def normalize_node_dict(data: dict[str, Any], timestamp: int | None = None) -> list[Any]:
    protocol_version = to_int(
        first_present(
            data,
            FIELD_ALIASES["protocol_version"]
        )
    )

    user_agent = first_present(
        data,
        FIELD_ALIASES["user_agent"],
        "unknown"
    )

    connected_since = to_int(
        first_present(
            data,
            FIELD_ALIASES["connected_since"]
        ),
        timestamp or now_ts()
    )

    services = to_int(
        first_present(
            data,
            FIELD_ALIASES["services"]
        )
    )

    height = to_int(
        first_present(
            data,
            FIELD_ALIASES["height"]
        )
    )

    hostname = first_present(
        data,
        FIELD_ALIASES["hostname"]
    )

    city = first_present(
        data,
        FIELD_ALIASES["city"]
    )

    country_code = normalize_country(
        first_present(
            data,
            FIELD_ALIASES["country_code"]
        )
    )

    latitude = to_float(
        first_present(
            data,
            FIELD_ALIASES["latitude"]
        )
    )

    longitude = to_float(
        first_present(
            data,
            FIELD_ALIASES["longitude"]
        )
    )

    timezone = first_present(
        data,
        FIELD_ALIASES["timezone"]
    )

    asn = normalize_asn(
        first_present(
            data,
            FIELD_ALIASES["asn"]
        )
    )

    organization = first_present(
        data,
        FIELD_ALIASES["organization"]
    )

    return [
        protocol_version,
        user_agent,
        connected_since,
        services,
        height,
        hostname,
        city,
        country_code,
        latitude,
        longitude,
        timezone,
        asn,
        organization
    ]


def normalize_node_item(
    address: str | None,
    value: Any,
    timestamp: int | None = None,
    default_port: int = DEFAULT_PORT
) -> NormalizedNode | None:

    if isinstance(value, list):
        normalized_address = normalize_address(
            address=address,
            default_port=default_port
        )

        if not normalized_address:
            return None

        return NormalizedNode(
            normalized_address,
            normalize_node_array(value, timestamp)
        )

    if isinstance(value, dict):
        candidate_address = (
            address or
            value.get("address") or
            value.get("node") or
            value.get("addr")
        )

        candidate_host = (
            value.get("host") or
            value.get("hostname") or
            value.get("ip") or
            value.get("address")
        )

        candidate_port = (
            value.get("port") or
            value.get("listen_port")
        )

        normalized_address = normalize_address(
            address=candidate_address,
            host=candidate_host,
            port=candidate_port,
            default_port=default_port
        )

        if not normalized_address:
            return None

        return NormalizedNode(
            normalized_address,
            normalize_node_dict(value, timestamp)
        )

    return None


def normalize_nodes(
    raw: Any,
    timestamp: int | None = None,
    default_port: int = DEFAULT_PORT
) -> dict[str, list[Any]]:

    if timestamp is None:
        timestamp = now_ts()

    if isinstance(raw, dict) and "nodes" in raw:
        raw = raw["nodes"]

    output: dict[str, list[Any]] = {}

    if isinstance(raw, dict):
        for address, value in raw.items():
            item = normalize_node_item(
                address=address,
                value=value,
                timestamp=timestamp,
                default_port=default_port
            )

            if item:
                output[item.address] = item.values

        return output

    if isinstance(raw, list):
        for value in raw:
            item = normalize_node_item(
                address=None,
                value=value,
                timestamp=timestamp,
                default_port=default_port
            )

            if item:
                output[item.address] = item.values

        return output

    return output


def node_array_to_dict(address: str, values: list[Any]) -> dict[str, Any]:
    padded = normalize_node_array(values)

    item = {
        "address": address
    }

    for index, name in enumerate(NODE_FIELD_NAMES):
        item[name] = padded[index]

    return item


def nodes_to_dicts(nodes: dict[str, list[Any]]) -> list[dict[str, Any]]:
    return [
        node_array_to_dict(address, values)
        for address, values in nodes.items()
    ]


def filter_reachable(nodes: dict[str, list[Any]]) -> dict[str, list[Any]]:
    output = {}

    for address, values in nodes.items():
        if not values:
            continue

        output[address] = values

    return output


def split_nodes_by_network(nodes: dict[str, list[Any]]) -> dict[str, dict[str, list[Any]]]:
    groups = {
        "ipv4": {},
        "ipv6": {},
        "tor": {},
        "unknown": {}
    }

    for address, values in nodes.items():
        host, _port = parse_address_port(address)

        if not host:
            groups["unknown"][address] = values
            continue

        if ".onion" in host:
            groups["tor"][address] = values
            continue

        try:
            ip = ipaddress.ip_address(strip_ipv6_brackets(host))

            if isinstance(ip, ipaddress.IPv4Address):
                groups["ipv4"][address] = values
            elif isinstance(ip, ipaddress.IPv6Address):
                groups["ipv6"][address] = values
            else:
                groups["unknown"][address] = values
        except ValueError:
            groups["unknown"][address] = values

    return groups


def merge_node_sets(*sets: dict[str, list[Any]]) -> dict[str, list[Any]]:
    merged: dict[str, list[Any]] = {}

    for node_set in sets:
        for address, values in node_set.items():
            merged[address] = normalize_node_array(values)

    return merged


def validate_node_array(values: list[Any]) -> bool:
    if not isinstance(values, list):
        return False

    if len(values) < 2:
        return False

    return True


def validate_nodes(nodes: dict[str, list[Any]]) -> tuple[dict[str, list[Any]], list[str]]:
    valid = {}
    errors = []

    for address, values in nodes.items():
        if not normalize_address(address=address):
            errors.append(f"Invalid address: {address}")
            continue

        if not validate_node_array(values):
            errors.append(f"Invalid node array: {address}")
            continue

        valid[address] = normalize_node_array(values)

    return valid, errors
