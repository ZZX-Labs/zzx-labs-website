#!/usr/bin/env python3
"""Validate current BPI frontend contracts and hourly archive integrity."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
from typing import Any


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def positive(value: Any) -> float:
    n = float(value)
    if not math.isfinite(n) or n <= 0:
        raise ValueError(f"expected positive finite value, got {value!r}")
    return n


def validate_current(root: Path) -> dict[str, Any]:
    api = root / "bitcoin/bpi/api"
    latest = load(api / "latest.json")
    markets_payload = load(api / "markets.json")
    markets = markets_payload.get("markets")
    if not isinstance(markets, list):
        raise ValueError("markets.json markets must be an array")

    price = positive(latest.get("price_usd") or latest.get("bpi_usd"))
    global_obj = latest.get("global_bpi") if isinstance(latest.get("global_bpi"), dict) else {}
    global_price = positive(global_obj.get("weighted_price_usd") or latest.get("global_bpi_usd") or price)

    eligible = 0
    quarantined = 0
    weight_sum = 0.0
    for row in markets:
        if not isinstance(row, dict):
            raise ValueError("market row must be object")
        w = float(row.get("weight_ratio") or row.get("weight") or 0.0)
        if not math.isfinite(w) or w < 0:
            raise ValueError("invalid market weight")
        if row.get("index_eligible") is False:
            quarantined += 1
            if abs(w) > 1e-15:
                raise ValueError(f"quarantined market has non-zero weight: {row.get('exchange')}")
        else:
            if row.get("price_usd") is not None:
                positive(row.get("price_usd"))
                eligible += 1
                weight_sum += w

    if eligible >= 2 and weight_sum > 0 and abs(weight_sum - 1.0) > 1e-6:
        raise ValueError(f"eligible global weight sum is {weight_sum}, expected 1")

    return {
        "price_usd": price,
        "global_bpi_usd": global_price,
        "markets": len(markets),
        "eligible": eligible,
        "quarantined": quarantined,
        "weight_sum": weight_sum,
    }


def validate_manifest(root: Path, manifest_path: Path) -> dict[str, Any]:
    manifest = load(manifest_path)
    if manifest.get("schema") != "zzx-bpi-hourly-archive-v1":
        raise ValueError("unexpected archive schema")
    json_rows = sql_rows = 0
    for chunk in manifest.get("chunks", []):
        path = manifest_path.parent / str(chunk["path"])
        if not path.is_file():
            raise ValueError(f"missing archive chunk {path}")
        if sha256(path) != chunk.get("sha256"):
            raise ValueError(f"checksum mismatch {path}")
        if chunk.get("kind") == "jsonl-gzip":
            count = 0
            with gzip.open(path, "rt", encoding="utf-8") as fh:
                for line in fh:
                    row = json.loads(line)
                    positive(row["price_usd"])
                    count += 1
            if count != int(chunk.get("rows") or -1):
                raise ValueError(f"row count mismatch {path}")
            json_rows += count
        elif chunk.get("kind") == "mariadb-sql-gzip":
            sql_rows += int(chunk.get("rows") or 0)
    expected = int(manifest.get("rows") or 0)
    if json_rows != expected or sql_rows != expected:
        raise ValueError(f"archive row mismatch expected={expected} json={json_rows} sql={sql_rows}")

    orderbook = manifest.get("orderbook_history") if isinstance(manifest.get("orderbook_history"), dict) else {}
    ob_json = {"snapshots": 0, "events": 0}
    ob_sql = {"snapshots": 0, "events": 0}
    for chunk in orderbook.get("chunks") or []:
        path = manifest_path.parent / str(chunk["path"])
        if not path.is_file():
            raise ValueError(f"missing order-book archive chunk {path}")
        if sha256(path) != chunk.get("sha256"):
            raise ValueError(f"checksum mismatch {path}")
        kind = str(chunk.get("kind") or "")
        rows = int(chunk.get("rows") or 0)
        family = "snapshots" if "snapshots" in kind else "events" if "events" in kind else None
        if family is None:
            raise ValueError(f"unknown order-book chunk kind {kind}")
        if kind.endswith("jsonl-gzip"):
            count = 0
            with gzip.open(path, "rt", encoding="utf-8") as fh:
                for line in fh:
                    json.loads(line)
                    count += 1
            if count != rows:
                raise ValueError(f"order-book row count mismatch {path}")
            ob_json[family] += count
        elif kind.endswith("mariadb-sql-gzip"):
            ob_sql[family] += rows

    expected_snapshots = int(orderbook.get("snapshot_rows") or 0)
    expected_events = int(orderbook.get("event_rows") or 0)
    if ob_json["snapshots"] != expected_snapshots or ob_sql["snapshots"] != expected_snapshots:
        raise ValueError("order-book snapshot shard row mismatch")
    if ob_json["events"] != expected_events or ob_sql["events"] != expected_events:
        raise ValueError("order-book event shard row mismatch")

    return {
        "manifest": str(manifest_path),
        "rows": expected,
        "chunks": len(manifest.get("chunks", [])),
        "orderbook_snapshot_rows": expected_snapshots,
        "orderbook_event_rows": expected_events,
        "orderbook_chunks": len(orderbook.get("chunks") or []),
    }


def latest_manifest(root: Path) -> Path | None:
    index = root / "bitcoin/bpi/archive/archive-index.json"
    if not index.is_file():
        return None
    payload = load(index)
    hours = payload.get("hours") or []
    if not hours:
        return None
    return root / str(hours[-1]["manifest"])


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    p.add_argument("--manifest")
    p.add_argument("--allow-empty-current", action="store_true")
    args = p.parse_args()
    root = Path(args.root).resolve()
    result: dict[str, Any] = {}
    try:
        result["current"] = validate_current(root)
    except Exception as exc:
        if not args.allow_empty_current:
            raise
        result["current_warning"] = str(exc)
    manifest = Path(args.manifest).resolve() if args.manifest else latest_manifest(root)
    if manifest and manifest.is_file():
        result["archive"] = validate_manifest(root, manifest)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
