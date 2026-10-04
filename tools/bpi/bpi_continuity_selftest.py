#!/usr/bin/env python3
from __future__ import annotations
import json
import math
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from collector import Collector
from history_store import HistoryStore


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> int:
    # Stale-market policy must keep a fresh last-known-good row briefly but
    # remove it from index eligibility after the configured freshness window.
    c = Collector.__new__(Collector)
    c.market_stale_after_ms = 30_000
    now = datetime.now(timezone.utc)
    assert c._market_is_fresh({"updated_at": iso(now - timedelta(seconds=5))}, now.timestamp())
    assert not c._market_is_fresh({"updated_at": iso(now - timedelta(seconds=31))}, now.timestamp())
    assert not c._market_is_fresh({"updated_at": "garbage"}, now.timestamp())
    assert not c._market_is_fresh({}, now.timestamp())

    # Durable history must round-trip finite price/volume observations and WAL.
    with tempfile.TemporaryDirectory(prefix="zzx-bpi-selftest-") as td:
        db = Path(td) / "history.sqlite3"
        store = HistoryStore(db)
        ts = int(time.time() * 1000)
        store.append_market(ts, {
            "exchange": "selftest",
            "market_key": "selftest::BTCUSD",
            "quote": "USD",
            "price_usd": 100000.0,
            "native_price": 100000.0,
            "volume_24h_btc": 123.5,
            "high_24h_usd": 101000.0,
            "low_24h_usd": 99000.0,
            "weight": 1.0,
        })
        store.commit()
        bounds = store.bounds("selftest")
        assert bounds["count"] == 1
        result = store.query("selftest", ts - 1000, ts + 1000, "raw", 100)
        points = result.get("points") or result.get("rows") or result.get("data") or []
        assert points, result
        store.checkpoint("FULL")
        store.close()
        assert db.is_file() and db.stat().st_size > 0

    print(json.dumps({"schema":"zzx-bpi-continuity-selftest-v1","ok":True}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
