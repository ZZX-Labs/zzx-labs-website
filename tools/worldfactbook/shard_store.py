#!/usr/bin/env python3
"""MariaDB-compatible SQL shard writer for World Factbook chunks."""
from __future__ import annotations

import gzip
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

SCHEMA_SQL = r'''SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS worldfactbook_chunks (
  chunk_id CHAR(64) NOT NULL,
  edition_year SMALLINT UNSIGNED NOT NULL,
  entity_code VARCHAR(24) NOT NULL DEFAULT '',
  entity_name VARCHAR(160) NOT NULL DEFAULT '',
  category VARCHAR(96) NOT NULL,
  ordinal INT UNSIGNED NOT NULL,
  content MEDIUMTEXT NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  source_provider VARCHAR(64) NOT NULL,
  source_identifier VARCHAR(255) NOT NULL,
  source_format VARCHAR(32) NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  source_url TEXT NOT NULL,
  extractor VARCHAR(64) NOT NULL,
  PRIMARY KEY (chunk_id),
  KEY idx_wfb_year_category (edition_year, category),
  KEY idx_wfb_entity_year (entity_code, edition_year),
  KEY idx_wfb_source_sha (source_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
'''


def esc(value) -> str:
    if value is None:
        return "NULL"
    text = str(value).replace("\\", "\\\\").replace("'", "''").replace("\x00", "")
    return "'" + text + "'"


def row_sql(row: dict) -> str:
    cols = [
        "chunk_id", "edition_year", "entity_code", "entity_name", "category", "ordinal",
        "content", "content_sha256", "source_provider", "source_identifier", "source_format",
        "source_sha256", "source_url", "extractor",
    ]
    vals = [
        esc(row.get("chunk_id")), str(int(row.get("edition_year") or 0)),
        esc(row.get("entity_code") or ""), esc(row.get("entity_name") or ""),
        esc(row.get("category") or "raw"), str(int(row.get("ordinal") or 0)),
        esc(row.get("content") or ""), esc(row.get("content_sha256")),
        esc(row.get("source_provider") or ""), esc(row.get("source_identifier") or ""),
        esc(row.get("source_format") or ""), esc(row.get("source_sha256") or ""),
        esc(row.get("source_url") or ""), esc(row.get("extractor") or ""),
    ]
    updates = ",".join(f"{c}=VALUES({c})" for c in cols[1:])
    return (
        "INSERT INTO worldfactbook_chunks (" + ",".join(cols) + ") VALUES (" + ",".join(vals) + ") "
        "ON DUPLICATE KEY UPDATE " + updates + ";\n"
    )


def write_shards(rows: list[dict], root: Path, *, max_compressed_bytes: int = 24_000_000, target_rows: int = 4000) -> dict:
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    groups: dict[tuple[int, str], list[dict]] = {}
    for row in rows:
        key = (int(row["edition_year"]), str(row["category"]))
        groups.setdefault(key, []).append(row)

    manifest = {"schema": "zzx-worldfactbook-mariadb-shards-v1", "files": [], "rows": len(rows)}
    for (year, category), items in sorted(groups.items()):
        safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in category.lower()).strip("-") or "raw"
        part = 0
        cursor = 0
        while cursor < len(items):
            batch = items[cursor: cursor + target_rows]
            while True:
                part += 1
                rel = Path(str(year)) / f"{safe}-{part:04d}.sql.gz"
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                payload = SCHEMA_SQL + "".join(row_sql(r) for r in batch)
                with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as fh:
                    fh.write(payload)
                size = path.stat().st_size
                if size <= max_compressed_bytes or len(batch) <= 1:
                    break
                path.unlink(missing_ok=True)
                part -= 1
                batch = batch[: max(1, len(batch)//2)]
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            manifest["files"].append({
                "path": rel.as_posix(), "edition_year": year, "category": category,
                "rows": len(batch), "bytes": size, "sha256": digest,
            })
            cursor += len(batch)

    (root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest
