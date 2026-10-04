#!/usr/bin/env python3
"""Rebuild the local SQLite BPI history from immutable hourly JSONL shards."""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path
from typing import Any

from history_store import HistoryStore


def iter_manifests(root: Path):
    index_path = root / "bitcoin/bpi/archive/archive-index.json"
    if not index_path.is_file():
        return
    data = json.loads(index_path.read_text(encoding="utf-8"))
    for entry in data.get("hours", []):
        path = root / str(entry.get("manifest") or "")
        if path.is_file():
            yield path, json.loads(path.read_text(encoding="utf-8"))


def hydrate(root: Path, db_path: Path, from_ms: int | None = None, to_ms: int | None = None) -> dict[str, Any]:
    store = HistoryStore(db_path)
    imported = rejected = files = 0
    for manifest_path, manifest in iter_manifests(root) or []:
        start_ms = int(manifest.get("window_start_ms") or 0)
        end_ms = int(manifest.get("window_end_ms") or 0)
        if from_ms is not None and end_ms <= from_ms:
            continue
        if to_ms is not None and start_ms >= to_ms:
            continue
        for chunk in manifest.get("chunks", []):
            if chunk.get("kind") != "jsonl-gzip":
                continue
            path = manifest_path.parent / str(chunk["path"])
            if not path.is_file():
                continue
            files += 1
            with gzip.open(path, "rt", encoding="utf-8") as fh:
                for line in fh:
                    try:
                        row = json.loads(line)
                        ts = int(row["ts_ms"])
                        if from_ms is not None and ts < from_ms:
                            continue
                        if to_ms is not None and ts >= to_ms:
                            continue
                        store.append_market(ts, {
                            "exchange": row.get("source"),
                            "market_key": row.get("market"),
                            "quote": row.get("quote"),
                            "price_usd": row.get("price_usd"),
                            "native_price": row.get("native_price"),
                            "volume_24h_btc": row.get("volume_24h_btc"),
                            "high_24h_usd": row.get("high_usd"),
                            "low_24h_usd": row.get("low_usd"),
                            "weight": row.get("weight"),
                        })
                        imported += 1
                    except Exception:
                        rejected += 1
    store.commit()
    return {"database": str(db_path), "files": files, "imported": imported, "rejected": rejected}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    p.add_argument("--db")
    p.add_argument("--from-ms", type=int)
    p.add_argument("--to-ms", type=int)
    args = p.parse_args()
    root = Path(args.root).resolve()
    db = Path(args.db).resolve() if args.db else root / "bitcoin/bpi/history.sqlite3"
    print(json.dumps(hydrate(root, db, args.from_ms, args.to_ms), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
