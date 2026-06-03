#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


TOOLS_DIR = Path(__file__).resolve().parent

APP_NAME = "bitnodes.py"
APP_VERSION = "0.3.0"

DEFAULT_MODE = "gui"

PRIMARY_TARGETS = {
    "gui": "bitnodes-gui.py",
    "cli": "bitnodes-cli.py",
    "daemon": "bitnodesd.py",
}

TOOL_TARGETS = {
    "crawl": "crawl.py",
    "crawler": "crawl.py",
    "enrich": "enrich.py",
    "maps": "maps.py",
    "push-ipdb": "push_ipdb.py",
    "ipdb": "push_ipdb.py",
    "asn": "asn.py",
    "isp": "isp.py",
    "provider": "provider.py",
    "organization": "organization.py",
    "government": "government.py",
    "military": "military.py",
    "datacenter": "datacenter.py",
    "apt": "aptattribution.py",
    "aptattribution": "aptattribution.py",
    "tag": "tagattribution.py",
    "tagattribution": "tagattribution.py",
    "knownmalactor": "knownmalactor.py",
}

MODE_ALIASES = {
    "g": "gui",
    "ui": "gui",
    "desktop": "gui",
    "c": "cli",
    "cmd": "cli",
    "console": "cli",
    "d": "daemon",
    "server": "daemon",
    "bitnodesd": "daemon",
    "crawler": "crawl",
    "map": "maps",
    "push_ipdb": "push-ipdb",
    "ip": "push-ipdb",
    "threatactor": "tagattribution",
    "threatactor": "tagattribution",
    "malactor": "knownmalactor",
}


@dataclass(frozen=True)
class Target:
    mode: str
    script: Path
    primary: bool


def eprint(message: str) -> None:
    print(message, file=sys.stderr)


def normalize_mode(mode: str | None) -> str:
    value = str(mode or DEFAULT_MODE).strip().lower()

    if not value:
        return DEFAULT_MODE

    return MODE_ALIASES.get(value, value)


def all_modes() -> dict[str, str]:
    merged: dict[str, str] = {}
    merged.update(PRIMARY_TARGETS)
    merged.update(TOOL_TARGETS)
    return merged


def resolve_target(mode: str) -> Target | None:
    normalized = normalize_mode(mode)

    if normalized in PRIMARY_TARGETS:
        return Target(
            mode=normalized,
            script=TOOLS_DIR / PRIMARY_TARGETS[normalized],
            primary=True,
        )

    if normalized in TOOL_TARGETS:
        return Target(
            mode=normalized,
            script=TOOLS_DIR / TOOL_TARGETS[normalized],
            primary=False,
        )

    return None


def clean_extra_args(extra: list[str] | None) -> list[str]:
    values = list(extra or [])

    if values and values[0] == "--":
        return values[1:]

    return values


def python_command(script: Path, extra_args: list[str]) -> list[str]:
    return [
        sys.executable,
        str(script),
        *extra_args,
    ]


def run_target(target: Target, extra_args: list[str]) -> int:
    if not target.script.exists():
        eprint(f"[{APP_NAME}] missing subsystem: {target.script}")
        return 127

    if not target.script.is_file():
        eprint(f"[{APP_NAME}] target is not a file: {target.script}")
        return 126

    command = python_command(target.script, extra_args)

    try:
        completed = subprocess.run(
            command,
            cwd=str(TOOLS_DIR),
            env=os.environ.copy(),
            check=False,
        )
    except KeyboardInterrupt:
        eprint(f"\n[{APP_NAME}] interrupted.")
        return 130
    except OSError as exc:
        eprint(f"[{APP_NAME}] failed to launch {target.script.name}: {exc}")
        return 1

    return int(completed.returncode)


def print_targets() -> int:
    print("Primary control surfaces:")
    for mode, filename in PRIMARY_TARGETS.items():
        path = TOOLS_DIR / filename
        state = "ok" if path.exists() else "missing"
        print(f"  {mode:<12} {filename:<28} {state}")

    print("")
    print("Direct tool dispatch:")
    seen: set[str] = set()

    for mode, filename in TOOL_TARGETS.items():
        if mode in seen:
            continue

        seen.add(mode)
        path = TOOLS_DIR / filename
        state = "ok" if path.exists() else "missing"
        print(f"  {mode:<12} {filename:<28} {state}")

    return 0


def print_status() -> int:
    missing: list[str] = []

    print(f"{APP_NAME} {APP_VERSION}")
    print(f"tools_dir: {TOOLS_DIR}")
    print(f"python: {sys.executable}")
    print("")

    for mode, filename in all_modes().items():
        path = TOOLS_DIR / filename
        if not path.exists():
            missing.append(filename)

    print_targets()

    if missing:
        unique_missing = sorted(set(missing))
        print("")
        print("Missing files:")
        for filename in unique_missing:
            print(f"  {filename}")
        return 1

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=APP_NAME,
        description=(
            "ZZX-Labs Bitnodes unified control wrapper. "
            "Routes GUI, CLI, daemon, crawler, enrichment, mapping, "
            "IP intelligence, attribution, and publishing subsystems."
        ),
    )

    parser.add_argument(
        "mode",
        nargs="?",
        default=DEFAULT_MODE,
        help=(
            "Mode to launch. Primary modes: gui, cli, daemon. "
            "Tool modes: crawl, enrich, maps, push-ipdb, asn, isp, provider, "
            "organization, government, military, datacenter, aptattribution, "
            "tagattribution, knownmalactor. Defaults to gui."
        ),
    )

    parser.add_argument(
        "extra",
        nargs=argparse.REMAINDER,
        help="Arguments passed directly to the selected subsystem.",
    )

    parser.add_argument(
        "--list",
        action="store_true",
        help="List available subsystem targets.",
    )

    parser.add_argument(
        "--status",
        action="store_true",
        help="Show wrapper status and verify expected subsystem files.",
    )

    parser.add_argument(
        "--version",
        action="store_true",
        help="Print wrapper version.",
    )

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.version:
        print(f"{APP_NAME} {APP_VERSION}")
        return 0

    if args.list:
        return print_targets()

    if args.status:
        return print_status()

    mode = normalize_mode(args.mode)
    extra_args = clean_extra_args(args.extra)

    target = resolve_target(mode)

    if target is None:
        eprint(f"[{APP_NAME}] unknown mode: {mode}")
        eprint("")
        parser.print_help(sys.stderr)
        return 2

    return run_target(target, extra_args)


if __name__ == "__main__":
    raise SystemExit(main())
