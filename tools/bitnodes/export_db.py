#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import os
import re
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_DATA_DIR = DEFAULT_API_DIR / "data"

DEFAULT_INPUTS = [
    DEFAULT_API_DIR / "enriched" / "zzxbitnodes" / "latest.json",
    DEFAULT_API_DIR / "enriched" / "originalbitnodes" / "latest.json",
    DEFAULT_API_DIR / "zzxbitnodes" / "latest.json",
    DEFAULT_API_DIR / "originalbitnodes" / "latest.json",
]

SCHEMA = "zzx-bitnodes-export-db-v1"
DEFAULT_MAX_BYTES = 24_000_000
SAFE_DB_RE = re.compile(r"^[a-zA-Z0-9_]+$")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def unix_now() -> int:
    return int(time.time())


def clean(value: Any) -> str:
    return str(value or "").strip()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def read_json(path: Path) -> Any:
    if not path.exists():
        return {}

    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)

    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
        ) + "\n",
        encoding="utf-8",
    )


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
            return source

    text = str(path).lower()

    if "originalbitnodes" in text:
        return "originalbitnodes"

    if "zzxbitnodes" in text:
        return "zzxbitnodes"

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

    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}

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

    return {
        "node_id": node_id,
        "source": source,
        "address": address,
        "host": host,
        "port": first(row, ("port", "metadata.port")),
        "network": network,
        "agent": first(row, ("agent", "user_agent", "metadata.agent")),
        "protocol": first(row, ("protocol", "protocol_version", "metadata.protocol")),
        "services": first(row, ("services", "metadata.services")),
        "height": first(row, ("height", "metadata.height")),
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
        "geohash": first(row, ("geohash", "metadata.geohash")),
        "reachable": first(row, ("reachable", "metadata.reachable")),
        "reachable_now": first(row, ("reachable_now", "metadata.reachable_now")),
        "reachable_24h": first(row, ("reachable_24h", "metadata.reachable_24h")),
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
            records.append(normalize_record(source, address, value))

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
  address VARCHAR(512) NOT NULL,
  host VARCHAR(512) NULL,
  port INT NULL,
  network VARCHAR(32) NULL,
  agent TEXT NULL,
  protocol BIGINT NULL,
  services BIGINT NULL,
  height BIGINT NULL,
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
  geohash VARCHAR(64) NULL,
  reachable TINYINT NULL,
  reachable_now TINYINT NULL,
  reachable_24h TINYINT NULL,
  latency_ms DOUBLE NULL,
  last_seen VARCHAR(64) NULL,
  raw_hash CHAR(64) NOT NULL,
  raw_json LONGTEXT NOT NULL,
  updated_at_utc VARCHAR(64) NOT NULL,
  PRIMARY KEY (node_id, source_name),
  KEY idx_address (address),
  KEY idx_source_name (source_name),
  KEY idx_network (network),
  KEY idx_country (country),
  KEY idx_city (city),
  KEY idx_asn (asn),
  KEY idx_geohash (geohash),
  KEY idx_reachable_now (reachable_now),
  KEY idx_reachable_24h (reachable_24h),
  KEY idx_lat_lon (latitude, longitude)
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
        "node_id", "source_name", "address", "host", "port", "network", "agent",
        "protocol", "services", "height", "city", "country", "territory", "county",
        "zip_code", "timezone", "latitude", "longitude", "asn", "organization",
        "provider", "w3w", "zzxgcs", "geohash", "reachable", "reachable_now",
        "reachable_24h", "latency_ms", "last_seen", "raw_hash", "raw_json",
        "updated_at_utc",
    ]

    values = [
        sql_string(row["node_id"]),
        sql_string(row["source"]),
        sql_string(row["address"]),
        sql_string(row["host"]),
        sql_int(row["port"]),
        sql_string(row["network"]),
        sql_string(row["agent"]),
        sql_int(row["protocol"]),
        sql_int(row["services"]),
        sql_int(row["height"]),
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
        sql_string(row["geohash"]),
        sql_bool(row["reachable"]),
        sql_bool(row["reachable_now"]),
        sql_bool(row["reachable_24h"]),
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

        shards.append({
            "file": name,
            "path": path.relative_to(output_dir).as_posix(),
            "size_bytes": size,
            "node_count": current_count,
            "sha256": sha256_text(path.read_bytes().hex()),
        })

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

    control_text = "\n".join([
        "-- ZZX-Labs Bitnodes MariaDB control file",
        f"-- generated_at_utc: {utc_now()}",
        "SET NAMES utf8mb4;",
        "SET FOREIGN_KEY_CHECKS=0;",
        schema_sql(database),
        insert_export_sql(export_id, len({r['source'] for r in records}), len(records), len(shards)),
        "SET FOREIGN_KEY_CHECKS=1;",
        "",
    ])

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
        "source_counts": dict(sorted({source: sum(1 for r in records if r["source"] == source) for source in {r["source"] for r in records}}.items())),
        "control": {
            "file": control_file.name,
            "path": control_file.relative_to(output_dir).as_posix(),
            "size_bytes": control_size,
        },
        "shard_count": len(shards),
        "shards": shards,
        "import_order": [f"mariadb/{control_file.name}", *[f"mariadb/{item['file']}" for item in shards]],
        "security_note": (
            "These are data-only SQL dumps. No credentials, grants, users, passwords, private keys, "
            "or server secrets are included."
        ),
    }

    write_json(output_dir / "mariadb_manifest.json", manifest, compact=compact)
    write_json(output_dir / "index.json", manifest, compact=compact)

    latest = {
        "schema": "zzx-bitnodes-api-data-latest-v1",
        "generated_at": utc_now(),
        "active_database": database,
        "mariadb_manifest": "mariadb_manifest.json",
        "node_count": len(records),
        "shard_count": len(shards),
        "max_bytes": max_bytes,
    }

    write_json(output_dir / "latest.json", latest, compact=compact)

    return manifest


def sqlite_value_int(value: Any) -> int | None:
    try:
        if value in ("", None):
            return None
        return int(float(value))
    except Exception:
        return None


def sqlite_value_float(value: Any) -> float | None:
    try:
        if value in ("", None):
            return None
        n = float(value)
        return n if math.isfinite(n) else None
    except Exception:
        return None


def sqlite_value_bool(value: Any) -> int | None:
    sql = sql_bool(value)
    if sql == "1":
        return 1
    if sql == "0":
        return 0
    return None


def export_sqlite(records: list[dict[str, Any]], output_dir: Path) -> dict[str, Any]:
    sqlite_dir = output_dir / "sqlite"
    sqlite_dir.mkdir(parents=True, exist_ok=True)

    db_path = sqlite_dir / "bitnodes.sqlite3"

    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(str(db_path))
    conn.executescript("""
CREATE TABLE bitnodes_nodes (
  node_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  address TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  network TEXT,
  agent TEXT,
  protocol INTEGER,
  services INTEGER,
  height INTEGER,
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
  geohash TEXT,
  reachable INTEGER,
  reachable_now INTEGER,
  reachable_24h INTEGER,
  latency_ms REAL,
  last_seen TEXT,
  raw_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  PRIMARY KEY (node_id, source_name)
);
CREATE INDEX idx_nodes_address ON bitnodes_nodes(address);
CREATE INDEX idx_nodes_source ON bitnodes_nodes(source_name);
CREATE INDEX idx_nodes_network ON bitnodes_nodes(network);
CREATE INDEX idx_nodes_country ON bitnodes_nodes(country);
CREATE INDEX idx_nodes_city ON bitnodes_nodes(city);
CREATE INDEX idx_nodes_asn ON bitnodes_nodes(asn);
CREATE INDEX idx_nodes_lat_lon ON bitnodes_nodes(latitude, longitude);
""")

    stmt = """
INSERT OR REPLACE INTO bitnodes_nodes (
  node_id, source_name, address, host, port, network, agent, protocol, services, height,
  city, country, territory, county, zip_code, timezone, latitude, longitude, asn,
  organization, provider, w3w, zzxgcs, geohash, reachable, reachable_now, reachable_24h,
  latency_ms, last_seen, raw_hash, raw_json, updated_at_utc
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

    for row in records:
        conn.execute(stmt, (
            row["node_id"],
            row["source"],
            row["address"],
            row["host"],
            sqlite_value_int(row["port"]),
            row["network"],
            row["agent"],
            sqlite_value_int(row["protocol"]),
            sqlite_value_int(row["services"]),
            sqlite_value_int(row["height"]),
            row["city"],
            row["country"],
            row["territory"],
            row["county"],
            row["zip_code"],
            row["timezone"],
            sqlite_value_float(row["latitude"]),
            sqlite_value_float(row["longitude"]),
            row["asn"],
            row["organization"],
            row["provider"],
            row["w3w"],
            row["zzxgcs"],
            row["geohash"],
            sqlite_value_bool(row["reachable"]),
            sqlite_value_bool(row["reachable_now"]),
            sqlite_value_bool(row["reachable_24h"]),
            sqlite_value_float(row["latency_ms"]),
            row["last_seen"],
            row["raw_hash"],
            row["raw_json"],
            utc_now(),
        ))

    conn.commit()
    conn.close()

    gz_path = sqlite_dir / "bitnodes.sqlite3.gz"

    with db_path.open("rb") as src, gzip.open(gz_path, "wb", compresslevel=9) as dst:
        dst.write(src.read())

    manifest = {
        "schema": "zzx-bitnodes-sqlite-export-v1",
        "generated_at": utc_now(),
        "node_count": len(records),
        "sqlite": "sqlite/bitnodes.sqlite3",
        "sqlite_gz": "sqlite/bitnodes.sqlite3.gz",
        "sqlite_size_bytes": db_path.stat().st_size,
        "sqlite_gz_size_bytes": gz_path.stat().st_size,
    }

    write_json(output_dir / "sqlite_manifest.json", manifest)

    return manifest


def parse_inputs(values: list[str]) -> list[Path]:
    if not values:
        return [path for path in DEFAULT_INPUTS if path.exists()]

    output = []

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
        description="Export Bitnodes node datasets into 24MB-safe MariaDB gzip shards under bitcoin/bitnodes/api/data/."
    )

    parser.add_argument("--input", action="append", default=[])
    parser.add_argument("--output-dir", default=str(DEFAULT_DATA_DIR))
    parser.add_argument("--database", default="zzx_bitnodes")
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--sqlite", action="store_true")
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

    manifest = export_mariadb_shards(
        records=records,
        output_dir=output_dir,
        database=args.database,
        max_bytes=args.max_bytes,
        compact=args.compact,
    )

    if args.sqlite:
        manifest["sqlite"] = export_sqlite(records, output_dir)
        write_json(output_dir / "index.json", manifest, compact=args.compact)

    print(
        "export_db complete: "
        f"{manifest['node_count']} nodes, "
        f"{manifest['shard_count']} mariadb shards, "
        f"output={output_dir}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
