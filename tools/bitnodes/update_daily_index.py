#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "zzx-bitnodes-daily-index-v3"

APP_ROOT = Path(__file__).resolve().parents[2]
BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))
BITNODES_API = BITNODES_ROOT / "api"
BITNODES_DATA = BITNODES_ROOT / "data"

DEFAULT_REPO_ROOT = BITNODES_API / "data"
DEFAULT_OUTPUT_DIR = "manifests"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(
        payload,
        ensure_ascii=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
        sort_keys=not compact,
    )
    path.write_text(text + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


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


def file_entry(root: Path, path: Path) -> dict[str, Any]:
    return {
        "path": rel(root, path),
        "filename": path.name,
        "directory": rel(root, path.parent),
        "size_bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "modified_at": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).replace(microsecond=0).isoformat(),
    }


def manifest_total_bytes(manifest: dict[str, Any]) -> int:
    chunks = manifest.get("chunks", [])
    shards = manifest.get("shards", [])

    total = 0

    if isinstance(chunks, list):
        total += sum(
            safe_int(chunk.get("bytes", chunk.get("size_bytes", 0)))
            for chunk in chunks
            if isinstance(chunk, dict)
        )

    if isinstance(shards, list):
        total += sum(
            safe_int(shard.get("bytes", shard.get("size_bytes", 0)))
            for shard in shards
            if isinstance(shard, dict)
        )

    return total


def manifest_entry(repo_root: Path, manifest_path: Path, date: str | None = None) -> dict[str, Any] | None:
    if not manifest_path.exists():
        return None

    manifest = read_json(manifest_path, fallback={})

    if not isinstance(manifest, dict) or not manifest:
        return None

    chunks = manifest.get("chunks", [])
    shards = manifest.get("shards", [])

    chunk_count = len(chunks) if isinstance(chunks, list) else 0
    shard_count = len(shards) if isinstance(shards, list) else 0

    entry = {
        "type": "manifest",
        "path": rel(repo_root, manifest_path),
        "directory": rel(repo_root, manifest_path.parent),
        "generated_at": manifest.get("generated_at"),
        "schema": manifest.get("schema"),
        "node_count": safe_int(manifest.get("node_count", 0)),
        "record_count": safe_int(manifest.get("record_count", 0)),
        "chunk_count": safe_int(manifest.get("chunk_count", chunk_count)),
        "shard_count": safe_int(manifest.get("shard_count", shard_count)),
        "max_bytes": safe_int(manifest.get("max_bytes", 0)),
        "total_bytes": manifest_total_bytes(manifest),
        "manifest_sha256": sha256_file(manifest_path),
    }

    if date:
        entry["date"] = date

    return entry


def build_legacy_registry_daily_entries(repo_root: Path) -> list[dict[str, Any]]:
    registry_dir = repo_root / "registry"
    entries: list[dict[str, Any]] = []

    if not registry_dir.exists():
        return entries

    for day_dir in sorted(registry_dir.iterdir()):
        if not day_dir.is_dir():
            continue

        entry = manifest_entry(repo_root, day_dir / "manifest.json", date=day_dir.name)

        if entry:
            entry["kind"] = "legacy_registry_daily"
            entries.append(entry)

    return entries


def build_legacy_latest_entry(repo_root: Path) -> dict[str, Any] | None:
    entry = manifest_entry(repo_root, repo_root / "latest" / "manifest.json")
    if entry:
        entry["kind"] = "legacy_registry_latest"
    return entry


def build_mariadb_entries(repo_root: Path) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    mariadb_dir = repo_root / "mariadb"

    if not mariadb_dir.exists():
        return output

    for path in sorted(mariadb_dir.glob("*.sql.gz")):
        entry = file_entry(repo_root, path)
        entry["kind"] = "mariadb_sql_gzip_shard"

        if "control" in path.name:
            entry["role"] = "control"
        else:
            entry["role"] = "data"

        output.append(entry)

    return output


def build_mariadb_manifest_entry(repo_root: Path) -> dict[str, Any] | None:
    for name in ("mariadb_manifest.json", "index.json"):
        path = repo_root / name
        if path.exists():
            entry = manifest_entry(repo_root, path)
            if entry:
                entry["kind"] = "mariadb_manifest"
                return entry
    return None


def build_snapshot_entries(repo_root: Path) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []

    candidates = [
        BITNODES_DATA / "snapshots",
        repo_root / "snapshots",
    ]

    for snapshots_root in candidates:
        if not snapshots_root.exists():
            continue

        for path in sorted(snapshots_root.rglob("*")):
            if not path.is_file():
                continue

            if path.suffix not in {".json", ".gz"} and not path.name.endswith(".sql.gz"):
                continue

            entry = file_entry(repo_root if repo_root in path.parents else snapshots_root, path)
            entry["kind"] = "snapshot"
            entry["bucket"] = path.parent.name
            entries.append(entry)

    return entries


def build_api_latest_entries(repo_root: Path) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []

    for path in sorted((BITNODES_API).rglob("latest.json")):
        if not path.is_file():
            continue

        entry = file_entry(BITNODES_API, path)
        entry["kind"] = "api_latest_json"
        entries.append(entry)

    return entries


def build_stats(
    *,
    legacy_daily: list[dict[str, Any]],
    legacy_latest: dict[str, Any] | None,
    mariadb_manifest: dict[str, Any] | None,
    mariadb_files: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
    api_latest: list[dict[str, Any]],
) -> dict[str, Any]:
    daily_node_counts = [safe_int(entry.get("node_count", 0)) for entry in legacy_daily]
    daily_byte_counts = [safe_int(entry.get("total_bytes", 0)) for entry in legacy_daily]
    daily_chunk_counts = [safe_int(entry.get("chunk_count", 0)) for entry in legacy_daily]

    mariadb_total_bytes = sum(safe_int(entry.get("size_bytes", 0)) for entry in mariadb_files)
    snapshot_total_bytes = sum(safe_int(entry.get("size_bytes", 0)) for entry in snapshots)

    return {
        "schema": "zzx-bitnodes-daily-index-stats-v3",
        "generated_at": utc_now_iso(),
        "legacy_daily_backup_count": len(legacy_daily),
        "legacy_latest_node_count": safe_int((legacy_latest or {}).get("node_count", 0)),
        "legacy_latest_chunk_count": safe_int((legacy_latest or {}).get("chunk_count", 0)),
        "legacy_latest_total_bytes": safe_int((legacy_latest or {}).get("total_bytes", 0)),
        "max_daily_node_count": max(daily_node_counts) if daily_node_counts else 0,
        "min_daily_node_count": min(daily_node_counts) if daily_node_counts else 0,
        "avg_daily_node_count": round(sum(daily_node_counts) / len(daily_node_counts), 4) if daily_node_counts else 0,
        "max_daily_chunk_count": max(daily_chunk_counts) if daily_chunk_counts else 0,
        "total_daily_bytes": sum(daily_byte_counts),
        "mariadb_file_count": len(mariadb_files),
        "mariadb_total_bytes": mariadb_total_bytes,
        "mariadb_manifest": mariadb_manifest,
        "snapshot_file_count": len(snapshots),
        "snapshot_total_bytes": snapshot_total_bytes,
        "api_latest_file_count": len(api_latest),
    }


def build_health(
    *,
    repo_root: Path,
    legacy_daily: list[dict[str, Any]],
    legacy_latest: dict[str, Any] | None,
    mariadb_manifest: dict[str, Any] | None,
    mariadb_files: list[dict[str, Any]],
    api_latest: list[dict[str, Any]],
) -> dict[str, Any]:
    problems: list[str] = []

    if not repo_root.exists():
        problems.append("missing_repo_root")

    if not legacy_daily and not mariadb_files:
        problems.append("no_daily_or_mariadb_backups")

    if mariadb_manifest and not mariadb_files:
        problems.append("mariadb_manifest_without_shards")

    if mariadb_files and not mariadb_manifest:
        problems.append("mariadb_shards_without_manifest")

    if not api_latest:
        problems.append("no_api_latest_files")

    if legacy_latest and safe_int(legacy_latest.get("node_count", 0)) <= 0:
        problems.append("empty_legacy_latest_registry")

    status = "ok"

    if problems:
        status = "warning"

    hard_errors = {"missing_repo_root"}
    if any(problem in hard_errors for problem in problems):
        status = "error"

    return {
        "schema": "zzx-bitnodes-daily-index-health-v3",
        "generated_at": utc_now_iso(),
        "status": status,
        "problems": problems,
        "repo_root": str(repo_root),
        "repo_root_exists": repo_root.exists(),
        "legacy_daily_backup_count": len(legacy_daily),
        "has_legacy_latest": legacy_latest is not None,
        "has_mariadb_manifest": mariadb_manifest is not None,
        "mariadb_file_count": len(mariadb_files),
        "api_latest_file_count": len(api_latest),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build indexes for Bitnodes registry and MariaDB public data artifacts."
    )

    parser.add_argument("--repo-root", default=str(DEFAULT_REPO_ROOT))
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    manifests_dir = repo_root / args.output_dir

    legacy_daily = build_legacy_registry_daily_entries(repo_root)
    legacy_latest = build_legacy_latest_entry(repo_root)
    mariadb_files = build_mariadb_entries(repo_root)
    mariadb_manifest = build_mariadb_manifest_entry(repo_root)
    snapshots = build_snapshot_entries(repo_root)
    api_latest = build_api_latest_entries(repo_root)

    daily_index = {
        "schema": "zzx-bitnodes-daily-index-v3",
        "generated_at": utc_now_iso(),
        "repo_root": str(repo_root),
        "legacy_daily_entry_count": len(legacy_daily),
        "mariadb_file_count": len(mariadb_files),
        "snapshot_file_count": len(snapshots),
        "entries": legacy_daily,
        "mariadb": mariadb_files,
        "snapshots": snapshots,
    }

    latest_index = {
        "schema": "zzx-bitnodes-latest-index-v3",
        "generated_at": utc_now_iso(),
        "legacy_latest": legacy_latest,
        "mariadb_manifest": mariadb_manifest,
        "api_latest": api_latest,
    }

    stats = build_stats(
        legacy_daily=legacy_daily,
        legacy_latest=legacy_latest,
        mariadb_manifest=mariadb_manifest,
        mariadb_files=mariadb_files,
        snapshots=snapshots,
        api_latest=api_latest,
    )

    health = build_health(
        repo_root=repo_root,
        legacy_daily=legacy_daily,
        legacy_latest=legacy_latest,
        mariadb_manifest=mariadb_manifest,
        mariadb_files=mariadb_files,
        api_latest=api_latest,
    )

    write_json(manifests_dir / "daily-index.json", daily_index, compact=args.compact)
    write_json(manifests_dir / "latest.json", latest_index, compact=args.compact)
    write_json(manifests_dir / "stats.json", stats, compact=args.compact)
    write_json(manifests_dir / "registry-health.json", health, compact=args.compact)

    print(f"daily index written: {manifests_dir / 'daily-index.json'}")
    print(f"latest index written: {manifests_dir / 'latest.json'}")
    print(f"stats written: {manifests_dir / 'stats.json'}")
    print(f"health written: {manifests_dir / 'registry-health.json'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
