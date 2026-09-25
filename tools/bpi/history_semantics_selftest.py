#!/usr/bin/env python3
from __future__ import annotations

import tempfile
from pathlib import Path

from history_store import HistoryStore


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        store = HistoryStore(Path(td) / "history.sqlite3")
        # Two one-minute bars, then a genuine two-minute hole, then one bar.
        bars = [
            (0, 10, 12, 9, 11, 5, 100),
            (60_000, 11, 13, 10, 12, 7, 101),
            (240_000, 20, 22, 19, 21, 3, 102),
        ]
        for ts, op, hi, lo, cl, interval, rolling in bars:
            store.append_market(ts, {
                "exchange": "demo", "market_key": "demo::BTC/USD", "quote": "USD",
                "open_usd": op, "high_usd": hi, "low_usd": lo, "close_usd": cl,
                "price_usd": cl, "interval_volume_btc": interval,
                "volume_24h_btc": rolling,
            })
        store.commit()
        one_minute = store.query("demo", 0, 300_000, "1m", 100)
        assert [p["interval_volume_btc"] for p in one_minute["points"]] == [5.0, 7.0, 3.0]
        assert [p["volume_24h_btc"] for p in one_minute["points"]] == [100.0, 101.0, 102.0]
        assert one_minute["points"][2]["gap_before"] is True
        assert one_minute["gap_count"] == 1
        five_minute = store.query("demo", 0, 300_000, "5m", 100)
        point = five_minute["points"][0]
        assert point["open"] == 10.0 and point["high"] == 22.0 and point["low"] == 9.0 and point["close"] == 21.0
        assert point["interval_volume_btc"] == 15.0
        assert point["volume_24h_btc"] == 102.0
        store.close()
    print("history_semantics_selftest.py: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
