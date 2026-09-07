#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def main() -> int:
    p = argparse.ArgumentParser(description="ZZX BPI master launcher")
    p.add_argument("--hourly", action="store_true", help="Run one bounded hourly collect/finalize/archive cycle.")
    p.add_argument("--root", default=str(ROOT))
    p.add_argument("--capture-seconds", type=float)
    p.add_argument("--finalize-margin-seconds", type=float)
    p.add_argument("--chunk-rows", type=int)
    p.add_argument("--skip-collect", action="store_true")
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()

    root = str(Path(args.root).resolve())

    if args.hourly or args.self_test:
        cmd = [sys.executable, str(HERE / "bpi_hourly_master.py"), "--root", root]
        if args.capture_seconds is not None:
            cmd += ["--capture-seconds", str(args.capture_seconds)]
        if args.finalize_margin_seconds is not None:
            cmd += ["--finalize-margin-seconds", str(args.finalize_margin_seconds)]
        if args.chunk_rows is not None:
            cmd += ["--chunk-rows", str(args.chunk_rows)]
        if args.skip_collect:
            cmd += ["--skip-collect"]
        if args.self_test:
            cmd += ["--self-test"]
        return subprocess.call(cmd)

    # Preserve the existing local 24/7 master-daemon behavior by default.
    return subprocess.call([
        sys.executable,
        str(HERE / "master_daemon.py"),
        "--root",
        root,
    ])


if __name__ == "__main__":
    raise SystemExit(main())
