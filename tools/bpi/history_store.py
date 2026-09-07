#!/usr/bin/env python3
from __future__ import annotations

import math
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
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
  PRIMARY KEY (ts_ms, source, market)
);
CREATE INDEX IF NOT EXISTS idx_ticks_source_ts ON ticks(source, ts_ms);
CREATE INDEX IF NOT EXISTS idx_ticks_market_ts ON ticks(source, market, ts_ms);
"""

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

def finite(v: Any) -> float:
    try:
        n=float(v)
    except (TypeError, ValueError):
        return math.nan
    return n if math.isfinite(n) else math.nan

class HistoryStore:
    def __init__(self, path: Path):
        self.path=Path(path)
        self.path.parent.mkdir(parents=True,exist_ok=True)
        self._lock=threading.Lock()
        self.db=sqlite3.connect(self.path,check_same_thread=False)
        self.db.execute("PRAGMA busy_timeout=5000")
        self.db.executescript(SCHEMA)
        self.db.commit()

    def append_market(self, ts_ms: int, row: dict[str, Any]) -> None:
        price=finite(row.get("price_usd"))
        if not (math.isfinite(price) and price>0):
            return
        vals=(
            int(ts_ms),
            str(row.get("exchange") or "unknown"),
            str(row.get("market_key") or row.get("pair") or "BTC/USD"),
            str(row.get("quote") or ""),
            price,
            finite(row.get("native_price")),
            finite(row.get("volume_24h_btc")),
            finite(row.get("high_24h_usd") or row.get("high_usd")),
            finite(row.get("low_24h_usd") or row.get("low_usd")),
            finite(row.get("weight")),
        )
        clean=tuple(None if isinstance(v,float) and not math.isfinite(v) else v for v in vals)
        with self._lock:
            self.db.execute(
                """INSERT OR REPLACE INTO ticks
                   (ts_ms,source,market,quote,price_usd,native_price,volume_24h_btc,high_usd,low_usd,weight)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                clean,
            )

    def append_index(self, ts_ms: int, source: str, price_usd: float, volume_btc: float|None=None) -> None:
        p=finite(price_usd)
        if not (math.isfinite(p) and p>0):
            return
        row={
            "exchange":source,
            "market_key":source,
            "pair":"BTC/USD",
            "quote":"USD",
            "price_usd":p,
            "native_price":p,
            "volume_24h_btc":volume_btc,
        }
        self.append_market(ts_ms,row)

    def commit(self) -> None:
        with self._lock:
            self.db.commit()

    def bounds(self, source: str|None=None) -> dict[str, Any]:
        with self._lock:
            if source:
                row=self.db.execute(
                    "SELECT MIN(ts_ms),MAX(ts_ms),COUNT(*) FROM ticks WHERE source=?",
                    (source,),
                ).fetchone()
            else:
                row=self.db.execute("SELECT MIN(ts_ms),MAX(ts_ms),COUNT(*) FROM ticks").fetchone()
        return {"min_ts":row[0],"max_ts":row[1],"count":row[2]}

    def sources(self) -> list[dict[str, Any]]:
        with self._lock:
            rows=self.db.execute(
                """SELECT source,COUNT(*),MIN(ts_ms),MAX(ts_ms),COUNT(DISTINCT market)
                   FROM ticks GROUP BY source ORDER BY source"""
            ).fetchall()
        return [
            {"source":r[0],"points":r[1],"min_ts":r[2],"max_ts":r[3],"markets":r[4]}
            for r in rows
        ]

    def _choose_resolution(self, start_ms: int, end_ms: int, max_points: int) -> str:
        span=max(1,end_ms-start_ms)
        target=max(1,span//max(10,max_points))
        for name,ms in [
            ("1s",1_000),("5s",5_000),("15s",15_000),("30s",30_000),
            ("1m",60_000),("5m",300_000),("15m",900_000),
            ("1h",3_600_000),("4h",14_400_000),("1d",86_400_000),("1w",604_800_000),
        ]:
            if ms>=target:
                return name
        return "1w"

    def query(
        self,
        source: str,
        start_ms: int|None=None,
        end_ms: int|None=None,
        resolution: str="auto",
        max_points: int=5000,
        market: str|None=None,
    ) -> dict[str, Any]:
        now=int(time.time()*1000)
        end_ms=int(end_ms or now)
        start_ms=int(start_ms or max(0,end_ms-86_400_000))
        max_points=max(100,min(int(max_points),20_000))
        if resolution=="auto":
            resolution=self._choose_resolution(start_ms,end_ms,max_points)

        where=["source=?","ts_ms>=?","ts_ms<=?"]
        args:[Any]=[source,start_ms,end_ms]
        if market:
            where.append("market=?")
            args.append(market)
        clause=" AND ".join(where)

        if resolution=="raw":
            sql=f"""SELECT ts_ms,price_usd,volume_24h_btc,high_usd,low_usd,weight,market,quote
                    FROM ticks WHERE {clause} ORDER BY ts_ms LIMIT ?"""
            with self._lock:
                rows=self.db.execute(sql,(*args,max_points)).fetchall()
            points=[]
            prev=None
            for r in rows:
                change=(r[1]-prev) if prev is not None else None
                change_pct=(change/prev*100.0) if prev not in (None,0) else None
                points.append({
                    "t":r[0],"open":r[1],"high":r[1],"low":r[1],"close":r[1],
                    "price":r[1],"volume_24h_btc":r[2],"high_24h":r[3],"low_24h":r[4],
                    "weight":r[5],"market":r[6],"quote":r[7],
                    "change":change,"change_pct":change_pct,
                })
                prev=r[1]
            return {"source":source,"market":market,"resolution":"raw","points":points}

        bucket_ms=RESOLUTIONS.get(resolution)
        if not bucket_ms:
            raise ValueError(f"unknown resolution {resolution}")

        # SQLite has no portable first/last aggregate; fetch rows ordered and bucket in Python.
        sql=f"""SELECT ts_ms,price_usd,volume_24h_btc,weight,market,quote
                FROM ticks WHERE {clause} ORDER BY ts_ms"""
        with self._lock:
            rows=self.db.execute(sql,args).fetchall()

        buckets={}
        for ts,price,volume,weight,mkt,quote in rows:
            b=(int(ts)//bucket_ms)*bucket_ms
            x=buckets.get(b)
            if x is None:
                x={
                    "t":b,"open":price,"high":price,"low":price,"close":price,
                    "volume_24h_btc":volume,"weight":weight,"market":mkt,"quote":quote,
                    "_last_ts":ts,
                }
                buckets[b]=x
            else:
                x["high"]=max(x["high"],price)
                x["low"]=min(x["low"],price)
                if ts>=x["_last_ts"]:
                    x["close"]=price
                    x["volume_24h_btc"]=volume
                    x["weight"]=weight
                    x["market"]=mkt
                    x["quote"]=quote
                    x["_last_ts"]=ts

        points=[]
        prev=None
        for _,x in sorted(buckets.items()):
            x.pop("_last_ts",None)
            x["price"]=x["close"]
            change=(x["close"]-prev) if prev is not None else None
            x["change"]=change
            x["change_pct"]=(change/prev*100.0) if prev not in (None,0) else None
            points.append(x)
            prev=x["close"]

        if len(points)>max_points:
            step=max(1,math.ceil(len(points)/max_points))
            points=points[::step]

        return {
            "source":source,
            "market":market,
            "resolution":resolution,
            "bucket_ms":bucket_ms,
            "points":points,
            "from":start_ms,
            "to":end_ms,
        }
