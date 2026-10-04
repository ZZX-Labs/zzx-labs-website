#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


SERVER_DIR = Path(__file__).resolve().parent
APP_ROOT = SERVER_DIR.parent

SERVER_APP = SERVER_DIR / "zzx-labs-server.py"

APP_NAME = "zzx-labs.py"
APP_VERSION = "0.1.0"

DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 5000


def eprint(message: str) -> None:
    print(message, file=sys.stderr)


def env_with_server_settings(host: str, port: int, debug: bool = False) -> dict[str, str]:
    env = os.environ.copy()
    env["ZZX_LABS_ROOT"] = str(APP_ROOT)
    env["ZZX_LABS_SERVER_DIR"] = str(SERVER_DIR)
    env["ZZX_LABS_HOST"] = host
    env["ZZX_LABS_PORT"] = str(port)
    env["ZZX_LABS_DEBUG"] = "1" if debug else "0"
    env["PYTHONUNBUFFERED"] = "1"

    return env


def run_command(command: list[str], env: dict[str, str] | None = None) -> int:
    try:
        return subprocess.call(
            command,
            cwd=str(APP_ROOT),
            env=env or os.environ.copy(),
        )
    except KeyboardInterrupt:
        eprint("\n[zzx-labs] interrupted.")
        return 130
    except OSError as exc:
        eprint(f"[zzx-labs] launch failed: {exc}")
        return 1


def command_dev(args: argparse.Namespace) -> int:
    if not SERVER_APP.exists():
        eprint(f"Missing server app: {SERVER_APP}")
        return 127

    env = env_with_server_settings(
        host=args.host,
        port=args.port,
        debug=True,
    )

    return run_command(
        [
            sys.executable,
            str(SERVER_APP),
        ],
        env=env,
    )


def command_waitress(args: argparse.Namespace) -> int:
    env = env_with_server_settings(
        host=args.host,
        port=args.port,
        debug=False,
    )

    return run_command(
        [
            sys.executable,
            "-m",
            "waitress",
            "--listen",
            f"{args.host}:{args.port}",
            "zzx-labs-server:app",
        ],
        env=env,
    )


def command_gunicorn(args: argparse.Namespace) -> int:
    env = env_with_server_settings(
        host=args.host,
        port=args.port,
        debug=False,
    )

    return run_command(
        [
            "gunicorn",
            "--bind",
            f"{args.host}:{args.port}",
            "--workers",
            str(args.workers),
            "--threads",
            str(args.threads),
            "--timeout",
            str(args.timeout),
            "--chdir",
            str(SERVER_DIR),
            "zzx-labs-server:app",
        ],
        env=env,
    )


def command_check() -> int:
    paths = {
        "app_root": APP_ROOT,
        "server_dir": SERVER_DIR,
        "server_app": SERVER_APP,
        "static_styles": APP_ROOT / "static" / "styles.css",
        "static_script": APP_ROOT / "static" / "script.js",
        "bitnodes_api": APP_ROOT / "bitcoin" / "bitnodes" / "api",
        "bpi_api": APP_ROOT / "bitcoin" / "bpi" / "api",
        "run_dir": APP_ROOT / "run",
    }

    print(f"{APP_NAME} {APP_VERSION}")
    print("")

    missing = 0

    for name, path in paths.items():
        exists = path.exists()

        if not exists:
            missing += 1

        print(f"{name:<18} {'ok' if exists else 'missing'}  {path}")

    return 1 if missing else 0


def command_paths() -> int:
    print(f"APP_ROOT={APP_ROOT}")
    print(f"SERVER_DIR={SERVER_DIR}")
    print(f"SERVER_APP={SERVER_APP}")
    print(f"BITNODES_API={APP_ROOT / 'bitcoin' / 'bitnodes' / 'api'}")
    print(f"BPI_API={APP_ROOT / 'bitcoin' / 'bpi' / 'api'}")
    print(f"RUN_DIR={APP_ROOT / 'run'}")

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=APP_NAME,
        description="ZZX-Labs server launcher/controller.",
    )

    parser.add_argument(
        "--version",
        action="store_true",
        help="Print version.",
    )

    sub = parser.add_subparsers(dest="command")

    dev = sub.add_parser("dev")
    dev.add_argument("--host", default=DEFAULT_HOST)
    dev.add_argument("--port", type=int, default=DEFAULT_PORT)

    waitress = sub.add_parser("waitress")
    waitress.add_argument("--host", default=DEFAULT_HOST)
    waitress.add_argument("--port", type=int, default=DEFAULT_PORT)

    gunicorn = sub.add_parser("gunicorn")
    gunicorn.add_argument("--host", default=DEFAULT_HOST)
    gunicorn.add_argument("--port", type=int, default=DEFAULT_PORT)
    gunicorn.add_argument("--workers", type=int, default=2)
    gunicorn.add_argument("--threads", type=int, default=4)
    gunicorn.add_argument("--timeout", type=int, default=120)

    sub.add_parser("check")
    sub.add_parser("paths")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.version:
        print(f"{APP_NAME} {APP_VERSION}")
        return 0

    if not args.command:
        parser.print_help()
        return 1

    if args.command == "dev":
        return command_dev(args)

    if args.command == "waitress":
        return command_waitress(args)

    if args.command == "gunicorn":
        return command_gunicorn(args)

    if args.command == "check":
        return command_check()

    if args.command == "paths":
        return command_paths()

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
