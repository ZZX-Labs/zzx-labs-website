#!/usr/bin/env python3
"""Runtime contract checker for the perpetual ZZX BPI service.

Validates that the resident collector is producing fresh atomic snapshots, that
all enabled market-provider definitions are scheduled at 2.5-5 seconds, that
provider attempts are represented in provider_health.json, and that weighted
and unweighted BPI values are finite and internally coherent.
"""
from __future__ import annotations

import argparse
import json
import math
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MIN_POLL_MS = 2500
MAX_POLL_MS = 5000


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"{path} must contain a JSON object")
    return value


def finite_positive(value: Any, label: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = math.nan
    if not math.isfinite(number) or number <= 0:
        raise RuntimeError(f"{label} must be finite and positive; got {value!r}")
    return number


def parse_time(value: Any) -> float:
    raw = str(value or "").strip()
    if not raw:
        raise RuntimeError("missing updated_at")
    dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def active_providers(provider_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    providers = provider_data.get("providers")
    if not isinstance(providers, dict):
        raise RuntimeError("provider_urls.json providers must be an object")
    return {
        str(pid): cfg
        for pid, cfg in providers.items()
        if isinstance(cfg, dict)
        and cfg.get("enabled_poll") is True
        and cfg.get("adapter")
        and cfg.get("price_volume_url")
    }


def validate_once(root: Path, *, max_age_seconds: float) -> dict[str, Any]:
    api = root / "bitcoin/bpi/api"
    provider_data = read_json(api / "provider_urls.json")
    latest = read_json(api / "latest.json")
    markets = read_json(api / "markets.json")
    health = read_json(api / "provider_health.json")

    active = active_providers(provider_data)
    if not active:
        raise RuntimeError("no enabled live market providers configured")

    bad_intervals = []
    for pid, cfg in active.items():
        try:
            interval = int(cfg.get("poll_interval_ms") or MIN_POLL_MS)
        except (TypeError, ValueError):
            bad_intervals.append((pid, cfg.get("poll_interval_ms")))
            continue
        if not MIN_POLL_MS <= interval <= MAX_POLL_MS:
            bad_intervals.append((pid, interval))
    if bad_intervals:
        raise RuntimeError(f"providers outside 2500-5000 ms contract: {bad_intervals}")

    updated_epoch = parse_time(latest.get("updated_at"))
    age = time.time() - updated_epoch
    if age < -5:
        raise RuntimeError(f"latest.json timestamp is in the future by {-age:.2f}s")
    if age > max_age_seconds:
        raise RuntimeError(f"latest.json stale: age={age:.2f}s > {max_age_seconds:.2f}s")

    weighted = finite_positive(
        (latest.get("weighted_average") or {}).get("price_usd")
        or latest.get("price_usd")
        or latest.get("bpi_usd"),
        "weighted BPI",
    )
    unweighted = finite_positive(
        (latest.get("weighted_average") or {}).get("unweighted_price_usd")
        or latest.get("unweighted_bpi_usd"),
        "unweighted BPI",
    )
    global_bpi = latest.get("global_bpi") or {}
    global_weighted = finite_positive(
        global_bpi.get("weighted_price_usd") or global_bpi.get("price_usd"),
        "global weighted BPI",
    )
    finite_positive(global_bpi.get("unweighted_price_usd"), "global unweighted BPI")

    rows = markets.get("markets")
    if not isinstance(rows, list) or len(rows) < 2:
        raise RuntimeError(f"insufficient market rows: {0 if not isinstance(rows, list) else len(rows)}")

    health_rows = health.get("providers")
    if not isinstance(health_rows, dict):
        raise RuntimeError("provider_health.json providers must be an object")

    attempted = set()
    for key in health_rows:
        name = str(key)
        provider_id = name.split("::", 1)[0]
        provider_id = provider_id.split(":", 1)[0]
        if provider_id in active:
            attempted.add(provider_id)

    missing_attempts = sorted(set(active) - attempted)
    if missing_attempts:
        raise RuntimeError(
            "enabled providers have no runtime attempt recorded: "
            + ", ".join(missing_attempts)
        )

    return {
        "updated_at": latest.get("updated_at"),
        "updated_epoch": updated_epoch,
        "age_seconds": age,
        "active_providers": len(active),
        "attempted_providers": len(attempted),
        "market_rows": len(rows),
        "weighted_bpi_usd": weighted,
        "unweighted_bpi_usd": unweighted,
        "global_weighted_bpi_usd": global_weighted,
    }


def watch(root: Path, *, watch_seconds: float, max_age_seconds: float, max_cycle_gap_seconds: float) -> dict[str, Any]:
    first = validate_once(root, max_age_seconds=max_age_seconds)
    stamps = [float(first["updated_epoch"])]
    deadline = time.monotonic() + max(0.0, watch_seconds)

    while time.monotonic() < deadline:
        time.sleep(0.5)
        sample = validate_once(root, max_age_seconds=max_age_seconds)
        stamp = float(sample["updated_epoch"])
        if stamp > stamps[-1]:
            stamps.append(stamp)

    if watch_seconds > 0 and len(stamps) < 3:
        raise RuntimeError(
            f"BPI snapshot did not advance enough during watch: unique_updates={len(stamps)}"
        )

    gaps = [b - a for a, b in zip(stamps, stamps[1:])]
    if gaps and max(gaps) > max_cycle_gap_seconds:
        raise RuntimeError(
            f"BPI snapshot cadence exceeded {max_cycle_gap_seconds:.2f}s: max_gap={max(gaps):.3f}s"
        )

    result = validate_once(root, max_age_seconds=max_age_seconds)
    result.update({
        "observed_updates": len(stamps),
        "observed_max_gap_seconds": max(gaps) if gaps else 0.0,
    })
    return result


def self_test() -> None:
    with tempfile.TemporaryDirectory(prefix="zzx-bpi-healthcheck-") as td:
        root = Path(td)
        api = root / "bitcoin/bpi/api"
        api.mkdir(parents=True)
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        (api / "provider_urls.json").write_text(json.dumps({
            "providers": {
                "a": {"enabled_poll": True, "adapter": "x", "price_volume_url": "https://example/a", "poll_interval_ms": 2500},
                "b": {"enabled_poll": True, "adapter": "x", "price_volume_url": "https://example/b", "poll_interval_ms": 5000},
                "disabled": {"enabled_poll": False},
            }
        }), encoding="utf-8")
        (api / "latest.json").write_text(json.dumps({
            "updated_at": now,
            "weighted_average": {"price_usd": 100.0, "unweighted_price_usd": 101.0},
            "global_bpi": {"weighted_price_usd": 100.5, "unweighted_price_usd": 100.7},
        }), encoding="utf-8")
        (api / "markets.json").write_text(json.dumps({"markets": [{"exchange": "a"}, {"exchange": "b"}]}), encoding="utf-8")
        (api / "provider_health.json").write_text(json.dumps({"providers": {"a::USD": {"ok": True}, "b::USD": {"ok": False}}}), encoding="utf-8")
        result = validate_once(root, max_age_seconds=10)
        assert result["active_providers"] == 2
        assert result["attempted_providers"] == 2
    print("bpi_runtime_healthcheck.py self-test: PASS")


def main() -> int:
    p = argparse.ArgumentParser(description="Validate perpetual ZZX BPI runtime freshness and cadence")
    p.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    p.add_argument("--max-age-seconds", type=float, default=10.0)
    p.add_argument("--watch-seconds", type=float, default=0.0)
    p.add_argument("--max-cycle-gap-seconds", type=float, default=6.0)
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()
    if args.self_test:
        self_test()
        return 0
    result = watch(
        Path(args.root).resolve(),
        watch_seconds=args.watch_seconds,
        max_age_seconds=args.max_age_seconds,
        max_cycle_gap_seconds=args.max_cycle_gap_seconds,
    )
    print(json.dumps({"schema": "zzx-bpi-runtime-health-v1", "ok": True, **result}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
