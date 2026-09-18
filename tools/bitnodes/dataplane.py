#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"
API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"

DEFAULT_OUT = API_DIR / "data"
DEFAULT_DATABASE = "zzx_bitnodes"
DEFAULT_MAX_BYTES = 24_000_000

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import export_db  # type: ignore


DATAPLANE_SCHEMA = "zzx-bitnodes-canonical-dataplane-v3"


def utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: Any, compact: bool = False) -> int:
    mkdir(path.parent)
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


def run_dataplane(args: argparse.Namespace) -> dict[str, Any]:
    inputs = export_db.parse_inputs(args.input)

    if not inputs:
        if args.strict:
            raise SystemExit("dataplane: no input files found")
        print("dataplane: no input files found")
        return {}

    records = export_db.load_records(inputs)

    if not records and args.strict:
        raise SystemExit("dataplane: no node records found")

    out_dir = Path(args.output_dir).expanduser().resolve()
    mkdir(out_dir)

    mariadb_manifest = export_db.export_mariadb_shards(
        records,
        out_dir,
        args.database,
        args.max_bytes,
        args.compact,
    )

    sqlite_manifest = None
    if not args.no_sqlite:
        sqlite_manifest = export_db.export_sqlite(records, out_dir, args.compact)

    duckdb_manifest = None
    if args.duckdb and hasattr(export_db, "export_duckdb"):
        duckdb_manifest = export_db.export_duckdb(records, out_dir, args.compact)

    parquet_manifest = None
    if args.parquet and hasattr(export_db, "export_parquet"):
        parquet_manifest = export_db.export_parquet(records, out_dir, args.compact)

    json_manifest = export_db.export_json_artifacts(records, out_dir, args.compact)
    csv_manifest = export_db.export_csv_artifacts(records, out_dir)
    xml_manifest = export_db.export_xml_artifacts(records, out_dir)
    redis_manifest = export_db.export_redis_artifacts(records, out_dir)
    geo_manifest = export_db.export_geo_indexes(records, out_dir, args.compact)
    map_manifest = export_db.export_map_artifacts(records, out_dir, args.compact)

    manifest = {
        "schema": DATAPLANE_SCHEMA,
        "generated_at": utc_iso(),
        "inputs": [str(path) for path in inputs],
        "node_count": len(records),
        "database": args.database,
        "max_bytes": args.max_bytes,
        "source_counts": export_db.source_counts(records),
        "mariadb": mariadb_manifest,
        "sqlite": sqlite_manifest,
        "duckdb": duckdb_manifest,
        "parquet": parquet_manifest,
        "json": json_manifest,
        "csv": csv_manifest,
        "xml": xml_manifest,
        "redis": redis_manifest,
        "geo": geo_manifest,
        "map": map_manifest,
        "paths": {
            "dataplane_manifest": "dataplane_manifest.json",
            "manifest": "manifest.json",
            "index": "index.json",
            "latest": "latest.json",
            "mariadb_manifest": "mariadb_manifest.json",
            "sqlite_manifest": "sqlite_manifest.json" if sqlite_manifest else None,
            "duckdb_manifest": "duckdb_manifest.json" if duckdb_manifest else None,
            "parquet_manifest": "parquet_manifest.json" if parquet_manifest else None,
            "json_latest_gz": json_manifest.get("latest_json_gz"),
            "csv_nodes": csv_manifest.get("csv"),
            "xml_nodes": xml_manifest.get("xml"),
            "redis_manifest": "redis/manifest.json",
            "geo_manifest": "geo/manifest.json",
            "map_manifest": "map/manifest.json",
        },
        "policy": {
            "canonical_store": "bitcoin/bitnodes/api/data",
            "database_first": True,
            "repo_rule": "Do not commit crawler fan-out snapshots or thousands of generated JSON files.",
            "public_json_limit_bytes": args.max_bytes,
        },
    }

    latest = {
        "schema": "zzx-bitnodes-api-data-latest-v3",
        "generated_at": manifest["generated_at"],
        "node_count": len(records),
        "source_counts": manifest["source_counts"],
        "active_database": args.database,
        "dataplane_manifest": "dataplane_manifest.json",
        "index": "index.json",
        "mariadb_manifest": "mariadb_manifest.json",
        "sqlite_manifest": "sqlite_manifest.json" if sqlite_manifest else None,
        "duckdb_manifest": "duckdb_manifest.json" if duckdb_manifest else None,
        "parquet_manifest": "parquet_manifest.json" if parquet_manifest else None,
    }

    write_json(out_dir / "dataplane_manifest.json", manifest, args.compact)
    write_json(out_dir / "manifest.json", manifest, args.compact)
    write_json(out_dir / "index.json", manifest, args.compact)
    write_json(out_dir / "latest.json", latest, args.compact)

    print(
        "dataplane complete: "
        f"{len(records)} nodes, "
        f"mariadb_shards={mariadb_manifest.get('shard_count')}, "
        f"sqlite={'yes' if sqlite_manifest else 'no'}, "
        f"duckdb={'yes' if duckdb_manifest else 'no'}, "
        f"parquet={'yes' if parquet_manifest else 'no'}, "
        f"output={out_dir}"
    )

    return manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Canonical ZZX Bitnodes dataplane. Builds MariaDB shards, SQLite, optional DuckDB/Parquet, "
            "Redis rebuild artifacts, compact JSON/CSV/XML, geo indexes, and map acceleration artifacts."
        ),
        allow_abbrev=False,
    )

    parser.add_argument("--input", action="append", default=[])
    parser.add_argument("--output-dir", default=str(DEFAULT_OUT))
    parser.add_argument("--database", default=DEFAULT_DATABASE)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--no-sqlite", action="store_true")
    parser.add_argument("--duckdb", action="store_true")
    parser.add_argument("--parquet", action="store_true")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    run_dataplane(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
