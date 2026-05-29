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


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return fallback


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


def safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def manifest_total_bytes(manifest: dict[str, Any]) -> int:
    chunks = manifest.get("chunks", [])

    if not isinstance(chunks, list):
        return 0

    return sum(
        safe_int(chunk.get("bytes", 0))
        for chunk in chunks
        if isinstance(chunk, dict)
    )


def manifest_entry(repo_root: Path, manifest_path: Path, date: str | None = None) -> dict[str, Any] | None:
    if not manifest_path.exists():
        return None

    manifest = read_json(manifest_path, fallback={})

    if not isinstance(manifest, dict) or not manifest:
        return None

    chunks = manifest.get("chunks", [])
    chunk_count = len(chunks) if isinstance(chunks, list) else 0

    entry = {
        "path": manifest_path.relative_to(repo_root).as_posix(),
        "directory": manifest_path.parent.relative_to(repo_root).as_posix(),
        "generated_at": manifest.get("generated_at"),
        "node_count": safe_int(manifest.get("node_count", 0)),
        "chunk_count": safe_int(manifest.get("chunk_count", chunk_count)),
        "max_bytes": safe_int(manifest.get("max_bytes", 0)),
        "total_bytes": manifest_total_bytes(manifest),
        "manifest_sha256": sha256_file(manifest_path),
    }

    if date:
        entry["date"] = date

    return entry


def build_daily_entries(repo_root: Path) -> list[dict[str, Any]]:
    registry_dir = repo_root / "registry"
    entries: list[dict[str, Any]] = []

    if not registry_dir.exists():
        return entries

    for day_dir in sorted(registry_dir.iterdir()):
        if not day_dir.is_dir():
            continue

        entry = manifest_entry(repo_root, day_dir / "manifest.json", date=day_dir.name)

        if entry:
            entries.append(entry)

    return entries


def build_latest_entry(repo_root: Path) -> dict[str, Any] | None:
    return manifest_entry(repo_root, repo_root / "latest" / "manifest.json")


def build_stats(entries: list[dict[str, Any]], latest: dict[str, Any] | None) -> dict[str, Any]:
    node_counts = [safe_int(entry.get("node_count", 0)) for entry in entries]
    byte_counts = [safe_int(entry.get("total_bytes", 0)) for entry in entries]
    chunk_counts = [safe_int(entry.get("chunk_count", 0)) for entry in entries]

    latest_node_count = safe_int((latest or {}).get("node_count", 0))
    latest_chunk_count = safe_int((latest or {}).get("chunk_count", 0))
    latest_total_bytes = safe_int((latest or {}).get("total_bytes", 0))

    return {
        "schema": "zzx-bitnodes-global-registry-stats-v2",
        "generated_at": utc_now_iso(),
        "daily_backup_count": len(entries),
        "latest_node_count": latest_node_count,
        "latest_chunk_count": latest_chunk_count,
        "latest_total_bytes": latest_total_bytes,
        "max_daily_node_count": max(node_counts) if node_counts else 0,
        "min_daily_node_count": min(node_counts) if node_counts else 0,
        "avg_daily_node_count": round(sum(node_counts) / len(node_counts), 4) if node_counts else 0,
        "max_daily_chunk_count": max(chunk_counts) if chunk_counts else 0,
        "total_daily_bytes": sum(byte_counts),
        "latest": latest,
    }


def build_health(repo_root: Path, entries: list[dict[str, Any]], latest: dict[str, Any] | None) -> dict[str, Any]:
    registry_dir = repo_root / "registry"
    latest_manifest = repo_root / "latest" / "manifest.json"

    problems = []

    if not registry_dir.exists():
        problems.append("missing_registry_dir")

    if not latest_manifest.exists():
        problems.append("missing_latest_manifest")

    if latest and safe_int(latest.get("node_count", 0)) <= 0:
        problems.append("empty_latest_registry")

    if latest and safe_int(latest.get("chunk_count", 0)) <= 0:
        problems.append("empty_latest_chunks")

    if not entries:
        problems.append("no_daily_backups")

    status = "ok" if not problems else "warning"

    if "missing_latest_manifest" in problems or "missing_registry_dir" in problems:
        status = "error"

    return {
        "schema": "zzx-bitnodes-global-registry-health-v2",
        "generated_at": utc_now_iso(),
        "status": status,
        "problems": problems,
        "registry_dir_exists": registry_dir.exists(),
        "latest_manifest_exists": latest_manifest.exists(),
        "daily_backup_count": len(entries),
        "latest_node_count": safe_int((latest or {}).get("node_count", 0)),
        "latest_chunk_count": safe_int((latest or {}).get("chunk_count", 0)),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build manifest indexes for the ZZX Bitnodes Global Registry repository."
    )

    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--output-dir", default="manifests")

    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    manifests_dir = repo_root / args.output_dir

    entries = build_daily_entries(repo_root)
    latest = build_latest_entry(repo_root)

    daily_index = {
        "schema": "zzx-bitnodes-global-registry-daily-index-v2",
        "generated_at": utc_now_iso(),
        "entry_count": len(entries),
        "entries": entries,
    }

    latest_index = {
        "schema": "zzx-bitnodes-global-registry-latest-index-v2",
        "generated_at": utc_now_iso(),
        "latest": latest,
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
