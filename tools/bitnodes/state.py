#!/usr/bin/env python3
from __future__ import annotations

import gzip
import ipaddress
import json
import math
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

NODE_CONTAINER_KEYS = (
    "nodes",
    "reachable_nodes",
    "data",
    "results",
    "rows",
    "peers",
    "node_records",
    "latest",
    "snapshot",
    "payload",
)

FIELD_ALIASES = {
    "protocol_version": ["protocol_version", "protocol", "version", "version_protocol"],
    "user_agent": ["user_agent", "agent", "subver", "client", "client_user_agent"],
    "connected_since": ["connected_since", "seen_at", "first_seen", "last_seen", "timestamp", "connected"],
    "services": ["services", "service_bits", "n_services"],
    "height": ["height", "latest_height", "start_height", "block_height", "blocks"],
    "hostname": ["hostname", "host", "dns", "name", "ip"],
    "city": ["city", "city_name", "city_data.city", "geoip.city", "metadata.city"],
    "country_code": ["country_code", "country", "cc", "country_iso", "iso_code", "geoip.country_code", "metadata.country", "metadata.country_code"],
    "latitude": ["latitude", "lat", "geoloc.latitude", "geo.latitude", "geoip.latitude", "geoip.lat", "location.latitude", "metadata.latitude", "metadata.lat"],
    "longitude": ["longitude", "lon", "lng", "geoloc.longitude", "geo.longitude", "geoip.longitude", "geoip.lon", "geoip.lng", "location.longitude", "metadata.longitude", "metadata.lon", "metadata.lng"],
    "timezone": ["timezone", "time_zone", "tz", "timezone_data.timezone", "geoip.timezone", "metadata.timezone"],
    "asn": ["asn", "as", "autonomous_system", "autonomous_system_number", "isp.asn", "geoip.asn", "metadata.asn"],
    "organization": ["organization", "org", "as_org", "autonomous_system_organization", "isp", "isp.organization", "geoip.organization", "metadata.organization"],
    "provider": ["provider", "isp_provider", "hosting_provider", "isp.provider", "geoip.provider", "metadata.provider"],
    "county": ["county", "county_name", "admin2", "county_data.county", "metadata.county"],
    "zip": ["zip", "postal", "postal_code", "postcode", "zip_code", "postal_data.postal_code", "metadata.zip", "metadata.postal_code"],
    "w3w": ["w3w", "what3words", "w3w_data.words", "w3w_data.w3w", "metadata.w3w"],
    "geohash": ["geohash", "geohashid", "geohashid_data.geohash", "geohashid_data.geohashid", "metadata.geohash", "metadata.geohashid"],
    "asn_location": ["asn_location", "as_location", "metadata.asn_location"],
}

METADATA_KEYS = (
    "canonical_address",
    "host",
    "port",
    "reachable",
    "reachable_now",
    "reachable_24h",
    "reachable_week",
    "reachable_month",
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
    "peer_health",
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
    "is_sanctioned_node",
    "jurisdiction_risk_level",
    "continent",
    "region",
    "territory",
    "provider_kind",
    "organization_type",
    "network_classification",
    "zzxgcs",
    "zzxgms",
    "geohashid",
    "suspected_government",
    "suspected_military",
    "suspected_datacenter",
    "suspected_apt_related",
    "suspected_threat_actor_group_related",
    "suspected_known_malicious_actor",
    "apt_attribution_score",
    "apt_attribution_confidence",
    "tag_attribution_score",
    "tag_attribution_confidence",
    "known_malactor_score",
    "known_malactor_confidence",
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
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(ts)))


def mkdir(path: Path) -> None:
    Path(path).mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: Any = None, fallback: Any = None) -> Any:
    if fallback is not None:
        default = fallback
    if default is None:
        default = {}

    path = Path(path)

    if not path.exists():
        return default

    try:
        if path.suffix == ".gz":
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)

        with path.open("r", encoding="utf-8") as handle:
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
            default=str,
        )
        handle.write("\n")


def write_gzip_json(path: Path, payload: Any, pretty: bool = False) -> None:
    path = Path(path)
    mkdir(path.parent)

    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as handle:
        json.dump(
            payload,
            handle,
            ensure_ascii=False,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
            sort_keys=pretty,
            default=str,
        )
        handle.write("\n")


def deep_get(data: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return data.get(key)

    current: Any = data

    for part in key.split("."):
        if not isinstance(current, Mapping):
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

    return text in {
        "true",
        "yes",
        "y",
        "ok",
        "up",
        "online",
        "reachable",
        "success",
        "connected",
        "on",
    }


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
    if lat is not None and -90 <= lat <= 90:
        return lat
    return None


def valid_lon(value: Any) -> float | None:
    lon = to_float(value)
    if lon is not None and -180 <= lon <= 180:
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
        return possible_host.strip("[]"), to_int(possible_port, default_port) or default_port

    return raw.strip("[]"), default_port


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
        host, port = parse_address_port(normalized_address)
        metadata["network"] = metadata.get("network") or classify_network(normalized_address)
        metadata["canonical_address"] = normalized_address
        metadata["host"] = host
        metadata["port"] = port

    lat = valid_lat(first_present(data, FIELD_ALIASES["latitude"]))
    lon = valid_lon(first_present(data, FIELD_ALIASES["longitude"]))

    if lat is not None:
        metadata.setdefault("latitude", lat)

    if lon is not None:
        metadata.setdefault("longitude", lon)

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

    if lat is not None:
        metadata.setdefault("latitude", lat)

    if lon is not None:
        metadata.setdefault("longitude", lon)

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
        row[19]["canonical_address"] = normalized_address

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
        values[19]["canonical_address"] = normalized_address

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


def node_array_to_dict(address: str, values: list[Any]) -> dict[str, Any]:
    padded = normalize_node_array(values)
    network = classify_network(address)
    host, port = parse_address_port(address)

    item: dict[str, Any] = {
        "address": address,
        "canonical_address": address,
        "host": host,
        "port": port,
        "network": network,
    }

    for index, name in enumerate(NODE_FIELD_NAMES):
        item[name] = padded[index]

    metadata = normalize_metadata(item.get("metadata"))
    item["metadata"] = metadata

    item["protocol"] = item["protocol_version"]
    item["agent"] = item["user_agent"]
    item["country"] = item["country_code"]
    item["postal_code"] = item["zip"]

    for key in METADATA_KEYS:
        if key in metadata:
            item[key] = metadata[key]

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
    item["suspected_proxy"] = boolish(metadata.get("suspected_proxy") or metadata.get("is_proxy") or metadata.get("proxy"))
    item["is_proxy"] = item["suspected_proxy"]

    item["policy_restricted"] = boolish(metadata.get("policy_restricted") or metadata.get("is_policy_restricted_node"))
    item["is_policy_restricted_node"] = item["policy_restricted"]
    item["policy_watch"] = boolish(metadata.get("policy_watch") or metadata.get("is_policy_watch_node"))
    item["is_policy_watch_node"] = item["policy_watch"]

    return item


def nodes_to_dicts(nodes: dict[str, list[Any]]) -> list[dict[str, Any]]:
    return [node_array_to_dict(address, values) for address, values in nodes.items()]


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
    if metadata.get("canonical_address"):
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
                candidate[19]["canonical_address"] = normalized_address
                candidate[19]["network"] = candidate[19].get("network") or classify_network(normalized_address)
                merged[normalized_address] = candidate

    return merged


def validate_node_array(values: list[Any]) -> bool:
    if not isinstance(values, list):
        return False
    if len(values) < len(NODE_FIELD_NAMES):
        return False
    return isinstance(normalize_node_array(values)[19], dict)


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

        row = normalize_node_array(values)
        row[19]["canonical_address"] = normalized_address
        row[19]["network"] = row[19].get("network") or classify_network(normalized_address)
        valid[normalized_address] = row

    return valid, errors


class BitnodesState:
    def __init__(
        self,
        state_dir: Path = DEFAULT_STATE_DIR,
        snapshot_24h_dir: Path = DEFAULT_SNAPSHOT_24H_DIR,
        *,
        source: str = "",
        max_queue: int = 250000,
    ) -> None:
        self.source = str(source or "zzxbitnodes").strip()
        self.state_dir = Path(state_dir)
        self.snapshot_24h_dir = Path(snapshot_24h_dir)
        self.max_queue = int(max_queue)

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
        normalized = normalize_address(address=address) or address

        if isinstance(value, Mapping):
            record = dict(value)
            record["address"] = normalize_address(address=record.get("address") or normalized) or normalized
            record.setdefault("canonical_address", record["address"])
            record.setdefault("network", classify_network(record["address"]))

            if "row" not in record:
                record["row"] = normalize_node_dict(record)

            record["row"] = normalize_node_array(record.get("row") or record)
            return self._record_from_row(record["address"], record["row"], extra=record)

        if isinstance(value, list):
            return self._record_from_row(normalized, value)

        return self._record_from_row(normalized, [])

    def _record_from_row(self, address: str, row: list[Any], extra: Mapping[str, Any] | None = None) -> dict[str, Any]:
        normalized = normalize_address(address=address) or address
        values = normalize_node_array(row)
        metadata = normalize_metadata(values[19])
        network = metadata.get("network") or classify_network(normalized)
        host, port = parse_address_port(normalized)

        metadata["network"] = network
        metadata["canonical_address"] = normalized
        metadata["host"] = host
        metadata["port"] = port
        values[19] = metadata

        record = {
            "address": normalized,
            "canonical_address": normalized,
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
            "geohashid": metadata.get("geohashid") or values[17],
            "asn_location": values[18],
            "metadata": metadata,
            "reachable": metadata.get("reachable"),
            "reachable_now": metadata.get("reachable_now"),
            "reachable_24h": metadata.get("reachable_24h"),
            "reachable_week": metadata.get("reachable_week"),
            "reachable_month": metadata.get("reachable_month"),
            "latency_ms": metadata.get("latency_ms"),
            "uptime_seconds": metadata.get("uptime_seconds") or metadata.get("total_uptime"),
            "first_seen": metadata.get("first_seen"),
            "last_seen": metadata.get("last_seen"),
            "last_success": metadata.get("last_success"),
            "last_failure": metadata.get("last_failure"),
            "success_count": int(metadata.get("success_count") or 0),
            "failure_count": int(metadata.get("failure_count") or 0),
            "peer_index": metadata.get("peer_index"),
            "is_tor": network == "tor" or boolish(metadata.get("is_tor") or metadata.get("tor")),
            "is_i2p": network == "i2p" or boolish(metadata.get("is_i2p") or metadata.get("i2p")),
            "is_ipv4": network == "ipv4",
            "is_ipv6": network == "ipv6",
            "is_cjdns": network == "cjdns",
            "is_vpn": boolish(metadata.get("is_vpn") or metadata.get("suspected_vpn") or metadata.get("vpn")),
            "is_proxy": boolish(metadata.get("is_proxy") or metadata.get("suspected_proxy") or metadata.get("proxy")),
        }

        for key in METADATA_KEYS:
            if key in metadata and key not in record:
                record[key] = metadata[key]

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

        normalized = normalize_address(address=record.get("address") or record.get("canonical_address")) or str(record.get("address") or "")
        host, port = parse_address_port(normalized)
        metadata.setdefault("canonical_address", normalized)
        metadata.setdefault("host", host)
        metadata.setdefault("port", port)
        metadata.setdefault("network", record.get("network") or classify_network(normalized))
        values[19] = metadata

        return values

    def save(self) -> None:
        self.meta["saved_at"] = utc_iso()
        self.meta["source"] = self.source
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

            if not normalized or normalized in self._queue_set:
                continue

            if normalized in self.nodes and self.nodes[normalized].get("reachable_now") is True:
                continue

            if self.max_queue > 0 and len(self.queue) >= self.max_queue:
                break

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
        seed_addresses: Iterable[Any] | None = None,
        include_queue: bool = True,
        include_known: bool = True,
        include_unreachable: bool = True,
        include_reachable: bool = True,
        include_recent_failures: bool = True,
        **_kwargs: Any,
    ) -> list[str]:
        candidates: list[str] = []

        if seed_addresses:
            candidates.extend(self._normalize_addresses(seed_addresses))

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
        return normalized[:limit] if limit and limit > 0 else normalized

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
        ts = int(now or timestamp or utc_now())

        for address, row in successes.items():
            normalized = normalize_address(address=address)

            if isinstance(row, tuple) and len(row) == 2:
                normalized = normalize_address(address=row[0]) or normalized
                row = row[1]

            if not normalized:
                continue

            record = self._record_from_any(normalized, row)
            metadata = normalize_metadata(record.get("metadata"))

            metadata["reachable"] = True
            metadata["reachable_now"] = True
            metadata["reachable_24h"] = True
            metadata["last_seen"] = ts
            metadata["last_success"] = ts
            metadata["success_count"] = int(metadata.get("success_count") or record.get("success_count") or 0) + 1
            metadata["first_seen"] = metadata.get("first_seen") or record.get("first_seen") or ts
            metadata.setdefault("network", classify_network(normalized))
            metadata.setdefault("canonical_address", normalized)

            record["metadata"] = metadata
            record["row"] = self._row_from_record(record)
            record.update(
                {
                    "reachable": True,
                    "reachable_now": True,
                    "reachable_24h": True,
                    "last_seen": ts,
                    "last_success": ts,
                    "first_seen": metadata["first_seen"],
                    "success_count": metadata["success_count"],
                    "network": metadata["network"],
                    "canonical_address": normalized,
                }
            )

            self.nodes[normalized] = record

            if normalized in self._queue_set:
                try:
                    self.queue.remove(normalized)
                except ValueError:
                    pass
                self._queue_set.discard(normalized)

        self.meta["last_success_update_at"] = utc_iso(ts)
        self.meta["last_success_count"] = len(successes)

    def update_failures(
        self,
        failures: Iterable[Any],
        *,
        now: int | None = None,
        timestamp: int | None = None,
        **_kwargs: Any,
    ) -> None:
        ts = int(now or timestamp or utc_now())
        count = 0

        for address in failures:
            normalized = normalize_address(address=address)

            if not normalized:
                continue

            record = self.nodes.get(normalized) or self._record_from_row(normalized, [])
            metadata = normalize_metadata(record.get("metadata"))

            metadata["reachable"] = False
            metadata["reachable_now"] = False
            metadata["last_failure"] = ts
            metadata["failure_count"] = int(metadata.get("failure_count") or record.get("failure_count") or 0) + 1
            metadata["first_seen"] = metadata.get("first_seen") or ts
            metadata.setdefault("network", classify_network(normalized))
            metadata.setdefault("canonical_address", normalized)

            record["metadata"] = metadata
            record["row"] = self._row_from_record(record)
            record.update(
                {
                    "reachable": False,
                    "reachable_now": False,
                    "last_failure": ts,
                    "failure_count": metadata["failure_count"],
                    "first_seen": metadata["first_seen"],
                    "network": metadata["network"],
                    "canonical_address": normalized,
                }
            )

            self.nodes[normalized] = record
            count += 1

        self.meta["last_failure_update_at"] = utc_iso(ts)
        self.meta["last_failure_count"] = count

    def mark_reachable(self, address: str, row: Any | None = None, *, now: int | None = None) -> None:
        normalized = normalize_address(address=address)

        if not normalized:
            return

        if row is not None:
            self.update_successes({normalized: row}, now=now)
            return

        ts = int(now or utc_now())
        record = self.nodes.get(normalized) or self._record_from_row(normalized, [])
        metadata = normalize_metadata(record.get("metadata"))

        metadata["reachable"] = True
        metadata["reachable_now"] = True
        metadata["reachable_24h"] = True
        metadata["last_seen"] = ts
        metadata["last_success"] = ts
        metadata.setdefault("network", classify_network(normalized))
        metadata.setdefault("canonical_address", normalized)

        record["metadata"] = metadata
        record.update(
            {
                "reachable": True,
                "reachable_now": True,
                "reachable_24h": True,
                "last_seen": ts,
                "last_success": ts,
                "network": metadata["network"],
                "canonical_address": normalized,
            }
        )
        record["row"] = self._row_from_record(record)
        self.nodes[normalized] = record

    def mark_unreachable(self, address: str, *, now: int | None = None) -> None:
        self.update_failures([address], now=now)

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

            reachable = boolish(metadata.get("reachable") or record.get("reachable"))
            reachable_now = boolish(metadata.get("reachable_now") or record.get("reachable_now"))
            reachable_24h = boolish(metadata.get("reachable_24h") or record.get("reachable_24h") or reachable_now)

            if mode in {"reachable", "reachable_now"} and not reachable_now:
                continue
            if mode in {"reachable_24h", "24h"} and not reachable_24h:
                continue
            if mode in {"unreachable", "failed"} and reachable:
                continue
            if mode in {"stale"} and reachable_now:
                continue
            if mode in {"plottable", "map"} and (row[8] is None or row[9] is None):
                continue

            output[address] = row

        return output

    def reachable_nodes(self) -> dict[str, list[Any]]:
        return self.to_bitnodes_nodes("reachable")

    def export_nodes(self, mode: str = "all") -> dict[str, list[Any]]:
        return self.to_bitnodes_nodes(mode)

    def build_export_payload(self, mode: str = "all") -> dict[str, Any]:
        timestamp = utc_now()
        nodes = self.to_bitnodes_nodes(mode)
        dicts = nodes_to_dicts(nodes)

        latest_height = 0
        network_counts: dict[str, int] = {}
        reachable_count = 0
        coordinate_count = 0

        for item in dicts:
            height = to_int(item.get("height"), 0) or 0
            latest_height = max(latest_height, height)

            network = str(item.get("network") or "unknown")
            network_counts[network] = network_counts.get(network, 0) + 1

            if boolish(item.get("reachable") or item.get("reachable_now")):
                reachable_count += 1

            if item.get("latitude") is not None and item.get("longitude") is not None:
                coordinate_count += 1

        return {
            "schema": "zzx-bitnodes-snapshot-v4",
            "source": self.source or "zzxbitnodes",
            "crawler": self.source or "zzxbitnodes",
            "mode": mode,
            "timestamp": timestamp,
            "updated_at": utc_iso(timestamp),
            "generated_at": utc_iso(timestamp),
            "total_nodes": len(nodes),
            "known_nodes": len(nodes),
            "reachable_nodes": reachable_count,
            "coordinate_nodes": coordinate_count,
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

    def write_24h_snapshot(self, payload: dict[str, Any] | None = None) -> Path:
        return self.snapshot_24h(payload)

    def state_summary(self) -> dict[str, Any]:
        total = len(self.nodes)
        reachable_now = 0
        reachable_24h = 0
        unreachable_now = 0
        stale = 0
        coordinate_nodes = 0

        networks: dict[str, int] = {
            "ipv4": 0,
            "ipv6": 0,
            "tor": 0,
            "i2p": 0,
            "cjdns": 0,
            "dns": 0,
            "unknown": 0,
        }

        vpn = 0
        proxy = 0
        policy_restricted = 0
        government = 0
        military = 0
        datacenter = 0
        apt_related = 0

        now = utc_now()

        for address, record in self.nodes.items():
            metadata = normalize_metadata(record.get("metadata"))
            network = str(record.get("network") or metadata.get("network") or classify_network(address))
            networks[network] = networks.get(network, 0) + 1

            is_reachable_now = boolish(record.get("reachable_now") or metadata.get("reachable_now"))
            is_reachable_24h = boolish(record.get("reachable_24h") or metadata.get("reachable_24h") or is_reachable_now)
            is_reachable = boolish(record.get("reachable") or metadata.get("reachable"))

            if is_reachable_now:
                reachable_now += 1
            elif is_reachable is False:
                unreachable_now += 1

            if is_reachable_24h:
                reachable_24h += 1

            last_seen = to_int(record.get("last_seen") or metadata.get("last_seen"), 0) or 0
            if last_seen and now - last_seen > 86400:
                stale += 1

            if valid_lat(record.get("latitude") or metadata.get("latitude")) is not None and valid_lon(record.get("longitude") or metadata.get("longitude")) is not None:
                coordinate_nodes += 1

            if boolish(record.get("is_vpn") or metadata.get("is_vpn") or metadata.get("suspected_vpn") or metadata.get("vpn")):
                vpn += 1

            if boolish(record.get("is_proxy") or metadata.get("is_proxy") or metadata.get("suspected_proxy") or metadata.get("proxy")):
                proxy += 1

            if boolish(record.get("is_policy_restricted_node") or metadata.get("is_policy_restricted_node") or metadata.get("policy_restricted")):
                policy_restricted += 1

            if boolish(record.get("suspected_government") or metadata.get("suspected_government")):
                government += 1

            if boolish(record.get("suspected_military") or metadata.get("suspected_military")):
                military += 1

            if boolish(record.get("suspected_datacenter") or metadata.get("suspected_datacenter")):
                datacenter += 1

            if boolish(record.get("suspected_apt_related") or metadata.get("suspected_apt_related")):
                apt_related += 1

        return {
            "schema": "zzx-bitnodes-state-summary-v2",
            "source": self.source,
            "generated_at": utc_iso(),
            "total_known_nodes": total,
            "reachable_now": reachable_now,
            "unreachable_now": unreachable_now,
            "reachable_24h": reachable_24h,
            "stale_nodes": stale,
            "queue_size": len(self.queue),
            "coordinate_nodes": coordinate_nodes,
            "ipv4_nodes": networks.get("ipv4", 0),
            "ipv6_nodes": networks.get("ipv6", 0),
            "tor_nodes": networks.get("tor", 0),
            "i2p_nodes": networks.get("i2p", 0),
            "cjdns_nodes": networks.get("cjdns", 0),
            "dns_nodes": networks.get("dns", 0),
            "unknown_nodes": networks.get("unknown", 0),
            "vpn_nodes": vpn,
            "proxy_nodes": proxy,
            "policy_restricted_nodes": policy_restricted,
            "government_nodes": government,
            "military_nodes": military,
            "datacenter_nodes": datacenter,
            "apt_related_nodes": apt_related,
            "network_counts": networks,
        }

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": "zzx-bitnodes-state-v3",
            "source": self.source,
            "saved_at": utc_iso(),
            "nodes": self.nodes,
            "queue": list(self.queue),
            "meta": self.meta,
            "summary": self.state_summary(),
        }

    def __len__(self) -> int:
        return len(self.nodes)
