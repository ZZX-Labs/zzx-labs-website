#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"
VENDOR_DIR = TOOLS_DIR / "vendor" / "bitnodes"
CONFIG_PATH = TOOLS_DIR / "config.json"
CONFIG_EXAMPLE_PATH = TOOLS_DIR / "config.example.json"
PID_PATH = APP_ROOT / "run" / "bitnodesd.pid"
LOG_DIR = APP_ROOT / "log" / "bitnodes"
API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"


def load_config() -> dict:
    path = CONFIG_PATH if CONFIG_PATH.exists() else CONFIG_EXAMPLE_PATH

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ensure_dirs() -> None:
    PID_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    API_DIR.mkdir(parents=True, exist_ok=True)
    VENDOR_DIR.parent.mkdir(parents=True, exist_ok=True)


def log(message: str) -> None:
    ensure_dirs()

    line = f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {message}"

    print(line, flush=True)

    with (LOG_DIR / "bitnodesd.log").open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def run_command(command: list[str], cwd: Path | None = None, check: bool = False) -> subprocess.CompletedProcess:
    log(f"RUN {' '.join(command)}")

    return subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=check
    )


def clone_or_update_bitnodes() -> None:
    if not VENDOR_DIR.exists():
        run_command(
            [
                "git",
                "clone",
                "https://github.com/ayeowch/bitnodes",
                str(VENDOR_DIR)
            ],
            check=True
        )
        return

    run_command(["git", "pull", "--ff-only"], cwd=VENDOR_DIR, check=False)


def start_original_bitnodes() -> None:
    start_script = VENDOR_DIR / "start.sh"

    if not start_script.exists():
        log("Original Bitnodes start.sh not found; skipping crawler start.")
        return

    subprocess.Popen(
        ["bash", str(start_script)],
        cwd=str(VENDOR_DIR),
        stdout=(LOG_DIR / "original-bitnodes.stdout.log").open("a", encoding="utf-8"),
        stderr=(LOG_DIR / "original-bitnodes.stderr.log").open("a", encoding="utf-8"),
        start_new_session=True
    )

    log("Original Bitnodes crawler start requested.")


def export_once() -> None:
    export_script = TOOLS_DIR / "export_from_redis.py"

    result = run_command(
        [
            sys.executable,
            str(export_script),
            "--output",
            str(API_DIR)
        ],
        cwd=APP_ROOT,
        check=False
    )

    if result.stdout.strip():
        log(result.stdout.strip())

    if result.stderr.strip():
        log(result.stderr.strip())


def write_pid() -> None:
    ensure_dirs()
    PID_PATH.write_text(str(os.getpid()), encoding="utf-8")


def remove_pid() -> None:
    try:
        PID_PATH.unlink()
    except FileNotFoundError:
        pass


def read_pid() -> int | None:
    try:
        return int(PID_PATH.read_text(encoding="utf-8").strip())
    except Exception:
        return None


def is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def daemon_loop() -> int:
    ensure_dirs()
    write_pid()

    config = load_config()
    interval = int(config.get("crawler", {}).get("crawl_interval_seconds", 900))

    stop = False

    def handle_stop(_signum, _frame):
        nonlocal stop
        stop = True
        log("Stop signal received.")

    signal.signal(signal.SIGTERM, handle_stop)
    signal.signal(signal.SIGINT, handle_stop)

    log("bitnodesd started.")

    clone_or_update_bitnodes()
    start_original_bitnodes()

    while not stop:
        try:
            export_once()
        except Exception as exc:
            log(f"Export failed: {exc}")

        slept = 0

        while slept < interval and not stop:
            time.sleep(1)
            slept += 1

    remove_pid()
    log("bitnodesd stopped.")

    return 0


def status() -> int:
    pid = read_pid()

    if pid and is_running(pid):
        print(json.dumps({"running": True, "pid": pid}, indent=2))
        return 0

    print(json.dumps({"running": False, "pid": pid}, indent=2))
    return 1


def stop() -> int:
    pid = read_pid()

    if not pid:
        print("bitnodesd is not running.")
        return 1

    if not is_running(pid):
        remove_pid()
        print("stale pid removed.")
        return 1

    os.kill(pid, signal.SIGTERM)
    print(f"stop signal sent to {pid}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="ZZX-Labs Bitnodes daemon.")
    parser.add_argument("command", choices=["run", "status", "stop", "export-once", "clone"])

    args = parser.parse_args()

    if args.command == "run":
        return daemon_loop()

    if args.command == "status":
        return status()

    if args.command == "stop":
        return stop()

    if args.command == "export-once":
        export_once()
        return 0

    if args.command == "clone":
        clone_or_update_bitnodes()
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
