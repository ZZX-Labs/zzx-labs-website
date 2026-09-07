#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
raise SystemExit(
    subprocess.call([
        sys.executable,
        str(HERE/"master_daemon.py"),
        "--root",
        str(ROOT),
    ])
)
