#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import shutil
import time
from pathlib import Path
from typing import Any, Iterable, Mapping

PUBLIC_AGGREGATE_SCHEMA = "zzx-bitnodes-public-aggregate-v1"
IPDB_MANIFEST_SCHEMA = "zzx-bitnodes-ipdb-public-manifest-v1"
IPDB_SHARD_SCHEMA = "zzx-bitnodes-ipdb-public-shard-v1"
IPDB_LATEST_SCHEMA = "zzx-bitnodes-ipdb-public-latest-v1"

AGGREGATE_KEYS = (
    "source",
    "sources",
    "source_counts",
    "source_meta",
    "reachable_nodes",
    "reachable",
    "reachable_now",
    "reachable_24h",
    "total_nodes",
    "total",
    "node_count",
    "known_nodes",
    "known",
    "stale_nodes",
    "latest_height",
    "height",
    "block_height",
    "updated_at",
    "updated_ms",
    "timestamp",
    "counts",
    "top",
    "by_network",
    "by_version",
    "by_nation",
    "by_city",
    "by_county",
    "geolocation",
    "geo_summary",
)


def compact_json_bytes(payload: Any) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def node_count(payload: Mapping[str, Any]) -> int:
    raw = payload.get("nodes")
    if isinstance(raw, (list, dict)):
        return len(raw)
    for key in ("node_count", "reachable_nodes", "reachable", "known_nodes", "known"):
        try:
            value = int(payload.get(key))
        except (TypeError, ValueError):
            continue
        if value >= 0:
            return value
    return 0


def compact_aggregate(
    source: Path,
    output: Path,
    *,
    canonical_url: str,
    max_bytes: int,
) -> dict[str, Any]:
    payload = read_json(source)
    if not isinstance(payload, Mapping):
        raise RuntimeError(f"aggregate input must be an object: {source}")

    summary: dict[str, Any] = {
        "schema": PUBLIC_AGGREGATE_SCHEMA,
        "source_schema": payload.get("schema"),
        "generated_at": int(time.time()),
        "nodes_omitted": True,
        "node_count": node_count(payload),
        "canonical_nodes": canonical_url,
        "publication_policy": "summary-only duplicate; full normalized nodes live in canonical_nodes",
    }

    for key in AGGREGATE_KEYS:
        if key == "node_count":
            continue
        value = payload.get(key)
        if value not in (None, "", [], {}):
            summary[key] = value

    # Metadata is useful, but legacy aggregate metadata can accidentally embed
    # raw node collections. Keep only scalar/small structural metadata.
    metadata = payload.get("metadata")
    if isinstance(metadata, Mapping):
        safe_meta: dict[str, Any] = {}
        for key, value in metadata.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                safe_meta[str(key)] = value
            elif isinstance(value, list) and len(value) <= 128:
                safe_meta[str(key)] = value
            elif isinstance(value, Mapping) and len(value) <= 128:
                encoded = compact_json_bytes(value)
                if len(encoded) <= 256_000:
                    safe_meta[str(key)] = value
        if safe_meta:
            summary["metadata"] = safe_meta

    data = compact_json_bytes(summary)
    if len(data) > max_bytes:
        raise RuntimeError(
            f"public aggregate summary remains too large: {len(data)} > {max_bytes}: {output}"
        )
    atomic_write(output, data)
    return {
        "schema": PUBLIC_AGGREGATE_SCHEMA,
        "output": str(output),
        "bytes": len(data),
        "node_count": summary["node_count"],
    }


def nodes_container(payload: Mapping[str, Any]) -> tuple[str, list[Any]]:
    raw = payload.get("nodes")
    if isinstance(raw, list):
        return "list", list(raw)
    if isinstance(raw, dict):
        return "dict", list(raw.items())
    raise RuntimeError("IPDB latest payload contains no list/dict nodes collection")


def make_shard_payload(
    payload: Mapping[str, Any],
    mode: str,
    chunk: list[Any],
    index: int,
) -> dict[str, Any]:
    nodes: Any
    if mode == "dict":
        nodes = {str(key): value for key, value in chunk}
    else:
        nodes = chunk
    return {
        "schema": IPDB_SHARD_SCHEMA,
        "source_schema": payload.get("schema"),
        "source": payload.get("source"),
        "updated_at": payload.get("updated_at"),
        "updated_ms": payload.get("updated_ms"),
        "shard_index": index,
        "node_count": len(chunk),
        "nodes": nodes,
    }


def gzip_bytes(data: bytes, level: int) -> bytes:
    # mtime=0 makes shard bytes stable for identical input.
    return gzip.compress(data, compresslevel=level, mtime=0)


def split_to_fit(
    payload: Mapping[str, Any],
    mode: str,
    chunk: list[Any],
    *,
    start_index: int,
    max_bytes: int,
    gzip_level: int,
) -> list[tuple[dict[str, Any], bytes]]:
    candidate = make_shard_payload(payload, mode, chunk, start_index)
    compressed = gzip_bytes(compact_json_bytes(candidate), gzip_level)
    if len(compressed) <= max_bytes:
        return [(candidate, compressed)]
    if len(chunk) <= 1:
        raise RuntimeError(
            f"single IPDB row cannot fit public gzip limit: {len(compressed)} > {max_bytes}"
        )
    mid = len(chunk) // 2
    left = split_to_fit(
        payload,
        mode,
        chunk[:mid],
        start_index=start_index,
        max_bytes=max_bytes,
        gzip_level=gzip_level,
    )
    right = split_to_fit(
        payload,
        mode,
        chunk[mid:],
        start_index=start_index + len(left),
        max_bytes=max_bytes,
        gzip_level=gzip_level,
    )
    return left + right


def shard_ipdb(
    source: Path,
    shard_dir: Path,
    manifest_path: Path,
    *,
    max_bytes: int,
    rows_per_shard: int,
    gzip_level: int,
    pointer_path: Path | None = None,
    write_pointer: bool = True,
) -> dict[str, Any]:
    payload = read_json(source)
    if not isinstance(payload, Mapping):
        raise RuntimeError(f"IPDB input must be an object: {source}")
    if payload.get("schema") == IPDB_LATEST_SCHEMA:
        raise RuntimeError(
            "IPDB source is already the bounded latest-pointer contract; "
            "pass the node-bearing IPDB snapshot via --ipdb-source"
        )

    mode, rows = nodes_container(payload)
    if not rows:
        raise RuntimeError("IPDB input has zero node rows")

    if shard_dir.exists():
        shutil.rmtree(shard_dir)
    shard_dir.mkdir(parents=True, exist_ok=True)

    rows_per_shard = max(1, int(rows_per_shard))
    gzip_level = max(1, min(9, int(gzip_level)))
    max_bytes = max(1024, int(max_bytes))

    pieces: list[tuple[dict[str, Any], bytes]] = []
    for offset in range(0, len(rows), rows_per_shard):
        chunk = rows[offset : offset + rows_per_shard]
        pieces.extend(
            split_to_fit(
                payload,
                mode,
                chunk,
                start_index=len(pieces),
                max_bytes=max_bytes,
                gzip_level=gzip_level,
            )
        )

    manifest_shards: list[dict[str, Any]] = []
    total_rows = 0
    for index, (shard_payload, compressed) in enumerate(pieces):
        # Reindex after any recursive splits.
        shard_payload["shard_index"] = index
        compressed = gzip_bytes(compact_json_bytes(shard_payload), gzip_level)
        if len(compressed) > max_bytes:
            raise RuntimeError(
                f"IPDB gzip shard exceeds public limit after finalization: {len(compressed)} > {max_bytes}"
            )
        name = f"ip_db-{index:05d}.json.gz"
        path = shard_dir / name
        path.write_bytes(compressed)
        digest = hashlib.sha256(compressed).hexdigest()
        count = int(shard_payload["node_count"])
        total_rows += count
        manifest_shards.append(
            {
                "index": index,
                "path": f"shards/{name}",
                "node_count": count,
                "bytes": len(compressed),
                "sha256": digest,
            }
        )

    if total_rows != len(rows):
        raise RuntimeError(f"IPDB shard row mismatch: {total_rows} != {len(rows)}")

    manifest = {
        "schema": IPDB_MANIFEST_SCHEMA,
        "source_schema": payload.get("schema"),
        "source": payload.get("source"),
        "generated_at": int(time.time()),
        "node_count": len(rows),
        "storage": "gzip-json-shards",
        "max_shard_bytes": max_bytes,
        "rows_per_shard_target": rows_per_shard,
        "gzip_level": gzip_level,
        "shard_count": len(manifest_shards),
        "shards": manifest_shards,
    }
    data = compact_json_bytes(manifest)
    if len(data) > max_bytes:
        raise RuntimeError(f"IPDB public manifest exceeds public limit: {len(data)} > {max_bytes}")
    atomic_write(manifest_path, data)

    pointer_written = False
    pointer_target = pointer_path if pointer_path is not None else source
    if write_pointer:
        latest_stub = {
            "schema": IPDB_LATEST_SCHEMA,
            "source_schema": payload.get("schema"),
            "source": payload.get("source"),
            "generated_at": int(time.time()),
            "node_count": len(rows),
            "storage": "gzip-json-shards",
            "manifest": manifest_path.name,
            "shard_count": len(manifest_shards),
        }
        stub_data = compact_json_bytes(latest_stub)
        if len(stub_data) > max_bytes:
            raise RuntimeError(f"IPDB latest pointer exceeds public limit: {len(stub_data)} > {max_bytes}")
        atomic_write(pointer_target, stub_data)
        pointer_written = True

    return {
        "schema": IPDB_MANIFEST_SCHEMA,
        "source": str(source),
        "manifest": str(manifest_path),
        "latest_pointer": str(pointer_target),
        "node_count": len(rows),
        "shard_count": len(manifest_shards),
        "largest_shard_bytes": max(item["bytes"] for item in manifest_shards),
        "latest_replaced_with_pointer": pointer_written and pointer_target == source,
        "latest_pointer_written": pointer_written,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build bounded public Bitnodes aggregate/IPDB contracts.")
    parser.add_argument("--aggregate", required=True)
    parser.add_argument("--canonical-url", default="/bitcoin/bitnodes/api/snapshots/latest.json")
    parser.add_argument(
        "--ipdb-source",
        default="",
        help="Node-bearing IPDB snapshot to shard. Defaults to --ipdb-latest for backward compatibility.",
    )
    parser.add_argument(
        "--ipdb-latest",
        required=True,
        help="Bounded latest-pointer contract written after sharding.",
    )
    parser.add_argument("--ipdb-shard-dir", required=True)
    parser.add_argument("--ipdb-manifest", required=True)
    parser.add_argument("--max-bytes", type=int, default=24_000_000)
    parser.add_argument("--rows-per-shard", type=int, default=5_000)
    parser.add_argument("--gzip-level", type=int, default=6)
    parser.add_argument("--keep-ipdb-latest", action="store_true")
    parser.add_argument("--report", default="")
    args = parser.parse_args()

    started = time.monotonic()
    aggregate_report = compact_aggregate(
        Path(args.aggregate),
        Path(args.aggregate),
        canonical_url=args.canonical_url,
        max_bytes=args.max_bytes,
    )
    ipdb_source = Path(args.ipdb_source) if args.ipdb_source else Path(args.ipdb_latest)
    ipdb_latest = Path(args.ipdb_latest)
    if ipdb_source.resolve() == ipdb_latest.resolve() and not args.keep_ipdb_latest:
        # Backward-compatible mode: consume a node-bearing latest and replace it
        # with the public pointer. Production should use --ipdb-source explicitly.
        pointer_path = ipdb_latest
    else:
        pointer_path = ipdb_latest

    ipdb_report = shard_ipdb(
        ipdb_source,
        Path(args.ipdb_shard_dir),
        Path(args.ipdb_manifest),
        max_bytes=args.max_bytes,
        rows_per_shard=args.rows_per_shard,
        gzip_level=args.gzip_level,
        pointer_path=pointer_path,
        write_pointer=not args.keep_ipdb_latest,
    )
    report = {
        "schema": "zzx-bitnodes-public-artifacts-report-v1",
        "generated_at": int(time.time()),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "aggregate": aggregate_report,
        "ipdb": ipdb_report,
    }
    if args.report:
        atomic_write(Path(args.report), compact_json_bytes(report))
    print(json.dumps(report, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
