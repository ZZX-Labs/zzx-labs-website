#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-ip-db-v1"

APP_ROOT = Path(__file__).resolve().parents[2]
BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))
BITNODES_DATA = Path(os.environ.get("BITNODES_DATA", str(BITNODES_ROOT / "data")))

DEFAULT_IPDB_DIR = BITNODES_DATA / "geoip"
DEFAULT_CURRENT_DIR = DEFAULT_IPDB_DIR / "current"
DEFAULT_ARCHIVE_DIR = DEFAULT_IPDB_DIR / "archive"

DEFAULT_LATEST_PATH = DEFAULT_CURRENT_DIR / "ip_db.latest.json"
DEFAULT_INDEX_PATH = DEFAULT_CURRENT_DIR / "ip_db.index.json"
DEFAULT_STATS_PATH = DEFAULT_CURRENT_DIR / "ip_db.stats.json"

DEFAULT_MAX_SEGMENT_BYTES = 24 * 1024 * 1024
DEFAULT_SEGMENT_PREFIX = "ip_db"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def json_bytes(payload: Any, pretty: bool = False) -> bytes:
    if pretty:
        text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    else:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

    return (text + "\n").encode("utf-8")


def write_json(path: Path, payload: Any, pretty: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(json_bytes(payload, pretty=pretty))


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def compact_key(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.:-]+", "_", value.strip().lower())


def normalize_host(address: Any) -> str:
    value = str(address or "").strip()

    if not value:
        return ""

    if value.startswith("[") and "]" in value:
        return value[1:value.index("]")].strip().lower()

    lower = value.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        return value.rsplit(":", 1)[0].strip("[]").lower()

    if lower.endswith(".onion") or lower.endswith(".i2p"):
        return value.strip("[]").lower()

    if value.count(":") == 1 and "." in value:
        host, port_text = value.rsplit(":", 1)

        if port_text.isdigit():
            return host.strip("[]").lower()

    if value.count(":") > 1:
        possible_host, possible_port = value.rsplit(":", 1)

        if possible_port.isdigit():
            try:
                ipaddress.ip_address(possible_host.strip("[]"))
                return possible_host.strip("[]").lower()
            except ValueError:
                pass

    return value.strip("[]").lower()


def classify_network_from_host(host: str) -> str:
    host = normalize_host(host)

    if not host:
        return "unknown"

    if host.endswith(".onion"):
        return "tor"

    if host.endswith(".i2p"):
        return "i2p"

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return "dns"

    if ip.version == 4:
        return "ipv4"

    if ip.version == 6:
        if ip in ipaddress.ip_network("fc00::/8"):
            return "cjdns"
        return "ipv6"

    return "unknown"


def classify_ip(address: Any) -> dict[str, Any]:
    host = normalize_host(address)
    network = classify_network_from_host(host)

    result = {
        "schema": "zzx-bitnodes-ip-classification-v1",
        "host": host,
        "network": network,
        "is_ip": False,
        "ip_version": None,
        "is_ipv4": False,
        "is_ipv6": False,
        "is_tor": network == "tor",
        "is_i2p": network == "i2p",
        "is_cjdns": network == "cjdns",
        "is_dns": network == "dns",
        "is_private": False,
        "is_loopback": False,
        "is_reserved": False,
        "is_multicast": False,
        "is_global": False,
        "is_link_local": False,
        "is_unspecified": False,
        "compressed": None,
        "exploded": None,
        "updated_at": utc_now(),
    }

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return result

    result.update({
        "is_ip": True,
        "ip_version": ip.version,
        "is_ipv4": ip.version == 4,
        "is_ipv6": ip.version == 6,
        "is_private": ip.is_private,
        "is_loopback": ip.is_loopback,
        "is_reserved": ip.is_reserved,
        "is_multicast": ip.is_multicast,
        "is_global": ip.is_global,
        "is_link_local": ip.is_link_local,
        "is_unspecified": ip.is_unspecified,
        "compressed": ip.compressed,
        "exploded": ip.exploded,
    })

    return result


def node_address(node: Mapping[str, Any]) -> str:
    return str(
        node.get("address")
        or node.get("node")
        or node.get("addr")
        or node.get("host")
        or node.get("hostname")
        or node.get("ip")
        or node.get("id")
        or ""
    )


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return row.get(key)

    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)

    return current


def first_value(row: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = deep_get(row, key)

        if value not in ("", None):
            return value

    return None


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    text = str(value or "").strip().lower()

    return text in {"true", "yes", "y", "ok", "up", "online", "reachable", "success"}


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [dict(x) for x in payload if isinstance(x, Mapping)]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [dict(x) for x in nodes if isinstance(x, Mapping)]

    if isinstance(nodes, Mapping):
        output: list[dict[str, Any]] = []

        for address, value in nodes.items():
            if isinstance(value, Mapping):
                output.append({"address": str(address), **dict(value)})
            elif isinstance(value, list):
                output.append(bitnodes_array_to_record(str(address), value))
            else:
                output.append({"address": str(address), "value": value})

        return output

    for key in ("results", "data", "rows", "reachable", "unreachable", "peers", "node_records"):
        value = payload.get(key)

        if isinstance(value, list):
            return [dict(x) for x in value if isinstance(x, Mapping)]

        if isinstance(value, Mapping):
            return extract_nodes({"nodes": value})

    return []


def bitnodes_array_to_record(address: str, row: list[Any]) -> dict[str, Any]:
    padded = list(row) + [None] * max(0, 20 - len(row))
    metadata = padded[19] if isinstance(padded[19], Mapping) else {}

    record = {
        "address": address,
        "protocol_version": padded[0],
        "agent": padded[1],
        "user_agent": padded[1],
        "connected_since": padded[2],
        "services": padded[3],
        "height": padded[4],
        "hostname": padded[5],
        "city": padded[6],
        "country": padded[7],
        "country_code": padded[7],
        "latitude": padded[8],
        "longitude": padded[9],
        "timezone": padded[10],
        "asn": padded[11],
        "organization": padded[12],
        "provider": padded[13],
        "county": padded[14],
        "zip": padded[15],
        "postal_code": padded[15],
        "w3w": padded[16],
        "what3words": padded[16],
        "geohash": padded[17],
        "geohashid": padded[17],
        "asn_location": padded[18],
        "metadata": dict(metadata),
    }

    for key, value in dict(metadata).items():
        record.setdefault(key, value)

    return record


def put_nodes(payload: Any, nodes: list[dict[str, Any]]) -> Any:
    if isinstance(payload, list):
        return nodes

    if not isinstance(payload, MutableMapping):
        return {"nodes": nodes}

    output = dict(payload)

    if isinstance(output.get("nodes"), Mapping):
        output["nodes"] = {node.get("address", str(i)): node for i, node in enumerate(nodes)}
    else:
        output["nodes"] = nodes

    output.setdefault("metadata", {})
    if isinstance(output["metadata"], MutableMapping):
        output["metadata"]["ip_db_enriched_at"] = utc_now()

    return output


def source_value(node: Mapping[str, Any], context: dict[str, Any] | None = None) -> str:
    context = context or {}

    return str(
        node.get("source")
        or first_value(node, "metadata.source", "crawl_source")
        or context.get("source")
        or "unknown"
    )


def record_from_node(node: Mapping[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any] | None:
    address = node_address(node)
    host = normalize_host(address)

    if not host:
        return None

    ip_data = classify_ip(host)
    now = utc_now()
    src = source_value(node, context)

    record = {
        "schema": "zzx-bitnodes-ip-db-record-v1",
        "host": host,
        "host_hash_sha256": sha256_text(host),
        "first_seen": first_value(node, "first_seen", "metadata.first_seen") or now,
        "last_seen": first_value(node, "last_seen", "metadata.last_seen") or now,
        "seen_count": 1,
        "sources": sorted({src}),
        "addresses": sorted({str(address)}),
        "ports": sorted({int(first_value(node, "port", "metadata.port") or 8333)}),
        "network": ip_data["network"],
        "is_ip": ip_data["is_ip"],
        "ip_version": ip_data["ip_version"],
        "is_ipv4": ip_data["is_ipv4"],
        "is_ipv6": ip_data["is_ipv6"],
        "is_tor": ip_data["is_tor"] or boolish(first_value(node, "is_tor", "tor.is_tor")),
        "is_i2p": ip_data["is_i2p"] or boolish(first_value(node, "is_i2p", "i2p.is_i2p")),
        "is_cjdns": ip_data["is_cjdns"] or boolish(first_value(node, "is_cjdns", "ipv6.is_cjdns_ipv6")),
        "is_dns": ip_data["is_dns"],
        "is_global": ip_data["is_global"],
        "is_private": ip_data["is_private"],
        "is_loopback": ip_data["is_loopback"],
        "is_reserved": ip_data["is_reserved"],
        "is_multicast": ip_data["is_multicast"],
        "is_link_local": ip_data["is_link_local"],
        "suspected_vpn": boolish(first_value(node, "suspected_vpn", "is_vpn", "vpn.suspected_vpn", "vpn.is_vpn", "metadata.suspected_vpn")),
        "suspected_proxy": boolish(first_value(node, "suspected_proxy", "is_proxy", "proxy.suspected_proxy", "proxy.is_proxy", "metadata.suspected_proxy")),
        "policy_restricted": boolish(first_value(node, "policy_restricted", "is_policy_restricted_node", "sanctions_data.is_policy_restricted", "metadata.policy_restricted")),
        "policy_watch": boolish(first_value(node, "policy_watch", "is_policy_watch_node", "sanctions_data.is_policy_watch", "metadata.policy_watch")),
        "country": first_value(node, "country_code", "country", "geoip.country_code", "geoip_data.country_code"),
        "country_name": first_value(node, "country_name", "geoip.country_name", "geoip_data.country_name"),
        "region": first_value(node, "region", "territory", "state", "province", "geoip.region"),
        "city": first_value(node, "city", "geoip.city", "city_data.city"),
        "county": first_value(node, "county", "county_data.county"),
        "postal_code": first_value(node, "postal_code", "zip", "postal", "postal_data.postal_code"),
        "timezone": first_value(node, "timezone", "timezone_data.timezone", "geoip.timezone"),
        "latitude": first_value(node, "latitude", "lat", "geoip.latitude", "geoloc.latitude"),
        "longitude": first_value(node, "longitude", "lon", "lng", "geoip.longitude", "geoloc.longitude"),
        "asn": first_value(node, "asn", "isp.asn", "geoip.asn", "isp_data.asn"),
        "organization": first_value(node, "organization", "org", "isp.organization", "geoip.organization"),
        "provider": first_value(node, "provider", "isp.provider", "geoip.provider"),
        "agent": first_value(node, "agent", "user_agent"),
        "protocol_version": first_value(node, "protocol_version", "protocol"),
        "height": first_value(node, "height"),
        "reachable": boolish(first_value(node, "reachable", "reachable_now", "metadata.reachable")),
        "updated_at": now,
    }

    return record


def merge_record(existing: Mapping[str, Any] | None, incoming: Mapping[str, Any]) -> dict[str, Any]:
    if existing is None:
        return dict(incoming)

    merged = dict(existing)
    now = utc_now()

    merged["last_seen"] = incoming.get("last_seen") or now
    merged["updated_at"] = now
    merged["seen_count"] = int(merged.get("seen_count") or 0) + 1

    for key in ("sources", "addresses", "ports"):
        left = merged.get(key, [])
        right = incoming.get(key, [])

        if not isinstance(left, list):
            left = [left]

        if not isinstance(right, list):
            right = [right]

        merged[key] = sorted({x for x in [*left, *right] if x not in ("", None)})

    for key, value in incoming.items():
        if key in {"seen_count", "sources", "addresses", "ports", "first_seen"}:
            continue

        if value not in ("", None, [], {}):
            merged[key] = value

    merged.setdefault("first_seen", incoming.get("first_seen") or now)

    return merged


def default_index() -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-ip-db-index-v1",
        "generated_at": utc_now(),
        "updated_at": utc_now(),
        "segment_count": 0,
        "total_unique_hosts": 0,
        "latest_segment": "",
        "segments": [],
    }


def load_ipdb(latest_path: Path) -> dict[str, Any]:
    payload = read_json(latest_path, fallback={})

    if isinstance(payload, Mapping) and isinstance(payload.get("records"), Mapping):
        return dict(payload["records"])

    if isinstance(payload, Mapping):
        return {str(k): v for k, v in payload.items() if isinstance(v, Mapping)}

    return {}


def build_latest_payload(records: Mapping[str, Any], source: str = "") -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "updated_at": utc_now(),
        "source": source,
        "record_count": len(records),
        "records": dict(sorted(records.items())),
    }


def split_records_into_segments(
    records: Mapping[str, Any],
    *,
    max_segment_bytes: int = DEFAULT_MAX_SEGMENT_BYTES,
    segment_prefix: str = DEFAULT_SEGMENT_PREFIX,
) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    current_records: dict[str, Any] = {}
    segment_number = 1

    def payload_for(number: int, recs: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "schema": "zzx-bitnodes-ip-db-segment-v1",
            "generated_at": utc_now(),
            "segment": number,
            "record_count": len(recs),
            "records": dict(sorted(recs.items())),
        }

    for host, record in sorted(records.items()):
        tentative = dict(current_records)
        tentative[host] = record
        tentative_payload = payload_for(segment_number, tentative)
        tentative_size = len(json_bytes(tentative_payload, pretty=False))

        if current_records and tentative_size > max_segment_bytes:
            segments.append(payload_for(segment_number, current_records))
            segment_number += 1
            current_records = {host: record}
        else:
            current_records = tentative

    if current_records or not segments:
        segments.append(payload_for(segment_number, current_records))

    return segments


def write_segments(
    records: Mapping[str, Any],
    *,
    archive_dir: Path,
    index_path: Path,
    max_segment_bytes: int,
    segment_prefix: str = DEFAULT_SEGMENT_PREFIX,
    pretty: bool = True,
) -> dict[str, Any]:
    archive_dir.mkdir(parents=True, exist_ok=True)

    for old in archive_dir.glob(f"{segment_prefix}.*.json"):
        old.unlink()

    segments = split_records_into_segments(
        records,
        max_segment_bytes=max_segment_bytes,
        segment_prefix=segment_prefix,
    )

    index = default_index()
    index["segment_count"] = len(segments)
    index["total_unique_hosts"] = len(records)

    segment_entries = []

    for segment in segments:
        number = int(segment["segment"])
        filename = f"{segment_prefix}.{number:08d}.json"
        path = archive_dir / filename

        write_json(path, segment, pretty=pretty)

        size_bytes = path.stat().st_size
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()

        segment_entries.append({
            "segment": number,
            "filename": filename,
            "path": str(path),
            "size_bytes": size_bytes,
            "sha256": checksum,
            "record_count": segment["record_count"],
        })

    index["segments"] = segment_entries
    index["latest_segment"] = segment_entries[-1]["filename"] if segment_entries else ""
    index["updated_at"] = utc_now()

    write_json(index_path, index, pretty=True)

    return index


def build_stats(records: Mapping[str, Any]) -> dict[str, Any]:
    counters = {
        "ipv4": 0,
        "ipv6": 0,
        "tor": 0,
        "i2p": 0,
        "cjdns": 0,
        "dns": 0,
        "unknown": 0,
        "suspected_vpn": 0,
        "suspected_proxy": 0,
        "policy_restricted": 0,
        "policy_watch": 0,
    }

    countries: dict[str, int] = {}
    asns: dict[str, int] = {}
    providers: dict[str, int] = {}

    for record in records.values():
        if not isinstance(record, Mapping):
            continue

        network = str(record.get("network") or "unknown")

        if network in counters:
            counters[network] += 1
        else:
            counters["unknown"] += 1

        for key in ("suspected_vpn", "suspected_proxy", "policy_restricted", "policy_watch"):
            counters[key] += int(bool(record.get(key)))

        country = str(record.get("country") or "Unknown")
        asn = str(record.get("asn") or "Unknown")
        provider = str(record.get("provider") or record.get("organization") or "Unknown")

        countries[country] = countries.get(country, 0) + 1
        asns[asn] = asns.get(asn, 0) + 1
        providers[provider] = providers.get(provider, 0) + 1

    def top(counter: dict[str, int], limit: int = 100) -> list[dict[str, Any]]:
        return [
            {"name": name, "count": count}
            for name, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
        ]

    return {
        "schema": "zzx-bitnodes-ip-db-stats-v1",
        "generated_at": utc_now(),
        "total_unique_hosts": len(records),
        "counts": counters,
        "top": {
            "countries": top(countries),
            "asns": top(asns),
            "providers": top(providers),
        },
    }


def update_ipdb(
    nodes: list[dict[str, Any]],
    *,
    latest_path: Path = DEFAULT_LATEST_PATH,
    index_path: Path = DEFAULT_INDEX_PATH,
    stats_path: Path = DEFAULT_STATS_PATH,
    archive_dir: Path = DEFAULT_ARCHIVE_DIR,
    max_segment_bytes: int = DEFAULT_MAX_SEGMENT_BYTES,
    source: str = "",
    pretty: bool = True,
    write_archive: bool = True,
) -> dict[str, Any]:
    records = load_ipdb(latest_path)

    changed = 0

    for node in nodes:
        record = record_from_node(node, context={"source": source})

        if record is None:
            continue

        host = record["host"]
        key = compact_key(host)

        old = records.get(key)
        new = merge_record(old, record)

        if old != new:
            changed += 1

        records[key] = new

    latest_payload = build_latest_payload(records, source=source)
    write_json(latest_path, latest_payload, pretty=pretty)

    stats = build_stats(records)
    write_json(stats_path, stats, pretty=True)

    index = read_json(index_path, fallback=default_index())

    if write_archive:
        index = write_segments(
            records,
            archive_dir=archive_dir,
            index_path=index_path,
            max_segment_bytes=max_segment_bytes,
            segment_prefix=DEFAULT_SEGMENT_PREFIX,
            pretty=pretty,
        )
    else:
        index["updated_at"] = utc_now()
        index["total_unique_hosts"] = len(records)
        write_json(index_path, index, pretty=True)

    return {
        "schema": "zzx-bitnodes-ip-db-update-report-v1",
        "updated_at": utc_now(),
        "input_nodes": len(nodes),
        "changed_records": changed,
        "total_unique_hosts": len(records),
        "latest_path": str(latest_path),
        "index_path": str(index_path),
        "stats_path": str(stats_path),
        "archive_dir": str(archive_dir),
        "segment_count": index.get("segment_count", 0),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    address = node_address(node)
    ip_data = classify_ip(address)

    node["ip"] = ip_data
    node["host"] = ip_data.get("host") or normalize_host(address)
    node["is_ip"] = ip_data["is_ip"]
    node["ip_version"] = ip_data["ip_version"]
    node["network"] = ip_data["network"] if ip_data["network"] != "unknown" else node.get("network", "unknown")

    node["is_ipv4"] = ip_data["is_ipv4"]
    node["is_ipv6"] = ip_data["is_ipv6"]
    node["is_tor"] = ip_data["is_tor"] or boolish(node.get("is_tor"))
    node["is_i2p"] = ip_data["is_i2p"] or boolish(node.get("is_i2p"))
    node["is_cjdns"] = ip_data["is_cjdns"] or boolish(node.get("is_cjdns"))

    node.setdefault("enrichment", {})
    node["enrichment"]["ip_db"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
    }

    return node


def enrich_nodes(
    nodes: Any,
    context: dict[str, Any] | None = None,
) -> Any:
    if isinstance(nodes, list):
        enriched = [
            enrich_node(dict(node)) if isinstance(node, Mapping) else node
            for node in nodes
        ]
    elif isinstance(nodes, Mapping):
        enriched = {
            key: enrich_node(dict(value)) if isinstance(value, Mapping) else value
            for key, value in nodes.items()
        }
    else:
        return nodes

    if context and context.get("ip_db_update"):
        update_ipdb(
            extract_nodes({"nodes": enriched}),
            latest_path=Path(context.get("ip_db_latest", DEFAULT_LATEST_PATH)),
            index_path=Path(context.get("ip_db_index", DEFAULT_INDEX_PATH)),
            stats_path=Path(context.get("ip_db_stats", DEFAULT_STATS_PATH)),
            archive_dir=Path(context.get("ip_db_archive", DEFAULT_ARCHIVE_DIR)),
            max_segment_bytes=int(context.get("ip_db_max_segment_bytes", DEFAULT_MAX_SEGMENT_BYTES)),
            source=str(context.get("source", "")),
            pretty=not bool(context.get("compact", False)),
            write_archive=not bool(context.get("ip_db_no_archive", False)),
        )

    return enriched


def enrich_payload(
    payload: Any,
    context: dict[str, Any] | None = None,
) -> Any:
    if isinstance(payload, list):
        enriched = enrich_nodes(payload, context)
        return enriched

    if not isinstance(payload, MutableMapping):
        return payload

    nodes = extract_nodes(payload)
    enriched_nodes = enrich_nodes(nodes, context)

    output = put_nodes(payload, enriched_nodes)

    output.setdefault("metadata", {})
    if isinstance(output["metadata"], MutableMapping):
        output["metadata"]["ip_db_enriched_at"] = utc_now()

    return output


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with normalized IP metadata and maintain segmented IP DB logs."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)

    parser.add_argument("--ipdb-dir", default=str(DEFAULT_IPDB_DIR))
    parser.add_argument("--latest", default="")
    parser.add_argument("--index", default="")
    parser.add_argument("--stats", default="")
    parser.add_argument("--archive-dir", default="")
    parser.add_argument("--max-segment-bytes", type=int, default=DEFAULT_MAX_SEGMENT_BYTES)
    parser.add_argument("--source", default="")
    parser.add_argument("--update-db", action="store_true")
    parser.add_argument("--no-archive", action="store_true")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--report", default="")

    args = parser.parse_args()

    ipdb_dir = Path(args.ipdb_dir)
    current_dir = ipdb_dir / "current"
    archive_dir = Path(args.archive_dir) if args.archive_dir else ipdb_dir / "archive"

    latest_path = Path(args.latest) if args.latest else current_dir / "ip_db.latest.json"
    index_path = Path(args.index) if args.index else current_dir / "ip_db.index.json"
    stats_path = Path(args.stats) if args.stats else current_dir / "ip_db.stats.json"

    payload = read_json(Path(args.input), fallback={})

    context = {
        "source": args.source,
        "ip_db_update": args.update_db,
        "ip_db_latest": str(latest_path),
        "ip_db_index": str(index_path),
        "ip_db_stats": str(stats_path),
        "ip_db_archive": str(archive_dir),
        "ip_db_max_segment_bytes": args.max_segment_bytes,
        "ip_db_no_archive": args.no_archive,
        "compact": args.compact,
    }

    enriched = enrich_payload(payload, context=context)

    write_json(Path(args.output), enriched, pretty=not args.compact)

    report = {
        "schema": "zzx-bitnodes-ip-db-run-report-v1",
        "updated_at": utc_now(),
        "input": str(Path(args.input)),
        "output": str(Path(args.output)),
        "node_count": len(extract_nodes(enriched)),
        "updated_db": args.update_db,
        "ipdb_dir": str(ipdb_dir),
        "latest": str(latest_path),
        "index": str(index_path),
        "stats": str(stats_path),
        "archive_dir": str(archive_dir),
    }

    if args.update_db:
        report["db_update"] = update_ipdb(
            extract_nodes(enriched),
            latest_path=latest_path,
            index_path=index_path,
            stats_path=stats_path,
            archive_dir=archive_dir,
            max_segment_bytes=args.max_segment_bytes,
            source=args.source,
            pretty=not args.compact,
            write_archive=not args.no_archive,
        )

    if args.report:
        write_json(Path(args.report), report, pretty=True)

    print(
        "ip_db complete: "
        f"{report['node_count']} nodes, "
        f"updated_db={args.update_db}, "
        f"latest={latest_path}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
