#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
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

DEFAULT_INPUTS = [
    DEFAULT_API_DIR / "enriched" / "zzxbitnodes" / "latest.json",
    DEFAULT_API_DIR / "enriched" / "originalbitnodes" / "latest.json",
    DEFAULT_API_DIR / "aggregate" / "zzxbitnodes" / "latest.json",
    DEFAULT_API_DIR / "aggregate" / "originalbitnodes" / "latest.json",
    DEFAULT_API_DIR / "zzxbitnodes" / "latest.json",
    DEFAULT_API_DIR / "originalbitnodes" / "latest.json",
]

SCHEMA = "zzx-bitnodes-export-db-v2"
DEFAULT_MAX_BYTES = 24_000_000
SAFE_DB_RE = re.compile(r"^[a-zA-Z0-9_]+$")

PUBLIC_FIELDS = [
    "node_id",
    "source",
    "source_type",
    "source_url",
    "crawler_version",
    "crawl_id",
    "address",
    "host",
    "port",
    "network",
    "agent",
    "protocol",
    "services",
    "height",
    "continent",
    "region",
    "city",
    "country",
    "territory",
    "county",
    "zip_code",
    "timezone",
    "latitude",
    "longitude",
    "asn",
    "organization",
    "provider",
    "w3w",
    "zzxgcs",
    "zzxgms",
    "geohash",
    "reachable",
    "reachable_now",
    "reachable_24h",
    "reachable_week",
    "reachable_month",
    "latency_ms",
    "last_seen",
    "raw_hash",
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


def sql_string(value: Any) -> str:
    if value is None:
        return "NULL"

    text = str(value)
    text = text.replace("\x00", "")
    text = text.replace("\\", "\\\\")
    text = text.replace("'", "''")

    return f"'{text}'"


def sql_int(value: Any) -> str:
    if value in ("", None):
        return "NULL"

    try:
        return str(int(float(value)))
    except Exception:
        return "NULL"


def sql_float(value: Any) -> str:
    if value in ("", None):
        return "NULL"

    try:
        n = float(value)
    except Exception:
        return "NULL"

    if not math.isfinite(n):
        return "NULL"

    return repr(n)


def sql_bool(value: Any) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"

    text = str(value or "").strip().lower()

    if text in {"1", "true", "yes", "y", "reachable", "online", "ok", "success"}:
        return "1"

    if text in {"0", "false", "no", "n", "unreachable", "offline", "fail", "failed"}:
        return "0"

    return "NULL"


def bool_int(value: Any) -> int | None:
    out = sql_bool(value)
    if out == "1":
        return 1
    if out == "0":
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


def infer_source(path: Path, payload: Any) -> str:
    if isinstance(payload, dict):
        source = clean(payload.get("source") or payload.get("crawler"))

        if source:
            if isinstance(payload.get("crawler"), dict):
                return clean(payload["crawler"].get("engine") or source)
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


def normalize_record(source: str, address: str, value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        row = dict(value)
    elif isinstance(value, list):
        row = normalize_array(address, value)
    else:
        row = {"address": address, "value": value}

    address = clean(
        row.get("address")
        or row.get("node")
        or row.get("addr")
        or row.get("host")
        or row.get("hostname")
        or address
    )

    host = clean(row.get("host") or row.get("hostname") or address)

    node_id = clean(row.get("node_id") or row.get("id") or row.get("map_node"))
    if not node_id:
        node_id = "node:" + sha256_text(f"{source}:{address}")[:24]

    network = clean(first(row, ("network", "metadata.network"))).lower()

    if not network:
        lower = address.lower()
        if ".onion" in lower:
            network = "tor"
        elif ".i2p" in lower:
            network = "i2p"
        elif ":" in lower and lower.count(".") < 3:
            network = "ipv6"
        elif lower.count(".") >= 3:
            network = "ipv4"
        else:
            network = "unknown"

    raw_json = json.dumps(row, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str)

    source_type = infer_source_type(source, row)

    return {
        "node_id": node_id,
        "source": source,
        "source_type": source_type,
        "source_url": first(row, ("source_url", "metadata.source_url")),
        "crawler_version": first(row, ("crawler_version", "metadata.crawler_version")),
        "crawl_id": first(row, ("crawl_id", "metadata.crawl_id")),
        "address": address,
        "host": host,
        "port": first(row, ("port", "metadata.port")),
        "network": network,
        "agent": first(row, ("agent", "user_agent", "metadata.agent")),
        "protocol": first(row, ("protocol", "protocol_version", "metadata.protocol")),
        "services": first(row, ("services", "metadata.services")),
        "height": first(row, ("height", "metadata.height")),
        "continent": first(row, ("continent", "metadata.continent")),
        "region": first(row, ("region", "metadata.region")),
        "city": first(row, ("city", "city_name", "geoip.city", "metadata.city")),
        "country": first(row, ("country", "country_code", "geoip.country_code", "metadata.country_code")),
        "territory": first(row, ("territory", "state", "region", "admin1", "metadata.territory")),
        "county": first(row, ("county", "district", "admin2", "metadata.county")),
        "zip_code": first(row, ("zip", "zip_code", "postal_code", "metadata.zip")),
        "timezone": first(row, ("timezone", "tz", "geoip.timezone", "metadata.timezone")),
        "latitude": first(row, ("latitude", "lat", "geoip.latitude", "metadata.latitude")),
        "longitude": first(row, ("longitude", "lon", "lng", "geoip.longitude", "metadata.longitude")),
        "asn": first(row, ("asn", "geoip.asn", "metadata.asn")),
        "organization": first(row, ("organization", "org", "geoip.organization", "metadata.organization")),
        "provider": first(row, ("provider", "isp", "geoip.provider", "metadata.provider")),
        "w3w": first(row, ("w3w", "what3words", "metadata.w3w")),
        "zzxgcs": first(row, ("zzxgcs", "zzx_gcs", "metadata.zzxgcs")),
        "zzxgms": first(row, ("zzxgms", "zzx_gms", "metadata.zzxgms")),
        "geohash": first(row, ("geohash", "metadata.geohash")),
        "reachable": first(row, ("reachable", "metadata.reachable")),
        "reachable_now": first(row, ("reachable_now", "metadata.reachable_now")),
        "reachable_24h": first(row, ("reachable_24h", "metadata.reachable_24h")),
        "reachable_week": first(row, ("reachable_week", "metadata.reachable_week")),
        "reachable_month": first(row, ("reachable_month", "metadata.reachable_month")),
        "latency_ms": first(row, ("latency_ms", "metadata.latency_ms")),
        "last_seen": first(row, ("last_seen", "metadata.last_seen")),
        "raw_hash": sha256_text(raw_json),
        "raw_json": raw_json,
    }


def load_records(inputs: list[Path]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    for path in inputs:
        if not path.exists():
            continue

        payload = read_json(path)
        source = infer_source(path, payload)

        for address, value in node_items(payload):
            record = normalize_record(source, address, value)

            if record["address"]:
                records.append(record)

    deduped: dict[tuple[str, str], dict[str, Any]] = {}

    for row in records:
        deduped[(row["source"], row["address"])] = row

    return list(deduped.values())


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
  address VARCHAR(512) NOT NULL,
  host VARCHAR(512) NULL,
  port INT NULL,
  network VARCHAR(32) NULL,
  agent TEXT NULL,
  protocol BIGINT NULL,
  services BIGINT NULL,
  height BIGINT NULL,
  continent VARCHAR(64) NULL,
  region VARCHAR(255) NULL,
  city VARCHAR(255) NULL,
  country VARCHAR(64) NULL,
  territory VARCHAR(255) NULL,
  county VARCHAR(255) NULL,
  zip_code VARCHAR(64) NULL,
  timezone VARCHAR(128) NULL,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  asn VARCHAR(64) NULL,
  organization TEXT NULL,
  provider TEXT NULL,
  w3w VARCHAR(255) NULL,
  zzxgcs VARCHAR(255) NULL,
  zzxgms VARCHAR(255) NULL,
  geohash VARCHAR(64) NULL,
  reachable TINYINT NULL,
  reachable_now TINYINT NULL,
  reachable_24h TINYINT NULL,
  reachable_week TINYINT NULL,
  reachable_month TINYINT NULL,
  latency_ms DOUBLE NULL,
  last_seen VARCHAR(64) NULL,
  raw_hash CHAR(64) NOT NULL,
  raw_json LONGTEXT NOT NULL,
  updated_at_utc VARCHAR(64) NOT NULL,
  PRIMARY KEY (node_id, source_name),
  KEY idx_address (address),
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
  KEY idx_reachable_week (reachable_week),
  KEY idx_reachable_month (reachable_month),
  KEY idx_lat_lon (latitude, longitude),
  KEY idx_geo_cluster (latitude, longitude, country)
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


def insert_export_sql(export_id: str, source_count: int, node_count: int, shard_count: int) -> str:
    return (
        "INSERT INTO bitnodes_exports "
        "(export_id, schema_name, generated_at_utc, source_count, node_count, shard_count) VALUES "
        f"({sql_string(export_id)}, {sql_string(SCHEMA)}, {sql_string(utc_now())}, "
        f"{source_count}, {node_count}, {shard_count}) "
        "ON DUPLICATE KEY UPDATE "
        "schema_name=VALUES(schema_name), "
        "generated_at_utc=VALUES(generated_at_utc), "
        "source_count=VALUES(source_count), "
        "node_count=VALUES(node_count), "
        "shard_count=VALUES(shard_count);"
    )


def insert_node_sql(row: dict[str, Any]) -> str:
    columns = [
        "node_id",
        "source_name",
        "source_type",
        "source_url",
        "crawler_version",
        "crawl_id",
        "address",
        "host",
        "port",
        "network",
        "agent",
        "protocol",
        "services",
        "height",
        "continent",
        "region",
        "city",
        "country",
        "territory",
        "county",
        "zip_code",
        "timezone",
        "latitude",
        "longitude",
        "asn",
        "organization",
        "provider",
        "w3w",
        "zzxgcs",
        "zzxgms",
        "geohash",
        "reachable",
        "reachable_now",
        "reachable_24h",
        "reachable_week",
        "reachable_month",
        "latency_ms",
        "last_seen",
        "raw_hash",
        "raw_json",
        "updated_at_utc",
    ]

    values = [
        sql_string(row["node_id"]),
        sql_string(row["source"]),
        sql_string(row["source_type"]),
        sql_string(row["source_url"]),
        sql_string(row["crawler_version"]),
        sql_string(row["crawl_id"]),
        sql_string(row["address"]),
        sql_string(row["host"]),
        sql_int(row["port"]),
        sql_string(row["network"]),
        sql_string(row["agent"]),
        sql_int(row["protocol"]),
        sql_int(row["services"]),
        sql_int(row["height"]),
        sql_string(row["continent"]),
        sql_string(row["region"]),
        sql_string(row["city"]),
        sql_string(row["country"]),
        sql_string(row["territory"]),
        sql_string(row["county"]),
        sql_string(row["zip_code"]),
        sql_string(row["timezone"]),
        sql_float(row["latitude"]),
        sql_float(row["longitude"]),
        sql_string(row["asn"]),
        sql_string(row["organization"]),
        sql_string(row["provider"]),
        sql_string(row["w3w"]),
        sql_string(row["zzxgcs"]),
        sql_string(row["zzxgms"]),
        sql_string(row["geohash"]),
        sql_bool(row["reachable"]),
        sql_bool(row["reachable_now"]),
        sql_bool(row["reachable_24h"]),
        sql_bool(row["reachable_week"]),
        sql_bool(row["reachable_month"]),
        sql_float(row["latency_ms"]),
        sql_string(row["last_seen"]),
        sql_string(row["raw_hash"]),
        sql_string(row["raw_json"]),
        sql_string(utc_now()),
    ]

    updates = [
        f"{column}=VALUES({column})"
        for column in columns
        if column not in {"node_id", "source_name"}
    ]

    return (
        f"INSERT INTO bitnodes_nodes ({', '.join(columns)}) VALUES ({', '.join(values)}) "
        f"ON DUPLICATE KEY UPDATE {', '.join(updates)};"
    )


def gzip_text(path: Path, text: str) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)

    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as handle:
        handle.write(text)

    return path.stat().st_size


def estimate_gzip_size(text: str) -> int:
    return len(gzip.compress(text.encode("utf-8"), compresslevel=9))


def source_counts(records: list[dict[str, Any]]) -> dict[str, int]:
    return dict(sorted(Counter(str(row.get("source") or "unknown") for row in records).items()))


def export_mariadb_shards(
    records: list[dict[str, Any]],
    output_dir: Path,
    database: str,
    max_bytes: int,
    compact: bool,
) -> dict[str, Any]:
    if not SAFE_DB_RE.match(database):
        raise SystemExit(f"unsafe database name: {database}")

    output_dir.mkdir(parents=True, exist_ok=True)

    export_id = "export:" + sha256_text(f"{SCHEMA}:{utc_now()}:{len(records)}")[:24]
    prefix = "bitnodes_mariadb"
    shard_dir = output_dir / "mariadb"
    shard_dir.mkdir(parents=True, exist_ok=True)

    for old in shard_dir.glob("*.sql.gz"):
        old.unlink()

    header = "\n".join(
        [
            "-- ZZX-Labs Bitnodes MariaDB shard",
            f"-- schema: {SCHEMA}",
            f"-- generated_at_utc: {utc_now()}",
            "SET NAMES utf8mb4;",
            "SET FOREIGN_KEY_CHECKS=0;",
            schema_sql(database),
            "",
        ]
    )

    footer = "\nSET FOREIGN_KEY_CHECKS=1;\n"

    shards: list[dict[str, Any]] = []
    current_lines = [header]
    current_count = 0
    shard_no = 0

    def flush() -> None:
        nonlocal current_lines, current_count, shard_no

        if current_count <= 0:
            return

        text = "\n".join(current_lines) + footer
        name = f"{prefix}_{shard_no:04d}.sql.gz"
        path = shard_dir / name
        size = gzip_text(path, text)

        shards.append(
            {
                "file": name,
                "path": path.relative_to(output_dir).as_posix(),
                "size_bytes": size,
                "node_count": current_count,
                "sha256": sha256_bytes(path.read_bytes()),
            }
        )

        shard_no += 1
        current_lines = [header]
        current_count = 0

    for row in records:
        line = insert_node_sql(row)
        candidate = "\n".join(current_lines + [line]) + footer

        if current_count > 0 and estimate_gzip_size(candidate) >= max_bytes:
            flush()

        current_lines.append(line)
        current_count += 1

    flush()

    control_text = "\n".join(
        [
            "-- ZZX-Labs Bitnodes MariaDB control file",
            f"-- generated_at_utc: {utc_now()}",
            "SET NAMES utf8mb4;",
            "SET FOREIGN_KEY_CHECKS=0;",
            schema_sql(database),
            insert_export_sql(export_id, len(source_counts(records)), len(records), len(shards)),
            "SET FOREIGN_KEY_CHECKS=1;",
            "",
        ]
    )

    control_file = shard_dir / f"{prefix}_control.sql.gz"
    control_size = gzip_text(control_file, control_text)

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
            "file": control_file.name,
            "path": control_file.relative_to(output_dir).as_posix(),
            "size_bytes": control_size,
            "sha256": sha256_bytes(control_file.read_bytes()),
        },
        "shard_count": len(shards),
        "shards": shards,
        "import_order": [f"mariadb/{control_file.name}", *[f"mariadb/{item['file']}" for item in shards]],
        "security_note": (
            "These are data-only SQL dumps. No credentials, grants, users, passwords, "
            "private keys, or server secrets are included."
        ),
    }

    write_json(output_dir / "mariadb_manifest.json", manifest, compact=compact)
    return manifest


SQLITE_COLUMNS = [
    "node_id",
    "source_name",
    "source_type",
    "source_url",
    "crawler_version",
    "crawl_id",
    "address",
    "host",
    "port",
    "network",
    "agent",
    "protocol",
    "services",
    "height",
    "continent",
    "region",
    "city",
    "country",
    "territory",
    "county",
    "zip_code",
    "timezone",
    "latitude",
    "longitude",
    "asn",
    "organization",
    "provider",
    "w3w",
    "zzxgcs",
    "zzxgms",
    "geohash",
    "reachable",
    "reachable_now",
    "reachable_24h",
    "reachable_week",
    "reachable_month",
    "latency_ms",
    "last_seen",
    "raw_hash",
    "raw_json",
    "updated_at_utc",
]


def export_sqlite(records: list[dict[str, Any]], output_dir: Path, compact: bool = False) -> dict[str, Any]:
    sqlite_dir = output_dir / "sqlite"
    sqlite_dir.mkdir(parents=True, exist_ok=True)

    db_path = sqlite_dir / "bitnodes.sqlite3"

    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(str(db_path))
    conn.executescript(
        """
CREATE TABLE bitnodes_nodes (
  node_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_type TEXT,
  source_url TEXT,
  crawler_version TEXT,
  crawl_id TEXT,
  address TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  network TEXT,
  agent TEXT,
  protocol INTEGER,
  services INTEGER,
  height INTEGER,
  continent TEXT,
  region TEXT,
  city TEXT,
  country TEXT,
  territory TEXT,
  county TEXT,
  zip_code TEXT,
  timezone TEXT,
  latitude REAL,
  longitude REAL,
  asn TEXT,
  organization TEXT,
  provider TEXT,
  w3w TEXT,
  zzxgcs TEXT,
  zzxgms TEXT,
  geohash TEXT,
  reachable INTEGER,
  reachable_now INTEGER,
  reachable_24h INTEGER,
  reachable_week INTEGER,
  reachable_month INTEGER,
  latency_ms REAL,
  last_seen TEXT,
  raw_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  PRIMARY KEY (node_id, source_name)
);
CREATE INDEX idx_nodes_address ON bitnodes_nodes(address);
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
    )

    placeholders = ", ".join(["?"] * len(SQLITE_COLUMNS))
    stmt = f"INSERT OR REPLACE INTO bitnodes_nodes ({', '.join(SQLITE_COLUMNS)}) VALUES ({placeholders})"

    for row in records:
        conn.execute(
            stmt,
            (
                row["node_id"],
                row["source"],
                row["source_type"],
                row["source_url"],
                row["crawler_version"],
                row["crawl_id"],
                row["address"],
                row["host"],
                int_or_none(row["port"]),
                row["network"],
                row["agent"],
                int_or_none(row["protocol"]),
                int_or_none(row["services"]),
                int_or_none(row["height"]),
                row["continent"],
                row["region"],
                row["city"],
                row["country"],
                row["territory"],
                row["county"],
                row["zip_code"],
                row["timezone"],
                float_or_none(row["latitude"]),
                float_or_none(row["longitude"]),
                row["asn"],
                row["organization"],
                row["provider"],
                row["w3w"],
                row["zzxgcs"],
                row["zzxgms"],
                row["geohash"],
                bool_int(row["reachable"]),
                bool_int(row["reachable_now"]),
                bool_int(row["reachable_24h"]),
                bool_int(row["reachable_week"]),
                bool_int(row["reachable_month"]),
                float_or_none(row["latency_ms"]),
                row["last_seen"],
                row["raw_hash"],
                row["raw_json"],
                utc_now(),
            ),
        )

    conn.commit()
    conn.close()

    gz_path = sqlite_dir / "bitnodes.sqlite3.gz"

    with db_path.open("rb") as src, gzip.open(gz_path, "wb", compresslevel=9) as dst:
        dst.write(src.read())

    manifest = {
        "schema": "zzx-bitnodes-sqlite-export-v2",
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


def public_row(row: dict[str, Any]) -> dict[str, Any]:
    return {field: row.get(field) for field in PUBLIC_FIELDS}


def export_json_artifacts(records: list[dict[str, Any]], output_dir: Path, compact: bool) -> dict[str, Any]:
    json_dir = output_dir / "json"
    json_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "schema": "zzx-bitnodes-public-json-v2",
        "generated_at": utc_now(),
        "node_count": len(records),
        "source_counts": source_counts(records),
        "nodes": [public_row(row) for row in records],
    }

    gz = json_dir / "latest.json.gz"
    gz_size = write_gzip_json(gz, payload, compact=True)

    summary = {
        key: value
        for key, value in payload.items()
        if key != "nodes"
    }

    summary_path = json_dir / "latest.summary.json"
    summary_size = write_json(summary_path, summary, compact=compact)

    return {
        "schema": "zzx-bitnodes-json-artifacts-v1",
        "latest_json_gz": "json/latest.json.gz",
        "latest_json_gz_size_bytes": gz_size,
        "latest_json_gz_sha256": sha256_bytes(gz.read_bytes()),
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
            writer.writerow({field: row.get(field) for field in PUBLIC_FIELDS})

    gz = csv_dir / "nodes.csv.gz"

    with path.open("rb") as src, gzip.open(gz, "wb", compresslevel=9) as dst:
        dst.write(src.read())

    return {
        "schema": "zzx-bitnodes-csv-artifacts-v1",
        "csv": "csv/nodes.csv",
        "csv_gz": "csv/nodes.csv.gz",
        "csv_size_bytes": path.stat().st_size,
        "csv_gz_size_bytes": gz.stat().st_size,
        "csv_sha256": sha256_bytes(path.read_bytes()),
        "csv_gz_sha256": sha256_bytes(gz.read_bytes()),
    }


def safe_xml_tag(value: str) -> str:
    out = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in value).strip("_") or "field"

    if out[0].isdigit():
        out = "field_" + out

    return out


def export_xml_artifacts(records: list[dict[str, Any]], output_dir: Path) -> dict[str, Any]:
    xml_dir = output_dir / "xml"
    xml_dir.mkdir(parents=True, exist_ok=True)

    root = Element("bitnodes")
    root.set("schema", "zzx-bitnodes-public-xml-v2")
    root.set("generated_at", utc_now())
    root.set("count", str(len(records)))

    for row in records:
        node = SubElement(root, "node")

        for field in PUBLIC_FIELDS:
            child = SubElement(node, safe_xml_tag(field))
            value = row.get(field)
            child.text = "" if value is None else str(value)

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
        "schema": "zzx-bitnodes-xml-artifacts-v1",
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
        "schema": "zzx-bitnodes-redis-rebuild-v1",
        "generated_at": utc_now(),
        "node_count": len(records),
        "source_counts": source_counts(records),
        "nodes": [public_row(row) for row in records],
    }

    json_size = write_gzip_json(json_path, redis_json, compact=True)

    source_counter = Counter(str(row.get("source") or "unknown") for row in records)
    country_counter = Counter(str(row.get("country") or "unknown") for row in records)
    network_counter = Counter(str(row.get("network") or "unknown") for row in records)

    with gzip.open(command_path, "wb", compresslevel=9) as handle:
        handle.write(resp(["DEL", "zzx:bitnodes:nodes", "zzx:bitnodes:sources", "zzx:bitnodes:countries", "zzx:bitnodes:networks"]))

        for row in records:
            address = str(row.get("address") or "")
            if not address:
                continue

            key = f"zzx:bitnodes:node:{address}"
            parts = ["HSET", key]

            for field in PUBLIC_FIELDS:
                value = row.get(field)
                parts.extend([field, "" if value is None else str(value)])

            handle.write(resp(parts))
            handle.write(resp(["SADD", "zzx:bitnodes:nodes", address]))

        for name, count in source_counter.items():
            handle.write(resp(["HSET", "zzx:bitnodes:sources", name, str(count)]))

        for name, count in country_counter.items():
            handle.write(resp(["HSET", "zzx:bitnodes:countries", name, str(count)]))

        for name, count in network_counter.items():
            handle.write(resp(["HSET", "zzx:bitnodes:networks", name, str(count)]))

    manifest = {
        "schema": "zzx-bitnodes-redis-artifacts-v1",
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
        networks = Counter(str(row.get("network") or "unknown") for row in rows)
        sources = Counter(str(row.get("source") or "unknown") for row in rows)

        output.append(
            {
                key: name,
                "node_count": len(rows),
                "reachable_now": sum(1 for row in rows if bool_int(row.get("reachable_now")) == 1),
                "reachable_24h": sum(1 for row in rows if bool_int(row.get("reachable_24h")) == 1),
                "networks": dict(sorted(networks.items())),
                "sources": dict(sorted(sources.items())),
            }
        )

    return sorted(output, key=lambda item: item["node_count"], reverse=True)


def export_geo_indexes(records: list[dict[str, Any]], output_dir: Path, compact: bool) -> dict[str, Any]:
    geo_dir = output_dir / "geo"
    geo_dir.mkdir(parents=True, exist_ok=True)

    artifacts = {}

    for key in ("country", "territory", "county", "city", "asn", "geohash", "network", "source"):
        path = geo_dir / f"{key}s.json.gz"
        payload = {
            "schema": f"zzx-bitnodes-{key}-index-v1",
            "generated_at": utc_now(),
            "field": key,
            "count": len(records),
            "items": group_stats(records, key),
        }
        size = write_gzip_json(path, payload, compact=True)
        artifacts[key] = {
            "path": f"geo/{path.name}",
            "size_bytes": size,
            "sha256": sha256_bytes(path.read_bytes()),
        }

    manifest = {
        "schema": "zzx-bitnodes-geo-index-manifest-v1",
        "generated_at": utc_now(),
        "artifacts": artifacts,
    }

    write_json(geo_dir / "manifest.json", manifest, compact=compact)
    return manifest


def has_coordinates(row: dict[str, Any]) -> bool:
    return float_or_none(row.get("latitude")) is not None and float_or_none(row.get("longitude")) is not None


def geojson_feature(row: dict[str, Any]) -> dict[str, Any]:
    props = public_row(row)
    lat = float_or_none(row.get("latitude"))
    lon = float_or_none(row.get("longitude"))

    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [lon, lat],
        },
        "properties": props,
    }


def export_map_artifacts(records: list[dict[str, Any]], output_dir: Path, compact: bool) -> dict[str, Any]:
    map_dir = output_dir / "map"
    map_dir.mkdir(parents=True, exist_ok=True)

    coordinate_records = [row for row in records if has_coordinates(row)]

    sets = {
        "nodes": coordinate_records,
        "reachable": [row for row in coordinate_records if bool_int(row.get("reachable_now")) == 1],
        "tor": [row for row in coordinate_records if row.get("network") == "tor"],
        "ipv4": [row for row in coordinate_records if row.get("network") == "ipv4"],
        "ipv6": [row for row in coordinate_records if row.get("network") == "ipv6"],
        "i2p": [row for row in coordinate_records if row.get("network") == "i2p"],
    }

    artifacts = {}

    for name, rows in sets.items():
        path = map_dir / f"{name}.geojson.gz"
        payload = {
            "type": "FeatureCollection",
            "schema": "zzx-bitnodes-map-geojson-v1",
            "generated_at": utc_now(),
            "name": name,
            "count": len(rows),
            "features": [geojson_feature(row) for row in rows],
        }
        size = write_gzip_json(path, payload, compact=True)
        artifacts[name] = {
            "path": f"map/{path.name}",
            "size_bytes": size,
            "sha256": sha256_bytes(path.read_bytes()),
            "count": len(rows),
        }

    manifest = {
        "schema": "zzx-bitnodes-map-artifacts-v1",
        "generated_at": utc_now(),
        "coordinate_node_count": len(coordinate_records),
        "artifacts": artifacts,
    }

    write_json(map_dir / "manifest.json", manifest, compact=compact)
    return manifest


def write_latest_and_index(
    output_dir: Path,
    *,
    records: list[dict[str, Any]],
    database: str,
    max_bytes: int,
    compact: bool,
    mariadb: dict[str, Any],
    sqlite: dict[str, Any] | None,
    json_artifacts: dict[str, Any],
    csv_artifacts: dict[str, Any],
    xml_artifacts: dict[str, Any],
    redis_artifacts: dict[str, Any],
    geo_indexes: dict[str, Any],
    map_artifacts: dict[str, Any],
) -> dict[str, Any]:
    manifest = {
        "schema": "zzx-bitnodes-dataplane-index-v2",
        "generated_at": utc_now(),
        "generated_unix": unix_now(),
        "database": database,
        "max_bytes": max_bytes,
        "node_count": len(records),
        "source_counts": source_counts(records),
        "mariadb": mariadb,
        "sqlite": sqlite,
        "json": json_artifacts,
        "csv": csv_artifacts,
        "xml": xml_artifacts,
        "redis": redis_artifacts,
        "geo": geo_indexes,
        "map": map_artifacts,
        "policy": {
            "canonical_store": "bitcoin/bitnodes/api/data",
            "repo_rule": "Do not commit crawler fan-out snapshots or thousands of generated JSON files.",
            "public_json_limit_bytes": max_bytes,
        },
    }

    latest = {
        "schema": "zzx-bitnodes-api-data-latest-v2",
        "generated_at": manifest["generated_at"],
        "active_database": database,
        "node_count": len(records),
        "source_counts": source_counts(records),
        "mariadb_manifest": "mariadb_manifest.json",
        "sqlite_manifest": "sqlite_manifest.json" if sqlite else None,
        "dataplane_manifest": "dataplane_manifest.json",
        "index": "index.json",
    }

    write_json(output_dir / "dataplane_manifest.json", manifest, compact=compact)
    write_json(output_dir / "index.json", manifest, compact=compact)
    write_json(output_dir / "latest.json", latest, compact=compact)

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
        key = str(path)

        if key in seen:
            continue

        seen.add(key)
        unique.append(path)

    return unique


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export Bitnodes node datasets into DB-first dataplane artifacts under bitcoin/bitnodes/api/data/."
    )

    parser.add_argument("--input", action="append", default=[])
    parser.add_argument("--output-dir", default=str(DEFAULT_DATA_DIR))
    parser.add_argument("--database", default="zzx_bitnodes")
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--sqlite", action="store_true")
    parser.add_argument("--no-sqlite", action="store_true")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--strict", action="store_true")

    args = parser.parse_args()

    inputs = parse_inputs(args.input)

    if not inputs:
        message = "no input files found"
        if args.strict:
            raise SystemExit(message)
        print(message)
        return 0

    records = load_records(inputs)

    if not records and args.strict:
        raise SystemExit("no records found")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    sqlite_enabled = bool(args.sqlite) or not bool(args.no_sqlite)

    mariadb_manifest = export_mariadb_shards(
        records=records,
        output_dir=output_dir,
        database=args.database,
        max_bytes=args.max_bytes,
        compact=args.compact,
    )

    sqlite_manifest = export_sqlite(records, output_dir, compact=args.compact) if sqlite_enabled else None
    json_manifest = export_json_artifacts(records, output_dir, compact=args.compact)
    csv_manifest = export_csv_artifacts(records, output_dir)
    xml_manifest = export_xml_artifacts(records, output_dir)
    redis_manifest = export_redis_artifacts(records, output_dir)
    geo_manifest = export_geo_indexes(records, output_dir, compact=args.compact)
    map_manifest = export_map_artifacts(records, output_dir, compact=args.compact)

    manifest = write_latest_and_index(
        output_dir,
        records=records,
        database=args.database,
        max_bytes=args.max_bytes,
        compact=args.compact,
        mariadb=mariadb_manifest,
        sqlite=sqlite_manifest,
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
        f"output={output_dir}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
