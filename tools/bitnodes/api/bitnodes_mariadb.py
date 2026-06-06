#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]
BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))

DEFAULT_INPUTS = [
    BITNODES_ROOT / "api" / "aggregate" / "zzxbitnodes" / "latest.json",
    BITNODES_ROOT / "api" / "aggregate" / "originalbitnodes" / "latest.json",
    BITNODES_ROOT / "api" / "zzxbitnodes" / "latest.json",
    BITNODES_ROOT / "api" / "originalbitnodes" / "latest.json",
]

DEFAULT_OUT_DIR = BITNODES_ROOT / "data" / "mariadb" / "api"
DEFAULT_SQL_GZ = DEFAULT_OUT_DIR / "bitnodes-api-latest.sql.gz"
DEFAULT_SHARDS_DIR = DEFAULT_OUT_DIR / "shards"
DEFAULT_SQLITE = DEFAULT_OUT_DIR / "bitnodes.sqlite3"

SCHEMA_VERSION = "zzx-bitnodes-api-mariadb-gz-v4"

NODE_TABLE = "bitnodes_api_nodes"
METADATA_TABLE = "bitnodes_api_metadata"
SHARD_TABLE = "bitnodes_api_shards"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def utc_mysql() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0).isoformat(sep=" ")


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for block in iter(lambda: block_read(handle), b""):
            digest.update(block)

    return digest.hexdigest()


def block_read(handle: Any) -> bytes:
    return handle.read(1024 * 1024)


def sql_quote(value: Any) -> str:
    if value is None:
        return "NULL"

    if isinstance(value, bool):
        return "1" if value else "0"

    if isinstance(value, (int, float)):
        return str(value)

    text = str(value).replace("\x00", "")
    text = text.replace("\\", "\\\\").replace("'", "''")
    return f"'{text}'"


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str)


def safe_int(value: Any, fallback: int | None = None) -> int | None:
    try:
        if value in ("", None):
            return fallback
        return int(float(value))
    except Exception:
        return fallback


def safe_float(value: Any, fallback: float | None = None) -> float | None:
    try:
        if value in ("", None):
            return fallback
        out = float(value)
        if out != out:
            return fallback
        return out
    except Exception:
        return fallback


def bool_or_none(value: Any) -> int | None:
    if isinstance(value, bool):
        return 1 if value else 0

    text = str(value or "").strip().lower()

    if text in {"1", "true", "yes", "y", "reachable", "ok", "online"}:
        return 1

    if text in {"0", "false", "no", "n", "unreachable", "offline"}:
        return 0

    return None


def read_json(path: Path) -> Any:
    if not path.exists():
        return {}

    try:
        if path.name.endswith(".gz"):
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)

        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return {}


def write_gzip_text(path: Path, text: str) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)

    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as handle:
        handle.write(text)

    return path.stat().st_size


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)

    return current


def first(row: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)

        if value not in ("", None):
            return value

    return None


def split_host_port(address: str) -> tuple[str, int | None]:
    value = clean(address)

    if not value:
        return "", None

    if value.startswith("[") and "]" in value:
        host = value[1:value.index("]")]
        rest = value[value.index("]") + 1:]

        if rest.startswith(":") and rest[1:].isdigit():
            return host, int(rest[1:])

        return host, None

    lower = value.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        host, port = value.rsplit(":", 1)

        if port.isdigit():
            return host, int(port)

    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)

        if port.isdigit():
            return host, int(port)

    return value, None


def infer_network(address: str, row: Mapping[str, Any]) -> str:
    network = clean(first(row, "network", "metadata.network", "address_family"))

    if network:
        return network.lower()

    lower = address.lower()

    if ".onion" in lower:
        return "tor"

    if ".i2p" in lower:
        return "i2p"

    if ":" in lower and lower.count(":") > 1:
        return "ipv6"

    if lower.count(".") >= 3:
        return "ipv4"

    return "unknown"


def normalize_original_array(address: str, value: list[Any]) -> dict[str, Any]:
    padded = list(value) + [None] * max(0, 24 - len(value))
    metadata = padded[19] if isinstance(padded[19], Mapping) else {}
    host, port = split_host_port(address)

    return {
        "address": address,
        "host": host,
        "port": port or 8333,
        "protocol": padded[0],
        "agent": padded[1],
        "services": padded[2],
        "timestamp": padded[3],
        "height": padded[4],
        "hostname": padded[5],
        "city": padded[6],
        "country": padded[7],
        "latitude": padded[8],
        "longitude": padded[9],
        "timezone": padded[10],
        "asn": padded[11],
        "organization": padded[12],
        "provider": padded[13],
        "metadata": dict(metadata),
        "reachable": True,
        "raw_array": value,
    }


def normalize_node_record(source: str, address: str, value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        row = dict(value)
    elif isinstance(value, list):
        row = normalize_original_array(address, value)
    else:
        row = {"address": address, "raw": value}

    address = clean(first(row, "address", "canonical_address", "node", "addr", "host") or address)
    host_from_address, port_from_address = split_host_port(address)

    node_id = clean(first(row, "node_id", "id"))

    if not node_id:
        node_id = "node:" + sha256_text(f"{source}:{address}")[:24]

    network = infer_network(address, row)

    return {
        "node_id": node_id,
        "source": source,
        "address": address,
        "host": clean(first(row, "host", "hostname") or host_from_address),
        "port": safe_int(first(row, "port", "metadata.port"), port_from_address or 8333),
        "network": network,
        "agent": first(row, "agent", "user_agent", "subver", "metadata.agent"),
        "protocol": first(row, "protocol", "version", "metadata.protocol"),
        "services": first(row, "services", "metadata.services"),
        "height": first(row, "height", "block_height", "metadata.height"),
        "city": first(row, "city", "city_name", "city_data.city", "geoip.city", "metadata.city"),
        "country_code": first(row, "country_code", "country", "country_data.country_code", "geoip.country_code", "metadata.country_code"),
        "country_name": first(row, "country_name", "country_data.country_name", "metadata.country_name"),
        "continent": first(row, "continent", "continent_name", "continent_data.continent", "metadata.continent"),
        "region": first(row, "region", "region_name", "metadata.region"),
        "territory": first(row, "territory", "state", "province", "admin1", "territory_data.territory", "metadata.territory"),
        "county": first(row, "county", "district", "admin2", "county_data.county", "metadata.county"),
        "zip_code": first(row, "zip", "zipcode", "postal_code", "postcode", "postal_data.postal_code", "metadata.zip"),
        "timezone": first(row, "timezone", "iana_timezone", "tz", "timezone_data.timezone", "metadata.timezone"),
        "latitude": first(row, "latitude", "lat", "geoip.latitude", "metadata.latitude"),
        "longitude": first(row, "longitude", "lon", "lng", "geoip.longitude", "metadata.longitude"),
        "asn": first(row, "asn", "asn_data.asn", "geoip.asn", "metadata.asn"),
        "organization": first(row, "organization", "org", "asn_data.organization", "geoip.organization", "metadata.organization"),
        "provider": first(row, "provider", "isp", "provider_data.provider", "geoip.provider", "metadata.provider"),
        "w3w": first(row, "w3w", "what3words", "w3w_data.w3w", "metadata.w3w"),
        "zzxgcs": first(row, "zzxgcs", "zzx_gcs", "zzxgcs_data.zzxgcs", "metadata.zzxgcs"),
        "geohash": first(row, "geohash", "geohashid_data.geohash", "metadata.geohash"),
        "geohashid": first(row, "geohashid", "geohashid_data.geohashid", "metadata.geohashid"),
        "reachable": first(row, "reachable", "metadata.reachable"),
        "reachable_now": first(row, "reachable_now", "metadata.reachable_now"),
        "reachable_24h": first(row, "reachable_24h", "metadata.reachable_24h"),
        "latency_ms": first(row, "latency_ms", "latency", "metadata.latency_ms"),
        "last_seen": first(row, "last_seen", "last_success", "metadata.last_seen"),
        "is_tor": first(row, "is_tor", "tor.is_tor", "metadata.is_tor"),
        "is_i2p": first(row, "is_i2p", "i2p.is_i2p", "metadata.is_i2p"),
        "is_vpn": first(row, "is_vpn", "vpn.is_vpn", "metadata.is_vpn"),
        "is_proxy": first(row, "is_proxy", "proxy.is_proxy", "metadata.is_proxy"),
        "is_sanctioned_node": first(row, "is_sanctioned_node", "sanctions_data.is_sanctioned", "metadata.is_sanctioned_node"),
        "is_policy_restricted_node": first(row, "is_policy_restricted_node", "sanctions_data.is_policy_restricted", "metadata.is_policy_restricted_node"),
        "is_threat_infrastructure": first(row, "is_threat_infrastructure", "threat_infrastructure.is_threat_infrastructure", "metadata.is_threat_infrastructure"),
        "threat_level": first(row, "threat_level", "threat_infrastructure.threat_level", "tag_attribution.threat_level", "metadata.threat_level"),
        "raw_json": compact_json(row),
        "raw_hash": sha256_text(compact_json(row)),
    }


def iter_nodes(payload: Any, source: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    if isinstance(payload, Mapping):
        nodes = payload.get("nodes")

        if isinstance(nodes, Mapping):
            for address, value in nodes.items():
                records.append(normalize_node_record(source, str(address), value))
            return records

        if isinstance(nodes, list):
            for index, value in enumerate(nodes):
                address = ""
                if isinstance(value, Mapping):
                    address = clean(value.get("address") or value.get("node") or value.get("addr") or value.get("host"))
                records.append(normalize_node_record(source, address or str(index), value))
            return records

        for key in ("data", "results", "rows", "peers", "reachable_nodes", "node_records"):
            value = payload.get(key)

            if isinstance(value, Mapping):
                for address, item in value.items():
                    records.append(normalize_node_record(source, str(address), item))
                return records

            if isinstance(value, list):
                for index, item in enumerate(value):
                    records.append(normalize_node_record(source, str(index), item))
                return records

    elif isinstance(payload, list):
        for index, item in enumerate(payload):
            records.append(normalize_node_record(source, str(index), item))

    return records


def infer_source(path: Path, payload: Any) -> str:
    if isinstance(payload, Mapping):
        source = clean(payload.get("source") or payload.get("crawler"))
        if source:
            return source

    text = str(path).lower()

    if "originalbitnodes" in text:
        return "originalbitnodes"

    if "zzxbitnodes" in text:
        return "zzxbitnodes"

    return "unknown"


def schema_sql() -> str:
    return f"""
-- {SCHEMA_VERSION}
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS {METADATA_TABLE} (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  schema_version VARCHAR(128) NOT NULL,
  generated_at DATETIME NOT NULL,
  source_file TEXT NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  node_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  payload_json LONGTEXT NULL,
  KEY idx_bitnodes_api_metadata_source (source_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {NODE_TABLE} (
  node_id VARCHAR(96) NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  address VARCHAR(512) NOT NULL,
  host VARCHAR(512) NULL,
  port INT NULL,
  network VARCHAR(32) NULL,
  agent TEXT NULL,
  protocol BIGINT NULL,
  services TEXT NULL,
  height BIGINT NULL,
  city VARCHAR(255) NULL,
  country_code VARCHAR(32) NULL,
  country_name VARCHAR(128) NULL,
  continent VARCHAR(128) NULL,
  region_name VARCHAR(128) NULL,
  territory_name VARCHAR(255) NULL,
  county_name VARCHAR(255) NULL,
  zip_code VARCHAR(64) NULL,
  timezone_name VARCHAR(128) NULL,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  asn VARCHAR(64) NULL,
  organization TEXT NULL,
  provider TEXT NULL,
  w3w VARCHAR(255) NULL,
  zzxgcs VARCHAR(255) NULL,
  geohash VARCHAR(64) NULL,
  geohashid VARCHAR(96) NULL,
  reachable TINYINT NULL,
  reachable_now TINYINT NULL,
  reachable_24h TINYINT NULL,
  latency_ms DOUBLE NULL,
  last_seen VARCHAR(64) NULL,
  is_tor TINYINT NULL,
  is_i2p TINYINT NULL,
  is_vpn TINYINT NULL,
  is_proxy TINYINT NULL,
  is_sanctioned_node TINYINT NULL,
  is_policy_restricted_node TINYINT NULL,
  is_threat_infrastructure TINYINT NULL,
  threat_level VARCHAR(32) NULL,
  raw_hash CHAR(64) NOT NULL,
  raw_json LONGTEXT NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (node_id, source_name),
  KEY idx_bitnodes_api_address (address),
  KEY idx_bitnodes_api_source (source_name),
  KEY idx_bitnodes_api_network (network),
  KEY idx_bitnodes_api_country (country_code),
  KEY idx_bitnodes_api_city (city),
  KEY idx_bitnodes_api_asn (asn),
  KEY idx_bitnodes_api_geohash (geohash),
  KEY idx_bitnodes_api_reachable_now (reachable_now),
  KEY idx_bitnodes_api_reachable_24h (reachable_24h),
  KEY idx_bitnodes_api_lat_lon (latitude, longitude),
  KEY idx_bitnodes_api_flags (is_tor, is_i2p, is_vpn, is_proxy, is_sanctioned_node, is_threat_infrastructure)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {SHARD_TABLE} (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  generated_at DATETIME NOT NULL,
  shard_name VARCHAR(255) NOT NULL,
  shard_path TEXT NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  node_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sha256 CHAR(64) NOT NULL,
  UNIQUE KEY uniq_bitnodes_api_shard_sha256 (sha256),
  KEY idx_bitnodes_api_shard_source (source_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
""".strip()


def insert_metadata_sql(source: str, input_path: Path, node_count: int, payload: Any) -> str:
    values = [
        SCHEMA_VERSION,
        utc_mysql(),
        str(input_path),
        source,
        node_count,
        compact_json({k: v for k, v in payload.items() if k != "nodes"}) if isinstance(payload, Mapping) else "",
    ]

    return (
        f"INSERT INTO {METADATA_TABLE} "
        "(schema_version, generated_at, source_file, source_name, node_count, payload_json) "
        f"VALUES ({','.join(sql_quote(value) for value in values)});\n"
    )


def insert_node_sql(row: dict[str, Any]) -> str:
    columns = [
        "node_id",
        "source_name",
        "address",
        "host",
        "port",
        "network",
        "agent",
        "protocol",
        "services",
        "height",
        "city",
        "country_code",
        "country_name",
        "continent",
        "region_name",
        "territory_name",
        "county_name",
        "zip_code",
        "timezone_name",
        "latitude",
        "longitude",
        "asn",
        "organization",
        "provider",
        "w3w",
        "zzxgcs",
        "geohash",
        "geohashid",
        "reachable",
        "reachable_now",
        "reachable_24h",
        "latency_ms",
        "last_seen",
        "is_tor",
        "is_i2p",
        "is_vpn",
        "is_proxy",
        "is_sanctioned_node",
        "is_policy_restricted_node",
        "is_threat_infrastructure",
        "threat_level",
        "raw_hash",
        "raw_json",
        "updated_at",
    ]

    values = [
        row["node_id"],
        row["source"],
        row["address"],
        row["host"],
        row["port"],
        row["network"],
        row["agent"],
        safe_int(row["protocol"]),
        row["services"],
        safe_int(row["height"]),
        row["city"],
        row["country_code"],
        row["country_name"],
        row["continent"],
        row["region"],
        row["territory"],
        row["county"],
        row["zip_code"],
        row["timezone"],
        safe_float(row["latitude"]),
        safe_float(row["longitude"]),
        row["asn"],
        row["organization"],
        row["provider"],
        row["w3w"],
        row["zzxgcs"],
        row["geohash"],
        row["geohashid"],
        bool_or_none(row["reachable"]),
        bool_or_none(row["reachable_now"]),
        bool_or_none(row["reachable_24h"]),
        safe_float(row["latency_ms"]),
        row["last_seen"],
        bool_or_none(row["is_tor"]),
        bool_or_none(row["is_i2p"]),
        bool_or_none(row["is_vpn"]),
        bool_or_none(row["is_proxy"]),
        bool_or_none(row["is_sanctioned_node"]),
        bool_or_none(row["is_policy_restricted_node"]),
        bool_or_none(row["is_threat_infrastructure"]),
        row["threat_level"],
        row["raw_hash"],
        row["raw_json"],
        utc_mysql(),
    ]

    updates = [
        f"{column}=VALUES({column})"
        for column in columns
        if column not in {"node_id", "source_name"}
    ]

    return (
        f"INSERT INTO {NODE_TABLE} ({', '.join(columns)}) "
        f"VALUES ({','.join(sql_quote(value) for value in values)}) "
        f"ON DUPLICATE KEY UPDATE {', '.join(updates)};\n"
    )


def shard_control_sql(path: Path, name: str, source: str, node_count: int) -> str:
    values = [
        utc_mysql(),
        name,
        str(path),
        source,
        node_count,
        path.stat().st_size if path.exists() else 0,
        sha256_file(path) if path.exists() else "",
    ]

    return (
        f"INSERT INTO {SHARD_TABLE} "
        "(generated_at, shard_name, shard_path, source_name, node_count, size_bytes, sha256) "
        f"VALUES ({','.join(sql_quote(value) for value in values)}) "
        "ON DUPLICATE KEY UPDATE generated_at=VALUES(generated_at), shard_path=VALUES(shard_path), "
        "source_name=VALUES(source_name), node_count=VALUES(node_count), size_bytes=VALUES(size_bytes);\n"
    )


def split_sql(lines: list[str], max_bytes: int, header: str) -> list[list[str]]:
    shards: list[list[str]] = []
    current: list[str] = []

    for line in lines:
        current_size = len(header.encode("utf-8")) + sum(len(item.encode("utf-8")) for item in current)

        if current and current_size + len(line.encode("utf-8")) > max_bytes:
            shards.append(current)
            current = []

        current.append(line)

    if current:
        shards.append(current)

    return shards


def build_rows(inputs: list[Path]) -> tuple[list[str], dict[str, int]]:
    lines: list[str] = []
    counts: dict[str, int] = {}

    for input_path in inputs:
        if not input_path.exists():
            continue

        payload = read_json(input_path)
        source = infer_source(input_path, payload)
        rows = iter_nodes(payload, source)

        counts[source] = counts.get(source, 0) + len(rows)
        lines.append(insert_metadata_sql(source, input_path, len(rows), payload))

        for row in rows:
            lines.append(insert_node_sql(row))

    return lines, counts


def build_mariadb_gz(
    *,
    inputs: list[Path],
    output_gz: Path,
    shards_dir: Path,
    max_mb: float,
    no_shards: bool = False,
) -> dict[str, Any]:
    header = schema_sql() + "\n\n"
    lines, source_counts = build_rows(inputs)
    max_bytes = int(max_mb * 1024 * 1024)

    shards_dir.mkdir(parents=True, exist_ok=True)

    if no_shards:
        sql = header + "".join(lines)
        sql += f"-- latest_sha256:{sha256_text(sql)}\n"
        write_gzip_text(output_gz, sql)
        shard_paths: list[Path] = []
    else:
        shard_paths = []
        chunks = split_sql(lines, max_bytes=max_bytes, header=header)

        for index, chunk in enumerate(chunks):
            name = f"bitnodes-api-{index:04d}.sql.gz"
            path = shards_dir / name
            body = "".join(chunk)
            sql = header + f"-- shard_index: {index}\n-- shard_sha256:{sha256_text(body)}\n" + body
            write_gzip_text(path, sql)
            shard_paths.append(path)

        control_lines = [
            shard_control_sql(path, path.name, "mixed", 0)
            for path in shard_paths
        ]

        latest_sql = header + "".join(control_lines)
        latest_sql += f"-- latest_sha256:{sha256_text(latest_sql)}\n"
        write_gzip_text(output_gz, latest_sql)

    manifest = {
        "schema": SCHEMA_VERSION,
        "generated_at": utc_now(),
        "output_sql_gz": str(output_gz),
        "shards_dir": str(shards_dir),
        "node_count": sum(source_counts.values()),
        "source_counts": source_counts,
        "inputs": [str(path) for path in inputs],
        "storage": "mariadb-sql-gzip-shards",
        "shards": [
            {
                "file": path.name,
                "path": str(path),
                "size_bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
            for path in shard_paths
        ],
    }

    write_gzip_text(output_gz.parent / "bitnodes_mariadb_manifest.sql.gz", header + f"-- manifest:{compact_json(manifest)}\n")
    return manifest


def sqlite_schema() -> str:
    return """
CREATE TABLE IF NOT EXISTS bitnodes_api_nodes (
  node_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  address TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  network TEXT,
  agent TEXT,
  protocol INTEGER,
  services TEXT,
  height INTEGER,
  city TEXT,
  country_code TEXT,
  country_name TEXT,
  continent TEXT,
  region_name TEXT,
  territory_name TEXT,
  county_name TEXT,
  zip_code TEXT,
  timezone_name TEXT,
  latitude REAL,
  longitude REAL,
  asn TEXT,
  organization TEXT,
  provider TEXT,
  w3w TEXT,
  zzxgcs TEXT,
  geohash TEXT,
  geohashid TEXT,
  reachable INTEGER,
  reachable_now INTEGER,
  reachable_24h INTEGER,
  latency_ms REAL,
  last_seen TEXT,
  is_tor INTEGER,
  is_i2p INTEGER,
  is_vpn INTEGER,
  is_proxy INTEGER,
  is_sanctioned_node INTEGER,
  is_policy_restricted_node INTEGER,
  is_threat_infrastructure INTEGER,
  threat_level TEXT,
  raw_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (node_id, source_name)
);

CREATE INDEX IF NOT EXISTS idx_bitnodes_api_address ON bitnodes_api_nodes(address);
CREATE INDEX IF NOT EXISTS idx_bitnodes_api_source ON bitnodes_api_nodes(source_name);
CREATE INDEX IF NOT EXISTS idx_bitnodes_api_network ON bitnodes_api_nodes(network);
CREATE INDEX IF NOT EXISTS idx_bitnodes_api_country ON bitnodes_api_nodes(country_code);
CREATE INDEX IF NOT EXISTS idx_bitnodes_api_city ON bitnodes_api_nodes(city);
CREATE INDEX IF NOT EXISTS idx_bitnodes_api_asn ON bitnodes_api_nodes(asn);
CREATE INDEX IF NOT EXISTS idx_bitnodes_api_geohash ON bitnodes_api_nodes(geohash);
CREATE INDEX IF NOT EXISTS idx_bitnodes_api_geo ON bitnodes_api_nodes(latitude, longitude);
""".strip()


def build_sqlite(inputs: list[Path], output: Path) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)

    if output.exists():
        output.unlink()

    conn = sqlite3.connect(str(output))
    conn.executescript(sqlite_schema())

    insert_sql = """
INSERT OR REPLACE INTO bitnodes_api_nodes (
  node_id, source_name, address, host, port, network, agent, protocol, services, height,
  city, country_code, country_name, continent, region_name, territory_name, county_name, zip_code,
  timezone_name, latitude, longitude, asn, organization, provider, w3w, zzxgcs, geohash, geohashid,
  reachable, reachable_now, reachable_24h, latency_ms, last_seen, is_tor, is_i2p, is_vpn, is_proxy,
  is_sanctioned_node, is_policy_restricted_node, is_threat_infrastructure, threat_level,
  raw_hash, raw_json, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

    total = 0
    source_counts: dict[str, int] = {}

    for input_path in inputs:
        if not input_path.exists():
            continue

        payload = read_json(input_path)
        source = infer_source(input_path, payload)
        rows = iter_nodes(payload, source)
        source_counts[source] = source_counts.get(source, 0) + len(rows)
        total += len(rows)

        for row in rows:
            conn.execute(insert_sql, (
                row["node_id"],
                row["source"],
                row["address"],
                row["host"],
                safe_int(row["port"]),
                row["network"],
                row["agent"],
                safe_int(row["protocol"]),
                row["services"],
                safe_int(row["height"]),
                row["city"],
                row["country_code"],
                row["country_name"],
                row["continent"],
                row["region"],
                row["territory"],
                row["county"],
                row["zip_code"],
                row["timezone"],
                safe_float(row["latitude"]),
                safe_float(row["longitude"]),
                row["asn"],
                row["organization"],
                row["provider"],
                row["w3w"],
                row["zzxgcs"],
                row["geohash"],
                row["geohashid"],
                bool_or_none(row["reachable"]),
                bool_or_none(row["reachable_now"]),
                bool_or_none(row["reachable_24h"]),
                safe_float(row["latency_ms"]),
                row["last_seen"],
                bool_or_none(row["is_tor"]),
                bool_or_none(row["is_i2p"]),
                bool_or_none(row["is_vpn"]),
                bool_or_none(row["is_proxy"]),
                bool_or_none(row["is_sanctioned_node"]),
                bool_or_none(row["is_policy_restricted_node"]),
                bool_or_none(row["is_threat_infrastructure"]),
                row["threat_level"],
                row["raw_hash"],
                row["raw_json"],
                utc_now(),
            ))

    conn.commit()
    conn.close()

    return {
        "schema": "zzx-bitnodes-api-sqlite-v4",
        "generated_at": utc_now(),
        "output": str(output),
        "node_count": total,
        "source_counts": source_counts,
        "inputs": [str(path) for path in inputs],
    }


def parse_inputs(values: list[str]) -> list[Path]:
    if not values:
        return [path for path in DEFAULT_INPUTS if path.exists()]

    inputs: list[Path] = []

    for value in values:
        path = Path(value)

        if path.is_dir():
            inputs.extend(sorted(path.rglob("*.json")))
            inputs.extend(sorted(path.rglob("*.json.gz")))
        else:
            inputs.append(path)

    seen: set[str] = set()
    unique: list[Path] = []

    for path in inputs:
        resolved = str(path.resolve())

        if resolved in seen:
            continue

        seen.add(resolved)
        unique.append(path.resolve())

    return unique


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert Bitnodes API JSON into MariaDB .sql.gz shards and optional SQLite cache.",
        allow_abbrev=False,
    )

    parser.add_argument("--input", action="append", default=[])
    parser.add_argument("--output-gz", default=str(DEFAULT_SQL_GZ))
    parser.add_argument("--shards-dir", default=str(DEFAULT_SHARDS_DIR))
    parser.add_argument("--max-mb", type=float, default=24.0)
    parser.add_argument("--sqlite", default="")
    parser.add_argument("--only-sqlite", action="store_true")
    parser.add_argument("--no-shards", action="store_true")
    parser.add_argument("--strict", action="store_true")

    args = parser.parse_args()

    inputs = parse_inputs(args.input)

    if not inputs:
        message = "No Bitnodes JSON inputs found."

        if args.strict:
            raise SystemExit(message)

        print(message)
        return 0

    manifests: dict[str, Any] = {}

    if args.only_sqlite:
        manifests["sqlite"] = build_sqlite(inputs, Path(args.sqlite or DEFAULT_SQLITE))
    else:
        manifests["mariadb"] = build_mariadb_gz(
            inputs=inputs,
            output_gz=Path(args.output_gz),
            shards_dir=Path(args.shards_dir),
            max_mb=args.max_mb,
            no_shards=args.no_shards,
        )

        if args.sqlite:
            manifests["sqlite"] = build_sqlite(inputs, Path(args.sqlite))

    print(json.dumps(manifests, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
