#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
import json
import sqlite3
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree.ElementTree import Element, ElementTree, SubElement

APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"
API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_OUT = API_DIR / "data"
DEFAULT_MAX_BYTES = 24_000_000

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import export_db  # type: ignore

FIELDS = [
    "node_id", "source", "address", "host", "port", "network", "agent", "protocol",
    "services", "height", "city", "country", "territory", "county", "zip_code",
    "timezone", "latitude", "longitude", "asn", "organization", "provider", "w3w",
    "zzxgcs", "geohash", "reachable", "reachable_now", "reachable_24h", "latency_ms",
    "last_seen", "raw_hash",
]


def utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: Any, compact: bool = True) -> None:
    mkdir(path.parent)
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
        )
        + "\n",
        encoding="utf-8",
    )


def gzip_json(path: Path, payload: Any, compact: bool = True) -> int:
    mkdir(path.parent)
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as handle:
        json.dump(
            payload,
            handle,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
        )
        handle.write("\n")
    return path.stat().st_size


def scalar(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value)


def public_row(row: dict[str, Any]) -> dict[str, Any]:
    out = {field: row.get(field) for field in FIELDS}
    if out.get("source") is None:
        out["source"] = row.get("source_name")
    return out


def write_csv(path: Path, rows: list[dict[str, Any]]) -> int:
    mkdir(path.parent)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: scalar(row.get(field)) for field in FIELDS})
    return path.stat().st_size


def safe_tag(value: str) -> str:
    out = "".join(
        ch if ch.isalnum() or ch in {"_", "-"} else "_"
        for ch in value
    ).strip("_") or "field"

    if out[0].isdigit():
        out = "field_" + out

    return out


def write_xml(path: Path, rows: list[dict[str, Any]]) -> int:
    mkdir(path.parent)

    root = Element("bitnodes")
    root.set("schema", "zzx-bitnodes-public-xml-v1")
    root.set("generated_at", utc_iso())
    root.set("count", str(len(rows)))

    for row in rows:
        node = SubElement(root, "node")
        for field in FIELDS:
            child = SubElement(node, safe_tag(field))
            child.text = scalar(row.get(field))

    tree = ElementTree(root)

    try:
        from xml.etree.ElementTree import indent

        indent(tree, space="  ")
    except Exception:
        pass

    tree.write(path, encoding="utf-8", xml_declaration=True)
    return path.stat().st_size


def write_redis_resp(
    path: Path,
    rows: list[dict[str, Any]],
    key_prefix: str = "zzx:bitnodes",
) -> int:
    mkdir(path.parent)

    def resp(parts: list[str]) -> bytes:
        out = [f"*{len(parts)}\r\n".encode()]

        for part in parts:
            data = part.encode("utf-8")
            out.append(f"${len(data)}\r\n".encode())
            out.append(data + b"\r\n")

        return b"".join(out)

    with gzip.open(path, "wb", compresslevel=9) as handle:
        handle.write(
            resp(
                [
                    "DEL",
                    f"{key_prefix}:nodes",
                    f"{key_prefix}:sources",
                    f"{key_prefix}:countries",
                ]
            )
        )

        source_counts = Counter(str(row.get("source") or "unknown") for row in rows)
        country_counts = Counter(str(row.get("country") or "unknown") for row in rows)

        for row in rows:
            addr = str(row.get("address") or row.get("node_id") or "")

            if not addr:
                continue

            key = f"{key_prefix}:node:{addr}"
            fields: list[str] = ["HSET", key]

            for field in FIELDS:
                fields.extend([field, scalar(row.get(field))])

            handle.write(resp(fields))
            handle.write(resp(["SADD", f"{key_prefix}:nodes", addr]))

        for name, count in source_counts.items():
            handle.write(resp(["HSET", f"{key_prefix}:sources", name, str(count)]))

        for name, count in country_counts.items():
            handle.write(resp(["HSET", f"{key_prefix}:countries", name, str(count)]))

    return path.stat().st_size


def write_public_json_bundle(
    out_dir: Path,
    rows: list[dict[str, Any]],
    max_bytes: int,
    compact: bool,
) -> dict[str, Any]:
    public_dir = out_dir / "public"
    json_dir = public_dir / "json"
    csv_dir = public_dir / "csv"
    xml_dir = public_dir / "xml"
    redis_dir = public_dir / "redis"

    for directory in (json_dir, csv_dir, xml_dir, redis_dir):
        mkdir(directory)

    rows = [public_row(row) for row in rows]

    by_source = dict(Counter(str(row.get("source") or "unknown") for row in rows))
    by_network = dict(Counter(str(row.get("network") or "unknown") for row in rows))
    by_country = dict(Counter(str(row.get("country") or "unknown") for row in rows))

    latest = {
        "schema": "zzx-bitnodes-public-latest-v1",
        "generated_at": utc_iso(),
        "node_count": len(rows),
        "source_counts": by_source,
        "network_counts": by_network,
        "country_counts": by_country,
        "nodes": rows,
    }

    latest_gz = json_dir / "latest.json.gz"
    latest_gz_size = gzip_json(latest_gz, latest, compact=compact)

    latest_plain = json_dir / "latest.compact.json"
    write_json(latest_plain, latest, compact=True)

    if latest_plain.stat().st_size > max_bytes:
        latest_plain.unlink()
        latest_plain = json_dir / "latest.summary.json"
        write_json(
            latest_plain,
            {key: value for key, value in latest.items() if key != "nodes"},
            compact=True,
        )

    csv_size = write_csv(csv_dir / "nodes.csv", rows)
    xml_size = write_xml(xml_dir / "nodes.xml", rows)
    redis_size = write_redis_resp(redis_dir / "nodes.redis.resp.gz", rows)

    manifest = {
        "schema": "zzx-bitnodes-dataplane-v1",
        "generated_at": utc_iso(),
        "node_count": len(rows),
        "source_counts": by_source,
        "max_public_json_bytes": max_bytes,
        "artifacts": {
            "json_latest_gz": {
                "path": "public/json/latest.json.gz",
                "bytes": latest_gz_size,
            },
            "json_latest_public": {
                "path": f"public/json/{latest_plain.name}",
                "bytes": latest_plain.stat().st_size,
            },
            "csv_nodes": {
                "path": "public/csv/nodes.csv",
                "bytes": csv_size,
            },
            "xml_nodes": {
                "path": "public/xml/nodes.xml",
                "bytes": xml_size,
            },
            "redis_resp_gz": {
                "path": "public/redis/nodes.redis.resp.gz",
                "bytes": redis_size,
            },
        },
    }

    write_json(public_dir / "manifest.json", manifest, compact=compact)
    return manifest


def copy_manifest_to_subpages(
    out_dir: Path,
    manifest: dict[str, Any],
    compact: bool,
) -> None:
    for rel in (
        "bitcoin/bitnodes/api/data/index.json",
        "bitcoin/bitnodes/api/data/latest.json",
    ):
        path = APP_ROOT / rel
        write_json(path, manifest, compact=compact)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Canonical Bitnodes dataplane: inputs -> MariaDB shards + SQLite DB "
            "+ compact JSON/CSV/XML/Redis artifacts."
        )
    )

    parser.add_argument("--input", action="append", default=[])
    parser.add_argument("--output-dir", default=str(DEFAULT_OUT))
    parser.add_argument("--database", default="zzx_bitnodes")
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--strict", action="store_true")

    args = parser.parse_args()

    inputs = export_db.parse_inputs(args.input)

    if not inputs:
        if args.strict:
            raise SystemExit("dataplane: no input files found")

        print("dataplane: no input files found")
        return 0

    records = export_db.load_records(inputs)

    if not records and args.strict:
        raise SystemExit("dataplane: no node records found")

    out_dir = Path(args.output_dir)

    mariadb_manifest = export_db.export_mariadb_shards(
        records,
        out_dir,
        args.database,
        args.max_bytes,
        args.compact,
    )

    sqlite_manifest = export_db.export_sqlite(records, out_dir)

    public_manifest = write_public_json_bundle(
        out_dir,
        records,
        args.max_bytes,
        args.compact,
    )

    manifest = {
        "schema": "zzx-bitnodes-canonical-dataplane-v1",
        "generated_at": utc_iso(),
        "inputs": [str(path) for path in inputs],
        "node_count": len(records),
        "mariadb": mariadb_manifest,
        "sqlite": sqlite_manifest,
        "public": public_manifest,
        "policy": {
            "canonical_store": "database artifacts under bitcoin/bitnodes/api/data/",
            "repo_rule": (
                "do not commit crawler fan-out snapshots or thousands of "
                "generated JSON files"
            ),
            "public_json_limit_bytes": args.max_bytes,
        },
    }

    write_json(out_dir / "dataplane_manifest.json", manifest, compact=args.compact)
    copy_manifest_to_subpages(out_dir, manifest, compact=args.compact)

    print(f"dataplane complete: {len(records)} nodes -> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
