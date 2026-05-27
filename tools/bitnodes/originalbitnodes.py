#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import zzxbitnodes


ORIGINAL_OUTPUT = APP_ROOT / "bitcoin" / "bitnodes" / "api" / "originalbitnodes"
ORIGINAL_ARCHIVE = APP_ROOT / "bitcoin" / "bitnodes" / "archive" / "originalbitnodes"
ORIGINAL_STATE = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state" / "originalbitnodes"
ORIGINAL_SNAPSHOT_24H = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "snapshots" / "24h" / "originalbitnodes"
ORIGINAL_SEEDERS = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "seeders" / "originalbitnodes"


def main() -> int:
    parser = zzxbitnodes.build_parser(
        description="Original Bitnodes-compatible crawler mode."
    )

    args = parser.parse_args()

    args.output = str(ORIGINAL_OUTPUT)
    args.archive_dir = str(ORIGINAL_ARCHIVE)
    args.state_dir = str(ORIGINAL_STATE)
    args.snapshot_24h_dir = str(ORIGINAL_SNAPSHOT_24H)
    args.seeder_dir = str(ORIGINAL_SEEDERS)

    args.disable_archive_replay = True
    args.export_mode = "reachable"
    args.timeout = min(float(args.timeout), 5.0)
    args.workers = min(int(args.workers), 256)
    args.batch_size = min(int(args.batch_size), 4096)
    args.getaddr_rounds = min(int(args.getaddr_rounds), 16)
    args.dns_seed_limit = min(int(args.dns_seed_limit), 4096)
    args.archive_replay_files = 0

    return zzxbitnodes.run_from_args(args)


if __name__ == "__main__":
    raise SystemExit(main())
