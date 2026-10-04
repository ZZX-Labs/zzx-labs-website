#!/usr/bin/env python3
"""Health checks for ZZX resident live telemetry and node snapshots."""
from __future__ import annotations

import argparse
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def parse_epoch(value: Any) -> float:
    if value is None:
        return math.nan
    try:
        if isinstance(value, (int, float)):
            n = float(value)
            if not math.isfinite(n) or n <= 0:
                return math.nan
            return n / 1000.0 if n >= 2e12 else n
        stamp = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        return stamp.timestamp()
    except Exception:
        return math.nan


def read_json(path: Path) -> dict[str, Any]:
    if not path.is_file() or path.stat().st_size <= 0:
        raise RuntimeError(f"missing/empty JSON: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"JSON root is not an object: {path}")
    return data


def age_seconds(value: Any) -> float:
    epoch = parse_epoch(value)
    if not math.isfinite(epoch):
        return math.inf
    return time.time() - epoch


def validate(root: Path, mempool_age: float, mining_age: float, lightning_age: float, nodes_age: float) -> dict[str, Any]:
    live = root / "bitcoin/live/api"
    limits = {
        "mempool": mempool_age,
        "mining": mining_age,
        "lightning": lightning_age,
    }
    result: dict[str, Any] = {"feeds": {}}
    for name, limit in limits.items():
        data = read_json(live / f"{name}.json")
        age = age_seconds(data.get("observed_at"))
        if age < -10 or age > limit:
            raise RuntimeError(f"{name} observed_at stale: age={age:.2f}s limit={limit:.2f}s")
        result["feeds"][name] = {
            "observed_at": data.get("observed_at"),
            "source_updated_at": data.get("source_updated_at"),
            "age_seconds": round(age, 3),
        }

    status = read_json(live / "status.json")
    status_age = age_seconds(status.get("observed_at"))
    if status_age < -10 or status_age > max(10.0, mempool_age):
        raise RuntimeError(f"live status heartbeat stale: age={status_age:.2f}s")
    result["status_age_seconds"] = round(status_age, 3)

    node_candidates = [
        root / "bitcoin/bitnodes/api/snapshots/latest.json",
        root / "bitcoin/bitnodes/api/zzxbitnodes/latest.json",
        root / "bitcoin/bitnodes/api/btcnodes/normalized/latest.json",
    ]
    node_data = None
    node_path = None
    for candidate in node_candidates:
        try:
            data = read_json(candidate)
        except Exception:
            continue
        stamp = data.get("observed_at") or data.get("updated_at") or data.get("generated_at") or data.get("timestamp")
        if math.isfinite(parse_epoch(stamp)):
            node_data, node_path = data, candidate
            break
    if node_data is not None:
        stamp = node_data.get("observed_at") or node_data.get("updated_at") or node_data.get("generated_at") or node_data.get("timestamp")
        age = age_seconds(stamp)
        if age < -10 or age > nodes_age:
            raise RuntimeError(f"node snapshot stale: age={age:.2f}s limit={nodes_age:.2f}s path={node_path}")
        result["nodes"] = {"path": str(node_path), "age_seconds": round(age, 3), "timestamp": stamp}
    else:
        result["nodes"] = {"path": None, "note": "node snapshot not yet materialized"}

    return result


def self_test() -> int:
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    assert abs(age_seconds(now)) < 2
    assert math.isinf(age_seconds(None))
    print("live_data_healthcheck self-test: ok")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--mempool-max-age", type=float, default=15.0)
    parser.add_argument("--mining-max-age", type=float, default=90.0)
    parser.add_argument("--lightning-max-age", type=float, default=90.0)
    parser.add_argument("--nodes-max-age", type=float, default=30.0)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    result = validate(Path(args.root).resolve(), args.mempool_max_age, args.mining_max_age, args.lightning_max_age, args.nodes_max_age)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
