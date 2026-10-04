#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sqlite3
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from history_backfill import import_file
from history_store import HistoryStore, RESOLUTIONS

GENESIS_MS = 1231006505000  # 2009-01-03T18:15:05Z, Bitcoin genesis block time.


def iso(ms: int | None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def finite(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return math.nan
    return number if math.isfinite(number) else math.nan


def exchange_catalog(root: Path) -> dict[str, dict[str, Any]]:
    registry = load_json(root / "bitcoin/bpi/api/exchanges.json", {})
    sources = registry.get("sources") or {}
    return {
        str(exchange_id): dict(meta)
        for exchange_id, meta in sources.items()
        if isinstance(meta, dict) and meta.get("kind") == "exchange"
    }


def archive_files(incoming: Path, exchange_id: str) -> list[Path]:
    directory = incoming / exchange_id
    candidates: list[Path] = []
    if directory.is_dir():
        for pattern in ("*.csv", "*.csv.gz", "*.json", "*.json.gz", "*.jsonl", "*.jsonl.gz", "*.ndjson", "*.ndjson.gz"):
            candidates.extend(directory.rglob(pattern))
    # Also accept flat files named <exchange>.* or <exchange>-*.*.
    if incoming.is_dir():
        for path in incoming.iterdir():
            if path.is_file() and (path.name.startswith(exchange_id + ".") or path.name.startswith(exchange_id + "-")):
                candidates.append(path)
    return sorted(set(candidates))


def import_all(root: Path, store: HistoryStore, incoming: Path) -> list[dict[str, Any]]:
    catalog = exchange_catalog(root)
    rows = []
    for exchange_id, meta in sorted(catalog.items()):
        files = archive_files(incoming, exchange_id)
        summary = {
            "exchange": exchange_id,
            "label": meta.get("label") or exchange_id,
            "region": meta.get("region") or "Unknown",
            "status": meta.get("status"),
            "files": len(files),
            "imported": 0,
            "rejected": 0,
            "min_ts": None,
            "max_ts": None,
            "coverage": "missing-archive",
        }
        for path in files:
            result = import_file(store, path, source=exchange_id, market="BTC/USD", quote="USD")
            summary["imported"] += int(result["imported"])
            summary["rejected"] += int(result["rejected"])
            if result.get("min_ts") is not None:
                summary["min_ts"] = result["min_ts"] if summary["min_ts"] is None else min(summary["min_ts"], result["min_ts"])
            if result.get("max_ts") is not None:
                summary["max_ts"] = result["max_ts"] if summary["max_ts"] is None else max(summary["max_ts"], result["max_ts"])
        if summary["imported"]:
            summary["coverage"] = "imported"
        rows.append(summary)
    store.commit()
    return rows


def delete_index_sources(db: sqlite3.Connection) -> None:
    db.execute("DELETE FROM ticks WHERE source IN ('bpi','bpi-unweighted','global-bpi','global-bpi-unweighted') OR source LIKE 'bpi:%' OR source LIKE 'bpi-unweighted:%'")
    db.commit()


def exchange_bucket_rows(
    db: sqlite3.Connection,
    *,
    start_ms: int,
    end_ms: int,
    bucket_ms: int,
    exchange_ids: set[str],
) -> dict[int, dict[str, dict[str, Any]]]:
    if not exchange_ids:
        return {}
    placeholders = ",".join("?" for _ in exchange_ids)
    sql = f"""SELECT ts_ms,source,price_usd,open_usd,close_usd,high_usd,low_usd,
                     interval_volume_btc,volume_24h_btc
              FROM ticks
              WHERE source IN ({placeholders}) AND ts_ms>=? AND ts_ms<=?
              ORDER BY ts_ms"""
    args = [*sorted(exchange_ids), int(start_ms), int(end_ms)]
    rows = db.execute(sql, args).fetchall()
    grouped: dict[int, dict[str, dict[str, Any]]] = defaultdict(dict)

    # Aggregate each exchange to one representative bar per bucket first. This
    # avoids double-counting an exchange merely because it has multiple markets.
    for ts, source, price, open_price, close_price, high, low, interval_volume, rolling_volume in rows:
        bucket = (int(ts) // bucket_ms) * bucket_ms
        exchange = grouped[bucket].get(source)
        close = finite(close_price if close_price is not None else price)
        open_value = finite(open_price if open_price is not None else close)
        high_value = finite(high if high is not None else max(open_value, close))
        low_value = finite(low if low is not None else min(open_value, close))
        volume = finite(interval_volume)
        rolling = finite(rolling_volume)
        if not (math.isfinite(close) and close > 0):
            continue
        if exchange is None:
            grouped[bucket][source] = {
                "open": open_value if math.isfinite(open_value) else close,
                "high": high_value if math.isfinite(high_value) else close,
                "low": low_value if math.isfinite(low_value) else close,
                "close": close,
                "interval_volume_btc": volume if math.isfinite(volume) and volume >= 0 else None,
                "rolling_volume_24h_btc": rolling if math.isfinite(rolling) and rolling >= 0 else None,
                "last_ts": ts,
                "samples": 1,
            }
        else:
            exchange["high"] = max(float(exchange["high"]), high_value if math.isfinite(high_value) else close)
            exchange["low"] = min(float(exchange["low"]), low_value if math.isfinite(low_value) else close)
            exchange["samples"] += 1
            if math.isfinite(volume) and volume >= 0:
                exchange["interval_volume_btc"] = float(exchange.get("interval_volume_btc") or 0.0) + volume
            if ts >= exchange["last_ts"]:
                exchange["close"] = close
                exchange["last_ts"] = ts
                if math.isfinite(rolling) and rolling >= 0:
                    exchange["rolling_volume_24h_btc"] = rolling
    return dict(grouped)


def index_bar(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    rows = [r for r in rows if finite(r.get("close")) > 0]
    if not rows:
        return None
    unweighted = sum(float(r["close"]) for r in rows) / len(rows)
    with_volume = [r for r in rows if finite(r.get("interval_volume_btc")) > 0]
    total_interval_volume = sum(float(r["interval_volume_btc"]) for r in with_volume)
    if with_volume and total_interval_volume > 0:
        weighted = sum(float(r["close"]) * float(r["interval_volume_btc"]) for r in with_volume) / total_interval_volume
        method = "interval-volume-weighted"
    else:
        weighted = unweighted
        method = "arithmetic-fallback-no-interval-volume"
    high = max(float(r["high"]) for r in rows)
    low = min(float(r["low"]) for r in rows)
    # Index open uses the same weighting method as close when interval volume is
    # available; otherwise it is an arithmetic mean of constituent opens.
    if with_volume and total_interval_volume > 0:
        open_index = sum(float(r["open"]) * float(r["interval_volume_btc"]) for r in with_volume) / total_interval_volume
    else:
        open_index = sum(float(r["open"]) for r in rows) / len(rows)
    return {
        "open": open_index,
        "high": high,
        "low": low,
        "close": weighted,
        "weighted": weighted,
        "unweighted": unweighted,
        "interval_volume_btc": total_interval_volume if total_interval_volume > 0 else None,
        "exchange_count": len(rows),
        "volume_exchange_count": len(with_volume),
        "method": method,
    }


def rebuild_indexes(
    root: Path,
    store: HistoryStore,
    *,
    start_ms: int,
    end_ms: int,
    resolution: str,
) -> dict[str, Any]:
    bucket_ms = RESOLUTIONS.get(resolution)
    if not bucket_ms:
        raise ValueError(f"index resolution must be one of {sorted(k for k,v in RESOLUTIONS.items() if v)}")
    catalog = exchange_catalog(root)
    exchange_ids = set(catalog)
    db = store.db
    delete_index_sources(db)
    buckets = exchange_bucket_rows(db, start_ms=start_ms, end_ms=end_ms, bucket_ms=bucket_ms, exchange_ids=exchange_ids)

    policy = load_json(root / "bitcoin/bpi/api/bpi_index_policy.json", {})
    native_regions = {
        str(v).upper() for v in (policy.get("native_bpi") or {}).get("regions", [policy.get("default_country") or "US"])
    }

    output = {"buckets": 0, "native_buckets": 0, "global_buckets": 0, "native_regions": sorted(native_regions)}
    for bucket, exchanges in sorted(buckets.items()):
        global_rows = list(exchanges.values())
        native_rows = [row for exchange, row in exchanges.items() if str(catalog.get(exchange, {}).get("region") or "").upper() in native_regions]
        global_bar = index_bar(global_rows)
        native_bar = index_bar(native_rows)
        if global_bar:
            store.append_index(
                bucket, "global-bpi", global_bar["weighted"],
                high_usd=global_bar["high"], low_usd=global_bar["low"],
                open_usd=global_bar["open"], close_usd=global_bar["close"],
                interval_volume_btc=global_bar["interval_volume_btc"],
                provenance=f"historical-backtest:{resolution}:{global_bar['method']}",
            )
            store.append_index(
                bucket, "global-bpi-unweighted", global_bar["unweighted"],
                high_usd=global_bar["high"], low_usd=global_bar["low"],
                open_usd=global_bar["open"], close_usd=global_bar["unweighted"],
                interval_volume_btc=global_bar["interval_volume_btc"],
                provenance=f"historical-backtest:{resolution}:arithmetic",
            )
            output["global_buckets"] += 1
        if native_bar:
            store.append_index(
                bucket, "bpi", native_bar["weighted"],
                high_usd=native_bar["high"], low_usd=native_bar["low"],
                open_usd=native_bar["open"], close_usd=native_bar["close"],
                interval_volume_btc=native_bar["interval_volume_btc"],
                provenance=f"historical-backtest:{resolution}:{native_bar['method']}",
            )
            store.append_index(
                bucket, "bpi-unweighted", native_bar["unweighted"],
                high_usd=native_bar["high"], low_usd=native_bar["low"],
                open_usd=native_bar["open"], close_usd=native_bar["unweighted"],
                interval_volume_btc=native_bar["interval_volume_btc"],
                provenance=f"historical-backtest:{resolution}:arithmetic",
            )
            output["native_buckets"] += 1
        output["buckets"] += 1
    store.commit()
    return output


def coverage_from_db(store: HistoryStore, root: Path, imported: list[dict[str, Any]]) -> dict[str, Any]:
    catalog = exchange_catalog(root)
    by_exchange = {row["exchange"]: row for row in imported}
    sources = {row["source"]: row for row in store.sources()}
    rows = []
    for exchange_id, meta in sorted(catalog.items()):
        dbrow = sources.get(exchange_id, {})
        imp = by_exchange.get(exchange_id, {})
        rows.append({
            "exchange": exchange_id,
            "label": meta.get("label") or exchange_id,
            "region": meta.get("region") or "Unknown",
            "exchange_status": meta.get("status"),
            "points": int(dbrow.get("points") or 0),
            "first": iso(dbrow.get("min_ts")),
            "last": iso(dbrow.get("max_ts")),
            "archive_files_this_run": int(imp.get("files") or 0),
            "imported_this_run": int(imp.get("imported") or 0),
            "rejected_this_run": int(imp.get("rejected") or 0),
            "coverage": "available" if int(dbrow.get("points") or 0) else "missing",
        })
    return {
        "exchange_count": len(rows),
        "with_history": sum(1 for row in rows if row["points"] > 0),
        "missing_history": sum(1 for row in rows if row["points"] == 0),
        "exchanges": rows,
    }


def self_test(root: Path) -> None:
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        store = HistoryStore(Path(td) / "history.sqlite3")
        store.append_market(0, {"exchange": "coinbase", "market_key": "coinbase::BTC/USD", "quote": "USD", "open_usd": 10, "high_usd": 12, "low_usd": 9, "close_usd": 11, "price_usd": 11, "interval_volume_btc": 2})
        store.append_market(0, {"exchange": "bitstamp", "market_key": "bitstamp::BTC/USD", "quote": "USD", "open_usd": 20, "high_usd": 22, "low_usd": 19, "close_usd": 21, "price_usd": 21, "interval_volume_btc": 8})
        store.commit()
        rows = exchange_bucket_rows(store.db, start_ms=0, end_ms=1000, bucket_ms=1000, exchange_ids={"coinbase", "bitstamp"})
        bar = index_bar(list(rows[0].values()))
        assert abs(bar["weighted"] - 19.0) < 1e-9
        assert abs(bar["unweighted"] - 16.0) < 1e-9
        store.close()
    print("backtest_all_exchanges.py self-test: PASS")


def main() -> int:
    parser = argparse.ArgumentParser(description="Import/rebuild 2009-present exchange history and BPI/Global BPI indexes using only auditable local archives.")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--db")
    parser.add_argument("--incoming")
    parser.add_argument("--start-ms", type=int, default=GENESIS_MS)
    parser.add_argument("--end-ms", type=int, default=0)
    parser.add_argument("--index-resolution", default="1h")
    parser.add_argument("--skip-import", action="store_true")
    parser.add_argument("--skip-indexes", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    if args.self_test:
        self_test(root); return 0
    db = Path(args.db).resolve() if args.db else root / "bitcoin/bpi/history.sqlite3"
    incoming = Path(args.incoming).resolve() if args.incoming else root / "bitcoin/bpi/backfill/incoming"
    end_ms = args.end_ms or int(time.time() * 1000)
    store = HistoryStore(db)
    imported = [] if args.skip_import else import_all(root, store, incoming)
    indexes = {} if args.skip_indexes else rebuild_indexes(root, store, start_ms=args.start_ms, end_ms=end_ms, resolution=args.index_resolution)
    coverage = coverage_from_db(store, root, imported)
    report = {
        "schema": "zzx-bpi-historical-backtest-report-v1",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "period": {"from": iso(args.start_ms), "to": iso(end_ms)},
        "database": str(db),
        "incoming": str(incoming),
        "index_resolution": args.index_resolution,
        "indexes": indexes,
        **coverage,
        "integrity": {
            "interpolation": "none",
            "missing_archive_policy": "report-gap-never-fabricate",
            "non_usd_policy": "requires explicit USD-normalized price fields",
            "volume_policy": "interval_volume_btc is actual candle/base volume; volume_24h_btc is kept separate as rolling upstream statistic",
        },
    }
    report_path = root / "bitcoin/bpi/backfill/backtest-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    store.checkpoint("TRUNCATE")
    store.close()
    print(json.dumps({"report": str(report_path), "with_history": coverage["with_history"], "missing_history": coverage["missing_history"], "indexes": indexes}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
