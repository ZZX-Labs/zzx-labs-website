#!/usr/bin/env python3
"""Persistent ZZX BPI process supervisor.

Acquisition is intentionally independent from presentation/reference helpers.
Every child is restarted with bounded exponential backoff; failure of an
ancillary child can never terminate the market collector.
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STOP = False


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


@dataclass
class Child:
    name: str
    command: list[str]
    critical: bool
    proc: subprocess.Popen | None = None
    failures: int = 0
    starts: int = 0
    next_start: float = 0.0
    last_exit: int | None = None
    last_started_at: str | None = None

    def start(self) -> None:
        self.proc = subprocess.Popen(self.command)
        self.starts += 1
        self.last_started_at = utcnow()

    def poll(self) -> int | None:
        return self.proc.poll() if self.proc is not None else None

    def schedule_restart(self, code: int) -> None:
        self.last_exit = code
        self.proc = None
        self.failures += 1
        # Fast recovery for one-off crashes, bounded to avoid a hot loop.
        delay = min(60.0, 1.5 * (2 ** min(self.failures - 1, 6)))
        self.next_start = time.monotonic() + delay

    def terminate(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            try:
                self.proc.terminate()
            except Exception:
                pass


def handle_signal(_signum=None, _frame=None) -> None:
    global STOP
    STOP = True


def main() -> int:
    parser = argparse.ArgumentParser(description="Supervise continuous ZZX BPI acquisition")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--proxy", default=os.environ.get("ZZX_BPI_PROXY"))
    parser.add_argument(
        "--history-db",
        default=os.environ.get("ZZX_BPI_HISTORY_DB"),
    )
    parser.add_argument(
        "--status-file",
        default=os.environ.get("ZZX_BPI_SUPERVISOR_STATUS"),
    )
    parser.add_argument("--no-reference-updater", action="store_true")
    parser.add_argument("--no-history-api", action="store_true")
    args = parser.parse_args()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    root = Path(args.root).resolve()
    here = Path(__file__).resolve().parent
    history_db = Path(args.history_db or (root / "bitcoin/bpi/history.sqlite3")).resolve()
    status_file = Path(args.status_file or (root / "bitcoin/bpi/api/supervisor-status.json")).resolve()
    history_db.parent.mkdir(parents=True, exist_ok=True)
    status_file.parent.mkdir(parents=True, exist_ok=True)

    collector_cmd = [
        sys.executable, str(here / "collector.py"),
        "--root", str(root),
        "--history-db", str(history_db),
    ]
    if args.proxy:
        collector_cmd += ["--proxy", args.proxy]

    children = [Child("collector", collector_cmd, True)]
    if not args.no_reference_updater:
        cmd = [sys.executable, str(here / "reference_updater.py"), "--root", str(root), "--bpi-only"]
        if args.proxy:
            cmd += ["--proxy", args.proxy]
        children.append(Child("reference-updater", cmd, False))
    if not args.no_history_api:
        children.append(Child("history-api", [
            sys.executable, str(here / "history_api.py"), "--db", str(history_db)
        ], False))

    started_at = utcnow()
    for child in children:
        child.start()

    try:
        while not STOP:
            now = time.monotonic()
            for child in children:
                if child.proc is not None:
                    code = child.poll()
                    if code is not None:
                        print(
                            f"BPI_SUPERVISOR child={child.name} exited={code}; scheduling restart",
                            file=sys.stderr,
                            flush=True,
                        )
                        child.schedule_restart(code)
                elif now >= child.next_start:
                    try:
                        child.start()
                        print(f"BPI_SUPERVISOR restarted child={child.name}", flush=True)
                    except Exception as exc:
                        print(f"BPI_SUPERVISOR restart child={child.name} failed: {exc}", file=sys.stderr, flush=True)
                        child.schedule_restart(127)

            payload = {
                "schema": "zzx-bpi-supervisor-status-v2",
                "started_at": started_at,
                "updated_at": utcnow(),
                "history_db": str(history_db),
                "children": [
                    {
                        "name": c.name,
                        "critical": c.critical,
                        "pid": c.proc.pid if c.proc is not None and c.proc.poll() is None else None,
                        "running": bool(c.proc is not None and c.proc.poll() is None),
                        "starts": c.starts,
                        "failures": c.failures,
                        "last_exit": c.last_exit,
                        "last_started_at": c.last_started_at,
                    }
                    for c in children
                ],
            }
            atomic_json(status_file, payload)
            time.sleep(1.0)
    finally:
        for child in children:
            child.terminate()
        deadline = time.monotonic() + 10.0
        for child in children:
            if child.proc is None:
                continue
            remaining = max(0.0, deadline - time.monotonic())
            try:
                child.proc.wait(timeout=remaining)
            except subprocess.TimeoutExpired:
                try:
                    child.proc.kill()
                except Exception:
                    pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
