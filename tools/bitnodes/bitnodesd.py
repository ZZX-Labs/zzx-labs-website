#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import signal
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[2]

TOOLS_DIR = (
    APP_ROOT
    / "tools"
    / "bitnodes"
)

CONFIG_PATH = (
    TOOLS_DIR
    / "config.json"
)

CONFIG_EXAMPLE_PATH = (
    TOOLS_DIR
    / "config.example.json"
)

PID_PATH = (
    APP_ROOT
    / "run"
    / "bitnodesd.pid"
)

LOG_DIR = (
    APP_ROOT
    / "log"
    / "bitnodes"
)

API_DIR = (
    APP_ROOT
    / "bitcoin"
    / "bitnodes"
    / "api"
)

RAW_DIR = (
    APP_ROOT
    / "data"
    / "bitnodes"
)

VENDOR_DIR = (
    TOOLS_DIR
    / "vendor"
    / "bitnodes"
)

CRAWLER = (
    TOOLS_DIR
    / "crawl.py"
)


def load_config() -> dict:

    path = (
        CONFIG_PATH
        if CONFIG_PATH.exists()
        else CONFIG_EXAMPLE_PATH
    )

    with path.open(
        "r",
        encoding="utf-8"
    ) as handle:

        return json.load(handle)


def ensure_dirs() -> None:

    PID_PATH.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    LOG_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    API_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    RAW_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    VENDOR_DIR.parent.mkdir(
        parents=True,
        exist_ok=True
    )


def log(msg: str) -> None:

    ensure_dirs()

    line = (
        f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} "
        f"{msg}"
    )

    print(
        line,
        flush=True
    )

    with (
        LOG_DIR
        / "bitnodesd.log"
    ).open(
        "a",
        encoding="utf-8"
    ) as handle:

        handle.write(
            line + "\n"
        )


def run_cmd(
    cmd: list[str],
    cwd: Path | None = None,
    check: bool = False
) -> subprocess.CompletedProcess:

    log(
        "RUN " + " ".join(cmd)
    )

    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=check
    )


def tcp_open(
    host: str,
    port: int,
    timeout: float = 1.0
) -> bool:

    try:

        with socket.create_connection(
            (host, port),
            timeout=timeout
        ):

            return True

    except OSError:
        return False


def redis_env(
    config: dict
) -> dict:

    redis_cfg = config.get(
        "redis",
        {}
    )

    env = os.environ.copy()

    env.pop(
        "REDIS_SOCKET",
        None
    )

    env["REDIS_HOST"] = str(
        redis_cfg.get(
            "host",
            "127.0.0.1"
        )
    )

    env["REDIS_PORT"] = str(
        redis_cfg.get(
            "port",
            6379
        )
    )

    env["REDIS_DB"] = str(
        redis_cfg.get(
            "db",
            0
        )
    )

    password = str(
        redis_cfg.get(
            "password",
            ""
        ) or ""
    )

    if password:
        env["REDIS_PASSWORD"] = password

    return env


def redis_status(
    config: dict
) -> bool:

    redis_cfg = config.get(
        "redis",
        {}
    )

    host = str(
        redis_cfg.get(
            "host",
            "127.0.0.1"
        )
    )

    port = int(
        redis_cfg.get(
            "port",
            6379
        )
    )

    return tcp_open(
        host,
        port
    )


def start_redis(
    config: dict
) -> bool:

    redis_cfg = config.get(
        "redis",
        {}
    )

    if not redis_cfg.get(
        "enabled",
        True
    ):

        log(
            "Redis disabled in config."
        )

        return False

    if redis_status(config):

        log(
            "Redis already running."
        )

        return True

    host = str(
        redis_cfg.get(
            "host",
            "127.0.0.1"
        )
    )

    port = int(
        redis_cfg.get(
            "port",
            6379
        )
    )

    redis_exe = (
        redis_cfg.get(
            "windows_exe"
        )
        if os.name == "nt"
        else redis_cfg.get(
            "linux_exe"
        )
    ) or "redis-server"

    config_file = str(
        redis_cfg.get(
            "config_file",
            ""
        ) or ""
    )

    if shutil.which(redis_exe):

        cmd = [redis_exe]

        if config_file:

            cmd.append(
                config_file
            )

        else:

            cmd += [
                "--port",
                str(port),
                "--bind",
                host,
                "--save",
                "",
                "--appendonly",
                "no"
            ]

        subprocess.Popen(
            cmd,
            stdout=(
                LOG_DIR
                / "redis.stdout.log"
            ).open(
                "a",
                encoding="utf-8"
            ),
            stderr=(
                LOG_DIR
                / "redis.stderr.log"
            ).open(
                "a",
                encoding="utf-8"
            ),
            creationflags=(
                subprocess.CREATE_NEW_PROCESS_GROUP
                if os.name == "nt"
                else 0
            )
        )

        for _ in range(30):

            if redis_status(config):

                log(
                    f"Redis started on "
                    f"{host}:{port}"
                )

                return True

            time.sleep(0.5)

    log(
        "Redis unavailable."
    )

    return False


def clone_or_update_original() -> None:

    if not VENDOR_DIR.exists():

        run_cmd(
            [
                "git",
                "clone",
                "https://github.com/ayeowch/bitnodes",
                str(VENDOR_DIR)
            ],
            check=False
        )

        return

    run_cmd(
        [
            "git",
            "pull",
            "--ff-only"
        ],
        cwd=VENDOR_DIR,
        check=False
    )


def start_original_bitnodes(
    config: dict
) -> None:

    if os.name == "nt":

        log(
            "Skipping original "
            "ayeowch/bitnodes "
            "crawler on Windows."
        )

        return

    start_script = (
        VENDOR_DIR
        / "start.sh"
    )

    if not start_script.exists():

        log(
            "Original Bitnodes "
            "start.sh missing."
        )

        return

    env = redis_env(config)

    subprocess.Popen(
        [
            "bash",
            str(start_script)
        ],
        cwd=str(VENDOR_DIR),
        env=env,
        stdout=(
            LOG_DIR
            / "original-bitnodes.stdout.log"
        ).open(
            "a",
            encoding="utf-8"
        ),
        stderr=(
            LOG_DIR
            / "original-bitnodes.stderr.log"
        ).open(
            "a",
            encoding="utf-8"
        ),
        start_new_session=True
    )

    log(
        "Original Bitnodes "
        "crawler start requested."
    )


def run_native_crawler(
    config: dict
) -> Path:

    raw_path = (
        RAW_DIR
        / "native_latest.json"
    )

    limit = str(
        config.get(
            "crawler",
            {}
        ).get(
            "max_nodes_per_run",
            5000
        )
    )

    timeout = str(
        config.get(
            "crawler",
            {}
        ).get(
            "handshake_timeout",
            5
        )
    )

    workers = str(
        config.get(
            "crawler",
            {}
        ).get(
            "max_parallel_connections",
            256
        )
    )

    interval = str(
        config.get(
            "crawler",
            {}
        ).get(
            "crawl_interval_seconds",
            900
        )
    )

    cmd = [
        sys.executable,
        str(CRAWLER),
        "--output",
        str(API_DIR),
        "--raw-output",
        str(raw_path),
        "--limit",
        limit,
        "--timeout",
        timeout,
        "--workers",
        workers
    ]

    result = run_cmd(
        cmd,
        cwd=APP_ROOT,
        check=False
    )

    if result.stdout.strip():
        log(result.stdout.strip())

    if result.stderr.strip():
        log(result.stderr.strip())

    return raw_path


def git_commit_and_push(
    config: dict
) -> None:

    github_cfg = config.get(
        "github",
        {}
    )

    if not github_cfg.get(
        "auto_push",
        True
    ):

        return

    message = str(
        github_cfg.get(
            "commit_message",
            "Update Bitnodes API snapshots"
        )
    )

    branch = str(
        github_cfg.get(
            "branch",
            "main"
        )
    )

    commands = [
        [
            "git",
            "add",
            "."
        ],
        [
            "git",
            "commit",
            "-m",
            message
        ],
        [
            "git",
            "push",
            "origin",
            branch
        ]
    ]

    for command in commands:

        result = run_cmd(
            command,
            cwd=APP_ROOT,
            check=False
        )

        if result.stdout.strip():
            log(result.stdout.strip())

        if result.stderr.strip():
            log(result.stderr.strip())


def export_once() -> None:

    config = load_config()

    start_redis(config)

    raw_path = run_native_crawler(
        config
    )

    if not raw_path.exists():

        log(
            "Native crawler "
            "did not generate "
            "raw snapshot."
        )

        return

    log(
        "Native crawler "
        "snapshot updated."
    )

    git_commit_and_push(
        config
    )


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


def process_running(
    pid: int
) -> bool:

    try:

        os.kill(pid, 0)

        return True

    except OSError:
        return False


def daemon_loop() -> int:

    ensure_dirs()

    write_pid()

    config = load_config()

    interval = int(
        config.get(
            "crawler",
            {}
        ).get(
            "crawl_interval_seconds",
            900
        )
    )

    stop_requested = False

    def stop_handler(
        _signum,
        _frame
    ):

        nonlocal stop_requested

        stop_requested = True

        log(
            "Stop signal received."
        )

    signal.signal(
        signal.SIGTERM,
        stop_handler
    )

    signal.signal(
        signal.SIGINT,
        stop_handler
    )

    log(
        "bitnodesd started."
    )

    start_redis(config)

    clone_or_update_original()

    start_original_bitnodes(
        config
    )

    while not stop_requested:

        try:

            export_once()

        except Exception as exc:

            log(
                f"Export cycle failed: "
                f"{exc}"
            )

        slept = 0

        while (
            slept < interval
            and not stop_requested
        ):

            time.sleep(1)

            slept += 1

    remove_pid()

    log(
        "bitnodesd stopped."
    )

    return 0


def status() -> int:

    config = load_config()

    pid = read_pid()

    running = bool(
        pid
        and process_running(pid)
    )

    redis_ok = redis_status(
        config
    )

    print(
        json.dumps(
            {
                "daemon_running": running,
                "pid": pid,
                "redis_running": redis_ok,
                "api_dir": str(API_DIR),
                "history_dir": str(RAW_DIR),
                "vendor_dir": str(VENDOR_DIR)
            },
            indent=2
        )
    )

    return 0 if running else 1


def stop_daemon() -> int:

    pid = read_pid()

    if not pid:

        print(
            "bitnodesd "
            "is not running."
        )

        return 1

    if not process_running(pid):

        remove_pid()

        print(
            "removed stale pid."
        )

        return 1

    os.kill(
        pid,
        signal.SIGTERM
    )

    print(
        f"stop signal "
        f"sent to {pid}"
    )

    return 0


def main() -> int:

    parser = argparse.ArgumentParser(
        description=(
            "ZZX-Labs "
            "Bitnodes daemon."
        )
    )

    parser.add_argument(
        "command",
        choices=[
            "run",
            "status",
            "stop",
            "export-once",
            "redis-start",
            "redis-status",
            "native-crawl",
            "clone"
        ]
    )

    args = parser.parse_args()

    config = load_config()

    if args.command == "run":
        return daemon_loop()

    if args.command == "status":
        return status()

    if args.command == "stop":
        return stop_daemon()

    if args.command == "export-once":

        export_once()

        return 0

    if args.command == "redis-start":

        return (
            0
            if start_redis(config)
            else 1
        )

    if args.command == "redis-status":

        print(
            json.dumps(
                {
                    "redis_running": redis_status(config)
                },
                indent=2
            )
        )

        return (
            0
            if redis_status(config)
            else 1
        )

    if args.command == "native-crawl":

        run_native_crawler(config)

        return 0

    if args.command == "clone":

        clone_or_update_original()

        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
