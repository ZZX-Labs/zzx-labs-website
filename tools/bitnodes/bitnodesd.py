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
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

CRAWLER = TOOLS_DIR / "crawl.py"

CONFIG_PATH = TOOLS_DIR / "config.json"
CONFIG_EXAMPLE_PATH = TOOLS_DIR / "config.example.json"

RUN_DIR = APP_ROOT / "run"
LOG_DIR = APP_ROOT / "log" / "bitnodes"

PID_PATH = RUN_DIR / "bitnodesd.pid"
LOG_PATH = LOG_DIR / "bitnodesd.log"

DEFAULT_API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_ARCHIVE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "archive"
DEFAULT_STATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state"
DEFAULT_SNAPSHOT_24H_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "snapshots" / "24h"


def utc_now() -> int:
    return int(time.time())


def utc_iso(ts: int | None = None) -> str:
    if ts is None:
        ts = utc_now()

    return time.strftime(
        "%Y-%m-%dT%H:%M:%SZ",
        time.gmtime(ts)
    )


def ensure_dirs() -> None:
    for path in [
        RUN_DIR,
        LOG_DIR,
        DEFAULT_API_DIR,
        DEFAULT_ARCHIVE_DIR,
        DEFAULT_STATE_DIR,
        DEFAULT_SNAPSHOT_24H_DIR
    ]:
        path.mkdir(
            parents=True,
            exist_ok=True
        )


def log(message: str) -> None:
    ensure_dirs()

    line = f"{utc_iso()} {message}"

    print(line, flush=True)

    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def read_json(
    path: Path,
    default: Any
) -> Any:
    if not path.exists():
        return default

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    except Exception:
        return default


def load_config() -> dict[str, Any]:
    if CONFIG_PATH.exists():
        return read_json(CONFIG_PATH, {})

    if CONFIG_EXAMPLE_PATH.exists():
        return read_json(CONFIG_EXAMPLE_PATH, {})

    return {}


def cfg_get(
    config: dict[str, Any],
    path: list[str],
    default: Any
) -> Any:
    cur: Any = config

    for key in path:
        if not isinstance(cur, dict):
            return default

        if key not in cur:
            return default

        cur = cur[key]

    return cur


def write_pid() -> None:
    ensure_dirs()

    PID_PATH.write_text(
        str(os.getpid()),
        encoding="utf-8"
    )


def read_pid() -> int | None:
    try:
        return int(
            PID_PATH.read_text(
                encoding="utf-8"
            ).strip()
        )

    except Exception:
        return None


def remove_pid() -> None:
    try:
        PID_PATH.unlink()

    except FileNotFoundError:
        pass


def process_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True

    except OSError:
        return False


def build_crawl_command(
    config: dict[str, Any],
    daemon_cycle: bool = False
) -> list[str]:
    crawler_cfg = config.get("crawler", {})
    export_cfg = config.get("export", {})
    github_cfg = config.get("github", {})
    geoip_cfg = config.get("geoip", {})

    limit = int(
        crawler_cfg.get(
            "max_nodes_per_run",
            100000
        )
    )

    batch_size = int(
        crawler_cfg.get(
            "batch_size",
            5000
        )
    )

    timeout = float(
        crawler_cfg.get(
            "handshake_timeout",
            crawler_cfg.get("connection_timeout", 5)
        )
    )

    workers = int(
        crawler_cfg.get(
            "max_parallel_connections",
            512
        )
    )

    getaddr_rounds = int(
        crawler_cfg.get(
            "getaddr_rounds",
            8
        )
    )

    export_mode = str(
        export_cfg.get(
            "mode",
            "reachable_24h"
        )
    )

    api_dir = Path(
        export_cfg.get(
            "base_dir",
            str(DEFAULT_API_DIR)
        )
    )

    archive_dir = Path(
        export_cfg.get(
            "archive_dir",
            str(DEFAULT_ARCHIVE_DIR)
        )
    )

    state_dir = Path(
        export_cfg.get(
            "state_dir",
            str(DEFAULT_STATE_DIR)
        )
    )

    snapshot_24h_dir = Path(
        export_cfg.get(
            "snapshot_24h_dir",
            str(DEFAULT_SNAPSHOT_24H_DIR)
        )
    )

    cmd = [
        sys.executable,
        str(CRAWLER),
        "--output",
        str(api_dir),
        "--archive-dir",
        str(archive_dir),
        "--state-dir",
        str(state_dir),
        "--snapshot-24h-dir",
        str(snapshot_24h_dir),
        "--limit",
        str(limit),
        "--batch-size",
        str(batch_size),
        "--timeout",
        str(timeout),
        "--workers",
        str(workers),
        "--getaddr-rounds",
        str(getaddr_rounds),
        "--export-mode",
        export_mode
    ]

    if not bool(geoip_cfg.get("enabled", True)):
        cmd.append("--disable-geoip")

    if bool(export_cfg.get("compact", False)):
        cmd.append("--compact")

    if daemon_cycle and bool(github_cfg.get("auto_push_from_crawler", False)):
        cmd.append("--git-push")

    return cmd


def run_command(
    command: list[str],
    cwd: Path = APP_ROOT,
    check: bool = False
) -> subprocess.CompletedProcess:
    log("RUN " + " ".join(command))

    result = subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False
    )

    if result.stdout.strip():
        log(result.stdout.strip())

    if result.stderr.strip():
        log(result.stderr.strip())

    if check and result.returncode != 0:
        raise RuntimeError(
            f"command failed with exit code {result.returncode}: {' '.join(command)}"
        )

    return result


def git_commit_and_push(
    config: dict[str, Any]
) -> None:
    github_cfg = config.get("github", {})

    if not bool(
        github_cfg.get(
            "auto_push",
            False
        )
    ):
        log("Git auto-push disabled.")
        return

    branch = str(
        github_cfg.get(
            "branch",
            "main"
        )
    )

    message = str(
        github_cfg.get(
            "commit_message",
            "Update Bitnodes global node snapshots"
        )
    )

    paths = github_cfg.get(
        "paths",
        [
            "bitcoin/bitnodes/api",
            "bitcoin/bitnodes/archive",
            "bitcoin/bitnodes/data"
        ]
    )

    if not isinstance(paths, list):
        paths = [
            "bitcoin/bitnodes/api",
            "bitcoin/bitnodes/archive",
            "bitcoin/bitnodes/data"
        ]

    run_command(
        [
            "git",
            "fetch",
            "origin",
            branch
        ],
        cwd=APP_ROOT,
        check=False
    )

    run_command(
        [
            "git",
            "pull",
            "--rebase",
            "origin",
            branch
        ],
        cwd=APP_ROOT,
        check=False
    )

    run_command(
        [
            "git",
            "add",
            *[str(path) for path in paths]
        ],
        cwd=APP_ROOT,
        check=False
    )

    diff = subprocess.run(
        [
            "git",
            "diff",
            "--cached",
            "--quiet"
        ],
        cwd=str(APP_ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False
    )

    if diff.returncode == 0:
        log("No Bitnodes JSON changes to commit.")
        return

    run_command(
        [
            "git",
            "commit",
            "-m",
            message
        ],
        cwd=APP_ROOT,
        check=False
    )

    for attempt in range(1, 6):
        pull = run_command(
            [
                "git",
                "pull",
                "--rebase",
                "origin",
                branch
            ],
            cwd=APP_ROOT,
            check=False
        )

        push = run_command(
            [
                "git",
                "push",
                "origin",
                branch
            ],
            cwd=APP_ROOT,
            check=False
        )

        if pull.returncode == 0 and push.returncode == 0:
            log("Bitnodes JSON snapshots pushed.")
            return

        log(f"Git push attempt {attempt} failed; retrying.")
        time.sleep(10)

    log("Failed to push Bitnodes JSON snapshots after retries.")


def export_once() -> int:
    ensure_dirs()

    config = load_config()

    result = run_command(
        build_crawl_command(
            config,
            daemon_cycle=False
        ),
        cwd=APP_ROOT,
        check=False
    )

    if result.returncode != 0:
        return result.returncode

    git_commit_and_push(config)

    return 0


def daemon_loop() -> int:
    ensure_dirs()
    write_pid()

    config = load_config()

    crawler_cfg = config.get("crawler", {})

    interval = int(
        crawler_cfg.get(
            "crawl_interval_seconds",
            900
        )
    )

    stop_requested = False

    def stop_handler(_signum, _frame) -> None:
        nonlocal stop_requested
        stop_requested = True
        log("Stop signal received.")

    signal.signal(signal.SIGTERM, stop_handler)
    signal.signal(signal.SIGINT, stop_handler)

    log("bitnodesd started.")

    try:
        while not stop_requested:
            config = load_config()

            result = run_command(
                build_crawl_command(
                    config,
                    daemon_cycle=True
                ),
                cwd=APP_ROOT,
                check=False
            )

            if result.returncode == 0:
                git_commit_and_push(config)
            else:
                log(f"Crawl cycle failed with exit code {result.returncode}.")

            slept = 0

            while slept < interval and not stop_requested:
                time.sleep(1)
                slept += 1

    finally:
        remove_pid()
        log("bitnodesd stopped.")

    return 0


def status() -> int:
    ensure_dirs()

    pid = read_pid()

    running = bool(
        pid
        and process_running(pid)
    )

    config = load_config()

    payload = {
        "daemon_running": running,
        "pid": pid,
        "app_root": str(APP_ROOT),
        "tools_dir": str(TOOLS_DIR),
        "crawler": str(CRAWLER),
        "api_dir": str(
            cfg_get(
                config,
                ["export", "base_dir"],
                str(DEFAULT_API_DIR)
            )
        ),
        "archive_dir": str(
            cfg_get(
                config,
                ["export", "archive_dir"],
                str(DEFAULT_ARCHIVE_DIR)
            )
        ),
        "state_dir": str(
            cfg_get(
                config,
                ["export", "state_dir"],
                str(DEFAULT_STATE_DIR)
            )
        ),
        "snapshot_24h_dir": str(
            cfg_get(
                config,
                ["export", "snapshot_24h_dir"],
                str(DEFAULT_SNAPSHOT_24H_DIR)
            )
        ),
        "log_path": str(LOG_PATH),
        "config_path": str(
            CONFIG_PATH
            if CONFIG_PATH.exists()
            else CONFIG_EXAMPLE_PATH
        )
    }

    print(
        json.dumps(
            payload,
            indent=2
        )
    )

    return 0 if running else 1


def stop_daemon() -> int:
    pid = read_pid()

    if not pid:
        print("bitnodesd is not running.")
        return 1

    if not process_running(pid):
        remove_pid()
        print("removed stale bitnodesd pid.")
        return 1

    os.kill(
        pid,
        signal.SIGTERM
    )

    print(f"stop signal sent to {pid}")

    return 0


def tail_log(lines: int = 80) -> int:
    ensure_dirs()

    if not LOG_PATH.exists():
        print("No bitnodesd log yet.")
        return 1

    content = LOG_PATH.read_text(
        encoding="utf-8",
        errors="replace"
    ).splitlines()

    for line in content[-lines:]:
        print(line)

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="ZZX-Labs Bitnodes persistent crawler daemon."
    )

    sub = parser.add_subparsers(
        dest="command",
        required=True
    )

    sub.add_parser("run")
    sub.add_parser("status")
    sub.add_parser("stop")
    sub.add_parser("export-once")
    sub.add_parser("native-crawl")

    tail = sub.add_parser("tail")
    tail.add_argument(
        "--lines",
        type=int,
        default=80
    )

    args = parser.parse_args()

    if args.command == "run":
        return daemon_loop()

    if args.command == "status":
        return status()

    if args.command == "stop":
        return stop_daemon()

    if args.command == "export-once":
        return export_once()

    if args.command == "native-crawl":
        return export_once()

    if args.command == "tail":
        return tail_log(args.lines)

    return 1


if __name__ == "__main__":
    raise SystemExit(main())