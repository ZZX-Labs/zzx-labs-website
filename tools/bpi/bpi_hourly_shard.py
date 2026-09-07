#!/usr/bin/env python3
"""Finalize one UTC BPI capture window into immutable archive shards.

The archive contains raw price/rolling-volume observations from history.sqlite3.
It is intentionally distinct from full order-book event history: the ticker
collector does not possess the bid/ask delta stream required to reconstruct an
exchange's entire historical book.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

SCHEMA = "zzx-bpi-hourly-archive-v1"
DEFAULT_CHUNK_ROWS = 50_000
COLUMNS = (
    "ts_ms", "source", "market", "quote", "price_usd", "native_price",
    "volume_24h_btc", "high_usd", "low_usd", "weight",
)
ORDERBOOK_SNAPSHOT_COLUMNS = (
    "ts_ms", "source", "market", "sequence", "bids_json", "asks_json", "checksum",
)
ORDERBOOK_EVENT_COLUMNS = (
    "ts_ms", "source", "market", "sequence", "event_index", "side", "price", "size", "action",
)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def iso_ms(value: int) -> str:
    return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat().replace("+00:00", "Z")


def hour_floor_ms(value_ms: int) -> int:
    return (int(value_ms) // 3_600_000) * 3_600_000


def parse_time(value: str | None, default_ms: int | None = None) -> int:
    if value is None:
        if default_ms is None:
            raise ValueError("missing timestamp")
        return int(default_ms)
    raw = str(value).strip()
    if raw.isdigit():
        n = int(raw)
        return n * 1000 if n < 100_000_000_000 else n
    dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def atomic_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(obj, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", delete=False, dir=str(path.parent), prefix=path.name + ".", suffix=".tmp"
    ) as fh:
        fh.write(data)
        tmp = Path(fh.name)
    tmp.replace(path)


def sql_quote(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        n = float(value)
        if not math.isfinite(n):
            return "NULL"
        if isinstance(value, int):
            return str(value)
        return format(n, ".17g")
    text = str(value).replace("\\", "\\\\").replace("'", "''").replace("\x00", "")
    return "'" + text + "'"


def ddl() -> str:
    return """CREATE TABLE IF NOT EXISTS bpi_ticks (\n  ts_ms BIGINT NOT NULL,\n  source VARCHAR(128) NOT NULL,\n  market VARCHAR(255) NOT NULL,\n  quote VARCHAR(16) NULL,\n  price_usd DECIMAL(32,12) NOT NULL,\n  native_price DECIMAL(32,12) NULL,\n  volume_24h_btc DECIMAL(32,12) NULL,\n  high_usd DECIMAL(32,12) NULL,\n  low_usd DECIMAL(32,12) NULL,\n  weight DECIMAL(24,20) NULL,\n  PRIMARY KEY (ts_ms, source, market),\n  KEY idx_bpi_ticks_source_ts (source, ts_ms),\n  KEY idx_bpi_ticks_market_ts (source, market, ts_ms)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n"""


def row_dict(row: tuple[Any, ...]) -> dict[str, Any]:
    return {key: row[i] for i, key in enumerate(COLUMNS)}


def fetch_rows(db_path: Path, start_ms: int, end_ms: int) -> Iterable[tuple[Any, ...]]:
    if not db_path.is_file():
        return []
    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        cur = db.execute(
            """SELECT ts_ms,source,market,quote,price_usd,native_price,volume_24h_btc,high_usd,low_usd,weight
               FROM ticks WHERE ts_ms>=? AND ts_ms<? ORDER BY ts_ms,source,market""",
            (int(start_ms), int(end_ms)),
        )
        return cur.fetchall()
    finally:
        db.close()


def provider_coverage(root: Path, rows: list[tuple[Any, ...]]) -> dict[str, Any]:
    registry_path = root / "bitcoin/bpi/api/provider_urls.json"
    try:
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
    except Exception:
        registry = {}
    providers = registry.get("providers") if isinstance(registry, dict) else {}
    providers = providers if isinstance(providers, dict) else {}

    counts: dict[str, int] = {}
    markets: dict[str, set[str]] = {}
    for row in rows:
        source = str(row[1])
        counts[source] = counts.get(source, 0) + 1
        markets.setdefault(source, set()).add(str(row[2]))

    source_ids = sorted(set(providers) | set(counts))
    result = []
    for source in source_ids:
        cfg = providers.get(source) if isinstance(providers.get(source), dict) else {}
        result.append({
            "source": source,
            "label": cfg.get("label") or source,
            "enabled_poll": bool(cfg.get("enabled_poll")),
            "adapter": cfg.get("adapter"),
            "rows": counts.get(source, 0),
            "markets": len(markets.get(source, set())),
            "orderbook_snapshot_configured": bool(cfg.get("orderbook_url")),
            "orderbook_backfill_configured": bool(cfg.get("orderbook_history_url") or cfg.get("trades_url")),
        })
    return {
        "configured_providers": len(providers),
        "providers_with_rows": sum(1 for item in result if item["rows"] > 0),
        "providers": result,
    }


def archive_dir(root: Path, start_ms: int) -> Path:
    dt = datetime.fromtimestamp(start_ms / 1000, timezone.utc)
    return root / "bitcoin/bpi/archive/hourly" / dt.strftime("%Y/%m/%d/%H")


def existing_rows(base: Path) -> tuple[list[tuple[Any, ...]], int | None, int | None]:
    manifest_path = base / "manifest.json"
    if not manifest_path.is_file():
        return [], None, None
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return [], None, None
    rows: list[tuple[Any, ...]] = []
    for chunk in manifest.get("chunks", []):
        if chunk.get("kind") != "jsonl-gzip":
            continue
        path = base / str(chunk.get("path") or "")
        if not path.is_file():
            continue
        try:
            with gzip.open(path, "rt", encoding="utf-8") as fh:
                for line in fh:
                    obj = json.loads(line)
                    rows.append(tuple(obj.get(key) for key in COLUMNS))
        except Exception:
            continue
    return (
        rows,
        int(manifest.get("window_start_ms")) if manifest.get("window_start_ms") is not None else None,
        int(manifest.get("window_end_ms")) if manifest.get("window_end_ms") is not None else None,
    )


def write_chunk(base: Path, index: int, rows: list[tuple[Any, ...]]) -> list[dict[str, Any]]:
    json_path = base / f"ticks-{index:05d}.jsonl.gz"
    sql_dir = base / "mariadb"
    sql_dir.mkdir(parents=True, exist_ok=True)
    sql_path = sql_dir / f"ticks-{index:05d}.sql.gz"

    with gzip.open(json_path, "wt", encoding="utf-8", compresslevel=9) as fh:
        for row in rows:
            fh.write(json.dumps(row_dict(row), ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n")

    with gzip.open(sql_path, "wt", encoding="utf-8", compresslevel=9) as fh:
        fh.write(ddl())
        batch_size = 500
        for offset in range(0, len(rows), batch_size):
            batch = rows[offset:offset + batch_size]
            fh.write("INSERT INTO bpi_ticks (" + ",".join(COLUMNS) + ") VALUES\n")
            values = []
            for row in batch:
                values.append("(" + ",".join(sql_quote(v) for v in row) + ")")
            fh.write(",\n".join(values))
            fh.write("\nON DUPLICATE KEY UPDATE quote=VALUES(quote),price_usd=VALUES(price_usd),native_price=VALUES(native_price),volume_24h_btc=VALUES(volume_24h_btc),high_usd=VALUES(high_usd),low_usd=VALUES(low_usd),weight=VALUES(weight);\n")

    return [
        {
            "kind": "jsonl-gzip",
            "path": json_path.name,
            "rows": len(rows),
            "bytes": json_path.stat().st_size,
            "sha256": sha256(json_path),
        },
        {
            "kind": "mariadb-sql-gzip",
            "path": f"mariadb/{sql_path.name}",
            "rows": len(rows),
            "bytes": sql_path.stat().st_size,
            "sha256": sha256(sql_path),
        },
    ]



def fetch_orderbook_rows(db_path: Path, table: str, columns: tuple[str, ...], start_ms: int, end_ms: int) -> list[tuple[Any, ...]]:
    if not db_path.is_file():
        return []
    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        exists = db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
        if not exists:
            return []
        sql = f"SELECT {','.join(columns)} FROM {table} WHERE ts_ms>=? AND ts_ms<? ORDER BY ts_ms,source,market"
        return db.execute(sql, (int(start_ms), int(end_ms))).fetchall()
    finally:
        db.close()


def existing_orderbook_rows(base: Path, prefix: str, columns: tuple[str, ...]) -> list[tuple[Any, ...]]:
    rows: list[tuple[Any, ...]] = []
    ob_dir = base / "orderbooks"
    for path in sorted(ob_dir.glob(prefix + "-*.jsonl.gz")):
        try:
            with gzip.open(path, "rt", encoding="utf-8") as fh:
                for line in fh:
                    obj = json.loads(line)
                    rows.append(tuple(obj.get(key) for key in columns))
        except Exception:
            continue
    return rows


def write_orderbook_chunks(
    base: Path,
    kind: str,
    columns: tuple[str, ...],
    rows: list[tuple[Any, ...]],
    chunk_rows: int,
) -> list[dict[str, Any]]:
    if not rows:
        return []
    ob_dir = base / "orderbooks"
    sql_dir = base / "mariadb"
    ob_dir.mkdir(parents=True, exist_ok=True)
    sql_dir.mkdir(parents=True, exist_ok=True)

    if kind == "snapshots":
        table = "bpi_orderbook_snapshots"
        ddl_sql = """CREATE TABLE IF NOT EXISTS bpi_orderbook_snapshots (
  ts_ms BIGINT NOT NULL,
  source VARCHAR(128) NOT NULL,
  market VARCHAR(255) NOT NULL,
  sequence_id VARCHAR(255) NULL,
  bids_json LONGTEXT NOT NULL,
  asks_json LONGTEXT NOT NULL,
  checksum CHAR(64) NOT NULL,
  PRIMARY KEY (ts_ms, source, market),
  KEY idx_ob_snap_source_ts (source, ts_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n"""
        sql_cols = ("ts_ms","source","market","sequence_id","bids_json","asks_json","checksum")
    else:
        table = "bpi_orderbook_events"
        ddl_sql = """CREATE TABLE IF NOT EXISTS bpi_orderbook_events (
  ts_ms BIGINT NOT NULL,
  source VARCHAR(128) NOT NULL,
  market VARCHAR(255) NOT NULL,
  sequence_id VARCHAR(255) NOT NULL,
  event_index INT NOT NULL,
  side VARCHAR(8) NOT NULL,
  price DECIMAL(38,18) NOT NULL,
  size DECIMAL(38,18) NOT NULL,
  action VARCHAR(16) NOT NULL,
  PRIMARY KEY (source, market, sequence_id, event_index),
  KEY idx_ob_evt_source_ts (source, ts_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n"""
        sql_cols = ("ts_ms","source","market","sequence_id","event_index","side","price","size","action")

    out: list[dict[str, Any]] = []
    for i, offset in enumerate(range(0, len(rows), chunk_rows)):
        batch = rows[offset:offset + chunk_rows]
        json_path = ob_dir / f"{kind}-{i:05d}.jsonl.gz"
        sql_path = sql_dir / f"orderbook-{kind}-{i:05d}.sql.gz"

        with gzip.open(json_path, "wt", encoding="utf-8", compresslevel=9) as fh:
            for row in batch:
                fh.write(json.dumps({key: row[n] for n,key in enumerate(columns)}, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n")

        with gzip.open(sql_path, "wt", encoding="utf-8", compresslevel=9) as fh:
            fh.write(ddl_sql)
            sql_batch = 200 if kind == "snapshots" else 1000
            for j in range(0, len(batch), sql_batch):
                part = batch[j:j + sql_batch]
                fh.write(f"INSERT INTO {table} ({','.join(sql_cols)}) VALUES\n")
                fh.write(",\n".join("(" + ",".join(sql_quote(v) for v in row) + ")" for row in part))
                fh.write("\nON DUPLICATE KEY UPDATE ts_ms=VALUES(ts_ms);\n")

        out.extend([
            {
                "kind": f"orderbook-{kind}-jsonl-gzip",
                "path": f"orderbooks/{json_path.name}",
                "rows": len(batch),
                "bytes": json_path.stat().st_size,
                "sha256": sha256(json_path),
            },
            {
                "kind": f"orderbook-{kind}-mariadb-sql-gzip",
                "path": f"mariadb/{sql_path.name}",
                "rows": len(batch),
                "bytes": sql_path.stat().st_size,
                "sha256": sha256(sql_path),
            },
        ])
    return out


def orderbook_registry_coverage(root: Path, snapshot_rows: list[tuple[Any, ...]], event_rows: list[tuple[Any, ...]]) -> dict[str, Any]:
    path = root / "bitcoin/bpi/api/orderbook_source_registry.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        payload = {}
    providers = payload.get("providers") if isinstance(payload, dict) else []
    providers = providers if isinstance(providers, list) else []
    snapshot_sources = {str(row[1]) for row in snapshot_rows}
    event_sources = {str(row[1]) for row in event_rows}
    configured = sum(1 for row in providers if isinstance(row, dict) and row.get("orderbook_capture_enabled") is True)
    verified = sum(1 for row in providers if isinstance(row, dict) and row.get("verification") == "verified")
    return {
        "registry_providers": len(providers),
        "capture_enabled": configured,
        "verified": verified,
        "snapshot_sources_with_rows": len(snapshot_sources),
        "event_sources_with_rows": len(event_sources),
    }

def update_archive_index(root: Path, manifest: dict[str, Any], manifest_path: Path) -> None:
    index_path = root / "bitcoin/bpi/archive/archive-index.json"
    try:
        index = json.loads(index_path.read_text(encoding="utf-8"))
    except Exception:
        index = {"schema": "zzx-bpi-archive-index-v1", "hours": []}
    hours = index.get("hours") if isinstance(index.get("hours"), list) else []
    rel = manifest_path.relative_to(root).as_posix()
    entry = {
        "hour_id": manifest["hour_id"],
        "window_start": manifest["window_start"],
        "window_end": manifest["window_end"],
        "rows": manifest["rows"],
        "orderbook_snapshot_rows": manifest.get("orderbook_history", {}).get("snapshot_rows", 0),
        "orderbook_event_rows": manifest.get("orderbook_history", {}).get("event_rows", 0),
        "providers_with_rows": manifest["coverage"]["providers_with_rows"],
        "manifest": rel,
        "complete_utc_hour": manifest["complete_utc_hour"],
        "updated_at": manifest["generated_at"],
    }
    hours = [h for h in hours if h.get("hour_id") != entry["hour_id"]]
    hours.append(entry)
    hours.sort(key=lambda h: str(h.get("window_start") or ""))
    index.update({"schema": "zzx-bpi-archive-index-v1", "updated_at": utcnow(), "hours": hours})
    atomic_json(index_path, index)


def finalize(root: Path, start_ms: int, end_ms: int, chunk_rows: int = DEFAULT_CHUNK_ROWS) -> dict[str, Any]:
    if end_ms <= start_ms:
        raise ValueError("end must be after start")
    chunk_rows = max(1000, int(chunk_rows))
    db_path = root / "bitcoin/bpi/history.sqlite3"
    fresh_rows = list(fetch_rows(db_path, start_ms, end_ms))
    base = archive_dir(root, start_ms)
    base.mkdir(parents=True, exist_ok=True)

    # Re-runs within the same UTC hour are cumulative. Existing committed
    # shard rows are merged by the SQLite/MariaDB primary key before the
    # hour is rewritten, so a retry cannot erase earlier observations.
    prior_rows, prior_start, prior_end = existing_rows(base)
    merged: dict[tuple[Any, Any, Any], tuple[Any, ...]] = {}
    for row in [*prior_rows, *fresh_rows]:
        try:
            key = (int(row[0]), str(row[1]), str(row[2]))
        except Exception:
            continue
        merged[key] = row
    rows = [merged[key] for key in sorted(merged)]

    if prior_start is not None:
        start_ms = min(start_ms, prior_start)
    if prior_end is not None:
        end_ms = max(end_ms, prior_end)

    for pattern in ("ticks-*.jsonl.gz", "mariadb/ticks-*.sql.gz"):
        for path in base.glob(pattern):
            path.unlink()

    chunks: list[dict[str, Any]] = []
    for i, offset in enumerate(range(0, len(rows), chunk_rows)):
        chunks.extend(write_chunk(base, i, rows[offset:offset + chunk_rows]))

    orderbook_db = root / "bitcoin/bpi/orderbooks.sqlite3"
    fresh_snapshots = fetch_orderbook_rows(
        orderbook_db, "orderbook_snapshots", ORDERBOOK_SNAPSHOT_COLUMNS, start_ms, end_ms
    )
    fresh_events = fetch_orderbook_rows(
        orderbook_db, "orderbook_events", ORDERBOOK_EVENT_COLUMNS, start_ms, end_ms
    )

    prior_snapshots = existing_orderbook_rows(base, "snapshots", ORDERBOOK_SNAPSHOT_COLUMNS)
    prior_events = existing_orderbook_rows(base, "events", ORDERBOOK_EVENT_COLUMNS)

    snapshot_map: dict[tuple[Any, Any, Any], tuple[Any, ...]] = {}
    for row in [*prior_snapshots, *fresh_snapshots]:
        snapshot_map[(int(row[0]), str(row[1]), str(row[2]))] = row
    snapshots = [snapshot_map[key] for key in sorted(snapshot_map)]

    event_map: dict[tuple[Any, Any, Any, Any], tuple[Any, ...]] = {}
    for row in [*prior_events, *fresh_events]:
        event_map[(str(row[1]), str(row[2]), str(row[3]), int(row[4]))] = row
    events = sorted(event_map.values(), key=lambda row: (int(row[0]), str(row[1]), str(row[2]), str(row[3]), int(row[4])))

    for pattern in ("orderbooks/snapshots-*.jsonl.gz", "orderbooks/events-*.jsonl.gz", "mariadb/orderbook-snapshots-*.sql.gz", "mariadb/orderbook-events-*.sql.gz"):
        for path in base.glob(pattern):
            path.unlink()

    orderbook_chunks = []
    orderbook_chunks.extend(write_orderbook_chunks(base, "snapshots", ORDERBOOK_SNAPSHOT_COLUMNS, snapshots, chunk_rows))
    orderbook_chunks.extend(write_orderbook_chunks(base, "events", ORDERBOOK_EVENT_COLUMNS, events, chunk_rows))
    orderbook_coverage = orderbook_registry_coverage(root, snapshots, events)

    hour_start = hour_floor_ms(start_ms)
    full_hour_end = hour_start + 3_600_000
    coverage = provider_coverage(root, rows)
    source_counts: dict[str, int] = {}
    for row in rows:
        source = str(row[1])
        source_counts[source] = source_counts.get(source, 0) + 1

    manifest = {
        "schema": SCHEMA,
        "generated_at": utcnow(),
        "hour_id": datetime.fromtimestamp(hour_start / 1000, timezone.utc).strftime("%Y-%m-%dT%H:00:00Z"),
        "window_start": iso_ms(start_ms),
        "window_end": iso_ms(end_ms),
        "window_start_ms": start_ms,
        "window_end_ms": end_ms,
        "complete_utc_hour": start_ms <= hour_start and end_ms >= full_hour_end,
        "coverage_seconds": round((end_ms - start_ms) / 1000, 3),
        "rows": len(rows),
        "sources_with_rows": len(source_counts),
        "source_rows": dict(sorted(source_counts.items())),
        "chunk_rows": chunk_rows,
        "chunks": chunks,
        "coverage": coverage,
        "orderbook_history": {
            "status": "available" if snapshots or events else "adapter-required-or-no-records",
            "note": "Price/volume ticks are never used to fabricate L2/L3 history. Order-book shards contain only separately ingested provider snapshots/deltas with source/market/sequence metadata.",
            "snapshot_rows": len(snapshots),
            "event_rows": len(events),
            "chunks": orderbook_chunks,
            "coverage": orderbook_coverage,
        },
    }
    manifest_path = base / "manifest.json"
    atomic_json(manifest_path, manifest)
    update_archive_index(root, manifest, manifest_path)
    return {**manifest, "manifest_path": manifest_path.relative_to(root).as_posix()}


def self_test() -> None:
    from history_store import HistoryStore
    from orderbook_store import OrderBookStore

    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / "bitcoin/bpi/api").mkdir(parents=True)
        atomic_json(root / "bitcoin/bpi/api/provider_urls.json", {
            "providers": {
                "a": {"label": "A", "enabled_poll": True, "adapter": "fixture"},
                "b": {"label": "B", "enabled_poll": False, "adapter": None},
            }
        })
        atomic_json(root / "bitcoin/bpi/api/orderbook_source_registry.json", {
            "providers": [
                {"source": "a", "orderbook_capture_enabled": True, "verification": "verified"},
                {"source": "b", "orderbook_capture_enabled": False, "verification": "adapter-required"},
            ]
        })

        store = HistoryStore(root / "bitcoin/bpi/history.sqlite3")
        start = 1_700_000_000_000
        for i in range(5):
            store.append_market(start + i * 2500, {
                "exchange": "a", "market_key": "a::BTC/USD", "quote": "USD",
                "price_usd": 79000 + i, "native_price": 79000 + i,
                "volume_24h_btc": 1000 + i, "high_24h_usd": 80000, "low_24h_usd": 78000,
            })
        store.commit()

        books = OrderBookStore(root / "bitcoin/bpi/orderbooks.sqlite3")
        books.append_snapshot(
            start + 1000, "a", "BTC/USD",
            [["78999.0", "1.25"]], [["79001.0", "0.75"]], sequence="100",
        )
        books.append_event(
            start + 1500, "a", "BTC/USD", "101", 0,
            "bid", "79000.0", "2.0", "update",
        )
        books.commit()

        result = finalize(root, start, start + 20_000, chunk_rows=1000)
        assert result["rows"] == 5
        assert result["coverage"]["configured_providers"] == 2
        assert result["coverage"]["providers_with_rows"] == 1
        assert any(c["kind"] == "jsonl-gzip" for c in result["chunks"])
        assert any(c["kind"] == "mariadb-sql-gzip" for c in result["chunks"])
        assert result["orderbook_history"]["snapshot_rows"] == 1
        assert result["orderbook_history"]["event_rows"] == 1
        assert result["orderbook_history"]["coverage"]["registry_providers"] == 2
        assert result["orderbook_history"]["coverage"]["verified"] == 1
        assert len(result["orderbook_history"]["chunks"]) == 4

        # A same-hour retry must merge prior committed shards rather than erase them.
        store.append_market(start + 30_000, {
            "exchange": "a", "market_key": "a::BTC/USD", "quote": "USD",
            "price_usd": 79010, "native_price": 79010,
            "volume_24h_btc": 1010, "high_24h_usd": 80000, "low_24h_usd": 78000,
        })
        store.commit()
        cumulative = finalize(root, start + 25_000, start + 40_000, chunk_rows=1000)
        assert cumulative["rows"] == 6
        assert cumulative["orderbook_history"]["snapshot_rows"] == 1
        assert cumulative["orderbook_history"]["event_rows"] == 1

        manifest = root / cumulative["manifest_path"]
        assert manifest.is_file()
    print("bpi_hourly_shard.py self-test: PASS")


def main() -> int:
    p = argparse.ArgumentParser(description="Finalize one BPI capture window into JSONL/MariaDB hourly shards.")
    p.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    p.add_argument("--start", help="Window start (ISO-8601 or epoch seconds/ms).")
    p.add_argument("--end", help="Window end, exclusive (ISO-8601 or epoch seconds/ms).")
    p.add_argument("--chunk-rows", type=int, default=DEFAULT_CHUNK_ROWS)
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()
    if args.self_test:
        self_test()
        return 0
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    start_ms = parse_time(args.start, hour_floor_ms(now_ms))
    end_ms = parse_time(args.end, now_ms)
    result = finalize(Path(args.root).resolve(), start_ms, end_ms, args.chunk_rows)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
