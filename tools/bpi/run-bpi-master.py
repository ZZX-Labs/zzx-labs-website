#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
raise SystemExit(
    subprocess.call([
        sys.executable,
        str(ROOT/"tools/bpi/master_daemon.py"),
        "--root",
        str(ROOT)
    ])
)
