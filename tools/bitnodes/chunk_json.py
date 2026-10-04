#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


DEFAULT_MAX_BYTES = 24_000_000
DEFAULT_MAX_VOLUMES = 10_000

SCHEMA = "zzx-bitnodes-json-to-mariadb-gz-wrapper-v4"
NODE_TABLE = "bitnodes_json_nodes"
CONTROL_TABLE = "bitnodes_json_control"
SHARD_TABLE = "bitnodes_json_shards"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def utc_mysql() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0).isoformat(sep=" ")


def read_json(path: Path) -> Any:
    if path.name.endswith(".gz"):
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def compact_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=False, default=str)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


def sql_quote(value: Any) -> str:
    if value is None:
        return "NULL"

    if isinstance(value, bool):
        return "1" if value else "0"

    if isinstance(value, (int, float)):
        return str(value)

    text = str(value)
    text = text.replace("\\", "\\\\")
    text = text.replace("'", "''")
    return f"'{text}'"


def safe_int(value: Any, fallback: int = 0) -> int:
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


def normalize_address(value: Any) -> str:
    return str(value or "").strip()


def split_host_port(address: str) -> tuple[str, int | None]:
    value = normalize_address(address)

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


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    return str(value or "").strip().lower() in {
        "true",
        "yes",
        "y",
        "ok",
        "1",
        "on",
        "reachable",
        "online",
    }


def json_size(payload: Any) -> int:
    return len(compact_json(payload).encode("utf-8"))


def extract_items(payload: Any, key: str) -> tuple[str, list[tuple[str | None, Any]], dict[str, Any]]:
    if isinstance(payload, dict) and isinstance(payload.get(key), dict):
        meta = {k: v for k, v in payload.items() if k != key}
        return "dict", list(payload[key].items()), meta

    if isinstance(payload, dict) and isinstance(payload.get(key), list):
        meta = {k: v for k, v in payload.items() if k != key}
        return "list", [(None, item) for item in payload[key]], meta

    if isinstance(payload, list):
        return "list", [(None, item) for item in payload], {}

    if isinstance(payload, dict):
        return "dict", list(payload.items()), {}

    raise SystemExit("input JSON must be object, object-with-nodes, object-with-results/data, or array")


def normalize_item(address: str | None, item: Any, index: int) -> dict[str, Any]:
    if isinstance(item, Mapping):
        row = dict(item)
        row_address = normalize_address(
            row.get("address")
            or row.get("canonical_address")
            or row.get("node")
            or row.get("addr")
            or row.get("host")
            or address
            or f"row-{index:08d}"
        )
        row["address"] = row_address
        return row

    if isinstance(item, list):
        row_address = normalize_address(address or f"row-{index:08d}")
        padded = list(item) + [None] * max(0, 24 - len(item))
        host, port = split_host_port(row_address)

        return {
            "address": row_address,
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
            "reachable": True,
            "raw": item,
        }

    return {
        "address": normalize_address(address or f"row-{index:08d}"),
        "raw": item,
    }


def create_sql_header() -> str:
    return f"""-- {SCHEMA}
-- generated_at: {utc_now()}
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS {NODE_TABLE} (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  indexed_at DATETIME NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  kind_name VARCHAR(128) NOT NULL,
  item_key VARCHAR(128) NOT NULL,
  address VARCHAR(512) NOT NULL,
  host VARCHAR(512) NOT NULL DEFAULT '',
  port INT UNSIGNED NULL,
  network VARCHAR(64) NOT NULL DEFAULT '',
  reachable TINYINT(1) NOT NULL DEFAULT 0,
  protocol VARCHAR(64) NOT NULL DEFAULT '',
  agent TEXT NULL,
  height BIGINT NULL,
  services TEXT NULL,
  country_code VARCHAR(16) NOT NULL DEFAULT '',
  country_name VARCHAR(128) NOT NULL DEFAULT '',
  continent VARCHAR(128) NOT NULL DEFAULT '',
  region_name VARCHAR(128) NOT NULL DEFAULT '',
  territory_name VARCHAR(128) NOT NULL DEFAULT '',
  county_name VARCHAR(128) NOT NULL DEFAULT '',
  city_name VARCHAR(128) NOT NULL DEFAULT '',
  postal_code VARCHAR(64) NOT NULL DEFAULT '',
  timezone_name VARCHAR(128) NOT NULL DEFAULT '',
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  asn VARCHAR(32) NOT NULL DEFAULT '',
  organization TEXT NULL,
  provider TEXT NULL,
  is_tor TINYINT(1) NOT NULL DEFAULT 0,
  is_i2p TINYINT(1) NOT NULL DEFAULT 0,
  is_vpn TINYINT(1) NOT NULL DEFAULT 0,
  is_proxy TINYINT(1) NOT NULL DEFAULT 0,
  is_sanctioned_node TINYINT(1) NOT NULL DEFAULT 0,
  is_policy_restricted_node TINYINT(1) NOT NULL DEFAULT 0,
  payload_json LONGTEXT NOT NULL,
  UNIQUE KEY uniq_zzx_json_node_address_source_kind (source_name, kind_name, address),
  KEY idx_zzx_json_node_geo (latitude, longitude),
  KEY idx_zzx_json_node_country (country_code),
  KEY idx_zzx_json_node_network (network),
  KEY idx_zzx_json_node_flags (is_tor, is_i2p, is_vpn, is_proxy, is_sanctioned_node)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {SHARD_TABLE} (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  generated_at DATETIME NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  kind_name VARCHAR(128) NOT NULL,
  shard_index INT UNSIGNED NOT NULL,
  shard_name VARCHAR(255) NOT NULL,
  shard_path TEXT NOT NULL,
  item_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sha256 CHAR(64) NOT NULL,
  UNIQUE KEY uniq_zzx_json_shard_sha256 (sha256),
  KEY idx_zzx_json_shard_source_kind (source_name, kind_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {CONTROL_TABLE} (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  generated_at DATETIME NOT NULL,
  schema_name VARCHAR(128) NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  kind_name VARCHAR(128) NOT NULL,
  item_key VARCHAR(128) NOT NULL,
  item_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  shard_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  max_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  input_path TEXT NOT NULL,
  metadata_json LONGTEXT NULL,
  manifest_json LONGTEXT NOT NULL,
  UNIQUE KEY uniq_zzx_json_control_source_kind (source_name, kind_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

"""


def node_insert_sql(row: Mapping[str, Any], *, source: str, kind: str, item_key: str, indexed_at: str) -> str:
    address = normalize_address(
        first(row, "address", "canonical_address", "node", "addr", "host")
    )

    host, port = split_host_port(address)

    host = normalize_address(first(row, "host", "hostname") or host)
    port = safe_int(first(row, "port"), port or 8333)

    values = [
        indexed_at,
        source,
        kind,
        item_key,
        address,
        host,
        port,
        first(row, "network", "metadata.network") or "",
        boolish(first(row, "reachable", "reachable_now")),
        first(row, "protocol", "version") or "",
        first(row, "agent", "user_agent", "subver") or "",
        safe_int(first(row, "height", "block_height")),
        first(row, "services") or "",
        first(row, "country_code", "country") or "",
        first(row, "country_name") or "",
        first(row, "continent") or "",
        first(row, "region", "region_name") or "",
        first(row, "territory", "state", "province") or "",
        first(row, "county") or "",
        first(row, "city") or "",
        first(row, "zip", "postal_code", "postcode") or "",
        first(row, "timezone", "iana_timezone") or "",
        safe_float(first(row, "latitude", "lat")),
        safe_float(first(row, "longitude", "lon", "lng")),
        first(row, "asn") or "",
        first(row, "organization", "org") or "",
        first(row, "provider") or "",
        boolish(first(row, "is_tor", "tor.is_tor")),
        boolish(first(row, "is_i2p", "i2p.is_i2p")),
        boolish(first(row, "is_vpn", "vpn.is_vpn")),
        boolish(first(row, "is_proxy", "proxy.is_proxy")),
        boolish(first(row, "is_sanctioned_node")),
        boolish(first(row, "is_policy_restricted_node")),
        compact_json(row),
    ]

    return (
        f"INSERT INTO {NODE_TABLE} "
        "(indexed_at, source_name, kind_name, item_key, address, host, port, network, reachable, protocol, "
        "agent, height, services, country_code, country_name, continent, region_name, territory_name, "
        "county_name, city_name, postal_code, timezone_name, latitude, longitude, asn, organization, provider, "
        "is_tor, is_i2p, is_vpn, is_proxy, is_sanctioned_node, is_policy_restricted_node, payload_json) "
        f"VALUES ({','.join(sql_quote(value) for value in values)}) "
        "ON DUPLICATE KEY UPDATE "
        "indexed_at=VALUES(indexed_at), item_key=VALUES(item_key), host=VALUES(host), port=VALUES(port), "
        "network=VALUES(network), reachable=VALUES(reachable), protocol=VALUES(protocol), agent=VALUES(agent), "
        "height=VALUES(height), services=VALUES(services), country_code=VALUES(country_code), "
        "country_name=VALUES(country_name), continent=VALUES(continent), region_name=VALUES(region_name), "
        "territory_name=VALUES(territory_name), county_name=VALUES(county_name), city_name=VALUES(city_name), "
        "postal_code=VALUES(postal_code), timezone_name=VALUES(timezone_name), latitude=VALUES(latitude), "
        "longitude=VALUES(longitude), asn=VALUES(asn), organization=VALUES(organization), provider=VALUES(provider), "
        "is_tor=VALUES(is_tor), is_i2p=VALUES(is_i2p), is_vpn=VALUES(is_vpn), is_proxy=VALUES(is_proxy), "
        "is_sanctioned_node=VALUES(is_sanctioned_node), "
        "is_policy_restricted_node=VALUES(is_policy_restricted_node), payload_json=VALUES(payload_json);\n"
    )


def shard_control_sql(
    *,
    generated_at: str,
    source: str,
    kind: str,
    shard_index: int,
    shard_name: str,
    shard_path: Path,
    item_count: int,
) -> str:
    values = [
        generated_at,
        source,
        kind,
        shard_index,
        shard_name,
        str(shard_path),
        item_count,
        shard_path.stat().st_size if shard_path.exists() else 0,
        sha256_file(shard_path) if shard_path.exists() else "",
    ]

    return (
        f"INSERT INTO {SHARD_TABLE} "
        "(generated_at, source_name, kind_name, shard_index, shard_name, shard_path, item_count, size_bytes, sha256) "
        f"VALUES ({','.join(sql_quote(value) for value in values)}) "
        "ON DUPLICATE KEY UPDATE generated_at=VALUES(generated_at), source_name=VALUES(source_name), "
        "kind_name=VALUES(kind_name), shard_index=VALUES(shard_index), shard_name=VALUES(shard_name), "
        "shard_path=VALUES(shard_path), item_count=VALUES(item_count), size_bytes=VALUES(size_bytes);\n"
    )


def control_sql(
    *,
    generated_at: str,
    source: str,
    kind: str,
    item_key: str,
    item_count: int,
    shard_count: int,
    max_bytes: int,
    input_path: Path,
    metadata: dict[str, Any],
    manifest: dict[str, Any],
) -> str:
    values = [
        generated_at,
        SCHEMA,
        source,
        kind,
        item_key,
        item_count,
        shard_count,
        max_bytes,
        str(input_path),
        compact_json(metadata),
        compact_json(manifest),
    ]

    return (
        f"INSERT INTO {CONTROL_TABLE} "
        "(generated_at, schema_name, source_name, kind_name, item_key, item_count, shard_count, "
        "max_bytes, input_path, metadata_json, manifest_json) "
        f"VALUES ({','.join(sql_quote(value) for value in values)}) "
        "ON DUPLICATE KEY UPDATE generated_at=VALUES(generated_at), item_count=VALUES(item_count), "
        "shard_count=VALUES(shard_count), max_bytes=VALUES(max_bytes), input_path=VALUES(input_path), "
        "metadata_json=VALUES(metadata_json), manifest_json=VALUES(manifest_json);\n"
    )


def split_sql_rows(
    rows: list[dict[str, Any]],
    *,
    source: str,
    kind: str,
    item_key: str,
    max_bytes: int,
    header: str,
    indexed_at: str,
) -> list[list[str]]:
    chunks: list[list[str]] = []
    current: list[str] = []

    for row in rows:
        line = node_insert_sql(
            row,
            source=source,
            kind=kind,
            item_key=item_key,
            indexed_at=indexed_at,
        )

        current_size = len(header.encode("utf-8")) + sum(len(item.encode("utf-8")) for item in current)

        if current and current_size + len(line.encode("utf-8")) > max_bytes:
            chunks.append(current)
            current = []

        current.append(line)

    if current:
        chunks.append(current)

    return chunks


def clean_output_dir(path: Path) -> None:
    mkdir(path)

    for pattern in ("*.sql.gz", "*.mariadb.gz", "volumes", "latest.json", "manifest.json"):
        for item in path.glob(pattern):
            try:
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()
            except Exception:
                pass


def write_gzip_sql(path: Path, text: str) -> int:
    mkdir(path.parent)

    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as handle:
        handle.write(text)

    return path.stat().st_size


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert Bitnodes JSON into compact MariaDB .sql.gz shards instead of JSON volume files.",
        allow_abbrev=False,
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--latest", default="")
    parser.add_argument("--volumes-dir", default="")
    parser.add_argument("--item-key", default="nodes")
    parser.add_argument("--source", default="zzxbitnodes")
    parser.add_argument("--kind", default="runtime")
    parser.add_argument("--schema", default=SCHEMA)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--max-volumes", type=int, default=DEFAULT_MAX_VOLUMES)
    parser.add_argument("--gzip", action="store_true")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--force-wrapper", action="store_true")
    parser.add_argument("--report", default="")
    parser.add_argument("--no-clean", action="store_true")

    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve() if args.output_dir else input_path.parent.resolve()
    latest_path = Path(args.latest).resolve() if args.latest else output_dir / "latest.sql.gz"
    volumes_dir = Path(args.volumes_dir).resolve() if args.volumes_dir else output_dir / "mariadb-gz"

    payload = read_json(input_path)
    _container_type, items, metadata = extract_items(payload, args.item_key)

    rows = [
        normalize_item(address, item, index)
        for index, (address, item) in enumerate(items)
    ]

    if not args.no_clean:
        clean_output_dir(volumes_dir)

    mkdir(output_dir)
    mkdir(volumes_dir)

    generated_at = utc_mysql()
    header = create_sql_header()

    chunks = split_sql_rows(
        rows,
        source=args.source,
        kind=args.kind,
        item_key=args.item_key,
        max_bytes=args.max_bytes,
        header=header,
        indexed_at=generated_at,
    )

    if len(chunks) > args.max_volumes:
        raise SystemExit(f"volume count exceeds max: {len(chunks)} > {args.max_volumes}")

    manifest = {
        "schema": args.schema,
        "generated_at": utc_now(),
        "source": args.source,
        "kind": args.kind,
        "input": str(input_path),
        "item_key": args.item_key,
        "item_count": len(rows),
        "shard_count": len(chunks),
        "max_bytes": args.max_bytes,
        "storage": "mariadb-sql-gzip-shards",
        "shards": [],
        "metadata": metadata,
    }

    shard_control_lines: list[str] = []

    with tempfile.TemporaryDirectory(prefix="zzx_chunk_mariadb_") as tmp_name:
        tmp = Path(tmp_name)
        tmp_volumes = tmp / "mariadb-gz"
        mkdir(tmp_volumes)

        for index, chunk in enumerate(chunks):
            name = f"{index:04d}.sql.gz"
            path = tmp_volumes / name
            shard_name = name

            body = "".join(chunk)
            sql = (
                header
                + f"-- shard_index: {index}\n"
                + f"-- shard_name: {shard_name}\n"
                + f"-- shard_sha256: {sha256_text(body)}\n"
                + body
            )

            size = write_gzip_sql(path, sql)

            manifest["shards"].append(
                {
                    "index": index,
                    "path": f"mariadb-gz/{name}",
                    "size_bytes": size,
                    "item_count": len(chunk),
                    "compressed": True,
                    "format": "sql.gz",
                }
            )

        if volumes_dir.exists():
            shutil.rmtree(volumes_dir)

        shutil.move(str(tmp_volumes), str(volumes_dir))

    for shard in manifest["shards"]:
        shard_path = volumes_dir / Path(shard["path"]).name
        shard_control_lines.append(
            shard_control_sql(
                generated_at=generated_at,
                source=args.source,
                kind=args.kind,
                shard_index=int(shard["index"]),
                shard_name=Path(shard["path"]).name,
                shard_path=shard_path,
                item_count=int(shard["item_count"]),
            )
        )
        shard["sha256"] = sha256_file(shard_path)

    control = control_sql(
        generated_at=generated_at,
        source=args.source,
        kind=args.kind,
        item_key=args.item_key,
        item_count=len(rows),
        shard_count=len(chunks),
        max_bytes=args.max_bytes,
        input_path=input_path,
        metadata=metadata,
        manifest=manifest,
    )

    latest_sql = header + "".join(shard_control_lines) + control
    latest_sql += f"-- latest_sha256:{sha256_text(latest_sql)}\n"

    write_gzip_sql(latest_path, latest_sql)

    report_sql = header + control

    if args.report:
        write_gzip_sql(Path(args.report).resolve(), report_sql)

    print(
        f"chunk_json: wrote mariadb gzip shards items={len(rows)} "
        f"shards={len(chunks)} latest={latest_path} shard_dir={volumes_dir}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
