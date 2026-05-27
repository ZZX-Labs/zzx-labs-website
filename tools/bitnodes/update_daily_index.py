#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            ensure_ascii=False,
            indent=2,
            sort_keys=True
        )
        handle.write("\n")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


def manifest_total_bytes(manifest: dict[str, Any]) -> int:
    chunks = manifest.get("chunks", [])

    if not isinstance(chunks, list):
        return 0

    total = 0

    for chunk in chunks:
        if not isinstance(chunk, dict):
            continue

        try:
            total += int(chunk.get("bytes", 0) or 0)
        except (TypeError, ValueError):
            continue

    return total


def safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def build_daily_entries(repo_root: Path) -> list[dict[str, Any]]:
    registry_dir = repo_root / "registry"
    entries: list[dict[str, Any]] = []

    if not registry_dir.exists():
        return entries

    for day_dir in sorted(registry_dir.iterdir()):
        if not day_dir.is_dir():
            continue

        manifest_path = day_dir / "manifest.json"

        if not manifest_path.exists():
            continue

        try:
            manifest = read_json(manifest_path)
        except Exception:
            continue

        chunks = manifest.get("chunks", [])
        chunk_count = len(chunks) if isinstance(chunks, list) else 0

        entries.append({
            "date": day_dir.name,
            "path": manifest_path.relative_to(repo_root).as_posix(),
            "directory": day_dir.relative_to(repo_root).as_posix(),
            "generated_at": manifest.get("generated_at"),
            "node_count": safe_int(manifest.get("node_count", 0)),
            "chunk_count": safe_int(manifest.get("chunk_count", chunk_count)),
            "max_bytes": safe_int(manifest.get("max_bytes", 0)),
            "total_bytes": manifest_total_bytes(manifest),
            "manifest_sha256": sha256_file(manifest_path)
        })

    return entries


def build_latest_entry(repo_root: Path) -> dict[str, Any] | None:
    manifest_path = repo_root / "latest" / "manifest.json"

    if not manifest_path.exists():
        return None

    try:
        manifest = read_json(manifest_path)
    except Exception:
        return None

    chunks = manifest.get("chunks", [])
    chunk_count = len(chunks) if isinstance(chunks, list) else 0

    return {
        "path": manifest_path.relative_to(repo_root).as_posix(),
        "directory": "latest",
        "generated_at": manifest.get("generated_at"),
        "node_count": safe_int(manifest.get("node_count", 0)),
        "chunk_count": safe_int(manifest.get("chunk_count", chunk_count)),
        "max_bytes": safe_int(manifest.get("max_bytes", 0)),
        "total_bytes": manifest_total_bytes(manifest),
        "manifest_sha256": sha256_file(manifest_path)
    }


def build_stats(entries: list[dict[str, Any]], latest: dict[str, Any] | None) -> dict[str, Any]:
    node_counts = [
        safe_int(entry.get("node_count", 0))
        for entry in entries
    ]

    total_bytes = [
        safe_int(entry.get("total_bytes", 0))
        for entry in entries
    ]

    return {
        "schema": "zzx-bitnodes-global-registry-stats-v1",
        "generated_at": utc_now_iso(),
        "daily_backup_count": len(entries),
        "latest_node_count": safe_int((latest or {}).get("node_count", 0)),
        "latest_chunk_count": safe_int((latest or {}).get("chunk_count", 0)),
        "max_daily_node_count": max(node_counts) if node_counts else 0,
        "min_daily_node_count": min(node_counts) if node_counts else 0,
        "total_daily_bytes": sum(total_bytes),
        "latest": latest
    }


def build_health(
    repo_root: Path,
    entries: list[dict[str, Any]],
    latest: dict[str, Any] | None
) -> dict[str, Any]:
    registry_dir = repo_root / "registry"
    latest_manifest = repo_root / "latest" / "manifest.json"

    status = "ok"

    if not registry_dir.exists():
        status = "missing_registry_dir"

    if not latest_manifest.exists():
        status = "missing_latest_manifest"

    if latest and safe_int(latest.get("node_count", 0)) <= 0:
        status = "empty_latest_registry"

    return {
        "schema": "zzx-bitnodes-global-registry-health-v1",
        "generated_at": utc_now_iso(),
        "status": status,
        "registry_dir_exists": registry_dir.exists(),
        "latest_manifest_exists": latest_manifest.exists(),
        "daily_backup_count": len(entries),
        "latest_node_count": safe_int((latest or {}).get("node_count", 0)),
        "latest_chunk_count": safe_int((latest or {}).get("chunk_count", 0))
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build manifest indexes for private ZZX Bitnodes registry repo."
    )

    parser.add_argument(
        "--repo-root",
        default=".",
        help="Private registry repo root."
    )

    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    manifests_dir = repo_root / "manifests"

    entries = build_daily_entries(repo_root)
    latest = build_latest_entry(repo_root)

    daily_index = {
        "schema": "zzx-bitnodes-global-registry-daily-index-v1",
        "generated_at": utc_now_iso(),
        "entry_count": len(entries),
        "entries": entries
    }

    latest_index = {
        "schema": "zzx-bitnodes-global-registry-latest-index-v1",
        "generated_at": utc_now_iso(),
        "latest": latest
    }

    stats = build_stats(entries, latest)
    health = build_health(repo_root, entries, latest)

    write_json(manifests_dir / "daily-index.json", daily_index)
    write_json(manifests_dir / "latest.json", latest_index)
    write_json(manifests_dir / "stats.json", stats)
    write_json(manifests_dir / "registry-health.json", health)

    print(f"daily index written: {manifests_dir / 'daily-index.json'}")
    print(f"latest index written: {manifests_dir / 'latest.json'}")
    print(f"stats written: {manifests_dir / 'stats.json'}")
    print(f"health written: {manifests_dir / 'registry-health.json'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
