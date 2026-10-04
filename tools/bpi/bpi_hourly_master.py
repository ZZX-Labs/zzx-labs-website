#!/usr/bin/env python3
"""Hourly BPI acquisition/finalization orchestrator.

One invocation is bounded to one UTC-hour window on GitHub Actions. The local
wrapper can run this repeatedly for a persistent 24/7 service.
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STOP = False


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(obj, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, dir=str(path.parent), prefix=path.name + ".", suffix=".tmp") as fh:
        fh.write(data)
        tmp = Path(fh.name)
    tmp.replace(path)


def hour_floor_ms(ms: int) -> int:
    return (int(ms) // 3_600_000) * 3_600_000


def signal_handler(_signum: int, _frame: Any) -> None:
    global STOP
    STOP = True


def run_command(root: Path, stage_id: str, argv: list[str], timeout: float | None = None) -> dict[str, Any]:
    started = time.monotonic()
    cmd = [sys.executable, *argv]
    proc = subprocess.run(
        cmd,
        cwd=str(root),
        text=True,
        capture_output=True,
        timeout=timeout,
        env=os.environ.copy(),
    )
    return {
        "id": stage_id,
        "command": cmd,
        "returncode": proc.returncode,
        "duration_seconds": round(time.monotonic() - started, 3),
        "stdout": proc.stdout[-20_000:],
        "stderr": proc.stderr[-20_000:],
        "ok": proc.returncode == 0,
    }


def split_windows(start_ms: int, end_ms: int):
    cursor = int(start_ms)
    while cursor < end_ms:
        hour_start = hour_floor_ms(cursor)
        boundary = hour_start + 3_600_000
        stop = min(end_ms, boundary)
        yield cursor, stop
        cursor = stop


def load_config(root: Path) -> dict[str, Any]:
    path = root / "tools/bpi/hourly-config.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def self_test(root: Path) -> None:
    assert list(split_windows(0, 7_200_000)) == [(0, 3_600_000), (3_600_000, 7_200_000)]
    cfg = load_config(root)
    assert int(cfg.get("capture_seconds") or 0) > 0
    shard = root / "tools/bpi/bpi_hourly_shard.py"
    stage = run_command(root, "shard-self-test", [str(shard), "--self-test"], timeout=30)
    if not stage["ok"]:
        raise RuntimeError(stage["stderr"] or stage["stdout"])
    print("bpi_hourly_master.py self-test: PASS")


def main() -> int:
    p = argparse.ArgumentParser(description="Run one bounded hourly BPI acquisition and archive cycle.")
    p.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    p.add_argument("--capture-seconds", type=float)
    p.add_argument("--finalize-margin-seconds", type=float)
    p.add_argument("--chunk-rows", type=int)
    p.add_argument("--no-hour-boundary", action="store_true", help="Do not shorten capture to leave finalization time before the next UTC hour.")
    p.add_argument("--skip-collect", action="store_true")
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()

    root = Path(args.root).resolve()
    here = Path(__file__).resolve().parent
    api = root / "bitcoin/bpi/api"
    status_path = api / "hourly_status.json"
    config = load_config(root)

    if args.self_test:
        self_test(root)
        return 0

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    capture_seconds = float(args.capture_seconds if args.capture_seconds is not None else config.get("capture_seconds", 3120))
    finalize_margin = float(args.finalize_margin_seconds if args.finalize_margin_seconds is not None else config.get("finalize_margin_seconds", 180))
    chunk_rows = int(args.chunk_rows if args.chunk_rows is not None else config.get("chunk_rows", 50_000))

    run_started_epoch = time.time()
    run_started_ms = int(run_started_epoch * 1000)
    hour_start_ms = hour_floor_ms(run_started_ms)
    next_hour_epoch = (hour_start_ms + 3_600_000) / 1000.0

    requested_deadline = run_started_epoch + max(0.0, capture_seconds)
    if args.no_hour_boundary:
        capture_deadline = requested_deadline
    else:
        capture_deadline = min(requested_deadline, next_hour_epoch - max(30.0, finalize_margin))
    effective_capture = max(0.0, capture_deadline - run_started_epoch)

    status: dict[str, Any] = {
        "schema": "zzx-bpi-hourly-run-v1",
        "run_id": datetime.fromtimestamp(run_started_epoch, timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
        "started_at": utcnow(),
        "capture_requested_seconds": capture_seconds,
        "capture_effective_seconds": round(effective_capture, 3),
        "finalize_margin_seconds": finalize_margin,
        "chunk_rows": chunk_rows,
        "stages": [],
        "archive_manifests": [],
        "warnings": [],
    }
    atomic_json(status_path, status)

    collector_status = api / "collector_run_status.json"

    if not args.skip_collect and effective_capture > 0 and not STOP:
        stage = run_command(
            root,
            "collect-price-volume",
            [
                str(here / "collector.py"),
                "--root", str(root),
                "--duration-seconds", str(effective_capture),
                "--status-file", str(collector_status),
            ],
            timeout=effective_capture + 120,
        )
        status["stages"].append(stage)
        if not stage["ok"]:
            status["warnings"].append("collector returned non-zero; finalization continues using all persisted observations")
    elif args.skip_collect:
        status["warnings"].append("collection skipped by operator")
    else:
        status["warnings"].append("no collection time remained before the UTC-hour finalization margin")

    # Sequential BPI maintenance. Reference/sovereign failures are recorded but
    # do not discard successfully captured market history.
    stage_specs: list[tuple[str, list[str], bool, int]] = []

    # FX belongs to the hourly BPI cycle. If the repository carries the
    # exchange-rate updater, run it before index calculation so quote
    # normalization and every downstream reference stage see the same FX state.
    exchange_rates = here / "update_exchange_rates.py"
    if exchange_rates.is_file():
        stage_specs.append(
            ("exchange-rates", [str(exchange_rates)], False, 180)
        )

    stage_specs.extend([
        ("latest-bpi", [str(here / "update_latest.py")], True, 120),
        ("reference-markets", [str(here / "reference_updater.py"), "--root", str(root), "--references-only"], False, 180),
        ("reference-national-averages", [str(here / "update_reference_national_averages.py"), "--root", str(root)], False, 60),
        ("sovereign-debt-balances", [str(here / "update_sovereign_data.py"), "--root", str(root), "--minimum-available", "10"], False, 240),
    ])

    # Preserve older BPI-derived statistics when those modules exist in a
    # deployment. They remain optional because newer branches may fold them
    # into the main collector/reference pipeline.
    for stage_id, filename, timeout in [
        ("deadopop", "update_deadopop.py", 180),
        ("themarketbtccreated", "update_themarketbtccreated.py", 180),
    ]:
        module = here / filename
        if module.is_file():
            stage_specs.append((stage_id, [str(module)], False, timeout))

    stage_specs.append(
        ("latest-bpi-final", [str(here / "update_latest.py")], True, 120)
    )

    critical_failed = False
    for stage_id, argv, critical, timeout in stage_specs:
        if STOP:
            status["warnings"].append(f"stopped before stage {stage_id}")
            break
        if not Path(argv[0]).is_file():
            status["warnings"].append(f"stage missing: {stage_id} ({argv[0]})")
            if critical:
                critical_failed = True
            continue
        stage = run_command(root, stage_id, argv, timeout=timeout)
        stage["critical"] = critical
        status["stages"].append(stage)
        if not stage["ok"]:
            status["warnings"].append(f"stage failed: {stage_id}")
            if critical:
                critical_failed = True

    finalize_end_ms = int(time.time() * 1000)
    archive_start_ms = run_started_ms

    # Create one partition per UTC hour touched by this run.
    for window_start, window_end in split_windows(archive_start_ms, finalize_end_ms):
        if window_end <= window_start:
            continue
        stage = run_command(
            root,
            f"archive-{datetime.fromtimestamp(window_start/1000, timezone.utc).strftime('%Y%m%dT%H')}",
            [
                str(here / "bpi_hourly_shard.py"),
                "--root", str(root),
                "--start", str(window_start),
                "--end", str(window_end),
                "--chunk-rows", str(chunk_rows),
            ],
            timeout=180,
        )
        stage["critical"] = True
        status["stages"].append(stage)
        if stage["ok"]:
            # The sharder prints a large provider-coverage object. run_command()
            # deliberately truncates captured stdout for status size, so parsing
            # that truncated text is not reliable. The hourly manifest location
            # is deterministic; record it directly and verify that it exists.
            dt = datetime.fromtimestamp(window_start / 1000, timezone.utc)
            manifest_rel = (
                Path("bitcoin/bpi/archive/hourly")
                / dt.strftime("%Y/%m/%d/%H")
                / "manifest.json"
            ).as_posix()
            if (root / manifest_rel).is_file():
                status["archive_manifests"].append(manifest_rel)
            else:
                status["warnings"].append(
                    f"archive stage succeeded but manifest is missing: {manifest_rel}"
                )
                critical_failed = True
        else:
            critical_failed = True

    validate_stage = run_command(
        root,
        "validate-current-and-archive",
        [str(here / "bpi_hourly_validate.py"), "--root", str(root), "--allow-empty-current"],
        timeout=120,
    )
    validate_stage["critical"] = True
    status["stages"].append(validate_stage)
    if not validate_stage["ok"]:
        critical_failed = True

    status["ended_at"] = utcnow()
    status["duration_seconds"] = round(time.time() - run_started_epoch, 3)
    status["ok"] = not critical_failed
    status["critical_failed"] = critical_failed
    atomic_json(status_path, status)

    print(json.dumps(status, indent=2))
    return 1 if critical_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
