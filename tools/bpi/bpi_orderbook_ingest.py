#!/usr/bin/env python3
"""Ingest provider-supplied L2/L3 order-book snapshot/delta JSONL into the archive store."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from orderbook_store import OrderBookStore


def timestamp_ms(value: Any) -> int:
    n = float(value)
    return int(n * 1000) if n < 100_000_000_000 else int(n)


def ingest(path: Path, store: OrderBookStore, default_source: str | None, default_market: str | None) -> dict[str, int]:
    snapshots = events = rejected = 0
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
                kind = str(row.get("type") or row.get("kind") or "snapshot").lower()
                source = str(row.get("source") or default_source or "")
                market = str(row.get("market") or default_market or "")
                if not source or not market:
                    raise ValueError("source/market required")
                ts = timestamp_ms(row.get("ts_ms") or row.get("timestamp") or row.get("time"))
                sequence = row.get("sequence") or row.get("seq")

                if kind == "snapshot":
                    store.append_snapshot(ts, source, market, row.get("bids") or [], row.get("asks") or [], sequence)
                    snapshots += 1
                    continue

                changes = row.get("changes")
                if isinstance(changes, list):
                    for i, change in enumerate(changes):
                        if isinstance(change, dict):
                            store.append_event(
                                ts, source, market, sequence, i,
                                change.get("side"), change.get("price"), change.get("size"), change.get("action") or "update",
                            )
                        elif isinstance(change, list) and len(change) >= 3:
                            store.append_event(ts, source, market, sequence, i, change[0], change[1], change[2], change[3] if len(change) > 3 else "update")
                    events += len(changes)
                else:
                    store.append_event(
                        ts, source, market, sequence, int(row.get("event_index") or 0),
                        row.get("side"), row.get("price"), row.get("size"), row.get("action") or "update",
                    )
                    events += 1
            except Exception:
                rejected += 1
    store.commit()
    return {"snapshots": snapshots, "events": events, "rejected": rejected}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("file")
    p.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    p.add_argument("--source")
    p.add_argument("--market")
    args = p.parse_args()
    root = Path(args.root).resolve()
    store = OrderBookStore(root / "bitcoin/bpi/orderbooks.sqlite3")
    result = ingest(Path(args.file), store, args.source, args.market)
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
