#!/usr/bin/env python3
from __future__ import annotations

import ipaddress
import json
import re
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping


DEFAULT_PORT = 8333

DEFAULT_STATE_DIR = Path("bitcoin/bitnodes/data/state")
DEFAULT_SNAPSHOT_24H_DIR = Path("bitcoin/bitnodes/data/snapshots/24h")

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

FIELD_ALIASES = {
    "protocol_version": ["protocol_version", "protocol", "version", "version_protocol"],
    "user_agent": ["user_agent", "agent", "subver", "client", "client_user_agent"],
    "connected_since": ["connected_since", "seen_at", "first_seen", "last_seen", "timestamp", "connected"],
    "services": ["services", "service_bits", "n_services"],
    "height": ["height", "latest_height", "start_height", "block_height", "blocks"],
    "hostname": ["hostname", "host", "dns", "name"],
    "city": ["city", "city_name", "city_data.city", "geoip.city", "metadata.city"],
    "country_code": ["country_code", "country", "cc", "country_iso", "iso_code", "geoip.country_code", "metadata.country"],
    "latitude": ["latitude", "lat", "geoloc.latitude", "geo.latitude", "geoip.latitude", "metadata.latitude"],
    "longitude": ["longitude", "lon", "lng", "geoloc.longitude", "geo.longitude", "geoip.longitude", "metadata.longitude"],
    "timezone": ["timezone", "time_zone", "tz", "timezone_data.timezone", "geoip.timezone", "metadata.timezone"],
    "asn": ["asn", "as", "autonomous_system", "autonomous_system_number", "isp.asn", "geoip.asn", "metadata.asn"],
    "organization": ["organization", "org", "as_org", "autonomous_system_organization", "isp", "isp.organization", "metadata.organization"],
    "provider": ["provider", "isp_provider", "hosting_provider", "isp.provider", "geoip.provider", "metadata.provider"],
    "county": ["county", "county_name", "admin2", "county_data.county", "metadata.county"],
    "zip": ["zip", "postal", "postal_code", "postcode", "zip_code", "postal_data.postal_code", "metadata.zip"],
    "w3w": ["w3w", "what3words", "w3w_data.words", "w3w_data.w3w", "metadata.w3w"],
    "geohash": ["geohash", "geohashid", "geohashid_data.geohashid", "metadata.geohash"],
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


def utc_now() -> int:
    return now_ts()


def utc_iso(ts: int | None = None) -> str:
    if ts is None:
        ts = utc_now()
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: Any = None, fallback: Any = None) -> Any:
    if fallback is not None:
        default = fallback

    if default is None:
        default = {}

    if not Path(path).exists():
        return default

    try:
        with Path(path).open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def write_json(path: Path, payload: Any, pretty: bool = True) -> None:
    path = Path(path)
    mkdir(path.parent)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            ensure_ascii=False,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
            sort_keys=pretty,
        )
        handle.write("\n")


def deep_get(data: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return data.get(key)

    current: Any = data

    for part in key.split("."):
        if not isinstance(current, Mapping) or part not in current:
            return None
        current = current.get(part)

    return current


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
        return int(float(value))
    except Exception:
        return default


def to_float(value: Any, default: float | None = None) -> float | None:
    try:
        if value in ("", None):
            return default
        parsed = float(value)
    except Exception:
        return default

    if parsed != parsed or parsed in (float("inf"), float("-inf")):
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
    return text in {"true", "yes", "y", "ok", "up", "online", "reachable", "success", "connected"}


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
            return match.group(1), int(match.group(2) or default_port)

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
        return possible_host, int(possible_port)

    return raw, default_port


def format_address(host: str, port: int = DEFAULT_PORT) -> str:
    host = strip_ipv6_brackets(host).strip().lower()

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

    return format_address(parsed_host, parsed_port)


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

    lat = first_present(data, FIELD_ALIASES["latitude"])
    lon = first_present(data, FIELD_ALIASES["longitude"])

    if lat not in ("", None) and "latitude" not in metadata:
        metadata["latitude"] = to_float(lat)

    if lon not in ("", None) and "longitude" not in metadata:
        metadata["longitude"] = to_float(lon)

    return metadata


def normalize_node_array(values: list[Any], timestamp: int | None = None) -> list[Any]:
    padded = list(values) + [None] * max(0, len(NODE_FIELD_NAMES) - len(values))
    metadata = normalize_metadata(padded[19])

    lat = to_float(padded[8])
    lon = to_float(padded[9])

    if lat is not None and not (-90 <= lat <= 90):
        lat = None

    if lon is not None and not (-180 <= lon <= 180):
        lon = None

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

    lat = to_float(first_present(data, FIELD_ALIASES["latitude"]))
    lon = to_float(first_present(data, FIELD_ALIASES["longitude"]))

    if lat is not None and not (-90 <= lat <= 90):
        lat = None

    if lon is not None and not (-180 <= lon <= 180):
        lon = None

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


def normalize_nodes(
    raw: Any,
    timestamp: int | None = None,
    default_port: int = DEFAULT_PORT,
) -> dict[str, list[Any]]:
    timestamp = timestamp or now_ts()

    if isinstance(raw, Mapping):
        for key in ("nodes", "reachable_nodes", "rows", "data", "results", "peers", "node_records"):
            value = raw.get(key)
            if isinstance(value, (Mapping, list)):
                raw = value
                break

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


def node_array_to_dict(address: str, values: list[Any]) -> dict[str, Any]:
    padded = normalize_node_array(values)
    network = classify_network(address)
    item: dict[str, Any] = {"address": address, "network": network}

    for index, name in enumerate(NODE_FIELD_NAMES):
        item[name] = padded[index]

    metadata = normalize_metadata(item.get("metadata"))
    item["metadata"] = metadata

    item["protocol"] = item["protocol_version"]
    item["agent"] = item["user_agent"]
    item["country"] = item["country_code"]
    item["postal_code"] = item["zip"]

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
    item["is_policy_watch_node"] = item["policy_watch"]

    return item


def nodes_to_dicts(nodes: dict[str, list[Any]]) -> list[dict[str, Any]]:
    return [node_array_to_dict(address, values) for address, values in nodes.items()]


def filter_reachable(nodes: dict[str, list[Any]]) -> dict[str, list[Any]]:
    output = {}

    for address, values in nodes.items():
        row = normalize_node_array(values)
        metadata = normalize_metadata(row[19])
        reachable = boolish(metadata.get("reachable"))

        if reachable is False:
            continue

        output[address] = row

    return output


def split_nodes_by_network(nodes: dict[str, list[Any]]) -> dict[str, dict[str, list[Any]]]:
    groups = {
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
        score += 25

    if metadata.get("reachable") is True:
        score += 20

    if metadata.get("reachable_now") is True:
        score += 20

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
            previous = merged.get(normalized_address)

            if previous is None or node_quality(candidate) >= node_quality(previous):
                merged[normalized_address] = candidate

    return merged


def validate_node_array(values: list[Any]) -> bool:
    if not isinstance(values, list):
        return False

    if len(values) < len(NODE_FIELD_NAMES):
        return False

    normalized = normalize_node_array(values)

    return isinstance(normalized[19], dict)


def validate_nodes(nodes: dict[str, list[Any]]) -> tuple[dict[str, list[Any]], list[str]]:
    valid = {}
    errors = []

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


class BitnodesState:
    def __init__(
        self,
        state_dir: Path = DEFAULT_STATE_DIR,
        snapshot_24h_dir: Path = DEFAULT_SNAPSHOT_24H_DIR,
        *,
        source: str = "",
    ) -> None:
        self.source = str(source or "").strip()
        self.state_dir = Path(state_dir)
        self.snapshot_24h_dir = Path(snapshot_24h_dir)

        mkdir(self.state_dir)
        mkdir(self.snapshot_24h_dir)

        self.nodes_path = self.state_dir / "nodes.json"
        self.queue_path = self.state_dir / "queue.json"
        self.meta_path = self.state_dir / "meta.json"

        self.nodes: dict[str, dict[str, Any]] = self._load_nodes(read_json(self.nodes_path, {}))
        self.queue: deque[str] = deque(self._normalize_addresses(read_json(self.queue_path, [])))
        self.meta: dict[str, Any] = read_json(self.meta_path, {})
        self._queue_set = set(self.queue)

    def _load_nodes(self, payload: Any) -> dict[str, dict[str, Any]]:
        output: dict[str, dict[str, Any]] = {}

        if isinstance(payload, Mapping):
            source = payload.get("nodes", payload)

            if isinstance(source, Mapping):
                for address, value in source.items():
                    normalized = normalize_address(address=address)

                    if not normalized:
                        continue

                    output[normalized] = self._record_from_any(normalized, value)

        return output

    def _normalize_addresses(self, values: Any) -> list[str]:
        addresses: list[str] = []

        if isinstance(values, Mapping):
            values = values.keys()

        if not isinstance(values, Iterable) or isinstance(values, (str, bytes)):
            values = []

        for value in values:
            normalized = normalize_address(address=value)

            if normalized:
                addresses.append(normalized)

        return sorted(set(addresses))

    def _record_from_any(self, address: str, value: Any) -> dict[str, Any]:
        if isinstance(value, Mapping):
            record = dict(value)
            record["address"] = normalize_address(address=record.get("address") or address) or address
            record.setdefault("network", classify_network(record["address"]))

            if "row" not in record:
                record["row"] = normalize_node_dict(record)

            record["row"] = normalize_node_array(record.get("row") or record)
            return self._record_from_row(record["address"], record["row"], extra=record)

        if isinstance(value, list):
            return self._record_from_row(address, value)

        return self._record_from_row(address, [])

    def _record_from_row(self, address: str, row: list[Any], extra: Mapping[str, Any] | None = None) -> dict[str, Any]:
        normalized = normalize_address(address=address) or address
        values = normalize_node_array(row)
        metadata = normalize_metadata(values[19])
        network = metadata.get("network") or classify_network(normalized)
        metadata["network"] = network
        values[19] = metadata

        host, port = parse_address_port(normalized)

        record = {
            "address": normalized,
            "host": host,
            "port": port,
            "network": network,
            "row": values,
            "protocol_version": values[0],
            "protocol": values[0],
            "user_agent": values[1],
            "agent": values[1],
            "connected_since": values[2],
            "services": values[3],
            "height": values[4],
            "hostname": values[5],
            "city": values[6],
            "country": values[7],
            "country_code": values[7],
            "latitude": values[8],
            "longitude": values[9],
            "timezone": values[10],
            "asn": values[11],
            "organization": values[12],
            "provider": values[13],
            "county": values[14],
            "zip": values[15],
            "postal_code": values[15],
            "w3w": values[16],
            "geohash": values[17],
            "asn_location": values[18],
            "metadata": metadata,
            "reachable": metadata.get("reachable"),
            "reachable_now": metadata.get("reachable_now"),
            "reachable_24h": metadata.get("reachable_24h"),
            "latency_ms": metadata.get("latency_ms"),
            "first_seen": metadata.get("first_seen"),
            "last_seen": metadata.get("last_seen"),
            "last_success": metadata.get("last_success"),
            "last_failure": metadata.get("last_failure"),
            "success_count": int(metadata.get("success_count") or 0),
            "failure_count": int(metadata.get("failure_count") or 0),
        }

        if extra:
            for key, value in extra.items():
                if key not in {"row", "metadata"} and value is not None:
                    record[key] = value

        return record

    def _row_from_record(self, record: Mapping[str, Any]) -> list[Any]:
        row = record.get("row")

        if isinstance(row, list):
            values = normalize_node_array(row)
        else:
            values = normalize_node_dict(record)

        metadata = normalize_metadata(values[19])

        for key in METADATA_KEYS:
            if key in record and record.get(key) is not None:
                metadata.setdefault(key, record.get(key))

        metadata.setdefault("network", record.get("network") or classify_network(str(record.get("address") or "")))
        values[19] = metadata

        return values

    def save(self) -> None:
        self.meta["saved_at"] = utc_iso()
        self.meta["source"] = self.source or self.meta.get("source", "")
        self.meta["state_dir"] = str(self.state_dir)
        self.meta["snapshot_24h_dir"] = str(self.snapshot_24h_dir)
        self.meta["node_count"] = len(self.nodes)
        self.meta["queue_count"] = len(self.queue)

        write_json(self.nodes_path, self.nodes)
        write_json(self.queue_path, list(self.queue))
        write_json(self.meta_path, self.meta)

    def save_runtime_state(self) -> None:
        self.save()

    def load(self) -> None:
        self.nodes = self._load_nodes(read_json(self.nodes_path, {}))
        self.queue = deque(self._normalize_addresses(read_json(self.queue_path, [])))
        self.meta = read_json(self.meta_path, {})
        self._queue_set = set(self.queue)

    def add_to_queue(self, addresses: Iterable[Any]) -> None:
        added = 0

        for address in addresses:
            normalized = normalize_address(address=address)

            if not normalized:
                continue

            if normalized in self._queue_set:
                continue

            if normalized in self.nodes and self.nodes[normalized].get("reachable_now") is True:
                continue

            self.queue.append(normalized)
            self._queue_set.add(normalized)
            added += 1

        self.meta["queue_last_added"] = added
        self.meta["queue_last_updated_at"] = utc_iso()

    def pop_batch(self, size: int) -> list[str]:
        batch: list[str] = []

        while self.queue and len(batch) < size:
            address = self.queue.popleft()
            self._queue_set.discard(address)

            normalized = normalize_address(address=address)

            if normalized:
                batch.append(normalized)

        self.meta["queue_last_popped"] = len(batch)
        self.meta["queue_last_popped_at"] = utc_iso()

        return batch

    def all_candidate_addresses(
        self,
        limit: int = 0,
        *,
        include_queue: bool = True,
        include_known: bool = True,
        include_unreachable: bool = True,
        include_reachable: bool = True,
        include_recent_failures: bool = True,
        **_kwargs: Any,
    ) -> list[str]:
        candidates: list[str] = []

        if include_queue:
            candidates.extend(list(self.queue))

        if include_known:
            for address, record in self.nodes.items():
                reachable = record.get("reachable")

                if reachable is True and not include_reachable:
                    continue

                if reachable is False and not include_unreachable:
                    continue

                if record.get("last_failure") and not include_recent_failures:
                    continue

                candidates.append(address)

        normalized = self._normalize_addresses(candidates)

        if limit and limit > 0:
            return normalized[:limit]

        return normalized

    def merge_node(self, address: str, values: Any, *, reachable: bool | None = None) -> None:
        normalized = normalize_address(address=address)

        if not normalized:
            return

        incoming = self._record_from_any(normalized, values)
        previous = self.nodes.get(normalized)

        if previous is None:
            self.nodes[normalized] = incoming
        else:
            previous_row = self._row_from_record(previous)
            incoming_row = self._row_from_record(incoming)

            if node_quality(incoming_row) >= node_quality(previous_row):
                merged = dict(previous)
                merged.update(incoming)
                self.nodes[normalized] = merged

        if reachable is not None:
            if reachable:
                self.mark_reachable(normalized)
            else:
                self.mark_unreachable(normalized)

def update_successes(
    self,
    successes: Mapping[str, Any],
    *,
    now: int | None = None,
    timestamp: int | None = None,
    **_kwargs: Any,
) -> None:
    now = int(now or timestamp or utc_now())

    for address, row in successes.items():
        normalized = normalize_address(address=address)

        if not normalized:
            continue

        if isinstance(row, tuple) and len(row) == 2:
            normalized = normalize_address(address=row[0]) or normalized
            row = row[1]

        record = self._record_from_any(normalized, row)
        metadata = normalize_metadata(record.get("metadata"))

        metadata["reachable"] = True
        metadata["reachable_now"] = True
        metadata["reachable_24h"] = True
        metadata["last_seen"] = now
        metadata["last_success"] = now
        metadata["success_count"] = (
            int(metadata.get("success_count") or record.get("success_count") or 0)
            + 1
        )

        first_seen = metadata.get("first_seen") or record.get("first_seen")
        metadata["first_seen"] = first_seen or now

        record["metadata"] = metadata
        record["row"] = self._row_from_record(record)

        record.update({
            "reachable": True,
            "reachable_now": True,
            "reachable_24h": True,
            "last_seen": now,
            "last_success": now,
            "first_seen": metadata["first_seen"],
            "success_count": metadata["success_count"],
        })

        self.nodes[normalized] = record

        if normalized in self._queue_set:
            try:
                self.queue.remove(normalized)
            except ValueError:
                pass

            self._queue_set.discard(normalized)

    self.meta["last_success_update_at"] = utc_iso(now)
    self.meta["last_success_count"] = len(successes)

def update_failures(
    self,
    failures: Iterable[Any],
    *,
    now: int | None = None,
    timestamp: int | None = None,
    **_kwargs: Any,
) -> None:
    now = int(now or timestamp or utc_now())

    count = 0

    for address in failures:
        normalized = normalize_address(address=address)

        if not normalized:
            continue

        record = self.nodes.get(normalized)

        if record is None:
            record = self._record_from_row(normalized, [])

        metadata = normalize_metadata(record.get("metadata"))

        metadata["reachable"] = False
        metadata["reachable_now"] = False
        metadata["last_failure"] = now
        metadata["failure_count"] = (
            int(metadata.get("failure_count") or record.get("failure_count") or 0)
            + 1
        )

        metadata.setdefault(
            "network",
            classify_network(normalized),
        )

        if not metadata.get("first_seen"):
            metadata["first_seen"] = now

        record["metadata"] = metadata
        record["row"] = self._row_from_record(record)

        record.update({
            "reachable": False,
            "reachable_now": False,
            "last_failure": now,
            "failure_count": metadata["failure_count"],
            "network": metadata["network"],
        })

        self.nodes[normalized] = record
        count += 1

    self.meta["last_failure_update_at"] = utc_iso(now)
    self.meta["last_failure_count"] = count
    def mark_reachable(self, address: str, row: Any | None = None) -> None:
        normalized = normalize_address(address=address)

        if not normalized:
            return

        if row is not None:
            self.update_successes({normalized: row})
            return

        record = self.nodes.get(normalized) or self._record_from_row(normalized, [])
        metadata = normalize_metadata(record.get("metadata"))
        now = utc_now()

        metadata["reachable"] = True
        metadata["reachable_now"] = True
        metadata["reachable_24h"] = True
        metadata["last_seen"] = now
        metadata["last_success"] = now

        record["metadata"] = metadata
        record.update({
            "reachable": True,
            "reachable_now": True,
            "reachable_24h": True,
            "last_seen": now,
            "last_success": now,
        })
        record["row"] = self._row_from_record(record)

        self.nodes[normalized] = record

    def mark_unreachable(self, address: str) -> None:
        self.update_failures([address])

    def record_latency(self, address: str, latency_ms: float | int | None) -> None:
        normalized = normalize_address(address=address)

        if not normalized or normalized not in self.nodes:
            return

        record = self.nodes[normalized]
        metadata = normalize_metadata(record.get("metadata"))
        metadata["latency_ms"] = latency_ms
        record["latency_ms"] = latency_ms
        record["metadata"] = metadata
        record["row"] = self._row_from_record(record)

    def record_peer(self, address: str, peer_index: Any = None) -> None:
        normalized = normalize_address(address=address)

        if not normalized or normalized not in self.nodes:
            return

        record = self.nodes[normalized]
        metadata = normalize_metadata(record.get("metadata"))
        metadata["peer_index"] = peer_index
        record["peer_index"] = peer_index
        record["metadata"] = metadata
        record["row"] = self._row_from_record(record)

    def to_bitnodes_nodes(self, mode: str = "all") -> dict[str, list[Any]]:
        mode = str(mode or "all").lower().replace("-", "_")
        output: dict[str, list[Any]] = {}

        for address, record in self.nodes.items():
            row = self._row_from_record(record)
            metadata = normalize_metadata(row[19])

            if mode in {"reachable", "reachable_now"}:
                if boolish(metadata.get("reachable_now") or record.get("reachable_now")) is not True:
                    continue

            elif mode in {"reachable_24h", "24h"}:
                if boolish(metadata.get("reachable_24h") or record.get("reachable_24h") or metadata.get("reachable_now")) is not True:
                    continue

            elif mode in {"unreachable", "failed"}:
                if boolish(metadata.get("reachable") or record.get("reachable")) is not False:
                    continue

            output[address] = row

        return output

    def reachable_nodes(self) -> dict[str, list[Any]]:
        return self.to_bitnodes_nodes("reachable")

    def build_export_payload(self, mode: str = "all") -> dict[str, Any]:
        timestamp = utc_now()
        nodes = self.to_bitnodes_nodes(mode)

        dicts = nodes_to_dicts(nodes)
        latest_height = 0

        for item in dicts:
            height = to_int(item.get("height"), 0) or 0
            latest_height = max(latest_height, height)

        network_counts: dict[str, int] = {}
        reachable_count = 0

        for item in dicts:
            network = str(item.get("network") or "unknown")
            network_counts[network] = network_counts.get(network, 0) + 1

            if boolish(item.get("reachable") or item.get("reachable_now")):
                reachable_count += 1

        return {
            "schema": "zzx-bitnodes-snapshot-v3",
            "source": self.source or "zzxbitnodes",
            "crawler": self.source or "zzxbitnodes",
            "mode": mode,
            "timestamp": timestamp,
            "updated_at": utc_iso(timestamp),
            "generated_at": utc_iso(timestamp),
            "total_nodes": len(nodes),
            "reachable_nodes": reachable_count,
            "latest_height": latest_height,
            "network_counts": network_counts,
            "nodes": nodes,
        }

    def snapshot_24h(self, payload: dict[str, Any] | None = None) -> Path:
        payload = payload or self.build_export_payload("reachable_24h")
        timestamp = int(payload.get("timestamp") or utc_now())
        path = self.snapshot_24h_dir / (time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(timestamp)) + ".json")
        write_json(path, payload)
        return path

    def export_nodes(self, mode: str = "all") -> dict[str, list[Any]]:
        return self.to_bitnodes_nodes(mode)

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": "zzx-bitnodes-state-v2",
            "source": self.source,
            "saved_at": utc_iso(),
            "nodes": self.nodes,
            "queue": list(self.queue),
            "meta": self.meta,
        }

    def __len__(self) -> int:
        return len(self.nodes)
