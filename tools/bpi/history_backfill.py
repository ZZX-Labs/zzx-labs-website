#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from history_store import HistoryStore

def number(v: Any) -> float:
    try:
        n=float(v)
    except (TypeError,ValueError):
        return math.nan
    return n if math.isfinite(n) else math.nan

def timestamp_ms(v: Any) -> int:
    if isinstance(v,(int,float)):
        n=float(v)
        if n<1e11:
            n*=1000
        return int(n)

    s=str(v or "").strip()
    if s.isdigit():
        return timestamp_ms(int(s))

    dt=datetime.fromisoformat(s.replace("Z","+00:00"))
    if dt.tzinfo is None:
        dt=dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp()*1000)

def row_to_tick(row: dict[str,Any],source: str,default_market: str,default_quote: str) -> tuple[int,dict[str,Any]]:
    ts=timestamp_ms(
        row.get("timestamp") or row.get("time") or row.get("ts") or
        row.get("date") or row.get("datetime")
    )

    close=number(
        row.get("price_usd") or row.get("price") or row.get("close") or row.get("Close")
    )
    if not (math.isfinite(close) and close>0):
        raise ValueError("row lacks positive price")

    market=str(row.get("market") or row.get("pair") or default_market)
    quote=str(row.get("quote") or default_quote).upper()

    tick={
        "exchange":source,
        "market_key":f"{source}::{market}",
        "pair":market,
        "quote":quote,
        "price_usd":close,
        "native_price":number(row.get("native_price")) if row.get("native_price") is not None else close,
        "volume_24h_btc":number(
            row.get("volume_24h_btc") or row.get("volume") or row.get("Volume")
        ),
        "high_usd":number(row.get("high") or row.get("High")),
        "low_usd":number(row.get("low") or row.get("Low")),
    }

    if not math.isfinite(tick["volume_24h_btc"]):
        tick["volume_24h_btc"]=0.0

    return ts,tick

def import_csv(path: Path):
    with path.open("r",encoding="utf-8-sig",newline="") as fh:
        yield from csv.DictReader(fh)

def import_json(path: Path):
    data=json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data,list):
        yield from data
    elif isinstance(data,dict):
        rows=data.get("rows") or data.get("data") or data.get("history") or data.get("candles") or []
        yield from rows

def main()->int:
    p=argparse.ArgumentParser(description="Import historical exchange data into the ZZX BPI history archive.")
    p.add_argument("file")
    p.add_argument("--source",required=True,help="Registry exchange/source id.")
    p.add_argument("--market",default="BTC/USD")
    p.add_argument("--quote",default="USD")
    p.add_argument("--root",default=str(Path(__file__).resolve().parents[2]))
    args=p.parse_args()

    path=Path(args.file)
    store=HistoryStore(Path(args.root)/"bitcoin/bpi/history.sqlite3")

    iterator=import_csv(path) if path.suffix.lower()==".csv" else import_json(path)
    good=bad=0

    for raw in iterator:
        if not isinstance(raw,dict):
            bad+=1
            continue
        try:
            ts,tick=row_to_tick(raw,args.source,args.market,args.quote)
            store.append_market(ts,tick)
            good+=1
        except Exception:
            bad+=1

    store.commit()
    print(json.dumps({"source":args.source,"imported":good,"rejected":bad}))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
