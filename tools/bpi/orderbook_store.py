#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
CREATE TABLE IF NOT EXISTS orderbook_snapshots (
  ts_ms INTEGER NOT NULL,
  source TEXT NOT NULL,
  market TEXT NOT NULL,
  sequence TEXT,
  bids_json TEXT NOT NULL,
  asks_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  PRIMARY KEY (ts_ms, source, market)
);
CREATE INDEX IF NOT EXISTS idx_orderbook_snapshots_source_ts
  ON orderbook_snapshots(source, ts_ms);

CREATE TABLE IF NOT EXISTS orderbook_events (
  ts_ms INTEGER NOT NULL,
  source TEXT NOT NULL,
  market TEXT NOT NULL,
  sequence TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  side TEXT NOT NULL,
  price TEXT NOT NULL,
  size TEXT NOT NULL,
  action TEXT NOT NULL,
  PRIMARY KEY (source, market, sequence, event_index)
);
CREATE INDEX IF NOT EXISTS idx_orderbook_events_source_ts
  ON orderbook_events(source, ts_ms);
"""


def canonical_levels(levels: Any) -> str:
    if not isinstance(levels, list):
        raise ValueError("order-book levels must be an array")
    return json.dumps(levels, ensure_ascii=False, separators=(",", ":"))


def checksum(source: str, market: str, bids_json: str, asks_json: str) -> str:
    h = hashlib.sha256()
    h.update(source.encode())
    h.update(b"\0")
    h.update(market.encode())
    h.update(b"\0")
    h.update(bids_json.encode())
    h.update(b"\0")
    h.update(asks_json.encode())
    return h.hexdigest()


class OrderBookStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.db = sqlite3.connect(self.path, check_same_thread=False)
        self.db.execute("PRAGMA busy_timeout=5000")
        self.db.executescript(SCHEMA)
        self.db.commit()

    def append_snapshot(self, ts_ms: int, source: str, market: str, bids: Any, asks: Any, sequence: Any = None) -> None:
        bids_json = canonical_levels(bids)
        asks_json = canonical_levels(asks)
        digest = checksum(str(source), str(market), bids_json, asks_json)
        with self._lock:
            self.db.execute(
                """INSERT OR REPLACE INTO orderbook_snapshots
                   (ts_ms,source,market,sequence,bids_json,asks_json,checksum)
                   VALUES (?,?,?,?,?,?,?)""",
                (int(ts_ms), str(source), str(market), None if sequence is None else str(sequence), bids_json, asks_json, digest),
            )

    def append_event(
        self, ts_ms: int, source: str, market: str, sequence: Any, event_index: int,
        side: str, price: Any, size: Any, action: str,
    ) -> None:
        side = str(side).lower()
        action = str(action).lower()
        if side not in {"bid", "ask"}:
            raise ValueError("side must be bid or ask")
        if action not in {"set", "update", "delete", "insert"}:
            raise ValueError("unsupported order-book action")
        with self._lock:
            self.db.execute(
                """INSERT OR REPLACE INTO orderbook_events
                   (ts_ms,source,market,sequence,event_index,side,price,size,action)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (int(ts_ms), str(source), str(market), str(sequence), int(event_index), side, str(price), str(size), action),
            )

    def commit(self) -> None:
        with self._lock:
            self.db.commit()
