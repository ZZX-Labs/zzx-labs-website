#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import ipaddress
import json
import math
import re
import sqlite3
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree.ElementTree import Element, ElementTree, SubElement


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_DATA_DIR = DEFAULT_API_DIR / "data"

SCHEMA = "zzx-bitnodes-export-db-v3"
DEFAULT_DATABASE = "zzx_bitnodes"
DEFAULT_MAX_BYTES = 24_000_000
SAFE_DB_RE = re.compile(r"^[a-zA-Z0-9_]+$")

DEFAULT_INPUTS = [
    DEFAULT_API_DIR / "aggregate" / "zzxbitnodes" / "latest.json",
    DEFAULT_API_DIR / "aggregate" / "originalbitnodes" / "latest.json",
    DEFAULT_API_DIR / "enriched" / "zzxbitnodes" / "latest.json",
    DEFAULT_API_DIR / "enriched" / "originalbitnodes" / "latest.json",
    DEFAULT_API_DIR / "zzxbitnodes" / "latest.json",
    DEFAULT_API_DIR / "originalbitnodes" / "latest.json",
]

PUBLIC_FIELDS = [
    "node_id", "source", "source_type", "source_url", "crawler_version", "crawl_id",
    "snapshot_timestamp", "snapshot_hash", "enrichment_version", "aggregate_version", "export_version",
    "address", "canonical_address", "host", "port", "network",
    "agent", "protocol", "services", "height",
    "continent", "region", "country", "territory", "county", "city", "zip_code", "timezone",
    "latitude", "longitude",
    "asn", "organization", "provider", "provider_kind", "organization_type", "network_classification",
    "w3w", "zzxgcs", "zzxgms", "geohash", "geohashid",
    "reachable", "reachable_now", "reachable_24h", "reachable_week", "reachable_month",
    "latency_ms", "uptime_seconds", "peer_index",
    "is_ipv4", "is_ipv6", "is_cjdns", "is_tor", "is_i2p", "is_vpn", "is_proxy",
    "is_sanctioned_node", "is_policy_restricted_node",
    "suspected_government", "suspected_military", "suspected_datacenter",
    "suspected_apt_related", "suspected_threat_actor_group_related", "suspected_known_malicious_actor",
    "apt_attribution_score", "apt_attribution_confidence",
    "tag_attribution_score", "tag_attribution_confidence",
    "known_malactor_score", "known_malactor_confidence",
    "first_seen", "last_seen", "last_failure",
    "raw_hash",
]

SQL_COLUMNS = [
    "node_id", "source_name", "source_type", "source_url", "crawler_version", "crawl_id",
    "snapshot_timestamp", "snapshot_hash", "enrichment_version", "aggregate_version", "export_version",
    "address", "canonical_address", "host", "port", "network",
    "agent", "protocol", "services", "height",
    "continent", "region", "country", "territory", "county", "city", "zip_code", "timezone",
    "latitude", "longitude",
    "asn", "organization", "provider", "provider_kind", "organization_type", "network_classification",
    "w3w", "zzxgcs", "zzxgms", "geohash", "geohashid",
    "reachable", "reachable_now", "reachable_24h", "reachable_week", "reachable_month",
    "latency_ms", "uptime_seconds", "peer_index",
    "is_ipv4", "is_ipv6", "is_cjdns", "is_tor", "is_i2p", "is_vpn", "is_proxy",
    "is_sanctioned_node", "is_policy_restricted_node",
    "suspected_government", "suspected_military", "suspected_datacenter",
    "suspected_apt_related", "suspected_threat_actor_group_related", "suspected_known_malicious_actor",
    "apt_attribution_score", "apt_attribution_confidence",
    "tag_attribution_score", "tag_attribution_confidence",
    "known_malactor_score", "known_malactor_confidence",
    "first_seen", "last_seen", "last_failure",
    "raw_hash", "raw_json", "updated_at_utc",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def unix_now() -> int:
    return int(time.time())


def clean(value: Any) -> str:
    return str(value or "").strip()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_json(path: Path) -> Any:
    if not path.exists():
        return {}

    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)

    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any, compact: bool = False) -> int:
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
    return path.stat().st_size


def write_gzip_json(path: Path, payload: Any, compact: bool = True) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)

    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as handle:
        json.dump(
            payload,
            handle,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
            default=str,
        )
        handle.write("\n")

    return path.stat().st_size


def gzip_text(path: Path, text: str) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)

    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as handle:
        handle.write(text)

    return path.stat().st_size


def sql_string(value: Any) -> str:
    if value is None:
        return "NULL"

    text = str(value).replace("\x00", "").replace("\\", "\\\\").replace("'", "''")
    return f"'{text}'"


def sql_int(value: Any) -> str:
    try:
        if value in ("", None):
            return "NULL"
        return str(int(float(value)))
    except Exception:
        return "NULL"


def sql_float(value: Any) -> str:
    try:
        if value in ("", None):
            return "NULL"
        n = float(value)
        return repr(n) if math.isfinite(n) else "NULL"
    except Exception:
        return "NULL"


def sql_bool(value: Any) -> str:
    out = bool_int(value)

    if out is None:
        return "NULL"

    return "1" if out else "0"


def bool_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return 1 if value else 0

    if value in (1, "1"):
        return 1

    if value in (0, "0"):
        return 0

    text = str(value or "").strip().lower()

    if text in {"true", "yes", "y", "on", "reachable", "online", "ok", "success", "connected"}:
        return 1

    if text in {"false", "no", "n", "off", "unreachable", "offline", "fail", "failed", "timeout"}:
        return 0

    return None


def int_or_none(value: Any) -> int | None:
    try:
        if value in ("", None):
            return None
        return int(float(value))
    except Exception:
        return None


def float_or_none(value: Any) -> float | None:
    try:
        if value in ("", None):
            return None
        out = float(value)
        return out if math.isfinite(out) else None
    except Exception:
        return None


def scalar(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)

    return str(value)


def deep_get(row: dict[str, Any], key: str) -> Any:
    current: Any = row

    for part in key.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)

    return current


def first(row: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)

        if value not in ("", None):
            return value

    return None


def split_address(address: str) -> tuple[str, int | None]:
    value = clean(address)

    if value.startswith("[") and "]:" in value:
        host = value.split("]:", 1)[0].lstrip("[")
        return host, int_or_none(value.rsplit(":", 1)[1])

    if value.startswith("[") and value.endswith("]"):
        return value[1:-1], None

    lower = value.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        host, port_text = value.rsplit(":", 1)
        return host, int_or_none(port_text)

    if value.count(":") == 1 and "." in value:
        host, port_text = value.rsplit(":", 1)
        return host, int_or_none(port_text)

    if value.count(":") > 1:
        possible_host, possible_port = value.rsplit(":", 1)

        if possible_port.isdigit():
            try:
                ipaddress.ip_address(possible_host.strip("[]"))
                return possible_host.strip("[]"), int(possible_port)
            except Exception:
                pass

    return value.strip("[]"), None


def canonical_address(address: str, host: str | None = None, port: Any = None) -> str:
    parsed_host, parsed_port = split_address(address)
    final_host = clean(host) or parsed_host
    final_port = int_or_none(port) or parsed_port or 8333

    if ":" in final_host and not final_host.startswith("[") and ".onion" not in final_host and ".i2p" not in final_host:
        return f"[{final_host}]:{final_port}"

    return f"{final_host}:{final_port}"


def infer_network(address: str, row: dict[str, Any]) -> str:
    explicit = clean(first(row, ("network", "metadata.network"))).lower()

    if explicit:
        return explicit

    host, _port = split_address(address)
    lower = host.lower()

    if first(row, ("is_tor", "tor", "metadata.is_tor", "metadata.tor")) or lower.endswith(".onion"):
        return "tor"

    if first(row, ("is_i2p", "i2p", "metadata.is_i2p", "metadata.i2p")) or lower.endswith(".i2p"):
        return "i2p"

    try:
        ip = ipaddress.ip_address(lower)
        if ip.version == 4:
            return "ipv4"
        if ip.version == 6 and ip in ipaddress.ip_network("fc00::/8"):
            return "cjdns"
        if ip.version == 6:
            return "ipv6"
    except Exception:
        pass

    return "dns" if lower else "unknown"


def infer_source(path: Path, payload: Any) -> str:
    if isinstance(payload, dict):
        crawler = payload.get("crawler")

        if isinstance(crawler, dict):
            source = clean(crawler.get("engine") or crawler.get("source"))
            if source:
                return source

        source = clean(payload.get("source") or crawler)
        if source:
            return source

    text = str(path).lower()

    if "originalbitnodes" in text:
        return "originalbitnodes"

    if "zzxbitnodes" in text:
        return "zzxbitnodes"

    return "unknown"


def infer_source_type(source: str, row: dict[str, Any]) -> str:
    explicit = first(row, ("source_type", "metadata.source_type"))

    if explicit:
        return clean(explicit)

    if source == "zzxbitnodes":
        return "zzx-enhanced-crawler"

    if source == "originalbitnodes":
        return "original-bitnodes-compatible"

    if source.startswith("http://") or source.startswith("https://"):
        return "external-bitnodes-api"

    return "unknown"


def node_items(payload: Any) -> list[tuple[str, Any]]:
    if isinstance(payload, dict):
        nodes = payload.get("nodes")

        if isinstance(nodes, dict):
            return [(str(k), v) for k, v in nodes.items()]

        if isinstance(nodes, list):
            return [(str(i), item) for i, item in enumerate(nodes)]

        for key in ("reachable_nodes", "data", "results", "rows", "peers", "node_records"):
            value = payload.get(key)

            if isinstance(value, dict):
                return [(str(k), v) for k, v in value.items()]

            if isinstance(value, list):
                return [(str(i), item) for i, item in enumerate(value)]

    if isinstance(payload, list):
        return [(str(i), item) for i, item in enumerate(payload)]

    return []


def normalize_array(address: str, row: list[Any]) -> dict[str, Any]:
    values = list(row)

    while len(values) < 20:
        values.append(None)

    metadata = values[19] if isinstance(values[19], dict) else {}

    record = {
        "address": address,
        "protocol": values[0],
        "agent": values[1],
        "connected_since": values[2],
        "services": values[3],
        "height": values[4],
        "hostname": values[5],
        "city": values[6],
        "country": values[7],
        "latitude": values[8],
        "longitude": values[9],
        "timezone": values[10],
        "asn": values[11],
        "organization": values[12],
        "provider": values[13],
        "county": values[14],
        "zip_code": values[15],
        "w3w": values[16],
        "geohash": values[17],
        "asn_location": values[18],
        "metadata": metadata,
    }

    if isinstance(metadata, dict):
        for key, value in metadata.items():
            record.setdefault(key, value)

    return record


def normalize_record(source: str, address: str, value: Any, payload: Any, input_path: Path) -> dict[str, Any]:
    if isinstance(value, dict):
        row = dict(value)
    elif isinstance(value, list):
        row = normalize_array(address, value)
    else:
        row = {"address": address, "value": value}

    address = clean(first(row, ("address", "node", "addr", "host", "hostname")) or address)
    host = clean(first(row, ("host", "hostname")) or split_address(address)[0])
    port = first(row, ("port", "metadata.port")) or split_address(address)[1] or 8333
    canon = canonical_address(address, host, port)
    network = infer_network(canon, row)

    raw_json = json.dumps(row, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str)
    payload_hash = sha256_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str)) if isinstance(payload, dict) else None

    node_id = clean(first(row, ("node_id", "id", "map_node")))
    if not node_id:
        node_id = "node:" + sha256_text(f"{source}:{canon}")[:24]

    return {
        "node_id": node_id,
        "source": source,
        "source_type": infer_source_type(source, row),
        "source_url": first(row, ("source_url", "metadata.source_url")),
        "crawler_version": first(row, ("crawler_version", "metadata.crawler_version", "metadata.schema_version")),
        "crawl_id": first(row, ("crawl_id", "metadata.crawl_id")),
        "snapshot_timestamp": first(row, ("snapshot_timestamp", "timestamp", "metadata.snapshot_timestamp")) or (payload.get("timestamp") if isinstance(payload, dict) else None),
        "snapshot_hash": first(row, ("snapshot_hash", "metadata.snapshot_hash")) or payload_hash,
        "enrichment_version": first(row, ("enrichment_version", "metadata.enrichment_version")),
        "aggregate_version": first(row, ("aggregate_version", "metadata.aggregate_version")),
        "export_version": SCHEMA,
        "address": address,
        "canonical_address": canon,
        "host": host,
        "port": port,
        "network": network,
        "agent": first(row, ("agent", "user_agent", "subver", "metadata.agent")),
        "protocol": first(row, ("protocol", "protocol_version", "version", "metadata.protocol")),
        "services": first(row, ("services", "service_bits", "metadata.services")),
        "height": first(row, ("height", "start_height", "latest_height", "metadata.height")),
        "continent": first(row, ("continent", "metadata.continent")),
        "region": first(row, ("region", "metadata.region")),
        "country": first(row, ("country", "country_code", "geoip.country_code", "metadata.country", "metadata.country_code")),
        "territory": first(row, ("territory", "state", "admin1", "metadata.territory")),
        "county": first(row, ("county", "district", "admin2", "metadata.county")),
        "city": first(row, ("city", "city_name", "geoip.city", "metadata.city")),
        "zip_code": first(row, ("zip", "zip_code", "postal_code", "metadata.zip", "metadata.postal_code")),
        "timezone": first(row, ("timezone", "tz", "geoip.timezone", "metadata.timezone")),
        "latitude": first(row, ("latitude", "lat", "geoip.latitude", "metadata.latitude")),
        "longitude": first(row, ("longitude", "lon", "lng", "geoip.longitude", "metadata.longitude")),
        "asn": first(row, ("asn", "geoip.asn", "metadata.asn")),
        "organization": first(row, ("organization", "org", "geoip.organization", "metadata.organization")),
        "provider": first(row, ("provider", "isp", "geoip.provider", "metadata.provider")),
        "provider_kind": first(row, ("provider_kind", "metadata.provider_kind", "metadata.provider_data.provider_kind")),
        "organization_type": first(row, ("organization_type", "metadata.organization_type", "metadata.organization_data.organization_type")),
        "network_classification": first(row, ("network_classification", "metadata.network_classification", "metadata.isp.network_classification")),
        "w3w": first(row, ("w3w", "what3words", "metadata.w3w")),
        "zzxgcs": first(row, ("zzxgcs", "zzx_gcs", "metadata.zzxgcs")),
        "zzxgms": first(row, ("zzxgms", "zzx_gms", "metadata.zzxgms")),
        "geohash": first(row, ("geohash", "metadata.geohash")),
        "geohashid": first(row, ("geohashid", "metadata.geohashid")),
        "reachable": first(row, ("reachable", "metadata.reachable")),
        "reachable_now": first(row, ("reachable_now", "metadata.reachable_now")),
        "reachable_24h": first(row, ("reachable_24h", "metadata.reachable_24h")),
        "reachable_week": first(row, ("reachable_week", "metadata.reachable_week")),
        "reachable_month": first(row, ("reachable_month", "metadata.reachable_month")),
        "latency_ms": first(row, ("latency_ms", "metadata.latency_ms")),
        "uptime_seconds": first(row, ("uptime_seconds", "total_uptime", "metadata.uptime_seconds", "metadata.total_uptime")),
        "peer_index": first(row, ("peer_index", "metadata.peer_index")),
        "is_ipv4": network == "ipv4" or first(row, ("is_ipv4", "metadata.is_ipv4")),
        "is_ipv6": network == "ipv6" or first(row, ("is_ipv6", "metadata.is_ipv6")),
        "is_cjdns": network == "cjdns" or first(row, ("is_cjdns", "metadata.is_cjdns")),
        "is_tor": network == "tor" or first(row, ("is_tor", "tor", "metadata.is_tor", "metadata.tor")),
        "is_i2p": network == "i2p" or first(row, ("is_i2p", "i2p", "metadata.is_i2p", "metadata.i2p")),
        "is_vpn": first(row, ("is_vpn", "vpn", "metadata.is_vpn", "metadata.vpn")),
        "is_proxy": first(row, ("is_proxy", "proxy", "metadata.is_proxy", "metadata.proxy")),
        "is_sanctioned_node": first(row, ("is_sanctioned_node", "metadata.is_sanctioned_node")),
        "is_policy_restricted_node": first(row, ("is_policy_restricted_node", "policy_restricted", "metadata.is_policy_restricted_node", "metadata.policy_restricted")),
        "suspected_government": first(row, ("suspected_government", "metadata.suspected_government", "metadata.government.suspected_government")),
        "suspected_military": first(row, ("suspected_military", "metadata.suspected_military", "metadata.military.suspected_military")),
        "suspected_datacenter": first(row, ("suspected_datacenter", "metadata.suspected_datacenter", "metadata.datacenter.suspected_datacenter")),
        "suspected_apt_related": first(row, ("suspected_apt_related", "metadata.suspected_apt_related", "metadata.apt_attribution.suspected_apt_related")),
        "suspected_threat_actor_group_related": first(row, ("suspected_threat_actor_group_related", "metadata.suspected_threat_actor_group_related", "metadata.tag_attribution.suspected_threat_actor_group_related")),
        "suspected_known_malicious_actor": first(row, ("suspected_known_malicious_actor", "metadata.suspected_known_malicious_actor", "metadata.known_malactor.suspected_known_malicious_actor")),
        "apt_attribution_score": first(row, ("apt_attribution_score", "metadata.apt_attribution_score", "metadata.apt_attribution.apt_attribution_score")),
        "apt_attribution_confidence": first(row, ("apt_attribution_confidence", "metadata.apt_attribution_confidence", "metadata.apt_attribution.apt_attribution_confidence")),
        "tag_attribution_score": first(row, ("tag_attribution_score", "metadata.tag_attribution_score", "metadata.tag_attribution.tag_attribution_score")),
        "tag_attribution_confidence": first(row, ("tag_attribution_confidence", "metadata.tag_attribution_confidence", "metadata.tag_attribution.tag_attribution_confidence")),
        "known_malactor_score": first(row, ("known_malactor_score", "metadata.known_malactor_score", "metadata.known_malactor.known_malactor_score")),
        "known_malactor_confidence": first(row, ("known_malactor_confidence", "metadata.known_malactor_confidence", "metadata.known_malactor.known_malactor_confidence")),
        "first_seen": first(row, ("first_seen", "metadata.first_seen")),
        "last_seen": first(row, ("last_seen", "metadata.last_seen")),
        "last_failure": first(row, ("last_failure", "metadata.last_failure")),
        "raw_hash": sha256_text(raw_json),
        "raw_json": raw_json,
        "_input_path": str(input_path),
    }


def load_records(inputs: list[Path]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    for path in inputs:
        if not path.exists():
            continue

        payload = read_json(path)
        source = infer_source(path, payload)

        for address, value in node_items(payload):
            record = normalize_record(source, address, value, payload, path)
            if record["canonical_address"]:
                records.append(record)

    deduped: dict[tuple[str, str], dict[str, Any]] = {}

    for row in records:
        key = (str(row["source"]), str(row["canonical_address"]))

        if key not in deduped:
            deduped[key] = row
            continue

        old = deduped[key]
        old_score = sum(1 for field in PUBLIC_FIELDS if old.get(field) not in ("", None))
        new_score = sum(1 for field in PUBLIC_FIELDS if row.get(field) not in ("", None))

        if new_score >= old_score:
            deduped[key] = row

    return list(deduped.values())


def source_counts(records: list[dict[str, Any]]) -> dict[str, int]:
    return dict(sorted(Counter(str(row.get("source") or "unknown") for row in records).items()))


def public_row(row: dict[str, Any]) -> dict[str, Any]:
    return {field: row.get(field) for field in PUBLIC_FIELDS}


def schema_sql(database: str) -> str:
    return f"""
CREATE DATABASE IF NOT EXISTS `{database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `{database}`;

CREATE TABLE IF NOT EXISTS bitnodes_nodes (
  node_id VARCHAR(96) NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  source_type VARCHAR(128) NULL,
  source_url TEXT NULL,
  crawler_version VARCHAR(128) NULL,
  crawl_id VARCHAR(128) NULL,
  snapshot_timestamp VARCHAR(64) NULL,
  snapshot_hash CHAR(64) NULL,
  enrichment_version VARCHAR(128) NULL,
  aggregate_version VARCHAR(128) NULL,
  export_version VARCHAR(128) NULL,
  address VARCHAR(512) NOT NULL,
  canonical_address VARCHAR(512) NOT NULL,
  host VARCHAR(512) NULL,
  port INT NULL,
  network VARCHAR(32) NULL,
  agent TEXT NULL,
  protocol BIGINT NULL,
  services BIGINT NULL,
  height BIGINT NULL,
  continent VARCHAR(64) NULL,
  region VARCHAR(255) NULL,
  country VARCHAR(64) NULL,
  territory VARCHAR(255) NULL,
  county VARCHAR(255) NULL,
  city VARCHAR(255) NULL,
  zip_code VARCHAR(64) NULL,
  timezone VARCHAR(128) NULL,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  asn VARCHAR(64) NULL,
  organization TEXT NULL,
  provider TEXT NULL,
  provider_kind VARCHAR(128) NULL,
  organization_type VARCHAR(128) NULL,
  network_classification VARCHAR(128) NULL,
  w3w VARCHAR(255) NULL,
  zzxgcs VARCHAR(255) NULL,
  zzxgms VARCHAR(255) NULL,
  geohash VARCHAR(64) NULL,
  geohashid VARCHAR(64) NULL,
  reachable TINYINT NULL,
  reachable_now TINYINT NULL,
  reachable_24h TINYINT NULL,
  reachable_week TINYINT NULL,
  reachable_month TINYINT NULL,
  latency_ms DOUBLE NULL,
  uptime_seconds BIGINT NULL,
  peer_index DOUBLE NULL,
  is_ipv4 TINYINT NULL,
  is_ipv6 TINYINT NULL,
  is_cjdns TINYINT NULL,
  is_tor TINYINT NULL,
  is_i2p TINYINT NULL,
  is_vpn TINYINT NULL,
  is_proxy TINYINT NULL,
  is_sanctioned_node TINYINT NULL,
  is_policy_restricted_node TINYINT NULL,
  suspected_government TINYINT NULL,
  suspected_military TINYINT NULL,
  suspected_datacenter TINYINT NULL,
  suspected_apt_related TINYINT NULL,
  suspected_threat_actor_group_related TINYINT NULL,
  suspected_known_malicious_actor TINYINT NULL,
  apt_attribution_score DOUBLE NULL,
  apt_attribution_confidence VARCHAR(64) NULL,
  tag_attribution_score DOUBLE NULL,
  tag_attribution_confidence VARCHAR(64) NULL,
  known_malactor_score DOUBLE NULL,
  known_malactor_confidence VARCHAR(64) NULL,
  first_seen VARCHAR(64) NULL,
  last_seen VARCHAR(64) NULL,
  last_failure VARCHAR(64) NULL,
  raw_hash CHAR(64) NOT NULL,
  raw_json LONGTEXT NOT NULL,
  updated_at_utc VARCHAR(64) NOT NULL,
  PRIMARY KEY (node_id, source_name),
  UNIQUE KEY uq_source_canonical (source_name, canonical_address),
  KEY idx_address (address),
  KEY idx_canonical_address (canonical_address),
  KEY idx_source_name (source_name),
  KEY idx_source_network (source_name, network),
  KEY idx_source_country (source_name, country),
  KEY idx_source_reachable (source_name, reachable_now),
  KEY idx_network (network),
  KEY idx_country (country),
  KEY idx_country_city (country, city),
  KEY idx_country_asn (country, asn),
  KEY idx_city (city),
  KEY idx_asn (asn),
  KEY idx_geohash (geohash),
  KEY idx_reachable_now (reachable_now),
  KEY idx_reachable_24h (reachable_24h),
  KEY idx_lat_lon (latitude, longitude),
  KEY idx_geo_cluster (latitude, longitude, country),
  KEY idx_risk (suspected_government, suspected_military, suspected_datacenter),
  KEY idx_threat (suspected_apt_related, suspected_threat_actor_group_related, suspected_known_malicious_actor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bitnodes_exports (
  export_id VARCHAR(96) NOT NULL,
  schema_name VARCHAR(128) NOT NULL,
  generated_at_utc VARCHAR(64) NOT NULL,
  source_count INT NOT NULL,
  node_count BIGINT UNSIGNED NOT NULL,
  shard_count INT NOT NULL,
  PRIMARY KEY (export_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
""".strip()


def sql_value(column: str, row: dict[str, Any]) -> str:
    key = "source" if column == "source_name" else column

    if column in {"port", "protocol", "services", "height", "uptime_seconds"}:
        return sql_int(row.get(key))

    if column in {
        "latitude", "longitude", "latency_ms", "peer_index",
        "apt_attribution_score", "tag_attribution_score", "known_malactor_score",
    }:
        return sql_float(row.get(key))

    if column.startswith("is_") or column.startswith("suspected_") or column in {
        "reachable", "reachable_now", "reachable_24h", "reachable_week", "reachable_month",
    }:
        return sql_bool(row.get(key))

    return sql_string(row.get(key))


def insert_node_sql(row: dict[str, Any]) -> str:
    values = [sql_value(column, row) for column in SQL_COLUMNS]
    updates = [f"{column}=VALUES({column})" for column in SQL_COLUMNS if column not in {"node_id", "source_name"}]

    return (
        f"INSERT INTO bitnodes_nodes ({', '.join(SQL_COLUMNS)}) VALUES ({', '.join(values)}) "
        f"ON DUPLICATE KEY UPDATE {', '.join(updates)};"
    )


def insert_export_sql(export_id: str, source_count: int, node_count: int, shard_count: int) -> str:
    return (
        "INSERT INTO bitnodes_exports "
        "(export_id, schema_name, generated_at_utc, source_count, node_count, shard_count) VALUES "
        f"({sql_string(export_id)}, {sql_string(SCHEMA)}, {sql_string(utc_now())}, "
        f"{source_count}, {node_count}, {shard_count}) "
        "ON DUPLICATE KEY UPDATE "
        "schema_name=VALUES(schema_name), generated_at_utc=VALUES(generated_at_utc), "
        "source_count=VALUES(source_count), node_count=VALUES(node_count), shard_count=VALUES(shard_count);"
    )


def export_mariadb_shards(records: list[dict[str, Any]], output_dir: Path, database: str, max_bytes: int, compact: bool) -> dict[str, Any]:
    if not SAFE_DB_RE.match(database):
        raise SystemExit(f"unsafe database name: {database}")

    shard_dir = output_dir / "mariadb"
    shard_dir.mkdir(parents=True, exist_ok=True)

    for old in shard_dir.glob("*.sql.gz"):
        old.unlink()

    export_id = "export:" + sha256_text(f"{SCHEMA}:{utc_now()}:{len(records)}")[:24]

    header = "\n".join([
        "-- ZZX-Labs Bitnodes MariaDB shard",
        f"-- schema: {SCHEMA}",
        f"-- generated_at_utc: {utc_now()}",
        "SET NAMES utf8mb4;",
        "SET FOREIGN_KEY_CHECKS=0;",
        schema_sql(database),
        "",
    ])
    footer = "\nSET FOREIGN_KEY_CHECKS=1;\n"

    shards = []
    lines = [header]
    plain_estimate = len(header.encode("utf-8"))
    current_count = 0
    shard_no = 0
    plain_limit = max_bytes * 5

    def flush() -> None:
        nonlocal lines, plain_estimate, current_count, shard_no

        if current_count <= 0:
            return

        text = "\n".join(lines) + footer
        path = shard_dir / f"bitnodes_mariadb_{shard_no:04d}.sql.gz"
        size = gzip_text(path, text)

        shards.append({
            "file": path.name,
            "path": path.relative_to(output_dir).as_posix(),
            "size_bytes": size,
            "node_count": current_count,
            "sha256": sha256_bytes(path.read_bytes()),
        })

        shard_no += 1
        lines = [header]
        plain_estimate = len(header.encode("utf-8"))
        current_count = 0

    for row in records:
        line = insert_node_sql(row)
        line_size = len(line.encode("utf-8")) + 1

        if current_count > 0 and plain_estimate + line_size >= plain_limit:
            flush()

        lines.append(line)
        plain_estimate += line_size
        current_count += 1

    flush()

    control_path = shard_dir / "bitnodes_mariadb_control.sql.gz"
    control_text = "\n".join([
        "-- ZZX-Labs Bitnodes MariaDB control file",
        f"-- generated_at_utc: {utc_now()}",
        "SET NAMES utf8mb4;",
        "SET FOREIGN_KEY_CHECKS=0;",
        schema_sql(database),
        insert_export_sql(export_id, len(source_counts(records)), len(records), len(shards)),
        "SET FOREIGN_KEY_CHECKS=1;",
        "",
    ])
    control_size = gzip_text(control_path, control_text)

    manifest = {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "generated_unix": unix_now(),
        "database": database,
        "export_id": export_id,
        "format": "mariadb-sql-gzip-shards",
        "max_bytes": max_bytes,
        "node_count": len(records),
        "source_counts": source_counts(records),
        "control": {
            "file": control_path.name,
            "path": control_path.relative_to(output_dir).as_posix(),
            "size_bytes": control_size,
            "sha256": sha256_bytes(control_path.read_bytes()),
        },
        "shard_count": len(shards),
        "shards": shards,
        "import_order": [f"mariadb/{control_path.name}", *[f"mariadb/{item['file']}" for item in shards]],
    }

    write_json(output_dir / "mariadb_manifest.json", manifest, compact=compact)
    return manifest


def sqlite_row(row: dict[str, Any]) -> tuple[Any, ...]:
    out = []

    for column in SQL_COLUMNS:
        key = "source" if column == "source_name" else column

        if column == "updated_at_utc":
            out.append(utc_now())
        elif column in {"port", "protocol", "services", "height", "uptime_seconds"}:
            out.append(int_or_none(row.get(key)))
        elif column in {
            "latitude", "longitude", "latency_ms", "peer_index",
            "apt_attribution_score", "tag_attribution_score", "known_malactor_score",
        }:
            out.append(float_or_none(row.get(key)))
        elif column.startswith("is_") or column.startswith("suspected_") or column in {
            "reachable", "reachable_now", "reachable_24h", "reachable_week", "reachable_month",
        }:
            out.append(bool_int(row.get(key)))
        else:
            out.append(row.get(key))

    return tuple(out)


def sqlite_schema() -> str:
    return """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA temp_store=MEMORY;

CREATE TABLE bitnodes_nodes (
  node_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_type TEXT,
  source_url TEXT,
  crawler_version TEXT,
  crawl_id TEXT,
  snapshot_timestamp TEXT,
  snapshot_hash TEXT,
  enrichment_version TEXT,
  aggregate_version TEXT,
  export_version TEXT,
  address TEXT NOT NULL,
  canonical_address TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  network TEXT,
  agent TEXT,
  protocol INTEGER,
  services INTEGER,
  height INTEGER,
  continent TEXT,
  region TEXT,
  country TEXT,
  territory TEXT,
  county TEXT,
  city TEXT,
  zip_code TEXT,
  timezone TEXT,
  latitude REAL,
  longitude REAL,
  asn TEXT,
  organization TEXT,
  provider TEXT,
  provider_kind TEXT,
  organization_type TEXT,
  network_classification TEXT,
  w3w TEXT,
  zzxgcs TEXT,
  zzxgms TEXT,
  geohash TEXT,
  geohashid TEXT,
  reachable INTEGER,
  reachable_now INTEGER,
  reachable_24h INTEGER,
  reachable_week INTEGER,
  reachable_month INTEGER,
  latency_ms REAL,
  uptime_seconds INTEGER,
  peer_index REAL,
  is_ipv4 INTEGER,
  is_ipv6 INTEGER,
  is_cjdns INTEGER,
  is_tor INTEGER,
  is_i2p INTEGER,
  is_vpn INTEGER,
  is_proxy INTEGER,
  is_sanctioned_node INTEGER,
  is_policy_restricted_node INTEGER,
  suspected_government INTEGER,
  suspected_military INTEGER,
  suspected_datacenter INTEGER,
  suspected_apt_related INTEGER,
  suspected_threat_actor_group_related INTEGER,
  suspected_known_malicious_actor INTEGER,
  apt_attribution_score REAL,
  apt_attribution_confidence TEXT,
  tag_attribution_score REAL,
  tag_attribution_confidence TEXT,
  known_malactor_score REAL,
  known_malactor_confidence TEXT,
  first_seen TEXT,
  last_seen TEXT,
  last_failure TEXT,
  raw_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  PRIMARY KEY (node_id, source_name),
  UNIQUE (source_name, canonical_address)
);

CREATE INDEX idx_nodes_address ON bitnodes_nodes(address);
CREATE INDEX idx_nodes_canonical ON bitnodes_nodes(canonical_address);
CREATE INDEX idx_nodes_source ON bitnodes_nodes(source_name);
CREATE INDEX idx_nodes_source_network ON bitnodes_nodes(source_name, network);
CREATE INDEX idx_nodes_source_country ON bitnodes_nodes(source_name, country);
CREATE INDEX idx_nodes_source_reachable ON bitnodes_nodes(source_name, reachable_now);
CREATE INDEX idx_nodes_network ON bitnodes_nodes(network);
CREATE INDEX idx_nodes_country ON bitnodes_nodes(country);
CREATE INDEX idx_nodes_country_city ON bitnodes_nodes(country, city);
CREATE INDEX idx_nodes_country_asn ON bitnodes_nodes(country, asn);
CREATE INDEX idx_nodes_city ON bitnodes_nodes(city);
CREATE INDEX idx_nodes_asn ON bitnodes_nodes(asn);
CREATE INDEX idx_nodes_geohash ON bitnodes_nodes(geohash);
CREATE INDEX idx_nodes_lat_lon ON bitnodes_nodes(latitude, longitude);
"""


def export_sqlite(records: list[dict[str, Any]], output_dir: Path, compact: bool = False) -> dict[str, Any]:
    sqlite_dir = output_dir / "sqlite"
    sqlite_dir.mkdir(parents=True, exist_ok=True)
    db_path = sqlite_dir / "bitnodes.sqlite3"

    for path in (db_path, db_path.with_suffix(".sqlite3-wal"), db_path.with_suffix(".sqlite3-shm")):
        if path.exists():
            path.unlink()

    conn = sqlite3.connect(str(db_path))
    conn.executescript(sqlite_schema())

    placeholders = ", ".join(["?"] * len(SQL_COLUMNS))
    stmt = f"INSERT OR REPLACE INTO bitnodes_nodes ({', '.join(SQL_COLUMNS)}) VALUES ({placeholders})"

    conn.executemany(stmt, [sqlite_row(row) for row in records])
    conn.commit()
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
    conn.close()

    gz_path = sqlite_dir / "bitnodes.sqlite3.gz"

    with db_path.open("rb") as src, gzip.open(gz_path, "wb", compresslevel=9) as dst:
        dst.write(src.read())

    manifest = {
        "schema": "zzx-bitnodes-sqlite-export-v3",
        "generated_at": utc_now(),
        "node_count": len(records),
        "sqlite": "sqlite/bitnodes.sqlite3",
        "sqlite_gz": "sqlite/bitnodes.sqlite3.gz",
        "sqlite_size_bytes": db_path.stat().st_size,
        "sqlite_gz_size_bytes": gz_path.stat().st_size,
        "sqlite_sha256": sha256_bytes(db_path.read_bytes()),
        "sqlite_gz_sha256": sha256_bytes(gz_path.read_bytes()),
    }

    write_json(output_dir / "sqlite_manifest.json", manifest, compact=compact)
    return manifest


def export_duckdb(records: list[dict[str, Any]], output_dir: Path, compact: bool = False) -> dict[str, Any] | None:
    try:
        import duckdb
    except Exception:
        return None

    duck_dir = output_dir / "duckdb"
    duck_dir.mkdir(parents=True, exist_ok=True)
    db_path = duck_dir / "bitnodes.duckdb"

    if db_path.exists():
        db_path.unlink()

    rows = [public_row(row) | {"raw_json": row.get("raw_json")} for row in records]

    conn = duckdb.connect(str(db_path))
    conn.execute("CREATE TABLE bitnodes_nodes AS SELECT * FROM rows")
    conn.close()

    manifest = {
        "schema": "zzx-bitnodes-duckdb-export-v1",
        "generated_at": utc_now(),
        "node_count": len(records),
        "duckdb": "duckdb/bitnodes.duckdb",
        "duckdb_size_bytes": db_path.stat().st_size,
        "duckdb_sha256": sha256_bytes(db_path.read_bytes()),
    }

    write_json(output_dir / "duckdb_manifest.json", manifest, compact=compact)
    return manifest


def export_parquet(records: list[dict[str, Any]], output_dir: Path, compact: bool = False) -> dict[str, Any] | None:
    try:
        import pandas as pd
    except Exception:
        return None

    parquet_dir = output_dir / "parquet"
    parquet_dir.mkdir(parents=True, exist_ok=True)
    path = parquet_dir / "nodes.parquet"

    try:
        pd.DataFrame([public_row(row) for row in records]).to_parquet(path, index=False)
    except Exception:
        return None

    manifest = {
        "schema": "zzx-bitnodes-parquet-export-v1",
        "generated_at": utc_now(),
        "node_count": len(records),
        "parquet": "parquet/nodes.parquet",
        "parquet_size_bytes": path.stat().st_size,
        "parquet_sha256": sha256_bytes(path.read_bytes()),
    }

    write_json(output_dir / "parquet_manifest.json", manifest, compact=compact)
    return manifest


def export_json_artifacts(records: list[dict[str, Any]], output_dir: Path, compact: bool) -> dict[str, Any]:
    json_dir = output_dir / "json"
    json_dir.mkdir(parents=True, exist_ok=True)

    rows = [public_row(row) for row in records]
    payload = {
        "schema": "zzx-bitnodes-public-json-v3",
        "generated_at": utc_now(),
        "node_count": len(rows),
        "source_counts": source_counts(records),
        "nodes": rows,
    }

    latest_gz = json_dir / "latest.json.gz"
    latest_size = write_gzip_json(latest_gz, payload, compact=True)

    summary = {key: value for key, value in payload.items() if key != "nodes"}
    summary_size = write_json(json_dir / "latest.summary.json", summary, compact=compact)

    return {
        "schema": "zzx-bitnodes-json-artifacts-v3",
        "latest_json_gz": "json/latest.json.gz",
        "latest_json_gz_size_bytes": latest_size,
        "latest_json_gz_sha256": sha256_bytes(latest_gz.read_bytes()),
        "summary": "json/latest.summary.json",
        "summary_size_bytes": summary_size,
    }


def export_csv_artifacts(records: list[dict[str, Any]], output_dir: Path) -> dict[str, Any]:
    csv_dir = output_dir / "csv"
    csv_dir.mkdir(parents=True, exist_ok=True)
    path = csv_dir / "nodes.csv"

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=PUBLIC_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in records:
            writer.writerow({field: scalar(row.get(field)) for field in PUBLIC_FIELDS})

    gz = csv_dir / "nodes.csv.gz"

    with path.open("rb") as src, gzip.open(gz, "wb", compresslevel=9) as dst:
        dst.write(src.read())

    return {
        "schema": "zzx-bitnodes-csv-artifacts-v2",
        "csv": "csv/nodes.csv",
        "csv_gz": "csv/nodes.csv.gz",
        "csv_size_bytes": path.stat().st_size,
        "csv_gz_size_bytes": gz.stat().st_size,
        "csv_sha256": sha256_bytes(path.read_bytes()),
        "csv_gz_sha256": sha256_bytes(gz.read_bytes()),
    }


def safe_xml_tag(value: str) -> str:
    out = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in value).strip("_") or "field"
    return f"field_{out}" if out[0].isdigit() else out


def export_xml_artifacts(records: list[dict[str, Any]], output_dir: Path) -> dict[str, Any]:
    xml_dir = output_dir / "xml"
    xml_dir.mkdir(parents=True, exist_ok=True)

    root = Element("bitnodes")
    root.set("schema", "zzx-bitnodes-public-xml-v3")
    root.set("generated_at", utc_now())
    root.set("count", str(len(records)))

    for row in records:
        node = SubElement(root, "node")
        for field in PUBLIC_FIELDS:
            child = SubElement(node, safe_xml_tag(field))
            child.text = scalar(row.get(field))

    tree = ElementTree(root)

    try:
        from xml.etree.ElementTree import indent
        indent(tree, space="  ")
    except Exception:
        pass

    path = xml_dir / "nodes.xml"
    tree.write(path, encoding="utf-8", xml_declaration=True)

    gz = xml_dir / "nodes.xml.gz"
    with path.open("rb") as src, gzip.open(gz, "wb", compresslevel=9) as dst:
        dst.write(src.read())

    return {
        "schema": "zzx-bitnodes-xml-artifacts-v2",
        "xml": "xml/nodes.xml",
        "xml_gz": "xml/nodes.xml.gz",
        "xml_size_bytes": path.stat().st_size,
        "xml_gz_size_bytes": gz.stat().st_size,
        "xml_sha256": sha256_bytes(path.read_bytes()),
        "xml_gz_sha256": sha256_bytes(gz.read_bytes()),
    }


def resp(parts: list[str]) -> bytes:
    out = [f"*{len(parts)}\r\n".encode("utf-8")]
    for part in parts:
        data = str(part).encode("utf-8")
        out.append(f"${len(data)}\r\n".encode("utf-8"))
        out.append(data + b"\r\n")
    return b"".join(out)


def export_redis_artifacts(records: list[dict[str, Any]], output_dir: Path) -> dict[str, Any]:
    redis_dir = output_dir / "redis"
    redis_dir.mkdir(parents=True, exist_ok=True)

    json_path = redis_dir / "bitnodes.redis.json.gz"
    command_path = redis_dir / "bitnodes.redis.commands.gz"

    redis_json = {
        "schema": "zzx-bitnodes-redis-rebuild-v2",
        "generated_at": utc_now(),
        "node_count": len(records),
        "source_counts": source_counts(records),
        "nodes": [public_row(row) for row in records],
    }
    json_size = write_gzip_json(json_path, redis_json, compact=True)

    counters = {
        "sources": Counter(str(row.get("source") or "unknown") for row in records),
        "countries": Counter(str(row.get("country") or "unknown") for row in records),
        "cities": Counter(str(row.get("city") or "unknown") for row in records),
        "asns": Counter(str(row.get("asn") or "unknown") for row in records),
        "networks": Counter(str(row.get("network") or "unknown") for row in records),
        "organizations": Counter(str(row.get("organization") or "unknown") for row in records),
        "providers": Counter(str(row.get("provider") or "unknown") for row in records),
    }

    with gzip.open(command_path, "wb", compresslevel=9) as handle:
        handle.write(resp(["DEL", "zzx:bitnodes:nodes", *[f"zzx:bitnodes:{name}" for name in counters]]))

        for row in records:
            address = str(row.get("canonical_address") or row.get("address") or "")
            if not address:
                continue

            key = f"zzx:bitnodes:node:{address}"
            parts = ["HSET", key]

            for field in PUBLIC_FIELDS:
                parts.extend([field, scalar(row.get(field))])

            handle.write(resp(parts))
            handle.write(resp(["SADD", "zzx:bitnodes:nodes", address]))

            for field, prefix in [
                ("source", "source"), ("country", "country"), ("city", "city"), ("asn", "asn"),
                ("network", "network"), ("organization", "organization"), ("provider", "provider"),
            ]:
                value = str(row.get(field) or "unknown")
                handle.write(resp(["SADD", f"zzx:bitnodes:{prefix}:{value}", address]))

            for flag in ["is_tor", "is_i2p", "is_vpn", "is_proxy", "suspected_government", "suspected_military", "suspected_datacenter", "suspected_apt_related"]:
                if bool_int(row.get(flag)) == 1:
                    handle.write(resp(["SADD", f"zzx:bitnodes:{flag}", address]))

        for name, counter in counters.items():
            for key, count in counter.items():
                handle.write(resp(["HSET", f"zzx:bitnodes:{name}", key, str(count)]))

    manifest = {
        "schema": "zzx-bitnodes-redis-artifacts-v2",
        "redis_json_gz": "redis/bitnodes.redis.json.gz",
        "redis_commands_gz": "redis/bitnodes.redis.commands.gz",
        "redis_json_gz_size_bytes": json_size,
        "redis_commands_gz_size_bytes": command_path.stat().st_size,
        "redis_json_gz_sha256": sha256_bytes(json_path.read_bytes()),
        "redis_commands_gz_sha256": sha256_bytes(command_path.read_bytes()),
    }

    write_json(redis_dir / "manifest.json", manifest, compact=True)
    return manifest


def normalized_key(value: Any) -> str:
    text = clean(value)
    return text if text else "unknown"


def group_stats(records: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for row in records:
        buckets[normalized_key(row.get(key))].append(row)

    output = []
    for name, rows in buckets.items():
        output.append({
            key: name,
            "node_count": len(rows),
            "reachable_now": sum(1 for row in rows if bool_int(row.get("reachable_now")) == 1),
            "reachable_24h": sum(1 for row in rows if bool_int(row.get("reachable_24h")) == 1),
            "networks": dict(sorted(Counter(str(row.get("network") or "unknown") for row in rows).items())),
            "sources": dict(sorted(Counter(str(row.get("source") or "unknown") for row in rows).items())),
        })

    return sorted(output, key=lambda item: item["node_count"], reverse=True)


def export_geo_indexes(records: list[dict[str, Any]], output_dir: Path, compact: bool) -> dict[str, Any]:
    geo_dir = output_dir / "geo"
    geo_dir.mkdir(parents=True, exist_ok=True)

    artifacts = {}
    fields = [
        "continent", "region", "country", "territory", "county", "city", "zip_code",
        "asn", "organization", "provider", "provider_kind", "organization_type",
        "network_classification", "geohash", "geohashid", "network", "source",
    ]

    for key in fields:
        path = geo_dir / f"{key}s.json.gz"
        payload = {
            "schema": f"zzx-bitnodes-{key}-index-v2",
            "generated_at": utc_now(),
            "field": key,
            "count": len(records),
            "items": group_stats(records, key),
        }
        size = write_gzip_json(path, payload, compact=True)
        artifacts[key] = {"path": f"geo/{path.name}", "size_bytes": size, "sha256": sha256_bytes(path.read_bytes())}

    manifest = {"schema": "zzx-bitnodes-geo-index-manifest-v2", "generated_at": utc_now(), "artifacts": artifacts}
    write_json(geo_dir / "manifest.json", manifest, compact=compact)
    return manifest


def has_coordinates(row: dict[str, Any]) -> bool:
    return float_or_none(row.get("latitude")) is not None and float_or_none(row.get("longitude")) is not None


def geojson_feature(row: dict[str, Any]) -> dict[str, Any]:
    lat = float_or_none(row.get("latitude"))
    lon = float_or_none(row.get("longitude"))
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": public_row(row),
    }


def export_map_artifacts(records: list[dict[str, Any]], output_dir: Path, compact: bool) -> dict[str, Any]:
    map_dir = output_dir / "map"
    map_dir.mkdir(parents=True, exist_ok=True)

    coordinate_records = [row for row in records if has_coordinates(row)]

    layers = {
        "nodes": coordinate_records,
        "reachable": [row for row in coordinate_records if bool_int(row.get("reachable_now")) == 1],
        "ipv4": [row for row in coordinate_records if row.get("network") == "ipv4"],
        "ipv6": [row for row in coordinate_records if row.get("network") == "ipv6"],
        "tor": [row for row in coordinate_records if row.get("network") == "tor" or bool_int(row.get("is_tor")) == 1],
        "i2p": [row for row in coordinate_records if row.get("network") == "i2p" or bool_int(row.get("is_i2p")) == 1],
        "vpn": [row for row in coordinate_records if bool_int(row.get("is_vpn")) == 1],
        "proxy": [row for row in coordinate_records if bool_int(row.get("is_proxy")) == 1],
        "government": [row for row in coordinate_records if bool_int(row.get("suspected_government")) == 1],
        "military": [row for row in coordinate_records if bool_int(row.get("suspected_military")) == 1],
        "datacenter": [row for row in coordinate_records if bool_int(row.get("suspected_datacenter")) == 1],
        "apt": [row for row in coordinate_records if bool_int(row.get("suspected_apt_related")) == 1],
        "sanctioned": [row for row in coordinate_records if bool_int(row.get("is_sanctioned_node")) == 1],
    }

    artifacts = {}
    for name, rows in layers.items():
        path = map_dir / f"{name}.geojson.gz"
        payload = {
            "type": "FeatureCollection",
            "schema": "zzx-bitnodes-map-geojson-v2",
            "generated_at": utc_now(),
            "name": name,
            "count": len(rows),
            "features": [geojson_feature(row) for row in rows],
        }
        size = write_gzip_json(path, payload, compact=True)
        artifacts[name] = {"path": f"map/{path.name}", "size_bytes": size, "sha256": sha256_bytes(path.read_bytes()), "count": len(rows)}

    cluster_index = build_cluster_index(coordinate_records)
    heatmap = build_heatmap(coordinate_records)
    viewport = build_viewport_index(coordinate_records)

    cluster_size = write_gzip_json(map_dir / "cluster-index.json.gz", cluster_index, compact=True)
    heatmap_size = write_gzip_json(map_dir / "heatmap.json.gz", heatmap, compact=True)
    viewport_size = write_gzip_json(map_dir / "viewport-index.json.gz", viewport, compact=True)

    manifest = {
        "schema": "zzx-bitnodes-map-artifacts-v2",
        "generated_at": utc_now(),
        "coordinate_node_count": len(coordinate_records),
        "artifacts": artifacts,
        "accelerators": {
            "cluster_index": {"path": "map/cluster-index.json.gz", "size_bytes": cluster_size},
            "heatmap": {"path": "map/heatmap.json.gz", "size_bytes": heatmap_size},
            "viewport_index": {"path": "map/viewport-index.json.gz", "size_bytes": viewport_size},
        },
    }

    write_json(map_dir / "manifest.json", manifest, compact=compact)
    return manifest


def build_cluster_index(records: list[dict[str, Any]]) -> dict[str, Any]:
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for row in records:
        lat = float_or_none(row.get("latitude"))
        lon = float_or_none(row.get("longitude"))

        if lat is None or lon is None:
            continue

        key = f"{round(lat, 1)}:{round(lon, 1)}"
        buckets[key].append(row)

    clusters = []
    for key, rows in buckets.items():
        lat, lon = key.split(":")
        clusters.append({
            "cluster_id": "cluster:" + sha256_text(key)[:16],
            "latitude": float(lat),
            "longitude": float(lon),
            "node_count": len(rows),
            "reachable_count": sum(1 for row in rows if bool_int(row.get("reachable_now")) == 1),
            "tor_count": sum(1 for row in rows if row.get("network") == "tor"),
            "ipv4_count": sum(1 for row in rows if row.get("network") == "ipv4"),
            "ipv6_count": sum(1 for row in rows if row.get("network") == "ipv6"),
            "countries": dict(Counter(str(row.get("country") or "unknown") for row in rows)),
        })

    return {"schema": "zzx-bitnodes-cluster-index-v1", "generated_at": utc_now(), "clusters": clusters}


def build_heatmap(records: list[dict[str, Any]]) -> dict[str, Any]:
    points = []

    for row in records:
        lat = float_or_none(row.get("latitude"))
        lon = float_or_none(row.get("longitude"))

        if lat is None or lon is None:
            continue

        weight = 1
        if bool_int(row.get("reachable_now")) == 1:
            weight += 1
        if float_or_none(row.get("peer_index")):
            weight += min(5, int(float_or_none(row.get("peer_index")) or 0) // 20)

        points.append([lon, lat, weight])

    return {"schema": "zzx-bitnodes-heatmap-v1", "generated_at": utc_now(), "points": points}


def build_viewport_index(records: list[dict[str, Any]]) -> dict[str, Any]:
    lats = [float_or_none(row.get("latitude")) for row in records]
    lons = [float_or_none(row.get("longitude")) for row in records]
    lats = [x for x in lats if x is not None]
    lons = [x for x in lons if x is not None]

    return {
        "schema": "zzx-bitnodes-viewport-index-v1",
        "generated_at": utc_now(),
        "node_count": len(records),
        "bounds": {
            "west": min(lons) if lons else None,
            "south": min(lats) if lats else None,
            "east": max(lons) if lons else None,
            "north": max(lats) if lats else None,
        },
    }


def write_latest_and_index(output_dir: Path, **kwargs: Any) -> dict[str, Any]:
    records = kwargs["records"]
    manifest = {
        "schema": "zzx-bitnodes-dataplane-index-v3",
        "generated_at": utc_now(),
        "generated_unix": unix_now(),
        "database": kwargs["database"],
        "max_bytes": kwargs["max_bytes"],
        "node_count": len(records),
        "source_counts": source_counts(records),
        "mariadb": kwargs["mariadb"],
        "sqlite": kwargs["sqlite"],
        "duckdb": kwargs["duckdb"],
        "parquet": kwargs["parquet"],
        "json": kwargs["json_artifacts"],
        "csv": kwargs["csv_artifacts"],
        "xml": kwargs["xml_artifacts"],
        "redis": kwargs["redis_artifacts"],
        "geo": kwargs["geo_indexes"],
        "map": kwargs["map_artifacts"],
        "policy": {
            "canonical_store": "bitcoin/bitnodes/api/data",
            "repo_rule": "Do not commit crawler fan-out snapshots or thousands of generated JSON files.",
            "public_json_limit_bytes": kwargs["max_bytes"],
        },
    }

    latest = {
        "schema": "zzx-bitnodes-api-data-latest-v3",
        "generated_at": manifest["generated_at"],
        "active_database": kwargs["database"],
        "node_count": len(records),
        "source_counts": source_counts(records),
        "dataplane_manifest": "dataplane_manifest.json",
        "index": "index.json",
    }

    write_json(output_dir / "dataplane_manifest.json", manifest, compact=kwargs["compact"])
    write_json(output_dir / "manifest.json", manifest, compact=kwargs["compact"])
    write_json(output_dir / "index.json", manifest, compact=kwargs["compact"])
    write_json(output_dir / "latest.json", latest, compact=kwargs["compact"])
    return manifest


def parse_inputs(values: list[str]) -> list[Path]:
    if not values:
        return [path for path in DEFAULT_INPUTS if path.exists()]

    output: list[Path] = []
    for value in values:
        path = Path(value)
        if path.is_dir():
            output.extend(sorted(path.rglob("*.json")))
            output.extend(sorted(path.rglob("*.json.gz")))
        else:
            output.append(path)

    seen = set()
    unique = []

    for path in output:
        key = str(path.resolve()) if path.exists() else str(path)
        if key not in seen:
            seen.add(key)
            unique.append(path)

    return unique


def main() -> int:
    parser = argparse.ArgumentParser(description="Export Bitnodes node datasets into DB-first dataplane artifacts.")

    parser.add_argument("--input", action="append", default=[])
    parser.add_argument("--output-dir", default=str(DEFAULT_DATA_DIR))
    parser.add_argument("--database", default=DEFAULT_DATABASE)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--sqlite", action="store_true")
    parser.add_argument("--no-sqlite", action="store_true")
    parser.add_argument("--duckdb", action="store_true")
    parser.add_argument("--parquet", action="store_true")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--strict", action="store_true")

    args = parser.parse_args()
    inputs = parse_inputs(args.input)

    if not inputs:
        if args.strict:
            raise SystemExit("no input files found")
        print("no input files found")
        return 0

    records = load_records(inputs)

    if not records and args.strict:
        raise SystemExit("no records found")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    mariadb_manifest = export_mariadb_shards(records, output_dir, args.database, args.max_bytes, args.compact)
    sqlite_manifest = export_sqlite(records, output_dir, args.compact) if not args.no_sqlite else None
    duckdb_manifest = export_duckdb(records, output_dir, args.compact) if args.duckdb else None
    parquet_manifest = export_parquet(records, output_dir, args.compact) if args.parquet else None
    json_manifest = export_json_artifacts(records, output_dir, args.compact)
    csv_manifest = export_csv_artifacts(records, output_dir)
    xml_manifest = export_xml_artifacts(records, output_dir)
    redis_manifest = export_redis_artifacts(records, output_dir)
    geo_manifest = export_geo_indexes(records, output_dir, args.compact)
    map_manifest = export_map_artifacts(records, output_dir, args.compact)

    manifest = write_latest_and_index(
        output_dir,
        records=records,
        database=args.database,
        max_bytes=args.max_bytes,
        compact=args.compact,
        mariadb=mariadb_manifest,
        sqlite=sqlite_manifest,
        duckdb=duckdb_manifest,
        parquet=parquet_manifest,
        json_artifacts=json_manifest,
        csv_artifacts=csv_manifest,
        xml_artifacts=xml_manifest,
        redis_artifacts=redis_manifest,
        geo_indexes=geo_manifest,
        map_artifacts=map_manifest,
    )

    print(
        "export_db complete: "
        f"{manifest['node_count']} nodes, "
        f"{manifest['mariadb']['shard_count']} mariadb shards, "
        f"sqlite={'yes' if sqlite_manifest else 'no'}, "
        f"duckdb={'yes' if duckdb_manifest else 'no'}, "
        f"parquet={'yes' if parquet_manifest else 'no'}, "
        f"output={output_dir}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
