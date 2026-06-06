#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping


SCHEMA = "zzx-bitnodes-mariadb-gz-registry-backup-v4"

SUPPORTED_INPUT_EXTENSIONS = (
    ".json",
    ".json.gz",
    ".sql.gz",
    ".db.gz",
    ".sqlite.gz",
    ".sqlite3.gz",
    ".mariadb.gz",
)

NODE_TABLE = "bitnodes_registry_nodes"
SHARD_TABLE = "bitnodes_registry_shards"
CONTROL_TABLE = "bitnodes_registry_control"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def utc_day() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


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


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


def read_text(path: Path, max_bytes: int | None = None) -> str:
    try:
        if path.name.endswith(".gz"):
            with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
                return handle.read(max_bytes)
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            return handle.read(max_bytes)
    except Exception:
        return ""


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        text = read_text(path)
        if not text:
            return fallback
        return json.loads(text)
    except Exception:
        return fallback


def write_gzip_text(path: Path, text: str) -> int:
    mkdir(path.parent)

    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as handle:
        handle.write(text)

    return path.stat().st_size


def looks_supported(path: Path) -> bool:
    name = path.name.lower()
    return any(name.endswith(ext) for ext in SUPPORTED_INPUT_EXTENSIONS)


def collect_input_files(paths: list[Path]) -> list[Path]:
    output: list[Path] = []
    seen: set[Path] = set()

    for path in paths:
        if path.is_file() and looks_supported(path):
            resolved = path.resolve()
            if resolved not in seen:
                seen.add(resolved)
                output.append(resolved)

        elif path.is_dir():
            for item in sorted(path.rglob("*")):
                if not item.is_file() or not looks_supported(item):
                    continue

                resolved = item.resolve()

                if resolved in seen:
                    continue

                seen.add(resolved)
                output.append(resolved)

    return sorted(output)


def normalize_address(address: Any) -> str:
    return str(address or "").strip()


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

    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)

        if port.isdigit():
            return host, int(port)

    if ".onion:" in value.lower() or ".i2p:" in value.lower():
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


def normalize_original_list_row(address: str, row: list[Any]) -> dict[str, Any]:
    padded = list(row) + [None] * max(0, 24 - len(row))
    host, port = split_host_port(address)
    metadata = padded[19] if isinstance(padded[19], Mapping) else {}

    return {
        "address": address,
        "host": host,
        "port": port,
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
        "metadata": dict(metadata),
        "raw": row,
    }


def normalize_node(address: str, row: Any) -> dict[str, Any]:
    address = normalize_address(address)

    if isinstance(row, Mapping):
        out = dict(row)
        out["address"] = normalize_address(
            out.get("address")
            or out.get("canonical_address")
            or out.get("node")
            or out.get("addr")
            or address
        )

        host, port = split_host_port(out["address"])
        out.setdefault("host", host)

        if port is not None:
            out.setdefault("port", port)

        return out

    if isinstance(row, list):
        return normalize_original_list_row(address, row)

    return {"address": address, "raw": row}


def normalize_nodes(payload: Any) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}

    if isinstance(payload, Mapping) and isinstance(payload.get("nodes"), Mapping):
        for address, row in payload["nodes"].items():
            normalized = normalize_node(str(address), row)
            if normalized.get("address"):
                output[normalized["address"]] = normalized
        return output

    if isinstance(payload, Mapping):
        for key in ("results", "data", "rows", "peers", "node_records", "reachable_nodes"):
            value = payload.get(key)

            if isinstance(value, list):
                for row in value:
                    if not isinstance(row, Mapping):
                        continue

                    address = normalize_address(
                        row.get("address")
                        or row.get("canonical_address")
                        or row.get("node")
                        or row.get("addr")
                        or row.get("host")
                    )

                    if address:
                        output[address] = normalize_node(address, row)

                return output

            if isinstance(value, Mapping):
                return normalize_nodes({"nodes": value})

        for key, value in payload.items():
            if isinstance(value, (Mapping, list)):
                address = normalize_address(key)

                if address:
                    output[address] = normalize_node(address, value)

        return output

    if isinstance(payload, list):
        for row in payload:
            if not isinstance(row, Mapping):
                continue

            address = normalize_address(
                row.get("address")
                or row.get("canonical_address")
                or row.get("node")
                or row.get("addr")
                or row.get("host")
            )

            if address:
                output[address] = normalize_node(address, row)

    return output


def parse_sql_insert_values(sql: str) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []

    for match in re.finditer(
        r"INSERT\s+INTO\s+[`\"]?(?:bitnodes_)?(?:nodes|registry_nodes|node_records)[`\"]?.*?VALUES\s*(.+?);",
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        values_text = match.group(1)

        for obj_match in re.finditer(r"\{.*?\}", values_text, flags=re.DOTALL):
            try:
                item = json.loads(obj_match.group(0))
            except Exception:
                continue

            if isinstance(item, dict):
                output.append(item)

    return output


def nodes_from_file(path: Path) -> dict[str, dict[str, Any]]:
    name = path.name.lower()

    if name.endswith(".json") or name.endswith(".json.gz"):
        payload = read_json(path, fallback={})
        return normalize_nodes(payload)

    if name.endswith(".sql.gz") or name.endswith(".mariadb.gz"):
        text = read_text(path, max_bytes=16 * 1024 * 1024)
        rows = parse_sql_insert_values(text)
        return normalize_nodes(rows)

    return {}


def row_quality(row: Mapping[str, Any]) -> int:
    score = 0

    for value in row.values():
        if value not in ("", None, [], {}):
            score += 1

    if boolish(row.get("reachable")) or boolish(row.get("reachable_now")):
        score += 30

    if row.get("height"):
        score += 10

    if row.get("agent") or row.get("user_agent"):
        score += 10

    if row.get("latitude") not in ("", None) and row.get("longitude") not in ("", None):
        score += 20

    if row.get("country") or row.get("country_code"):
        score += 6

    if row.get("asn") or row.get("organization"):
        score += 6

    return score


def merge_nodes(files: list[Path]) -> dict[str, dict[str, Any]]:
    nodes: dict[str, dict[str, Any]] = {}

    for path in files:
        source_nodes = nodes_from_file(path)

        for address, row in source_nodes.items():
            previous = nodes.get(address)

            row["_registry_source_file"] = str(path)

            if previous is None or row_quality(row) >= row_quality(previous):
                nodes[address] = row

    return nodes


def node_sql(row: Mapping[str, Any], source: str, generated_at: str) -> str:
    address = normalize_address(row.get("address"))
    host, port = split_host_port(address)

    host = normalize_address(row.get("host") or row.get("hostname") or host)
    port = safe_int(row.get("port"), port or 8333)

    metadata = row.get("metadata") if isinstance(row.get("metadata"), Mapping) else {}
    payload_json = compact_json(row)

    values = [
        generated_at,
        source,
        address,
        host,
        port,
        row.get("network") or "",
        boolish(row.get("reachable") or row.get("reachable_now")),
        row.get("protocol") or "",
        row.get("agent") or row.get("user_agent") or "",
        safe_int(row.get("height")),
        row.get("services") or "",
        row.get("country_code") or row.get("country") or "",
        row.get("country_name") or "",
        row.get("continent") or "",
        row.get("region") or "",
        row.get("territory") or row.get("state") or "",
        row.get("county") or "",
        row.get("city") or "",
        row.get("zip") or row.get("postal_code") or "",
        row.get("timezone") or "",
        safe_float(row.get("latitude")),
        safe_float(row.get("longitude")),
        row.get("asn") or "",
        row.get("organization") or row.get("org") or "",
        row.get("provider") or "",
        boolish(row.get("is_tor")),
        boolish(row.get("is_i2p")),
        boolish(row.get("is_vpn")),
        boolish(row.get("is_proxy")),
        boolish(row.get("is_sanctioned_node")),
        boolish(row.get("is_policy_restricted_node")),
        payload_json,
        compact_json(metadata),
        row.get("_registry_source_file") or "",
    ]

    return (
        f"INSERT INTO {NODE_TABLE} "
        "(indexed_at, source_name, address, host, port, network, reachable, protocol, agent, height, services, "
        "country_code, country_name, continent, region_name, territory_name, county_name, city_name, postal_code, "
        "timezone_name, latitude, longitude, asn, organization, provider, is_tor, is_i2p, is_vpn, is_proxy, "
        "is_sanctioned_node, is_policy_restricted_node, payload_json, metadata_json, source_file) "
        f"VALUES ({','.join(sql_quote(value) for value in values)}) "
        "ON DUPLICATE KEY UPDATE "
        "indexed_at=VALUES(indexed_at), source_name=VALUES(source_name), host=VALUES(host), port=VALUES(port), "
        "network=VALUES(network), reachable=VALUES(reachable), protocol=VALUES(protocol), agent=VALUES(agent), "
        "height=VALUES(height), services=VALUES(services), country_code=VALUES(country_code), "
        "country_name=VALUES(country_name), continent=VALUES(continent), region_name=VALUES(region_name), "
        "territory_name=VALUES(territory_name), county_name=VALUES(county_name), city_name=VALUES(city_name), "
        "postal_code=VALUES(postal_code), timezone_name=VALUES(timezone_name), latitude=VALUES(latitude), "
        "longitude=VALUES(longitude), asn=VALUES(asn), organization=VALUES(organization), provider=VALUES(provider), "
        "is_tor=VALUES(is_tor), is_i2p=VALUES(is_i2p), is_vpn=VALUES(is_vpn), is_proxy=VALUES(is_proxy), "
        "is_sanctioned_node=VALUES(is_sanctioned_node), "
        "is_policy_restricted_node=VALUES(is_policy_restricted_node), payload_json=VALUES(payload_json), "
        "metadata_json=VALUES(metadata_json), source_file=VALUES(source_file);\n"
    )


def create_sql_header() -> str:
    return f"""-- {SCHEMA}
-- generated_at: {utc_now_iso()}
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS {NODE_TABLE} (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  indexed_at DATETIME NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  address VARCHAR(512) NOT NULL,
  host VARCHAR(512) NOT NULL,
  port INT UNSIGNED NOT NULL DEFAULT 8333,
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
  metadata_json LONGTEXT NULL,
  source_file TEXT NULL,
  UNIQUE KEY uniq_bitnodes_registry_address (address),
  KEY idx_bitnodes_registry_source (source_name),
  KEY idx_bitnodes_registry_country (country_code),
  KEY idx_bitnodes_registry_network (network),
  KEY idx_bitnodes_registry_geo (latitude, longitude),
  KEY idx_bitnodes_registry_flags (is_tor, is_i2p, is_vpn, is_proxy, is_sanctioned_node)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {SHARD_TABLE} (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  generated_at DATETIME NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  shard_name VARCHAR(255) NOT NULL,
  shard_path TEXT NOT NULL,
  node_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sha256 CHAR(64) NOT NULL,
  UNIQUE KEY uniq_bitnodes_registry_shard_sha256 (sha256),
  KEY idx_bitnodes_registry_shard_source (source_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {CONTROL_TABLE} (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  generated_at DATETIME NOT NULL,
  schema_name VARCHAR(128) NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  node_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  shard_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  source_file_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  max_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  manifest_json LONGTEXT NOT NULL,
  UNIQUE KEY uniq_bitnodes_registry_control_source_schema (source_name, schema_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

"""


def chunk_sql_rows(nodes: dict[str, dict[str, Any]], max_bytes: int, source: str, generated_at: str) -> list[list[str]]:
    chunks: list[list[str]] = []
    current: list[str] = []

    for address in sorted(nodes):
        line = node_sql(nodes[address], source, generated_at)

        if current and sum(len(item.encode("utf-8")) for item in current) + len(line.encode("utf-8")) >= max_bytes:
            chunks.append(current)
            current = []

        current.append(line)

    if current:
        chunks.append(current)

    return chunks


def clean_output_dir(path: Path) -> None:
    mkdir(path)

    for pattern in ("nodes-*.sql.gz", "registry-*.sql.gz", "manifest.sql.gz", "latest.sql.gz"):
        for item in path.glob(pattern):
            try:
                item.unlink()
            except Exception:
                pass


def infer_source(files: list[Path], explicit: str = "") -> str:
    if explicit:
        return explicit

    joined = " ".join(path.as_posix().lower() for path in files)

    for source in ("zzxbitnodes", "originalbitnodes", "externalbitnodes", "bitnodes"):
        if source in joined:
            return source

    return "bitnodes"


def shard_sql(
    *,
    header: str,
    generated_at: str,
    source: str,
    shard_name: str,
    rows: list[str],
) -> str:
    body = "".join(rows)
    shard_hash = sha256_text(header + body)

    return (
        header
        + f"-- shard_name: {shard_name}\n"
        + f"-- shard_sha256: {shard_hash}\n"
        + body
    )


def shard_entry_sql(generated_at: str, source: str, shard_name: str, shard_path: Path, node_count: int) -> str:
    values = [
        generated_at,
        source,
        shard_name,
        str(shard_path),
        node_count,
        shard_path.stat().st_size if shard_path.exists() else 0,
        sha256_file(shard_path) if shard_path.exists() else "",
    ]

    return (
        f"INSERT INTO {SHARD_TABLE} "
        "(generated_at, source_name, shard_name, shard_path, node_count, size_bytes, sha256) "
        f"VALUES ({','.join(sql_quote(value) for value in values)}) "
        "ON DUPLICATE KEY UPDATE generated_at=VALUES(generated_at), source_name=VALUES(source_name), "
        "shard_name=VALUES(shard_name), shard_path=VALUES(shard_path), node_count=VALUES(node_count), "
        "size_bytes=VALUES(size_bytes);\n"
    )


def control_sql(
    *,
    generated_at: str,
    source: str,
    node_count: int,
    shard_count: int,
    source_file_count: int,
    max_bytes: int,
    manifest: dict[str, Any],
) -> str:
    values = [
        generated_at,
        SCHEMA,
        source,
        node_count,
        shard_count,
        source_file_count,
        max_bytes,
        compact_json(manifest),
    ]

    return (
        f"INSERT INTO {CONTROL_TABLE} "
        "(generated_at, schema_name, source_name, node_count, shard_count, source_file_count, max_bytes, manifest_json) "
        f"VALUES ({','.join(sql_quote(value) for value in values)}) "
        "ON DUPLICATE KEY UPDATE generated_at=VALUES(generated_at), node_count=VALUES(node_count), "
        "shard_count=VALUES(shard_count), source_file_count=VALUES(source_file_count), "
        "max_bytes=VALUES(max_bytes), manifest_json=VALUES(manifest_json);\n"
    )


def build_manifest(
    *,
    generated_at: str,
    source: str,
    node_count: int,
    shard_count: int,
    max_bytes: int,
    source_files: list[Path],
) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "generated_at": generated_at,
        "source": source,
        "node_count": node_count,
        "shard_count": shard_count,
        "max_bytes": max_bytes,
        "source_file_count": len(source_files),
        "source_files": [str(path) for path in source_files],
        "shards": [],
    }


def backup(
    *,
    input_paths: list[Path],
    api_paths: list[Path],
    output_dir: Path,
    latest_dir: Path,
    max_mb: float,
    source: str,
    no_clean: bool,
) -> int:
    max_bytes = int(max_mb * 1024 * 1024)

    if not no_clean:
        clean_output_dir(output_dir)
        clean_output_dir(latest_dir)

    files = collect_input_files([*input_paths, *api_paths])
    nodes = merge_nodes(files)
    generated_at = utc_now_iso()
    source_name = infer_source(files, source)
    header = create_sql_header()
    chunks = chunk_sql_rows(nodes, max_bytes=max_bytes, source=source_name, generated_at=generated_at)

    manifest = build_manifest(
        generated_at=generated_at,
        source=source_name,
        node_count=len(nodes),
        shard_count=len(chunks),
        max_bytes=max_bytes,
        source_files=files,
    )

    mkdir(output_dir)
    mkdir(latest_dir)

    shard_control_lines: list[str] = []

    for index, rows in enumerate(chunks, start=1):
        name = f"nodes-{index:05d}.sql.gz"

        dated_path = output_dir / name
        latest_path = latest_dir / name

        sql = shard_sql(
            header=header,
            generated_at=generated_at,
            source=source_name,
            shard_name=name,
            rows=rows,
        )

        write_gzip_text(dated_path, sql)
        write_gzip_text(latest_path, sql)

        entry = {
            "file": name,
            "node_count": len(rows),
            "bytes": dated_path.stat().st_size,
            "sha256": sha256_file(dated_path),
        }

        manifest["shards"].append(entry)
        shard_control_lines.append(shard_entry_sql(generated_at, source_name, name, dated_path, len(rows)))

    control = control_sql(
        generated_at=generated_at,
        source=source_name,
        node_count=len(nodes),
        shard_count=len(chunks),
        source_file_count=len(files),
        max_bytes=max_bytes,
        manifest=manifest,
    )

    manifest_sql = header + "".join(shard_control_lines) + control
    manifest_sql += f"-- manifest_sha256:{sha256_text(manifest_sql)}\n"

    write_gzip_text(output_dir / "manifest.sql.gz", manifest_sql)
    write_gzip_text(latest_dir / "manifest.sql.gz", manifest_sql)
    write_gzip_text(latest_dir / "latest.sql.gz", manifest_sql + "\n".join(shard_control_lines))

    print(
        f"mariadb gz backup complete: {len(nodes)} nodes, "
        f"{len(chunks)} shards, output={output_dir}"
    )

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create compact MariaDB gzip DB-shard registry backups for ZZX Bitnodes.",
        allow_abbrev=False,
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--api", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--latest-output", required=True)
    parser.add_argument("--max-mb", type=float, default=24.0)
    parser.add_argument("--source", default="")
    parser.add_argument("--no-clean", action="store_true")

    args = parser.parse_args()

    return backup(
        input_paths=[Path(args.input).resolve()],
        api_paths=[Path(args.api).resolve()],
        output_dir=Path(args.output).resolve(),
        latest_dir=Path(args.latest_output).resolve(),
        max_mb=args.max_mb,
        source=args.source,
        no_clean=args.no_clean,
    )


if __name__ == "__main__":
    raise SystemExit(main())
