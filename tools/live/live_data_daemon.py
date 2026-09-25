#!/usr/bin/env python3
"""Persistent ZZX live Bitcoin telemetry collector.

This process is deliberately separate from the BPI and Bitnodes collectors:
- BPI owns exchange price/volume at 2.5-5 s.
- Bitnodes owns node snapshots at its configured cadence.
- This daemon owns mempool/mining/Lightning summaries whose upstreams are
  otherwise only queried when a browser happens to be open.

Every public document distinguishes `observed_at` (our successful poll time)
from `source_updated_at` (the upstream timestamp when one exists).  Widgets can
therefore show a constantly advancing health/freshness timestamp without
pretending an upstream dataset changed when it did not.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import signal
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

USER_AGENT = "ZZX-Labs-LiveData/1.0 (+https://zzx-labs.io/)"
DEFAULT_MEMPOOL_BASE = "https://mempool.space/api"
STOP = False


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    try:
        if isinstance(value, (int, float)):
            n = float(value)
            if n <= 0:
                return None
            if n < 2e12:
                n *= 1000.0
            return datetime.fromtimestamp(n / 1000.0, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        text = str(value).strip()
        if not text:
            return None
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    except Exception:
        return None


def deep_source_timestamp(obj: Any, depth: int = 0) -> str | None:
    if depth > 4:
        return None
    if isinstance(obj, dict):
        for key in (
            "updated_at", "updatedAt", "timestamp", "time", "generated_at",
            "generatedAt", "created_at", "createdAt", "last_updated", "lastUpdated",
        ):
            if key in obj:
                stamp = parse_timestamp(obj.get(key))
                if stamp:
                    return stamp
        for key in ("latest", "statistics", "stats", "network", "data", "result"):
            if key in obj:
                stamp = deep_source_timestamp(obj.get(key), depth + 1)
                if stamp:
                    return stamp
    elif isinstance(obj, list) and obj:
        for item in reversed(obj[-3:]):
            stamp = deep_source_timestamp(item, depth + 1)
            if stamp:
                return stamp
    return None


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(name, path)
    finally:
        try:
            if os.path.exists(name):
                os.unlink(name)
        except OSError:
            pass


def get_json(url: str, timeout: float = 4.5) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def get_text(url: str, timeout: float = 4.5) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/plain,*/*;q=0.5",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace").strip()


def first_success(urls: list[str], timeout: float = 4.5) -> tuple[Any, str]:
    last: Exception | None = None
    for url in urls:
        try:
            return get_json(url, timeout), url
        except Exception as exc:
            last = exc
    raise last or RuntimeError("no candidate URLs")


def parallel_json(requests: dict[str, str], timeout: float = 4.5) -> tuple[dict[str, Any], dict[str, str]]:
    values: dict[str, Any] = {}
    errors: dict[str, str] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, len(requests))) as pool:
        futures = {pool.submit(get_json, url, timeout): (key, url) for key, url in requests.items()}
        for future in concurrent.futures.as_completed(futures):
            key, url = futures[future]
            try:
                values[key] = future.result()
            except Exception as exc:
                errors[key] = f"{type(exc).__name__}: {exc} [{url}]"
    return values, errors


def collect_mempool(base: str) -> dict[str, Any]:
    base = base.rstrip("/")
    requests = {
        "summary": f"{base}/mempool",
        "fee_recommendations": f"{base}/v1/fees/recommended",
        "candidate_blocks": f"{base}/v1/fees/mempool-blocks",
    }
    values, errors = parallel_json(requests, timeout=4.5)
    try:
        tip = get_text(f"{base}/blocks/tip/height", timeout=4.5)
        values["tip_height"] = int(tip)
    except Exception as exc:
        errors["tip_height"] = f"{type(exc).__name__}: {exc}"

    if "summary" not in values and "candidate_blocks" not in values:
        raise RuntimeError("mempool summary and candidate-block endpoints both failed")

    stamps = [deep_source_timestamp(v) for v in values.values()]
    source_stamp = max((s for s in stamps if s), default=None)
    observed = utcnow()
    return {
        "schema": "zzx-live-mempool-v1",
        "observed_at": observed,
        "source_updated_at": source_stamp,
        "source": base,
        "summary": values.get("summary"),
        "fee_recommendations": values.get("fee_recommendations"),
        "candidate_blocks": values.get("candidate_blocks") or [],
        "tip_height": values.get("tip_height"),
        "partial_errors": errors,
    }


def collect_mining(base: str) -> dict[str, Any]:
    base = base.rstrip("/")
    requests = {
        "hashrate": f"{base}/v1/mining/hashrate/3d",
        "difficulty_adjustment": f"{base}/v1/difficulty-adjustment",
    }
    values, errors = parallel_json(requests, timeout=6.0)
    if not values:
        raise RuntimeError("all mining endpoints failed")
    stamps = [deep_source_timestamp(v) for v in values.values()]
    observed = utcnow()
    return {
        "schema": "zzx-live-mining-v1",
        "observed_at": observed,
        "source_updated_at": max((s for s in stamps if s), default=None),
        "source": base,
        "hashrate": values.get("hashrate"),
        "difficulty_adjustment": values.get("difficulty_adjustment"),
        "partial_errors": errors,
    }


def collect_lightning(base: str) -> dict[str, Any]:
    base = base.rstrip("/")
    urls = [
        f"{base}/v1/lightning/statistics/latest",
        f"{base}/v1/lightning/statistics",
        f"{base}/v1/lightning",
        f"{base}/v1/lightning/network",
    ]
    payload, source = first_success(urls, timeout=6.0)
    observed = utcnow()
    return {
        "schema": "zzx-live-lightning-v1",
        "observed_at": observed,
        "source_updated_at": deep_source_timestamp(payload),
        "source": source,
        "data": payload,
    }


@dataclass
class Feed:
    name: str
    cadence_ms: int
    output: Path
    collector: Callable[[], dict[str, Any]]
    next_due: float = 0.0
    attempts: int = 0
    successes: int = 0
    failures: int = 0
    consecutive_failures: int = 0
    last_success_at: str | None = None
    last_attempt_at: str | None = None
    last_error: str | None = None
    last_elapsed_ms: float | None = None
    last_source_updated_at: str | None = None

    def run(self) -> None:
        started = time.monotonic()
        scheduled = started
        self.attempts += 1
        self.last_attempt_at = utcnow()
        try:
            payload = self.collector()
            atomic_json(self.output, payload)
            self.successes += 1
            self.consecutive_failures = 0
            self.last_success_at = payload.get("observed_at") or utcnow()
            self.last_source_updated_at = payload.get("source_updated_at")
            self.last_error = None
        except Exception as exc:
            self.failures += 1
            self.consecutive_failures += 1
            self.last_error = f"{type(exc).__name__}: {exc}"
        finally:
            self.last_elapsed_ms = round((time.monotonic() - started) * 1000.0, 2)
            # Fixed-rate scheduling from cycle start.  A slow request must not
            # silently turn a 5 s feed into 5 s + request latency forever.
            interval = self.cadence_ms / 1000.0
            self.next_due = scheduled + interval
            if self.next_due < time.monotonic():
                self.next_due = time.monotonic() + min(interval, 0.25)

    def status(self) -> dict[str, Any]:
        return {
            "cadence_ms": self.cadence_ms,
            "attempts": self.attempts,
            "successes": self.successes,
            "failures": self.failures,
            "consecutive_failures": self.consecutive_failures,
            "last_attempt_at": self.last_attempt_at,
            "last_success_at": self.last_success_at,
            "source_updated_at": self.last_source_updated_at,
            "last_elapsed_ms": self.last_elapsed_ms,
            "last_error": self.last_error,
            "output": str(self.output),
        }


def handle_signal(_signum: int | None = None, _frame: Any = None) -> None:
    global STOP
    STOP = True


def self_test() -> int:
    assert parse_timestamp(1_700_000_000) is not None
    assert parse_timestamp("2026-09-23T12:00:00Z") == "2026-09-23T12:00:00.000Z"
    assert deep_source_timestamp({"data": {"updated_at": "2026-09-23T12:00:00Z"}})
    print("live_data_daemon self-test: ok")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="ZZX resident mempool/mining/Lightning telemetry daemon")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--mempool-base", default=os.environ.get("ZZX_MEMPOOL_API_BASE", DEFAULT_MEMPOOL_BASE))
    parser.add_argument("--mempool-ms", type=int, default=int(os.environ.get("ZZX_MEMPOOL_POLL_MS", "5000")))
    parser.add_argument("--mining-ms", type=int, default=int(os.environ.get("ZZX_MINING_POLL_MS", "15000")))
    parser.add_argument("--lightning-ms", type=int, default=int(os.environ.get("ZZX_LIGHTNING_POLL_MS", "15000")))
    parser.add_argument("--run-seconds", type=float, default=0.0, help="0 means run forever")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    root = Path(args.root).resolve()
    api = root / "bitcoin/live/api"
    api.mkdir(parents=True, exist_ok=True)

    mempool_ms = min(30_000, max(5_000, int(args.mempool_ms)))
    mining_ms = min(300_000, max(15_000, int(args.mining_ms)))
    lightning_ms = min(300_000, max(15_000, int(args.lightning_ms)))
    base = str(args.mempool_base).rstrip("/")

    feeds = [
        Feed("mempool", mempool_ms, api / "mempool.json", lambda: collect_mempool(base)),
        Feed("mining", mining_ms, api / "mining.json", lambda: collect_mining(base)),
        Feed("lightning", lightning_ms, api / "lightning.json", lambda: collect_lightning(base)),
    ]

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    started_at = utcnow()
    start_mono = time.monotonic()
    for feed in feeds:
        feed.next_due = 0.0

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(feeds)) as pool:
        inflight: dict[str, concurrent.futures.Future[None]] = {}
        while not STOP:
            now = time.monotonic()
            if args.run_seconds > 0 and now - start_mono >= args.run_seconds:
                break

            for feed in feeds:
                future = inflight.get(feed.name)
                if future is not None and future.done():
                    try:
                        future.result()
                    except Exception:
                        pass
                    inflight.pop(feed.name, None)

                if feed.name not in inflight and now >= feed.next_due:
                    # Reserve the next due time immediately to avoid duplicate
                    # submissions while the worker thread is starting.
                    feed.next_due = now + feed.cadence_ms / 1000.0
                    inflight[feed.name] = pool.submit(feed.run)

            status = {
                "schema": "zzx-live-data-status-v1",
                "started_at": started_at,
                "observed_at": utcnow(),
                "pid": os.getpid(),
                "feeds": {feed.name: feed.status() for feed in feeds},
            }
            atomic_json(api / "status.json", status)

            if args.once:
                if all(feed.attempts >= 1 and feed.name not in inflight for feed in feeds):
                    break
            time.sleep(0.25)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
