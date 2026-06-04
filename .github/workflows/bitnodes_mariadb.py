#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_INPUTS = [
    APP_ROOT / "bitcoin" / "bitnodes" / "api" / "aggregate" / "zzxbitnodes" / "latest.json",
    APP_ROOT / "bitcoin" / "bitnodes" / "api" / "aggregate" / "originalbitnodes" / "latest.json",
]

DEFAULT_OUT_DIR = APP_ROOT / "tools" / "bitnodes" / "api"
DEFAULT_SQL = DEFAULT_OUT_DIR / "bitnodes_mariadb.sql"
DEFAULT_SQL_GZ = DEFAULT_OUT_DIR / "bitnodes_mariadb.sql.gz"
DEFAULT_SQLITE = DEFAULT_OUT_DIR / "bitnodes.sqlite3"

SCHEMA_VERSION = "zzx-bitnodes-mariadb-v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    return str(value or "").strip()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sql_string(value: Any) -> str:
    if value is None:
        return "NULL"

    text = str(value)
    text = text.replace("\\", "\\\\")
    text = text.replace("'", "''")
    text = text.replace("\x00", "")

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
        return repr(float(value))
    except Exception:
        return "NULL"


def read_json(path: Path) -> Any:
    if not path.exists():
        return {}

    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def gzip_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)

    with src.open("rb") as source, gzip.open(dst, "wb", compresslevel=9) as target:
        target.write(source.read())


def deep_get(row: dict[str, Any], key: str) -> Any:
    current: Any = row

    for part in key.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)

    return current


def first(row: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = deep_get(row, key)

        if value not in ("", None):
            return value

    return None


def normalize_node_record(source: str, address: str, value: Any) -> dict[str, Any]:
    row: dict[str, Any]

    if isinstance(value, dict):
        row = dict(value)
    elif isinstance(value, list):
        row = {
            "raw_array": value,
            "address": address,
        }

        array_map = {
            "agent": 0,
            "protocol": 1,
            "services": 2,
            "height": 3,
            "host": 4,
            "port": 5,
            "city": 6,
            "country": 7,
            "latitude": 8,
            "longitude": 9,
            "timezone": 10,
            "asn": 11,
            "organization": 12,
            "provider": 13,
            "county": 14,
            "zip": 15,
            "w3w": 16,
            "geohash": 17,
            "asn_location": 18,
            "metadata": 19,
        }

        for key, index in array_map.items():
            if len(value) > index:
                row[key] = value[index]
    else:
        row = {"address": address, "value": value}

    address = clean(row.get("address") or row.get("node") or row.get("addr") or row.get("host") or address)
    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}

    if not isinstance(metadata, dict):
        metadata = {}

    node_id = clean(row.get("node_id") or row.get("id"))

    if not node_id:
        node_id = "node:" + sha256_text(f"{source}:{address}")[:24]

    network = clean(first(row, ("network", "metadata.network")))

    if not network:
        lower = address.lower()
        if ".onion" in lower:
            network = "tor"
        elif ".i2p" in lower:
            network = "i2p"
        elif ":" in lower:
            network = "ipv6"
        elif lower.count(".") >= 3:
            network = "ipv4"
        else:
            network = "unknown"

    return {
        "node_id": node_id,
        "source": source,
        "address": address,
        "host": clean(row.get("host") or address),
        "port": first(row, ("port", "metadata.port")),
        "network": network,
        "agent": first(row, ("agent", "user_agent", "metadata.agent")),
        "protocol": first(row, ("protocol", "metadata.protocol")),
        "services": first(row, ("services", "metadata.services")),
        "height": first(row, ("height", "metadata.height")),
        "city": first(row, ("city", "city_name", "geoip.city", "metadata.city")),
        "country": first(row, ("country", "country_code", "geoip.country_code", "metadata.country")),
        "territory": first(row, ("territory", "state", "region", "admin1", "metadata.territory")),
        "county": first(row, ("county", "district", "admin2", "metadata.county")),
        "zip_code": first(row, ("zip", "zip_code", "postal_code", "metadata.zip")),
        "timezone": first(row, ("timezone", "tz", "metadata.timezone")),
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
        "raw_json": json.dumps(row, ensure_ascii=False, separators=(",", ":")),
        "raw_hash": sha256_text(json.dumps(row, ensure_ascii=False, sort_keys=True, default=str)),
    }


def iter_nodes(payload: Any, source: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    if isinstance(payload, dict):
        nodes = payload.get("nodes")

        if isinstance(nodes, dict):
            for address, value in nodes.items():
                records.append(normalize_node_record(source, str(address), value))
            return records

        if isinstance(nodes, list):
            for index, value in enumerate(nodes):
                address = ""

                if isinstance(value, dict):
                    address = clean(value.get("address") or value.get("node") or value.get("addr") or value.get("host"))

                records.append(normalize_node_record(source, address or str(index), value))
            return records

        for key in ("data", "results", "rows", "peers", "reachable_nodes"):
            value = payload.get(key)

            if isinstance(value, dict):
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


def schema_sql() -> str:
    return """
CREATE TABLE IF NOT EXISTS bitnodes_metadata (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schema_version VARCHAR(128) NOT NULL,
  generated_at_utc VARCHAR(64) NOT NULL,
  source_file TEXT NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  node_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_source_name (source_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
""".strip()


def bool_to_sql(value: Any) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"

    text = str(value or "").strip().lower()

    if text in {"1", "true", "yes", "y", "reachable", "ok"}:
        return "1"

    if text in {"0", "false", "no", "n", "unreachable"}:
        return "0"

    return "NULL"


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
        "geohash",
        "reachable",
        "reachable_now",
        "reachable_24h",
        "latency_ms",
        "last_seen",
        "raw_hash",
        "raw_json",
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
        bool_to_sql(row["reachable"]),
        bool_to_sql(row["reachable_now"]),
        bool_to_sql(row["reachable_24h"]),
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


def build_mariadb_dump(inputs: list[Path], output_sql: Path, output_gz: Path | None) -> dict[str, Any]:
    output_sql.parent.mkdir(parents=True, exist_ok=True)

    total = 0
    source_counts: dict[str, int] = {}

    with output_sql.open("w", encoding="utf-8") as handle:
        handle.write("-- ZZX-Labs Bitnodes MariaDB dump\n")
        handle.write(f"-- Generated: {utc_now()}\n")
        handle.write(f"-- Schema: {SCHEMA_VERSION}\n\n")
        handle.write("SET NAMES utf8mb4;\n")
        handle.write("SET FOREIGN_KEY_CHECKS=0;\n")
        handle.write(schema_sql())
        handle.write("\n\n")

        for input_path in inputs:
            if not input_path.exists():
                continue

            payload = read_json(input_path)
            source = infer_source(input_path, payload)
            rows = iter_nodes(payload, source)
            source_counts[source] = source_counts.get(source, 0) + len(rows)
            total += len(rows)

            handle.write(
                "INSERT INTO bitnodes_metadata "
                "(schema_version, generated_at_utc, source_file, source_name, node_count) VALUES "
                f"({sql_string(SCHEMA_VERSION)}, {sql_string(utc_now())}, {sql_string(str(input_path))}, "
                f"{sql_string(source)}, {len(rows)});\n"
            )

            for row in rows:
                handle.write(insert_node_sql(row))
                handle.write("\n")

        handle.write("\nSET FOREIGN_KEY_CHECKS=1;\n")

    if output_gz:
        gzip_file(output_sql, output_gz)

    manifest = {
        "schema": SCHEMA_VERSION,
        "generated_at": utc_now(),
        "output_sql": str(output_sql),
        "output_sql_gz": str(output_gz) if output_gz else "",
        "node_count": total,
        "source_counts": source_counts,
        "inputs": [str(path) for path in inputs],
    }

    write_text(
        output_sql.parent / "bitnodes_mariadb_manifest.json",
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    )

    return manifest


def sqlite_type_schema() -> str:
    return """
CREATE TABLE IF NOT EXISTS bitnodes_nodes (
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

CREATE INDEX IF NOT EXISTS idx_bitnodes_address ON bitnodes_nodes(address);
CREATE INDEX IF NOT EXISTS idx_bitnodes_source ON bitnodes_nodes(source_name);
CREATE INDEX IF NOT EXISTS idx_bitnodes_network ON bitnodes_nodes(network);
CREATE INDEX IF NOT EXISTS idx_bitnodes_country ON bitnodes_nodes(country);
CREATE INDEX IF NOT EXISTS idx_bitnodes_city ON bitnodes_nodes(city);
CREATE INDEX IF NOT EXISTS idx_bitnodes_asn ON bitnodes_nodes(asn);
CREATE INDEX IF NOT EXISTS idx_bitnodes_geohash ON bitnodes_nodes(geohash);
""".strip()


def to_int_or_none(value: Any) -> int | None:
    try:
        if value in ("", None):
            return None
        return int(float(value))
    except Exception:
        return None


def to_float_or_none(value: Any) -> float | None:
    try:
        if value in ("", None):
            return None
        return float(value)
    except Exception:
        return None


def bool_or_none(value: Any) -> int | None:
    if isinstance(value, bool):
        return 1 if value else 0

    text = str(value or "").strip().lower()

    if text in {"1", "true", "yes", "y", "reachable", "ok"}:
        return 1

    if text in {"0", "false", "no", "n", "unreachable"}:
        return 0

    return None


def build_sqlite(inputs: list[Path], output: Path) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)

    if output.exists():
        output.unlink()

    conn = sqlite3.connect(str(output))
    conn.executescript(sqlite_type_schema())

    total = 0
    source_counts: dict[str, int] = {}

    sql = """
INSERT OR REPLACE INTO bitnodes_nodes (
  node_id, source_name, address, host, port, network, agent, protocol, services, height,
  city, country, territory, county, zip_code, timezone, latitude, longitude, asn,
  organization, provider, w3w, zzxgcs, geohash, reachable, reachable_now, reachable_24h,
  latency_ms, last_seen, raw_hash, raw_json, updated_at_utc
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

    for input_path in inputs:
        if not input_path.exists():
            continue

        payload = read_json(input_path)
        source = infer_source(input_path, payload)
        rows = iter_nodes(payload, source)

        source_counts[source] = source_counts.get(source, 0) + len(rows)
        total += len(rows)

        for row in rows:
            conn.execute(sql, (
                row["node_id"],
                row["source"],
                row["address"],
                row["host"],
                to_int_or_none(row["port"]),
                row["network"],
                row["agent"],
                to_int_or_none(row["protocol"]),
                to_int_or_none(row["services"]),
                to_int_or_none(row["height"]),
                row["city"],
                row["country"],
                row["territory"],
                row["county"],
                row["zip_code"],
                row["timezone"],
                to_float_or_none(row["latitude"]),
                to_float_or_none(row["longitude"]),
                row["asn"],
                row["organization"],
                row["provider"],
                row["w3w"],
                row["zzxgcs"],
                row["geohash"],
                bool_or_none(row["reachable"]),
                bool_or_none(row["reachable_now"]),
                bool_or_none(row["reachable_24h"]),
                to_float_or_none(row["latency_ms"]),
                row["last_seen"],
                row["raw_hash"],
                row["raw_json"],
                utc_now(),
            ))

    conn.commit()
    conn.close()

    manifest = {
        "schema": "zzx-bitnodes-sqlite-v1",
        "generated_at": utc_now(),
        "output": str(output),
        "node_count": total,
        "source_counts": source_counts,
        "inputs": [str(path) for path in inputs],
    }

    write_text(
        output.parent / "bitnodes_sqlite_manifest.json",
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    )

    return manifest


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

    seen = set()
    unique = []

    for path in inputs:
        resolved = str(path)

        if resolved in seen:
            continue

        seen.add(resolved)
        unique.append(path)

    return unique


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert Bitnodes JSON outputs into a compact MariaDB SQL dump and optional SQLite database."
    )

    parser.add_argument("--input", action="append", default=[])
    parser.add_argument("--output-sql", default=str(DEFAULT_SQL))
    parser.add_argument("--output-gz", default=str(DEFAULT_SQL_GZ))
    parser.add_argument("--sqlite", default="")
    parser.add_argument("--no-gzip", action="store_true")
    parser.add_argument("--only-sqlite", action="store_true")
    parser.add_argument("--strict", action="store_true")

    args = parser.parse_args()

    inputs = parse_inputs(args.input)

    if not inputs:
        message = "No Bitnodes JSON inputs found."

        if args.strict:
            raise SystemExit(message)

        print(message)
        return 0

    print(f"inputs: {len(inputs)}")

    manifests = {}

    if args.only_sqlite:
        sqlite_output = Path(args.sqlite or DEFAULT_SQLITE)
        manifests["sqlite"] = build_sqlite(inputs, sqlite_output)
    else:
        sql_output = Path(args.output_sql)
        gz_output = None if args.no_gzip else Path(args.output_gz)
        manifests["mariadb"] = build_mariadb_dump(inputs, sql_output, gz_output)

        if args.sqlite:
            manifests["sqlite"] = build_sqlite(inputs, Path(args.sqlite))

    print(json.dumps(manifests, ensure_ascii=False, indent=2, sort_keys=True))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
