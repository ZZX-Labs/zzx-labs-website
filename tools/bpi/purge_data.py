#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

CONFIRMATION = "PURGE_BPI_DATA"

# Derived/ephemeral BPI outputs. Registries, policies, overrides, source URLs and
# raw historical evidence are intentionally NOT listed here.
DERIVED_API_FILES = (
    "changes.json",
    "collector_run_status.json",
    "history-live.json",
    "history.json",
    "hourly_status.json",
    "latest.json",
    "markets.json",
    "prices.json",
    "provider_health.json",
    "supervisor-status.json",
)


def safe_unlink(path: Path, removed: list[str]) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink(missing_ok=True)
        removed.append(str(path))


def purge(root: Path, *, runtime_db: Path | None, dry_run: bool = False) -> dict:
    targets: list[Path] = []
    api = root / "bitcoin/bpi/api"
    targets.extend(api / name for name in DERIVED_API_FILES)

    # Repository-local SQLite database plus WAL/SHM sidecars.
    repo_db = root / "bitcoin/bpi/history.sqlite3"
    for db in [repo_db, runtime_db] if runtime_db else [repo_db]:
        if db is None:
            continue
        targets.extend([db, Path(str(db) + "-wal"), Path(str(db) + "-shm")])

    archive = root / "bitcoin/bpi/archive"
    report = root / "bitcoin/bpi/backfill/backtest-report.json"
    targets.append(report)

    existing = [str(path) for path in targets if path.exists() or path.is_symlink()]
    archive_exists = archive.exists()
    if dry_run:
        return {
            "dry_run": True,
            "files": existing,
            "archive": str(archive) if archive_exists else None,
            "preserved": [
                str(root / "bitcoin/bpi/api/exchanges.json"),
                str(root / "bitcoin/bpi/api/provider_urls.json"),
                str(root / "bitcoin/bpi/api/historical_sources.json"),
                str(root / "bitcoin/bpi/api/bpi_index_policy.json"),
                str(root / "bitcoin/bpi/backfill/incoming"),
            ],
        }

    removed: list[str] = []
    for path in targets:
        safe_unlink(path, removed)

    if archive.exists():
        # Remove all generated archive shards/indexes, then recreate an empty
        # archive root. Raw backfill evidence lives outside this directory.
        shutil.rmtree(archive)
        archive.mkdir(parents=True, exist_ok=True)
        (archive / ".gitkeep").write_text("", encoding="utf-8")
        removed.append(str(archive) + "/**")

    incoming = root / "bitcoin/bpi/backfill/incoming"
    incoming.mkdir(parents=True, exist_ok=True)
    marker = root / "bitcoin/bpi/backfill/last-purge.json"
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(
        json.dumps(
            {
                "schema": "zzx-bpi-purge-v1",
                "purged_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "removed": removed,
                "preserved_raw_backfill": str(incoming),
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    return {"dry_run": False, "removed": removed, "marker": str(marker)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Purge derived ZZX BPI runtime/history data while preserving configuration and raw archival evidence.")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--runtime-db", default=os.environ.get("ZZX_BPI_HISTORY_DB"))
    parser.add_argument("--confirm", default="")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    runtime_db = Path(args.runtime_db).resolve() if args.runtime_db else None

    if not args.dry_run and args.confirm != CONFIRMATION:
        raise SystemExit(f"refusing destructive purge; pass --confirm {CONFIRMATION}")

    result = purge(root, runtime_db=runtime_db, dry_run=args.dry_run)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
