#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


SCHEMA = "zzx-bitnodes-daily-index-mariadb-gz-v4"

APP_ROOT = Path(__file__).resolve().parents[2]
BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))
BITNODES_API = BITNODES_ROOT / "api"
BITNODES_DATA = BITNODES_ROOT / "data"
BITNODES_ARCHIVE = BITNODES_ROOT / "archive"

DEFAULT_REPO_ROOT = BITNODES_DATA / "registry"
DEFAULT_DB_ROOT = BITNODES_DATA / "mariadb"
DEFAULT_OUTPUT_DIR = DEFAULT_DB_ROOT / "indexes"

SUPPORTED_EXTENSIONS = (
    ".sql.gz",
    ".db.gz",
    ".sqlite.gz",
    ".sqlite3.gz",
    ".mariadb.gz",
    ".manifest.gz",
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def utc_day() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def safe_int(value: Any, fallback: int = 0) -> int:
    try:
        if value in ("", None):
            return fallback
        return int(float(value))
    except Exception:
        return fallback


def rel(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except Exception:
        return path.as_posix()


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


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


def read_gzip_text(path: Path, max_bytes: int = 8_000_000) -> str:
    try:
        with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
            return handle.read(max_bytes)
    except Exception:
        return ""


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback

        if path.suffix == ".gz":
            text = read_gzip_text(path)
            return json.loads(text) if text else fallback

        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_gzip_text(path: Path, text: str) -> None:
    mkdir(path.parent)

    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as handle:
        handle.write(text)


def looks_supported(path: Path) -> bool:
    name = path.name.lower()
    return any(name.endswith(ext) for ext in SUPPORTED_EXTENSIONS)


def classify_artifact(path: Path) -> str:
    name = path.name.lower()

    if name.endswith(".sql.gz") or name.endswith(".mariadb.gz"):
        return "mariadb_sql_gzip_shard"

    if name.endswith(".db.gz") or name.endswith(".sqlite.gz") or name.endswith(".sqlite3.gz"):
        return "compressed_sqlite_db_shard"

    if "manifest" in name:
        return "compressed_manifest"

    return "compressed_data_shard"


def infer_source(path: Path) -> str:
    parts = [part.lower() for part in path.parts]

    for source in ("zzxbitnodes", "originalbitnodes", "externalbitnodes", "bitnodes"):
        if source in parts:
            return source

    name = path.name.lower()

    for source in ("zzxbitnodes", "originalbitnodes", "externalbitnodes", "bitnodes"):
        if source in name:
            return source

    return "unknown"


def infer_bucket(path: Path) -> str:
    parts = [part.lower() for part in path.parts]

    for bucket in ("24h", "hourly", "daily", "week", "weekly", "monthly", "quarterly", "yearly", "all-time", "latest"):
        if bucket in parts:
            return bucket

    return "unknown"


def infer_role(path: Path) -> str:
    name = path.name.lower()

    if "control" in name:
        return "control"

    if "manifest" in name or "index" in name:
        return "manifest"

    if "latest" in name:
        return "latest"

    if "snapshot" in name:
        return "snapshot"

    if "shard" in name:
        return "data"

    return "data"


def infer_date(path: Path) -> str:
    text = path.as_posix()

    for pattern in (
        r"(20\d{2}-\d{2}-\d{2})",
        r"(20\d{6})",
        r"(20\d{2}/\d{2}/\d{2})",
    ):
        match = re.search(pattern, text)

        if not match:
            continue

        value = match.group(1).replace("/", "-")

        if re.fullmatch(r"20\d{6}", value):
            return f"{value[0:4]}-{value[4:6]}-{value[6:8]}"

        return value

    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).strftime("%Y-%m-%d")


def extract_manifest_stats_from_text(text: str) -> dict[str, Any]:
    if not text:
        return {}

    stripped = text.strip()

    if stripped.startswith("{"):
        try:
            data = json.loads(stripped)
            if isinstance(data, dict):
                return {
                    "schema": data.get("schema", ""),
                    "generated_at": data.get("generated_at") or data.get("updated_at") or "",
                    "node_count": safe_int(data.get("node_count") or data.get("total_nodes") or data.get("reachable_nodes")),
                    "record_count": safe_int(data.get("record_count") or data.get("rows") or data.get("row_count")),
                    "shard_count": safe_int(data.get("shard_count") or len(data.get("shards", [])) if isinstance(data.get("shards"), list) else 0),
                    "chunk_count": safe_int(data.get("chunk_count") or len(data.get("chunks", [])) if isinstance(data.get("chunks"), list) else 0),
                }
        except Exception:
            pass

    output: dict[str, Any] = {}

    for key in ("node_count", "total_nodes", "reachable_nodes", "record_count", "row_count", "shard_count", "chunk_count"):
        match = re.search(rf"\b{re.escape(key)}\b\s*[:=]\s*([0-9]+)", text, re.IGNORECASE)
        if match:
            output[key] = safe_int(match.group(1))

    return {
        "schema": "",
        "generated_at": "",
        "node_count": safe_int(output.get("node_count") or output.get("total_nodes") or output.get("reachable_nodes")),
        "record_count": safe_int(output.get("record_count") or output.get("row_count")),
        "shard_count": safe_int(output.get("shard_count")),
        "chunk_count": safe_int(output.get("chunk_count")),
    }


def extract_sql_stats(path: Path) -> dict[str, Any]:
    text = read_gzip_text(path, max_bytes=2_000_000)

    if not text:
        return {}

    table_count = len(re.findall(r"\bCREATE\s+TABLE\b", text, re.IGNORECASE))
    insert_count = len(re.findall(r"\bINSERT\s+INTO\b", text, re.IGNORECASE))

    row_count = 0
    for match in re.finditer(r"\bINSERT\s+INTO\b.+?\bVALUES\b(.+?);", text, re.IGNORECASE | re.DOTALL):
        values = match.group(1)
        row_count += max(1, values.count("),(") + values.count("),\n("))

    stats = extract_manifest_stats_from_text(text)
    stats.update({
        "table_count": table_count,
        "insert_count": insert_count,
        "estimated_row_count": row_count,
    })

    return stats


def extract_sqlite_stats_from_gz(path: Path) -> dict[str, Any]:
    scratch = path.with_suffix("")
    stats: dict[str, Any] = {}

    try:
        with gzip.open(path, "rb") as src, scratch.open("wb") as dst:
            for block in iter(lambda: src.read(1024 * 1024), b""):
                dst.write(block)

        conn = sqlite3.connect(str(scratch))
        cur = conn.cursor()

        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cur.fetchall()]

        stats["table_count"] = len(tables)
        stats["tables"] = tables[:64]

        total_rows = 0

        for table in tables:
            try:
                cur.execute(f'SELECT COUNT(*) FROM "{table}"')
                total_rows += safe_int(cur.fetchone()[0])
            except Exception:
                pass

        stats["estimated_row_count"] = total_rows
        stats["record_count"] = total_rows

        conn.close()
    except Exception:
        pass
    finally:
        try:
            scratch.unlink()
        except Exception:
            pass

    return stats


def artifact_entry(root: Path, path: Path) -> dict[str, Any]:
    stat = path.stat()
    kind = classify_artifact(path)

    if kind == "mariadb_sql_gzip_shard":
        parsed_stats = extract_sql_stats(path)
    elif kind == "compressed_sqlite_db_shard":
        parsed_stats = extract_sqlite_stats_from_gz(path)
    elif kind == "compressed_manifest":
        parsed_stats = extract_manifest_stats_from_text(read_gzip_text(path))
    else:
        parsed_stats = {}

    return {
        "schema": "zzx-bitnodes-mariadb-artifact-entry-v4",
        "path": rel(root, path),
        "absolute_path": str(path),
        "filename": path.name,
        "directory": rel(root, path.parent),
        "kind": kind,
        "role": infer_role(path),
        "source": infer_source(path),
        "bucket": infer_bucket(path),
        "date": infer_date(path),
        "size_bytes": stat.st_size,
        "sha256": sha256_file(path),
        "modified_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).replace(microsecond=0).isoformat(),
        "parsed": parsed_stats,
    }


def iter_artifacts(paths: Iterable[Path]) -> list[Path]:
    seen: set[Path] = set()
    output: list[Path] = []

    for root in paths:
        if not root.exists():
            continue

        if root.is_file() and looks_supported(root):
            resolved = root.resolve()
            if resolved not in seen:
                seen.add(resolved)
                output.append(resolved)
            continue

        for path in root.rglob("*"):
            if not path.is_file() or not looks_supported(path):
                continue

            resolved = path.resolve()

            if resolved in seen:
                continue

            seen.add(resolved)
            output.append(resolved)

    return sorted(output)


def aggregate_stats(entries: list[dict[str, Any]]) -> dict[str, Any]:
    by_kind: dict[str, int] = {}
    by_source: dict[str, int] = {}
    by_bucket: dict[str, int] = {}
    by_date: dict[str, int] = {}
    by_role: dict[str, int] = {}

    total_bytes = 0
    estimated_rows = 0
    table_count = 0
    insert_count = 0

    for entry in entries:
        kind = str(entry.get("kind") or "unknown")
        source = str(entry.get("source") or "unknown")
        bucket = str(entry.get("bucket") or "unknown")
        date = str(entry.get("date") or "unknown")
        role = str(entry.get("role") or "unknown")
        parsed = entry.get("parsed") if isinstance(entry.get("parsed"), dict) else {}

        by_kind[kind] = by_kind.get(kind, 0) + 1
        by_source[source] = by_source.get(source, 0) + 1
        by_bucket[bucket] = by_bucket.get(bucket, 0) + 1
        by_date[date] = by_date.get(date, 0) + 1
        by_role[role] = by_role.get(role, 0) + 1

        total_bytes += safe_int(entry.get("size_bytes"))
        estimated_rows += safe_int(parsed.get("record_count") or parsed.get("estimated_row_count"))
        table_count += safe_int(parsed.get("table_count"))
        insert_count += safe_int(parsed.get("insert_count"))

    return {
        "schema": "zzx-bitnodes-mariadb-index-stats-v4",
        "generated_at": utc_now_iso(),
        "artifact_count": len(entries),
        "total_bytes": total_bytes,
        "estimated_row_count": estimated_rows,
        "table_count": table_count,
        "insert_count": insert_count,
        "by_kind": dict(sorted(by_kind.items(), key=lambda item: (-item[1], item[0]))),
        "by_source": dict(sorted(by_source.items(), key=lambda item: (-item[1], item[0]))),
        "by_bucket": dict(sorted(by_bucket.items(), key=lambda item: (-item[1], item[0]))),
        "by_date": dict(sorted(by_date.items(), key=lambda item: (-item[1], item[0]))),
        "by_role": dict(sorted(by_role.items(), key=lambda item: (-item[1], item[0]))),
    }


def health(entries: list[dict[str, Any]], roots: list[Path]) -> dict[str, Any]:
    problems: list[str] = []

    if not entries:
        problems.append("no_mariadb_gz_artifacts_found")

    if not any(str(entry.get("kind")) == "mariadb_sql_gzip_shard" for entry in entries):
        problems.append("no_sql_gz_shards_found")

    if not any(str(entry.get("role")) in {"manifest", "control"} for entry in entries):
        problems.append("no_manifest_or_control_shard_found")

    missing_roots = [str(root) for root in roots if not root.exists()]

    if missing_roots:
        problems.append("one_or_more_scan_roots_missing")

    status = "ok" if not problems else "warning"

    if "no_mariadb_gz_artifacts_found" in problems:
        status = "error"

    return {
        "schema": "zzx-bitnodes-mariadb-index-health-v4",
        "generated_at": utc_now_iso(),
        "status": status,
        "problems": problems,
        "missing_roots": missing_roots,
        "artifact_count": len(entries),
    }


def create_sql_header() -> str:
    return f"""-- {SCHEMA}
-- generated_at: {utc_now_iso()}
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS bitnodes_artifact_index (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  indexed_at DATETIME NOT NULL,
  artifact_date DATE NULL,
  schema_name VARCHAR(128) NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  bucket_name VARCHAR(128) NOT NULL,
  role_name VARCHAR(128) NOT NULL,
  artifact_kind VARCHAR(128) NOT NULL,
  artifact_path TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  directory_path TEXT NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sha256 CHAR(64) NOT NULL,
  modified_at DATETIME NULL,
  parsed_json LONGTEXT NULL,
  UNIQUE KEY uniq_bitnodes_artifact_sha256 (sha256),
  KEY idx_bitnodes_artifact_source_date (source_name, artifact_date),
  KEY idx_bitnodes_artifact_kind (artifact_kind),
  KEY idx_bitnodes_artifact_bucket (bucket_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bitnodes_index_control (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  indexed_at DATETIME NOT NULL,
  schema_name VARCHAR(128) NOT NULL,
  index_date DATE NOT NULL,
  artifact_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  estimated_row_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  health_status VARCHAR(32) NOT NULL,
  stats_json LONGTEXT NOT NULL,
  health_json LONGTEXT NOT NULL,
  UNIQUE KEY uniq_bitnodes_index_control_date_schema (index_date, schema_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

"""


def to_mysql_datetime(value: Any) -> str | None:
    text = str(value or "").strip()

    if not text:
        return None

    text = text.replace("Z", "+00:00")

    try:
        dt = datetime.fromisoformat(text)
        return dt.astimezone(timezone.utc).replace(tzinfo=None, microsecond=0).isoformat(sep=" ")
    except Exception:
        return None


def insert_artifact_sql(entry: dict[str, Any]) -> str:
    indexed_at = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0).isoformat(sep=" ")
    artifact_date = entry.get("date")
    modified_at = to_mysql_datetime(entry.get("modified_at"))
    parsed_json = compact_json(entry.get("parsed", {}))

    values = [
        indexed_at,
        artifact_date,
        SCHEMA,
        entry.get("source", "unknown"),
        entry.get("bucket", "unknown"),
        entry.get("role", "unknown"),
        entry.get("kind", "unknown"),
        entry.get("path", ""),
        entry.get("absolute_path", ""),
        entry.get("filename", ""),
        entry.get("directory", ""),
        safe_int(entry.get("size_bytes")),
        entry.get("sha256", ""),
        modified_at,
        parsed_json,
    ]

    return (
        "INSERT INTO bitnodes_artifact_index "
        "(indexed_at, artifact_date, schema_name, source_name, bucket_name, role_name, artifact_kind, "
        "artifact_path, absolute_path, filename, directory_path, size_bytes, sha256, modified_at, parsed_json) "
        f"VALUES ({','.join(sql_quote(value) for value in values)}) "
        "ON DUPLICATE KEY UPDATE "
        "indexed_at=VALUES(indexed_at), artifact_date=VALUES(artifact_date), schema_name=VALUES(schema_name), "
        "source_name=VALUES(source_name), bucket_name=VALUES(bucket_name), role_name=VALUES(role_name), "
        "artifact_kind=VALUES(artifact_kind), artifact_path=VALUES(artifact_path), absolute_path=VALUES(absolute_path), "
        "filename=VALUES(filename), directory_path=VALUES(directory_path), size_bytes=VALUES(size_bytes), "
        "modified_at=VALUES(modified_at), parsed_json=VALUES(parsed_json);\n"
    )


def insert_control_sql(stats: dict[str, Any], health_data: dict[str, Any], index_date: str) -> str:
    indexed_at = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0).isoformat(sep=" ")

    values = [
        indexed_at,
        SCHEMA,
        index_date,
        safe_int(stats.get("artifact_count")),
        safe_int(stats.get("total_bytes")),
        safe_int(stats.get("estimated_row_count")),
        health_data.get("status", "unknown"),
        compact_json(stats),
        compact_json(health_data),
    ]

    return (
        "INSERT INTO bitnodes_index_control "
        "(indexed_at, schema_name, index_date, artifact_count, total_bytes, estimated_row_count, "
        "health_status, stats_json, health_json) "
        f"VALUES ({','.join(sql_quote(value) for value in values)}) "
        "ON DUPLICATE KEY UPDATE "
        "indexed_at=VALUES(indexed_at), artifact_count=VALUES(artifact_count), total_bytes=VALUES(total_bytes), "
        "estimated_row_count=VALUES(estimated_row_count), health_status=VALUES(health_status), "
        "stats_json=VALUES(stats_json), health_json=VALUES(health_json);\n"
    )


def build_sql(entries: list[dict[str, Any]], stats: dict[str, Any], health_data: dict[str, Any], index_date: str) -> str:
    lines = [create_sql_header()]
    lines.append(insert_control_sql(stats, health_data, index_date))

    for entry in entries:
        lines.append(insert_artifact_sql(entry))

    lines.append(f"-- sha256:{sha256_text(''.join(lines))}\n")
    return "".join(lines)


def write_index_shards(
    *,
    entries: list[dict[str, Any]],
    stats: dict[str, Any],
    health_data: dict[str, Any],
    output_dir: Path,
    max_mb: int,
    index_date: str,
) -> list[Path]:
    mkdir(output_dir)

    max_bytes = max(1, int(max_mb)) * 1024 * 1024
    header = create_sql_header()
    control = insert_control_sql(stats, health_data, index_date)

    shard_paths: list[Path] = []
    shard_lines = [header, control]
    shard_index = 0

    def flush() -> None:
        nonlocal shard_lines, shard_index

        if len(shard_lines) <= 2 and shard_index > 0:
            return

        name = f"bitnodes-index-{index_date}-shard-{shard_index:04d}.sql.gz"
        path = output_dir / name
        text = "".join(shard_lines)
        text += f"-- shard_sha256:{sha256_text(text)}\n"
        write_gzip_text(path, text)
        shard_paths.append(path)
        shard_index += 1
        shard_lines = [header]

    for entry in entries:
        sql = insert_artifact_sql(entry)

        if sum(len(line.encode("utf-8")) for line in shard_lines) + len(sql.encode("utf-8")) > max_bytes:
            flush()

        shard_lines.append(sql)

    if shard_lines:
        flush()

    latest_path = output_dir / "latest-index.sql.gz"
    latest_sql = build_sql(entries, stats, health_data, index_date)
    write_gzip_text(latest_path, latest_sql)

    control_path = output_dir / "bitnodes-index-control.sql.gz"
    write_gzip_text(control_path, header + control)

    return [latest_path, control_path, *shard_paths]


def parse_roots(args: argparse.Namespace) -> list[Path]:
    roots = [Path(args.repo_root).resolve(), Path(args.db_root).resolve()]

    for value in args.scan_root:
        roots.append(Path(value).resolve())

    unique: list[Path] = []
    seen: set[str] = set()

    for root in roots:
        key = str(root)

        if key in seen:
            continue

        seen.add(key)
        unique.append(root)

    return unique


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build MariaDB gzip index shards for Bitnodes MariaDB gzip DB/data shards.",
        allow_abbrev=False,
    )

    parser.add_argument("--repo-root", default=str(DEFAULT_REPO_ROOT))
    parser.add_argument("--db-root", default=str(DEFAULT_DB_ROOT))
    parser.add_argument("--scan-root", action="append", default=[])
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--index-date", default=utc_day())
    parser.add_argument("--max-mb", type=int, default=24)
    parser.add_argument("--include-legacy-json", action="store_true")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    roots = parse_roots(args)
    artifacts = iter_artifacts(roots)

    if args.include_legacy_json:
        for root in roots:
            if root.exists():
                artifacts.extend(sorted(path.resolve() for path in root.rglob("*.json") if path.is_file()))

    entries = [artifact_entry(roots[0], path) for path in sorted(set(artifacts))]
    stats = aggregate_stats(entries)
    health_data = health(entries, roots)

    written = write_index_shards(
        entries=entries,
        stats=stats,
        health_data=health_data,
        output_dir=Path(args.output_dir).resolve(),
        max_mb=args.max_mb,
        index_date=args.index_date,
    )

    for path in written:
        print(f"wrote mariadb gzip index shard: {path}")

    print(f"indexed artifacts: {len(entries)}")
    print(f"health: {health_data['status']}")
    return 0 if health_data["status"] != "error" else 1


if __name__ == "__main__":
    raise SystemExit(main())
