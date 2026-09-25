#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator

from history_store import HistoryStore


def number(value: Any) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return math.nan
    return n if math.isfinite(n) else math.nan


def first_number(row: dict[str, Any], *keys: str) -> float:
    for key in keys:
        if key in row and row[key] not in (None, ""):
            n = number(row[key])
            if math.isfinite(n):
                return n
    return math.nan


def timestamp_ms(value: Any) -> int:
    if isinstance(value, (int, float)):
        n = float(value)
        if n < 1e11:
            n *= 1000
        return int(n)
    text = str(value or "").strip()
    if not text:
        raise ValueError("missing timestamp")
    try:
        return timestamp_ms(float(text))
    except ValueError:
        pass
    dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def row_timestamp(row: dict[str, Any]) -> int:
    for key in ("timestamp", "time", "ts", "date", "datetime", "open_time", "time_open"):
        if row.get(key) not in (None, ""):
            return timestamp_ms(row[key])
    raise ValueError("row lacks timestamp")


def row_to_tick(
    row: dict[str, Any],
    source: str,
    default_market: str,
    default_quote: str,
    provenance: str | None = None,
) -> tuple[int, dict[str, Any]]:
    ts = row_timestamp(row)
    market = str(row.get("market") or row.get("pair") or row.get("symbol") or default_market)
    quote = str(row.get("quote") or default_quote).upper()
    usd_explicit = first_number(row, "price_usd", "close_usd")
    native_close = first_number(row, "close", "Close", "price")
    if quote != "USD" and not (math.isfinite(usd_explicit) and usd_explicit > 0):
        raise ValueError(f"non-USD archive row for {quote} lacks explicit USD-normalized price")
    close = usd_explicit if math.isfinite(usd_explicit) else native_close
    if not (math.isfinite(close) and close > 0):
        raise ValueError("row lacks positive close/price")

    # OHLC values must also be USD-normalized for non-USD archives. If only the
    # close is USD-normalized, retain a point observation rather than fabricating
    # a USD candle from native OHLC.
    if quote == "USD":
        open_price = first_number(row, "open_usd", "open", "Open")
        high = first_number(row, "high_usd", "high", "High")
        low = first_number(row, "low_usd", "low", "Low")
    else:
        open_price = first_number(row, "open_usd")
        high = first_number(row, "high_usd")
        low = first_number(row, "low_usd")
    if not (math.isfinite(open_price) and open_price > 0):
        open_price = close
    if not (math.isfinite(high) and high > 0):
        high = max(open_price, close)
    if not (math.isfinite(low) and low > 0):
        low = min(open_price, close)

    # Actual bar/base volume and rolling 24-hour volume are different facts.
    interval_volume = first_number(
        row,
        "interval_volume_btc", "trade_volume_btc", "base_volume_btc",
        "base_volume", "volume_btc", "Volume BTC", "Volume_BTC", "Volume",
    )
    rolling_volume = first_number(
        row,
        "volume_24h_btc", "rolling_volume_24h_btc", "volume24h_btc",
    )

    tick = {
        "exchange": source,
        "market_key": f"{source}::{market}",
        "pair": market,
        "quote": quote,
        "price_usd": close,
        "open_usd": open_price,
        "close_usd": close,
        "high_usd": high,
        "low_usd": low,
        "native_price": first_number(row, "native_price") if row.get("native_price") is not None else (native_close if math.isfinite(native_close) else close),
        "volume_24h_btc": rolling_volume if math.isfinite(rolling_volume) and rolling_volume >= 0 else None,
        "interval_volume_btc": interval_volume if math.isfinite(interval_volume) and interval_volume >= 0 else None,
        "source_updated_at": str(row.get("source_updated_at") or row.get("updated_at") or "") or None,
        "observed_at": str(row.get("observed_at") or "") or None,
        "provenance": provenance,
    }
    return ts, tick


def _open_text(path: Path):
    if path.suffix.lower() == ".gz":
        return gzip.open(path, "rt", encoding="utf-8-sig", newline="")
    return path.open("r", encoding="utf-8-sig", newline="")


def import_csv(path: Path) -> Iterator[dict[str, Any]]:
    with _open_text(path) as fh:
        yield from csv.DictReader(fh)


def import_json(path: Path) -> Iterator[dict[str, Any]]:
    with _open_text(path) as fh:
        data = json.load(fh)
    if isinstance(data, list):
        yield from (row for row in data if isinstance(row, dict))
    elif isinstance(data, dict):
        rows = data.get("rows") or data.get("data") or data.get("history") or data.get("candles") or []
        yield from (row for row in rows if isinstance(row, dict))


def import_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with _open_text(path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if isinstance(row, dict):
                yield row


def iter_rows(path: Path) -> Iterable[dict[str, Any]]:
    name = path.name.lower()
    if name.endswith((".csv", ".csv.gz")):
        return import_csv(path)
    if name.endswith((".jsonl", ".ndjson", ".jsonl.gz", ".ndjson.gz")):
        return import_jsonl(path)
    if name.endswith((".json", ".json.gz")):
        return import_json(path)
    raise ValueError(f"unsupported archive type: {path}")


def import_file(
    store: HistoryStore,
    path: Path,
    *,
    source: str,
    market: str = "BTC/USD",
    quote: str = "USD",
) -> dict[str, Any]:
    good = bad = 0
    minimum = maximum = None
    for raw in iter_rows(path):
        try:
            ts, tick = row_to_tick(raw, source, market, quote, provenance=str(path))
            store.append_market(ts, tick)
            minimum = ts if minimum is None else min(minimum, ts)
            maximum = ts if maximum is None else max(maximum, ts)
            good += 1
        except Exception:
            bad += 1
    return {"source": source, "file": str(path), "imported": good, "rejected": bad, "min_ts": minimum, "max_ts": maximum}


def self_test() -> None:
    ts, row = row_to_tick(
        {"timestamp": "2020-01-01T00:00:00Z", "open": 7000, "high": 7100, "low": 6900, "close": 7050, "Volume": 123.5},
        "demo", "BTC/USD", "USD", "self-test",
    )
    assert ts == 1577836800000
    assert row["interval_volume_btc"] == 123.5
    assert row["volume_24h_btc"] is None
    assert row["open_usd"] == 7000 and row["close_usd"] == 7050
    print("history_backfill.py self-test: PASS")


def main() -> int:
    parser = argparse.ArgumentParser(description="Import historical exchange OHLCV into the ZZX BPI history store.")
    parser.add_argument("file", nargs="?")
    parser.add_argument("--source", help="Registry exchange/source id.")
    parser.add_argument("--market", default="BTC/USD")
    parser.add_argument("--quote", default="USD")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--db")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test(); return 0
    if not args.file or not args.source:
        parser.error("file and --source are required")

    root = Path(args.root).resolve()
    db = Path(args.db).resolve() if args.db else root / "bitcoin/bpi/history.sqlite3"
    store = HistoryStore(db)
    result = import_file(store, Path(args.file), source=args.source, market=args.market, quote=args.quote)
    store.commit(); store.close()
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
