#!/usr/bin/env python3
from __future__ import annotations

import gzip
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Mapping

SCHEMA = "zzx-bitnodes-history-v3"
SNAPSHOT_SCHEMA = "zzx-bitnodes-history-snapshot-v2"
DEFAULT_MAX_SHARD_BYTES = 24_000_000
DEFAULT_NODES_PER_SHARD = 5000
DEFAULT_FULL_SNAPSHOT_INTERVAL_SECONDS = 900


def _mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def _write_gzip_json(path: Path, payload: Any) -> None:
    _mkdir(path.parent)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp"
    try:
        with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=6) as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str)
            f.write("\n")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def _write_gzip_ndjson(path: Path, rows: list[dict[str, Any]]) -> None:
    _mkdir(path.parent)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp"
    try:
        with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=6) as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str))
                f.write("\n")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def _atomic_json(path: Path, payload: Any) -> None:
    _mkdir(path.parent)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp"
    try:
        tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str) + "\n", encoding="utf-8")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def _descriptor(path: Path, root: Path, **extra: Any) -> dict[str, Any]:
    return {"path": path.relative_to(root).as_posix(), "bytes": path.stat().st_size, "sha256": _sha256(path), **extra}


def _write_node_shards(*, root: Path, snapshot_dir: Path, cycle_id: str, source: str, timestamp: int,
                       nodes: Mapping[str, Any], max_shard_bytes: int, initial_nodes_per_shard: int) -> list[dict[str, Any]]:
    items = list(nodes.items())
    shards: list[dict[str, Any]] = []
    offset = 0
    shard_no = 0
    target = max(1, int(initial_nodes_per_shard))
    while offset < len(items):
        size = min(target, len(items) - offset)
        while True:
            chunk = dict(items[offset:offset + size])
            path = snapshot_dir / f"nodes-{shard_no:05d}.json.gz"
            _write_gzip_json(path, {"schema": "zzx-bitnodes-history-node-shard-v2", "cycle_id": cycle_id,
                                    "source": source, "timestamp": timestamp, "offset": offset, "nodes": chunk})
            if path.stat().st_size <= max_shard_bytes:
                break
            path.unlink(missing_ok=True)
            if size <= 1:
                raise RuntimeError(f"single-node history shard exceeds {max_shard_bytes} bytes at offset {offset}")
            size = max(1, size // 2)
        shards.append(_descriptor(path, root, rows=size, offset=offset))
        offset += size
        shard_no += 1
        target = size
    return shards


def _latest_pointer_path(root: Path, source: str) -> Path:
    return root / source / "latest-full-snapshot.json"


def _read_latest_pointer(root: Path, source: str) -> dict[str, Any]:
    path = _latest_pointer_path(root, source)
    if not path.is_file():
        return {}
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
        return obj if isinstance(obj, dict) else {}
    except Exception:
        return {}


def record_cycle(root: Path, *, source: str, timestamp: int, payload: Mapping[str, Any],
                 successes: Mapping[str, Any], failures: Mapping[str, Any] | list[str], changes: Mapping[str, Any],
                 max_shard_bytes: int = DEFAULT_MAX_SHARD_BYTES,
                 nodes_per_shard: int = DEFAULT_NODES_PER_SHARD,
                 full_snapshot_interval_seconds: int = DEFAULT_FULL_SNAPSHOT_INTERVAL_SECONDS) -> dict[str, Any]:
    """Persist an immutable observation cycle plus periodic full-state baselines.

    Every probe cycle is losslessly archived as observations + change metadata.
    A complete all-known-node snapshot is emitted at a bounded interval (default
    15 minutes). This keeps history reconstructable without duplicating the full
    global state every few seconds forever.
    """
    root = Path(root)
    ts = int(timestamp or time.time())
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(ts))
    nonce = f"{time.time_ns() % 1_000_000_000:09d}"
    cycle_id = f"{stamp}-{nonce}"
    day = time.strftime("%Y/%m/%d", time.gmtime(ts))
    base = root / source / day
    observed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))
    nodes_obj = payload.get("nodes")
    nodes: Mapping[str, Any] = nodes_obj if isinstance(nodes_obj, Mapping) else {}

    rows: list[dict[str, Any]] = []
    for address, raw in successes.items():
        rows.append({"schema": "zzx-bitnodes-observation-v2", "cycle_id": cycle_id, "observed_at": observed_at,
                     "timestamp": ts, "source": source, "address": address, "reachable": True, "raw": raw})
    failure_items = failures.items() if isinstance(failures, Mapping) else ((address, None) for address in failures)
    for address, raw_failure in failure_items:
        rows.append({"schema": "zzx-bitnodes-observation-v2", "cycle_id": cycle_id, "observed_at": observed_at,
                     "timestamp": ts, "source": source, "address": address, "reachable": False, "raw": raw_failure})

    observations_path = base / "observations" / f"{cycle_id}.ndjson.gz"
    changes_path = base / "changes" / f"{cycle_id}.json.gz"
    _write_gzip_ndjson(observations_path, rows)
    _write_gzip_json(changes_path, dict(changes))

    pointer = _read_latest_pointer(root, source)
    last_full_ts = int(pointer.get("timestamp") or 0)
    interval = max(0, int(full_snapshot_interval_seconds))
    write_full = not pointer or interval == 0 or ts - last_full_ts >= interval
    snapshot_manifest_path: Path | None = None

    if write_full:
        snapshot_dir = base / "snapshots" / cycle_id
        metadata = dict(payload)
        metadata.pop("nodes", None)
        metadata.update({"history_schema": SCHEMA, "snapshot_schema": SNAPSHOT_SCHEMA,
                         "history_cycle_id": cycle_id, "node_count": len(nodes)})
        metadata_path = snapshot_dir / "metadata.json.gz"
        _write_gzip_json(metadata_path, metadata)
        node_shards = _write_node_shards(root=root, snapshot_dir=snapshot_dir, cycle_id=cycle_id, source=source,
                                         timestamp=ts, nodes=nodes, max_shard_bytes=max_shard_bytes,
                                         initial_nodes_per_shard=nodes_per_shard)
        snapshot_manifest = {"schema": SNAPSHOT_SCHEMA, "cycle_id": cycle_id, "source": source, "timestamp": ts,
                             "generated_at": observed_at, "node_count": len(nodes),
                             "max_shard_bytes": int(max_shard_bytes), "metadata": _descriptor(metadata_path, root),
                             "node_shards": node_shards}
        snapshot_manifest_path = snapshot_dir / "manifest.json"
        _atomic_json(snapshot_manifest_path, snapshot_manifest)
        pointer = {"schema": "zzx-bitnodes-latest-full-snapshot-v1", "cycle_id": cycle_id, "timestamp": ts,
                   "generated_at": observed_at, "manifest": snapshot_manifest_path.relative_to(root).as_posix(),
                   "node_count": len(nodes)}
        _atomic_json(_latest_pointer_path(root, source), pointer)

    baseline = str(pointer.get("manifest") or "")
    files: dict[str, Any] = {
        "observations": _descriptor(observations_path, root, rows=len(rows)),
        "changes": _descriptor(changes_path, root),
    }
    if snapshot_manifest_path is not None:
        files["snapshot_manifest"] = _descriptor(snapshot_manifest_path, root)

    manifest = {"schema": SCHEMA, "cycle_id": cycle_id, "source": source, "timestamp": ts,
                "observed_at": observed_at, "nodes": len(nodes), "successes": len(successes),
                "failures": len(failures), "full_snapshot": bool(write_full),
                "baseline_snapshot_manifest": baseline, "files": files}
    _atomic_json(base / "manifests" / f"{cycle_id}.json", manifest)
    return manifest
