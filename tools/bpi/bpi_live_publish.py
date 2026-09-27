#!/usr/bin/env python3
"""Race-safe publisher for overlapping live BPI checkpoint jobs.

GitHub-hosted runners are deliberately allowed to overlap so one delayed run does
not create an acquisition hole.  This publisher prevents a slower/older run from
regressing mutable live JSON when it finishes after a newer run.

Rules:
* latest/markets/provider-health/exchange-rates: newest ``updated_at`` wins.
* collector run status: newest ``ended_at_epoch`` wins.
* history-live merge support remains available when explicitly requested, but
  the high-frequency fallback publisher does not commit the multi-megabyte
  history mirror every five minutes; the hourly archive checkpoint owns it.
* every push attempt starts from the newest remote branch and repeats the merge.
* no force push and no rebase of generated commits.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_FILES = (
    "bitcoin/bpi/api/latest.json",
    "bitcoin/bpi/api/markets.json",
    "bitcoin/bpi/api/provider_health.json",
    "bitcoin/bpi/api/exchange_rates.json",
    "bitcoin/bpi/api/collector_run_status.json",
)


def run(root: Path, argv: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(argv, cwd=str(root), text=True, capture_output=True)
    if check and proc.returncode != 0:
        raise RuntimeError(
            f"command failed ({proc.returncode}): {' '.join(argv)}\n"
            f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
        )
    return proc


def parse_iso(value: Any) -> float:
    raw = str(value or "").strip()
    if not raw:
        return float("-inf")
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return float("-inf")


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    os.replace(tmp, path)


def payload_time(payload: Any, filename: str) -> float:
    if not isinstance(payload, dict):
        return float("-inf")
    if filename == "collector_run_status.json":
        try:
            return float(payload.get("ended_at_epoch") or payload.get("started_at_epoch") or float("-inf"))
        except Exception:
            return float("-inf")
    return parse_iso(payload.get("updated_at") or payload.get("ended_at") or payload.get("started_at"))


def newest_payload(remote: Any, local: Any, filename: str) -> Any:
    if remote is None:
        return local
    if local is None:
        return remote
    return local if payload_time(local, filename) >= payload_time(remote, filename) else remote


def merge_history(remote: Any, local: Any, keep: int = 1440) -> dict[str, Any]:
    remote = remote if isinstance(remote, dict) else {}
    local = local if isinstance(local, dict) else {}
    rs = remote.get("series") if isinstance(remote.get("series"), dict) else {}
    ls = local.get("series") if isinstance(local.get("series"), dict) else {}

    merged_series: dict[str, list[dict[str, Any]]] = {}
    for name in sorted(set(rs) | set(ls)):
        buckets: dict[int, dict[str, Any]] = {}
        for row in [*(rs.get(name) or []), *(ls.get(name) or [])]:
            if not isinstance(row, dict):
                continue
            try:
                t = int(row.get("t"))
            except Exception:
                continue
            # Local rows are visited second, therefore local wins equal bucket.
            buckets[t] = row
        keys = sorted(buckets)[-max(1, int(keep)):]
        merged_series[name] = [buckets[k] for k in keys]

    updated = max(
        parse_iso(remote.get("updated_at")),
        parse_iso(local.get("updated_at")),
    )
    if updated == float("-inf"):
        updated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    else:
        updated_at = datetime.fromtimestamp(updated, timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "schema": local.get("schema") or remote.get("schema") or "zzx-bpi-history-live-v1",
        "updated_at": updated_at,
        "resolution": local.get("resolution") or remote.get("resolution") or "1m-live-close",
        "series": merged_series,
    }


def merge_file(remote_path: Path, local_path: Path, filename: str, keep_history: int) -> Any:
    remote = read_json(remote_path)
    local = read_json(local_path)
    if filename == "history-live.json":
        return merge_history(remote, local, keep=keep_history)
    return newest_payload(remote, local, filename)


def snapshot_local(root: Path, files: list[str], dest: Path) -> list[str]:
    present: list[str] = []
    for rel in files:
        src = root / rel
        if not src.is_file():
            continue
        # Fail early on malformed/non-JSON generated state.
        json.loads(src.read_text(encoding="utf-8"))
        dst = dest / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        present.append(rel)
    return present


def publish(
    root: Path,
    files: list[str],
    message: str,
    remote: str,
    branch: str,
    attempts: int,
    sleep_seconds: float,
    keep_history: int,
) -> int:
    root = root.resolve()
    with tempfile.TemporaryDirectory(prefix="zzx-bpi-live-publish-") as td:
        snapshot = Path(td) / "snapshot"
        present = snapshot_local(root, files, snapshot)
        if not present:
            print("No live BPI JSON files exist; nothing to publish.")
            return 0

        for attempt in range(1, max(1, attempts) + 1):
            run(root, ["git", "rebase", "--abort"], check=False)
            run(root, ["git", "merge", "--abort"], check=False)
            fetched = run(root, ["git", "fetch", remote, branch], check=False)
            if fetched.returncode != 0:
                print(f"fetch attempt {attempt}/{attempts} failed", file=sys.stderr)
                if attempt < attempts:
                    time.sleep(max(0.0, sleep_seconds))
                continue

            run(root, ["git", "reset", "--hard", f"{remote}/{branch}"])
            merged_files: list[str] = []
            for rel in present:
                local_path = snapshot / rel
                remote_path = root / rel
                payload = merge_file(remote_path, local_path, Path(rel).name, keep_history)
                if payload is None:
                    continue
                write_json(remote_path, payload)
                merged_files.append(rel)

            if not merged_files:
                print("No merged live BPI files to publish.")
                return 0

            run(root, ["git", "add", "--", *merged_files])
            staged = run(root, ["git", "diff", "--cached", "--quiet"], check=False)
            if staged.returncode == 0:
                print("Newest branch already contains equal/newer live BPI state.")
                return 0
            if staged.returncode != 1:
                raise RuntimeError(staged.stderr)

            run(root, ["git", "commit", "-m", message])
            pushed = run(root, ["git", "push", remote, f"HEAD:{branch}"], check=False)
            if pushed.returncode == 0:
                print(f"Published {len(merged_files)} race-safe live BPI file(s) on attempt {attempt}.")
                return 0

            print(
                f"push attempt {attempt}/{attempts} rejected; replaying merge on newest {remote}/{branch}",
                file=sys.stderr,
            )
            if attempt < attempts:
                time.sleep(max(0.0, sleep_seconds))

    return 1


def self_test() -> None:
    older = {"updated_at": "2026-01-01T00:00:00Z", "value": 1}
    newer = {"updated_at": "2026-01-01T00:00:02Z", "value": 2}
    assert newest_payload(older, newer, "latest.json")["value"] == 2
    assert newest_payload(newer, older, "latest.json")["value"] == 2

    remote = {
        "schema": "x", "updated_at": "2026-01-01T00:01:00Z", "resolution": "1m-live-close",
        "series": {"bpi": [{"t": 1, "price": 10}, {"t": 2, "price": 20}]},
    }
    local = {
        "schema": "x", "updated_at": "2026-01-01T00:02:00Z", "resolution": "1m-live-close",
        "series": {"bpi": [{"t": 2, "price": 21}, {"t": 3, "price": 30}], "global": [{"t": 3, "price": 31}]},
    }
    merged = merge_history(remote, local, keep=3)
    assert [r["t"] for r in merged["series"]["bpi"]] == [1, 2, 3]
    assert merged["series"]["bpi"][1]["price"] == 21
    assert merged["series"]["global"][0]["t"] == 3
    print("bpi_live_publish.py self-test: PASS")


def main() -> int:
    p = argparse.ArgumentParser(description="Publish overlapping live BPI checkpoints without time regression")
    p.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    p.add_argument("--file", action="append", dest="files", help="Relative JSON path; repeatable")
    p.add_argument("--message", default="Update continuous live BPI checkpoint")
    p.add_argument("--remote", default="origin")
    p.add_argument("--branch", default="main")
    p.add_argument("--attempts", type=int, default=6)
    p.add_argument("--sleep-seconds", type=float, default=3.0)
    p.add_argument("--keep-history", type=int, default=1440)
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()
    if args.self_test:
        self_test()
        return 0
    return publish(
        Path(args.root),
        args.files or list(DEFAULT_FILES),
        args.message,
        args.remote,
        args.branch,
        args.attempts,
        args.sleep_seconds,
        args.keep_history,
    )


if __name__ == "__main__":
    raise SystemExit(main())
