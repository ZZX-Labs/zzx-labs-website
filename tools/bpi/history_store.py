#!/usr/bin/env python3
from __future__ import annotations

import math
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

BASE_SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA wal_autocheckpoint=1000;
CREATE TABLE IF NOT EXISTS ticks (
  ts_ms INTEGER NOT NULL,
  source TEXT NOT NULL,
  market TEXT NOT NULL,
  quote TEXT,
  price_usd REAL NOT NULL,
  native_price REAL,
  volume_24h_btc REAL,
  high_usd REAL,
  low_usd REAL,
  weight REAL,
  open_usd REAL,
  close_usd REAL,
  interval_volume_btc REAL,
  source_updated_at TEXT,
  observed_at TEXT,
  provenance TEXT,
  PRIMARY KEY (ts_ms, source, market)
);
CREATE INDEX IF NOT EXISTS idx_ticks_source_ts ON ticks(source, ts_ms);
CREATE INDEX IF NOT EXISTS idx_ticks_market_ts ON ticks(source, market, ts_ms);
"""

MIGRATION_COLUMNS = {
    "open_usd": "REAL",
    "close_usd": "REAL",
    "interval_volume_btc": "REAL",
    "source_updated_at": "TEXT",
    "observed_at": "TEXT",
    "provenance": "TEXT",
}

RESOLUTIONS = {
    "raw": 0,
    "1s": 1_000,
    "5s": 5_000,
    "15s": 15_000,
    "30s": 30_000,
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
    "1w": 604_800_000,
}


def finite(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return math.nan
    return number if math.isfinite(number) else math.nan


def clean_number(value: Any, *, positive: bool = False, nonnegative: bool = False) -> float | None:
    number = finite(value)
    if not math.isfinite(number):
        return None
    if positive and number <= 0:
        return None
    if nonnegative and number < 0:
        return None
    return number


class HistoryStore:
    """Durable tick/bar store with Python-side adaptive OHLCV aggregation.

    `volume_24h_btc` is the upstream rolling 24-hour statistic.
    `interval_volume_btc` is actual BTC traded during the stored bar interval.
    They are intentionally separate and must never be substituted for one another.
    """

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.db = sqlite3.connect(self.path, check_same_thread=False)
        self.db.execute("PRAGMA busy_timeout=5000")
        self.db.executescript(BASE_SCHEMA)
        self._migrate()
        self.db.commit()

    def _migrate(self) -> None:
        columns = {
            str(row[1]) for row in self.db.execute("PRAGMA table_info(ticks)").fetchall()
        }
        for name, kind in MIGRATION_COLUMNS.items():
            if name not in columns:
                self.db.execute(f"ALTER TABLE ticks ADD COLUMN {name} {kind}")

    def append_market(self, ts_ms: int, row: dict[str, Any]) -> None:
        close = clean_number(row.get("close_usd") or row.get("close") or row.get("price_usd"), positive=True)
        if close is None:
            return
        open_price = clean_number(row.get("open_usd") or row.get("open") or close, positive=True) or close
        high = clean_number(row.get("high_usd") or row.get("high") or row.get("high_24h_usd"), positive=True)
        low = clean_number(row.get("low_usd") or row.get("low") or row.get("low_24h_usd"), positive=True)
        # Stored bar high/low should bound the OHLC values. Rolling high/low are kept
        # only as fallback when a source has no interval bars.
        high = max(open_price, close, high if high is not None else close)
        low = min(open_price, close, low if low is not None else close)

        values = (
            int(ts_ms),
            str(row.get("exchange") or row.get("source") or "unknown"),
            str(row.get("market_key") or row.get("market") or row.get("pair") or "BTC/USD"),
            str(row.get("quote") or ""),
            close,
            clean_number(row.get("native_price")),
            clean_number(row.get("volume_24h_btc"), nonnegative=True),
            high,
            low,
            clean_number(row.get("weight")),
            open_price,
            close,
            clean_number(
                row.get("interval_volume_btc")
                if row.get("interval_volume_btc") is not None
                else row.get("trade_volume_btc"),
                nonnegative=True,
            ),
            str(row.get("source_updated_at") or "") or None,
            str(row.get("observed_at") or row.get("updated_at") or "") or None,
            str(row.get("provenance") or row.get("source_url") or "") or None,
        )
        with self._lock:
            self.db.execute(
                """INSERT OR REPLACE INTO ticks
                   (ts_ms,source,market,quote,price_usd,native_price,volume_24h_btc,
                    high_usd,low_usd,weight,open_usd,close_usd,interval_volume_btc,
                    source_updated_at,observed_at,provenance)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                values,
            )

    def append_index(
        self,
        ts_ms: int,
        source: str,
        price_usd: float,
        volume_btc: float | None = None,
        high_usd: float | None = None,
        low_usd: float | None = None,
        *,
        open_usd: float | None = None,
        close_usd: float | None = None,
        interval_volume_btc: float | None = None,
        provenance: str | None = None,
    ) -> None:
        price = clean_number(price_usd, positive=True)
        if price is None:
            return
        self.append_market(
            ts_ms,
            {
                "exchange": source,
                "market_key": source,
                "pair": "BTC/USD",
                "quote": "USD",
                "price_usd": close_usd if close_usd is not None else price,
                "open_usd": open_usd if open_usd is not None else price,
                "high_usd": high_usd,
                "low_usd": low_usd,
                "native_price": price,
                "volume_24h_btc": volume_btc,
                "interval_volume_btc": interval_volume_btc,
                "provenance": provenance,
            },
        )

    def commit(self) -> None:
        with self._lock:
            self.db.commit()

    def checkpoint(self, mode: str = "PASSIVE") -> None:
        mode = str(mode or "PASSIVE").upper()
        if mode not in {"PASSIVE", "FULL", "RESTART", "TRUNCATE"}:
            raise ValueError(f"invalid WAL checkpoint mode: {mode}")
        with self._lock:
            self.db.execute(f"PRAGMA wal_checkpoint({mode})")

    def close(self) -> None:
        with self._lock:
            try:
                self.db.commit()
            finally:
                self.db.close()

    def bounds(self, source: str | None = None) -> dict[str, Any]:
        with self._lock:
            if source:
                row = self.db.execute(
                    "SELECT MIN(ts_ms),MAX(ts_ms),COUNT(*) FROM ticks WHERE source=?",
                    (source,),
                ).fetchone()
            else:
                row = self.db.execute("SELECT MIN(ts_ms),MAX(ts_ms),COUNT(*) FROM ticks").fetchone()
        return {"min_ts": row[0], "max_ts": row[1], "count": row[2]}

    def sources(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self.db.execute(
                """SELECT source,COUNT(*),MIN(ts_ms),MAX(ts_ms),COUNT(DISTINCT market)
                   FROM ticks GROUP BY source ORDER BY source"""
            ).fetchall()
        return [
            {"source": r[0], "points": r[1], "min_ts": r[2], "max_ts": r[3], "markets": r[4]}
            for r in rows
        ]

    def _choose_resolution(self, start_ms: int, end_ms: int, max_points: int) -> str:
        span = max(1, end_ms - start_ms)
        target = max(1, span // max(10, max_points))
        for name, ms in RESOLUTIONS.items():
            if name != "raw" and ms >= target:
                return name
        return "1w"

    @staticmethod
    def _gap_metadata(points: list[dict[str, Any]], bucket_ms: int) -> dict[str, Any]:
        gaps = []
        if bucket_ms <= 0:
            deltas = [b["t"] - a["t"] for a, b in zip(points, points[1:]) if b["t"] > a["t"]]
            nominal = min(deltas) if deltas else 0
        else:
            nominal = bucket_ms
        threshold = nominal * 1.5 if nominal else 0
        for left, right in zip(points, points[1:]):
            delta = int(right["t"]) - int(left["t"])
            if threshold and delta > threshold:
                right["gap_before"] = True
                right["gap_ms"] = delta
                gaps.append({"from": left["t"], "to": right["t"], "gap_ms": delta})
            else:
                right["gap_before"] = False
                right["gap_ms"] = 0
        if points:
            points[0]["gap_before"] = False
            points[0]["gap_ms"] = 0
        return {"nominal_interval_ms": nominal, "gaps": gaps, "gap_count": len(gaps)}

    def query(
        self,
        source: str,
        start_ms: int | None = None,
        end_ms: int | None = None,
        resolution: str = "auto",
        max_points: int = 5000,
        market: str | None = None,
    ) -> dict[str, Any]:
        now = int(time.time() * 1000)
        end_ms = int(end_ms or now)
        start_ms = int(start_ms or max(0, end_ms - 86_400_000))
        max_points = max(100, min(int(max_points), 20_000))
        if resolution == "auto":
            resolution = self._choose_resolution(start_ms, end_ms, max_points)

        where = ["source=?", "ts_ms>=?", "ts_ms<=?"]
        args: list[Any] = [source, start_ms, end_ms]
        if market:
            where.append("market=?")
            args.append(market)
        clause = " AND ".join(where)
        sql = f"""SELECT ts_ms,price_usd,volume_24h_btc,high_usd,low_usd,weight,
                         market,quote,open_usd,close_usd,interval_volume_btc,
                         source_updated_at,observed_at,provenance
                  FROM ticks WHERE {clause} ORDER BY ts_ms"""
        with self._lock:
            rows = self.db.execute(sql, args).fetchall()

        if resolution == "raw":
            points = []
            previous_close = None
            for row in rows[-max_points:]:
                ts, price, rolling_volume, high, low, weight, market_name, quote, open_price, close_price, interval_volume, source_updated, observed, provenance = row
                close = close_price if close_price is not None else price
                open_value = open_price if open_price is not None else close
                change = close - previous_close if previous_close is not None else None
                points.append({
                    "t": ts, "open": open_value, "high": high if high is not None else close,
                    "low": low if low is not None else close, "close": close, "price": close,
                    "volume_24h_btc": rolling_volume,
                    "interval_volume_btc": interval_volume,
                    "high_24h": high, "low_24h": low, "weight": weight,
                    "market": market_name, "quote": quote,
                    "source_updated_at": source_updated, "observed_at": observed,
                    "provenance": provenance,
                    "change": change,
                    "change_pct": (change / previous_close * 100.0) if previous_close not in (None, 0) else None,
                })
                previous_close = close
            gap_info = self._gap_metadata(points, 0)
            return {
                "schema": "zzx-bpi-history-series-v2",
                "source": source, "market": market, "resolution": "raw",
                "points": points, "from": start_ms, "to": end_ms, **gap_info,
            }

        bucket_ms = RESOLUTIONS.get(resolution)
        if not bucket_ms:
            raise ValueError(f"unknown resolution {resolution}")

        buckets: dict[int, dict[str, Any]] = {}
        for row in rows:
            ts, price, rolling_volume, high, low, weight, market_name, quote, open_price, close_price, interval_volume, source_updated, observed, provenance = row
            bucket = (int(ts) // bucket_ms) * bucket_ms
            close = close_price if close_price is not None else price
            open_value = open_price if open_price is not None else close
            high_value = high if high is not None else max(open_value, close)
            low_value = low if low is not None else min(open_value, close)
            current = buckets.get(bucket)
            if current is None:
                current = {
                    "t": bucket,
                    "open": open_value,
                    "high": high_value,
                    "low": low_value,
                    "close": close,
                    "price": close,
                    "volume_24h_btc": rolling_volume,
                    "interval_volume_btc": interval_volume if interval_volume is not None else None,
                    "weight": weight, "market": market_name, "quote": quote,
                    "source_updated_at": source_updated, "observed_at": observed,
                    "provenance": provenance,
                    "sample_count": 1,
                    "_last_ts": ts,
                    "_has_interval_volume": interval_volume is not None,
                }
                buckets[bucket] = current
            else:
                current["high"] = max(float(current["high"]), float(high_value))
                current["low"] = min(float(current["low"]), float(low_value))
                current["sample_count"] += 1
                if interval_volume is not None:
                    current["interval_volume_btc"] = float(current.get("interval_volume_btc") or 0.0) + float(interval_volume)
                    current["_has_interval_volume"] = True
                if ts >= current["_last_ts"]:
                    current.update({
                        "close": close, "price": close, "volume_24h_btc": rolling_volume,
                        "weight": weight, "market": market_name, "quote": quote,
                        "source_updated_at": source_updated, "observed_at": observed,
                        "provenance": provenance, "_last_ts": ts,
                    })

        points = []
        previous_close = None
        for _, item in sorted(buckets.items()):
            item.pop("_last_ts", None)
            if not item.pop("_has_interval_volume", False):
                item["interval_volume_btc"] = None
            change = item["close"] - previous_close if previous_close is not None else None
            item["change"] = change
            item["change_pct"] = (change / previous_close * 100.0) if previous_close not in (None, 0) else None
            points.append(item)
            previous_close = item["close"]

        # Never decimate by skipping arbitrary candles: that creates synthetic
        # holes and incorrect OHLC/volume. If a requested resolution is too fine
        # for the response budget, re-aggregate server-side at the appropriate
        # coarser resolution and report both requested and actual resolution.
        if len(points) > max_points:
            coarser = self._choose_resolution(start_ms, end_ms, max_points)
            if RESOLUTIONS.get(coarser, 0) <= bucket_ms:
                ordered = [name for name, ms in RESOLUTIONS.items() if ms > bucket_ms]
                coarser = ordered[0] if ordered else "1w"
            result = self.query(
                source=source, start_ms=start_ms, end_ms=end_ms,
                resolution=coarser, max_points=max_points, market=market,
            )
            result["requested_resolution"] = resolution
            result["adaptive_resolution"] = True
            return result

        gap_info = self._gap_metadata(points, bucket_ms)
        return {
            "schema": "zzx-bpi-history-series-v2",
            "source": source, "market": market, "resolution": resolution,
            "bucket_ms": bucket_ms, "points": points,
            "from": start_ms, "to": end_ms,
            "volume_semantics": {
                "volume_24h_btc": "rolling upstream 24h BTC volume",
                "interval_volume_btc": "BTC traded inside this returned candle bucket when source data supports it",
            },
            **gap_info,
        }
