#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any


def read_json(path: Path) -> Any:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str) + "\n", encoding="utf-8")
    tmp.replace(path)


def resolve_path(manifest_path: Path, recorded: str) -> Path:
    # In latest-state copies, descriptors still contain their original archive
    # path. Prefer a same-directory basename copy, then the recorded relative
    # path beneath the nearest archive root if present.
    local = manifest_path.parent / Path(recorded).name
    if local.exists():
        return local
    for parent in [manifest_path.parent, *manifest_path.parents]:
        candidate = parent / recorded
        if candidate.exists():
            return candidate
    raise FileNotFoundError(recorded)


def main() -> int:
    ap = argparse.ArgumentParser(description="Restore durable ZZX Bitnodes state from a private sharded full-history snapshot.")
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--state-dir", required=True)
    args = ap.parse_args()

    manifest_path = Path(args.manifest)
    state_dir = Path(args.state_dir)
    manifest = read_json(manifest_path)
    if not isinstance(manifest, dict) or manifest.get("schema") != "zzx-bitnodes-history-snapshot-v2":
        raise SystemExit("private state manifest has an unsupported schema")

    nodes: dict[str, Any] = {}
    for entry in manifest.get("node_shards") or []:
        if not isinstance(entry, dict) or not entry.get("path"):
            raise SystemExit("invalid private state shard descriptor")
        path = resolve_path(manifest_path, str(entry["path"]))
        if entry.get("sha256") and sha256(path) != entry["sha256"]:
            raise SystemExit(f"private state shard hash mismatch: {path}")
        payload = read_json(path)
        shard_nodes = payload.get("nodes") if isinstance(payload, dict) else None
        if not isinstance(shard_nodes, dict):
            raise SystemExit(f"private state shard contains no node mapping: {path}")
        nodes.update(shard_nodes)

    expected = int(manifest.get("node_count") or 0)
    if expected <= 0 or len(nodes) != expected:
        raise SystemExit(f"private state node count mismatch: expected={expected} restored={len(nodes)}")

    meta = {
        "schema": "zzx-bitnodes-restored-private-state-v2",
        "source": manifest.get("source") or "zzxbitnodes",
        "restored_from": str(manifest_path),
        "node_count": len(nodes),
        "snapshot_timestamp": manifest.get("timestamp"),
        "snapshot_generated_at": manifest.get("generated_at"),
    }
    queue = sorted(str(address) for address in nodes if str(address).strip())
    write_json(state_dir / "nodes.json", nodes)
    write_json(state_dir / "queue.json", queue)
    write_json(state_dir / "meta.json", meta)
    print(f"restored private Bitnodes state: nodes={len(nodes)} manifest={manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
