#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

APP_NAME = "bitnodesd.py"
APP_VERSION = "0.4.0"

CRAWLER = TOOLS_DIR / "crawl.py"
ZZX_CRAWLER = TOOLS_DIR / "zzx_crawl.py"
ENRICH = TOOLS_DIR / "enrich.py"
MAPS = TOOLS_DIR / "maps.py"
BUILD_GEO_INDEXES = TOOLS_DIR / "build_geo_indexes.py"
PUSH_IPDB = TOOLS_DIR / "push_ipdb.py"

CONFIG_PATH = TOOLS_DIR / "config.json"
CONFIG_EXAMPLE_PATH = TOOLS_DIR / "config.example.json"

RUN_DIR = APP_ROOT / "run"
LOG_DIR = APP_ROOT / "log" / "bitnodes"

PID_PATH = RUN_DIR / "bitnodesd.pid"
STATUS_PATH = RUN_DIR / "bitnodesd.status.json"
LOG_PATH = LOG_DIR / "bitnodesd.log"

DEFAULT_API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_ARCHIVE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "archive"
DEFAULT_STATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state"
DEFAULT_SNAPSHOT_24H_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "snapshots" / "24h"

DEFAULT_ENRICHED_DIR = DEFAULT_API_DIR / "enriched"
DEFAULT_ENRICHED_LATEST = DEFAULT_ENRICHED_DIR / "latest.json"
DEFAULT_ENRICHMENT_REPORT = DEFAULT_ENRICHED_DIR / "enrichment-report.json"

DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"


def utc_now() -> int:
    return int(time.time())


def utc_iso(ts: int | None = None) -> str:
    if ts is None:
        ts = utc_now()

    return datetime.fromtimestamp(ts, timezone.utc).replace(microsecond=0).isoformat()


def ensure_dirs() -> None:
    for path in (
        RUN_DIR,
        LOG_DIR,
        DEFAULT_API_DIR,
        DEFAULT_ARCHIVE_DIR,
        DEFAULT_STATE_DIR,
        DEFAULT_SNAPSHOT_24H_DIR,
        DEFAULT_ENRICHED_DIR,
        DEFAULT_MAP_DIR,
        DEFAULT_LIVE_MAP_DIR,
    ):
        path.mkdir(parents=True, exist_ok=True)


def log(message: str) -> None:
    ensure_dirs()
    line = f"{utc_iso()} {message}"

    print(line, flush=True)

    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def read_json(path: Path, default: Any = None) -> Any:
    if default is None:
        default = {}

    if not path.exists():
        return default

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    temp_path = path.with_suffix(path.suffix + ".tmp")

    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")

    temp_path.replace(path)


def load_config() -> dict[str, Any]:
    if CONFIG_PATH.exists():
        return read_json(CONFIG_PATH, {})

    if CONFIG_EXAMPLE_PATH.exists():
        return read_json(CONFIG_EXAMPLE_PATH, {})

    return {}


def cfg_get(config: dict[str, Any], path: list[str], default: Any) -> Any:
    current: Any = config

    for key in path:
        if not isinstance(current, dict):
            return default

        if key not in current:
            return default

        current = current[key]

    return current


def bool_cfg(config: dict[str, Any], path: list[str], default: bool = False) -> bool:
    value = cfg_get(config, path, default)

    if isinstance(value, bool):
        return value

    return str(value).strip().lower() in {
        "1",
        "true",
        "yes",
        "y",
        "on",
        "enabled",
        "enable",
    }


def write_pid() -> None:
    ensure_dirs()
    PID_PATH.write_text(str(os.getpid()), encoding="utf-8")


def read_pid() -> int | None:
    try:
        return int(PID_PATH.read_text(encoding="utf-8").strip())
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


def current_pid_running() -> bool:
    pid = read_pid()
    return bool(pid and process_running(pid))


def run_command(
    command: list[str],
    cwd: Path = APP_ROOT,
    check: bool = False,
    timeout: int | None = None,
) -> subprocess.CompletedProcess[str]:
    log("RUN " + " ".join(str(item) for item in command))

    result = subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=timeout,
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


def latest_input(config: dict[str, Any]) -> Path:
    api_dir = Path(cfg_get(config, ["export", "base_dir"], str(DEFAULT_API_DIR)))
    state_dir = Path(cfg_get(config, ["export", "state_dir"], str(DEFAULT_STATE_DIR)))

    candidates = [
        api_dir / "zzxbitnodes" / "latest.json",
        api_dir / "zzxbitnodes" / "nodes.json",
        api_dir / "originalbitnodes" / "latest.json",
        api_dir / "originalbitnodes" / "nodes.json",
        api_dir / "latest.json",
        api_dir / "nodes.json",
        state_dir / "latest.json",
        state_dir / "nodes.json",
        state_dir / "registry.json",
    ]

    for path in candidates:
        if path.exists():
            return path

    return api_dir / "zzxbitnodes" / "latest.json"


def selected_crawler(config: dict[str, Any]) -> Path:
    prefer_zzx = bool_cfg(config, ["crawler", "prefer_zzx"], True)

    if prefer_zzx and ZZX_CRAWLER.exists():
        return ZZX_CRAWLER

    return CRAWLER


def default_modules() -> str:
    return ",".join(
        [
            "ip_db",
            "ipv4",
            "ipv6",
            "tor",
            "i2p",
            "proxy",
            "vpn",
            "geoloc",
            "continent",
            "region",
            "country",
            "territory",
            "county",
            "city",
            "zip",
            "timezone",
            "asn",
            "isp",
            "provider",
            "organization",
            "datacenter",
            "government",
            "military",
            "w3w_lookup",
            "geohashid_lookup",
            "sanctioned_nodes",
            "aptattribution",
            "tagattribution",
            "knownmalactor",
            "peers",
            "peer_index",
            "peer_health",
            "dns_seeder_health",
        ]
    )


def build_crawl_command(config: dict[str, Any], daemon_cycle: bool = False) -> list[str]:
    crawler_cfg = config.get("crawler", {})
    export_cfg = config.get("export", {})
    github_cfg = config.get("github", {})
    geoip_cfg = config.get("geoip", {})

    script = selected_crawler(config)

    limit = int(crawler_cfg.get("max_nodes_per_run", 100000))
    batch_size = int(crawler_cfg.get("batch_size", 5000))
    timeout = float(crawler_cfg.get("handshake_timeout", crawler_cfg.get("connection_timeout", 5)))
    workers = int(crawler_cfg.get("max_parallel_connections", 512))
    getaddr_rounds = int(crawler_cfg.get("getaddr_rounds", 8))
    interval = int(crawler_cfg.get("crawl_interval_seconds", 900))
    export_mode = str(export_cfg.get("mode", "reachable_24h"))

    api_dir = Path(export_cfg.get("base_dir", str(DEFAULT_API_DIR)))
    archive_dir = Path(export_cfg.get("archive_dir", str(DEFAULT_ARCHIVE_DIR)))
    state_dir = Path(export_cfg.get("state_dir", str(DEFAULT_STATE_DIR)))
    snapshot_24h_dir = Path(export_cfg.get("snapshot_24h_dir", str(DEFAULT_SNAPSHOT_24H_DIR)))

    cmd = [
        sys.executable,
        str(script),
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
        export_mode,
    ]

    if not bool(geoip_cfg.get("enabled", True)):
        cmd.append("--disable-geoip")

    if bool(export_cfg.get("compact", False)):
        cmd.append("--compact")

    if daemon_cycle:
        cmd.extend(["--interval", str(interval)])

    if daemon_cycle and bool(github_cfg.get("auto_push_from_crawler", False)):
        cmd.append("--git-push")

    return cmd


def build_enrich_command(config: dict[str, Any]) -> list[str]:
    enrich_cfg = config.get("enrichment", {})
    export_cfg = config.get("export", {})

    api_dir = Path(export_cfg.get("base_dir", str(DEFAULT_API_DIR)))
    state_dir = Path(export_cfg.get("state_dir", str(DEFAULT_STATE_DIR)))

    input_path = Path(enrich_cfg.get("input", "")) if enrich_cfg.get("input") else latest_input(config)
    output_path = Path(enrich_cfg.get("output", str(DEFAULT_ENRICHED_LATEST)))
    report_path = Path(enrich_cfg.get("report", str(DEFAULT_ENRICHMENT_REPORT)))

    modules = enrich_cfg.get("modules", default_modules())

    if isinstance(modules, list):
        modules = ",".join(str(item) for item in modules)

    cmd = [
        sys.executable,
        str(ENRICH),
        "--input",
        str(input_path),
        "--output",
        str(output_path),
        "--report",
        str(report_path),
        "--source",
        str(enrich_cfg.get("source", "zzxbitnodes")),
        "--api-dir",
        str(api_dir),
        "--state-dir",
        str(state_dir),
        "--modules",
        str(modules),
    ]

    option_map = {
        "geo_root": "--geo-root",
        "geoip_dir": "--geoip-dir",
        "territory_dir": "--territory-dir",
        "county_dir": "--county-dir",
        "city_dir": "--city-dir",
        "zip_dir": "--zip-dir",
        "timezone_dir": "--timezone-dir",
        "w3w_cache": "--w3w-cache",
        "w3w_api_key": "--w3w-api-key",
        "w3w_language": "--w3w-language",
        "w3w_sleep": "--w3w-sleep",
        "geohash_cache": "--geohash-cache",
        "geohash_precision": "--geohash-precision",
        "geohash_prefix": "--geohash-prefix",
        "sanctions_policy": "--sanctions-policy",
    }

    for key, flag in option_map.items():
        value = enrich_cfg.get(key)

        if value not in (None, ""):
            cmd.extend([flag, str(value)])

    if bool(enrich_cfg.get("w3w_no_api", False)):
        cmd.append("--w3w-no-api")

    if bool(enrich_cfg.get("w3w_no_fallback", False)):
        cmd.append("--w3w-no-fallback")

    if bool(enrich_cfg.get("strict", False)):
        cmd.append("--strict")

    return cmd


def build_maps_command(config: dict[str, Any]) -> list[str]:
    maps_cfg = config.get("maps", {})
    export_cfg = config.get("export", {})

    api_dir = Path(export_cfg.get("base_dir", str(DEFAULT_API_DIR)))
    state_dir = Path(export_cfg.get("state_dir", str(DEFAULT_STATE_DIR)))

    input_path = Path(maps_cfg.get("input", "")) if maps_cfg.get("input") else (
        DEFAULT_ENRICHED_LATEST if DEFAULT_ENRICHED_LATEST.exists() else latest_input(config)
    )

    cmd = [
        sys.executable,
        str(MAPS),
        "--input",
        str(input_path),
        "--api-dir",
        str(api_dir),
        "--state-dir",
        str(state_dir),
        "--map-dir",
        str(maps_cfg.get("map_dir", DEFAULT_MAP_DIR)),
        "--live-map-dir",
        str(maps_cfg.get("live_map_dir", DEFAULT_LIVE_MAP_DIR)),
        "--source",
        str(maps_cfg.get("source", "zzxbitnodes")),
        "--theme",
        str(maps_cfg.get("theme", "zzx_dark_olive")),
        "--settings",
        str(maps_cfg.get("settings", "default")),
        "--tile-provider",
        str(maps_cfg.get("tile_provider", "cartodb_dark")),
    ]

    if maps_cfg.get("theme_dir"):
        cmd.extend(["--theme-dir", str(maps_cfg["theme_dir"])])

    if maps_cfg.get("settings_dir"):
        cmd.extend(["--settings-dir", str(maps_cfg["settings_dir"])])

    if bool(maps_cfg.get("strict", False)):
        cmd.append("--strict")

    if bool(maps_cfg.get("no_modules", False)):
        cmd.append("--no-modules")

    return cmd


def git_commit_and_push(config: dict[str, Any]) -> None:
    github_cfg = config.get("github", {})

    if not bool(github_cfg.get("auto_push", False)):
        log("Git auto-push disabled.")
        return

    branch = str(github_cfg.get("branch", "main"))
    message = str(github_cfg.get("commit_message", "Update Bitnodes global node snapshots"))

    paths = github_cfg.get(
        "paths",
        [
            "bitcoin/bitnodes/api",
            "bitcoin/bitnodes/archive",
            "bitcoin/bitnodes/data",
            "bitcoin/bitnodes/maps",
            "bitcoin/bitnodes/live-map",
        ],
    )

    if not isinstance(paths, list):
        paths = [
            "bitcoin/bitnodes/api",
            "bitcoin/bitnodes/archive",
            "bitcoin/bitnodes/data",
            "bitcoin/bitnodes/maps",
            "bitcoin/bitnodes/live-map",
        ]

    run_command(["git", "fetch", "origin", branch], cwd=APP_ROOT, check=False)
    run_command(["git", "pull", "--rebase", "origin", branch], cwd=APP_ROOT, check=False)
    run_command(["git", "add", *[str(path) for path in paths]], cwd=APP_ROOT, check=False)

    diff = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=str(APP_ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    if diff.returncode == 0:
        log("No Bitnodes changes to commit.")
        return

    run_command(["git", "commit", "-m", message], cwd=APP_ROOT, check=False)

    for attempt in range(1, 6):
        pull = run_command(["git", "pull", "--rebase", "origin", branch], cwd=APP_ROOT, check=False)
        push = run_command(["git", "push", "origin", branch], cwd=APP_ROOT, check=False)

        if pull.returncode == 0 and push.returncode == 0:
            log("Bitnodes outputs pushed.")
            return

        log(f"Git push attempt {attempt} failed; retrying.")
        time.sleep(10)

    log("Failed to push Bitnodes outputs after retries.")


def write_status(
    config: dict[str, Any],
    state: str,
    extra: dict[str, Any] | None = None,
) -> None:
    pid = read_pid()

    payload = {
        "schema": "zzx-bitnodes-daemon-status-v2",
        "app": APP_NAME,
        "version": APP_VERSION,
        "updated_at": utc_iso(),
        "state": state,
        "daemon_running": bool(pid and process_running(pid)),
        "pid": pid,
        "app_root": str(APP_ROOT),
        "tools_dir": str(TOOLS_DIR),
        "crawler": str(selected_crawler(config)),
        "original_crawler": str(CRAWLER),
        "zzx_crawler": str(ZZX_CRAWLER),
        "enrich": str(ENRICH),
        "maps": str(MAPS),
        "push_ipdb": str(PUSH_IPDB),
        "api_dir": str(cfg_get(config, ["export", "base_dir"], str(DEFAULT_API_DIR))),
        "archive_dir": str(cfg_get(config, ["export", "archive_dir"], str(DEFAULT_ARCHIVE_DIR))),
        "state_dir": str(cfg_get(config, ["export", "state_dir"], str(DEFAULT_STATE_DIR))),
        "snapshot_24h_dir": str(cfg_get(config, ["export", "snapshot_24h_dir"], str(DEFAULT_SNAPSHOT_24H_DIR))),
        "enriched_latest": str(DEFAULT_ENRICHED_LATEST),
        "map_dir": str(DEFAULT_MAP_DIR),
        "live_map_dir": str(DEFAULT_LIVE_MAP_DIR),
        "log_path": str(LOG_PATH),
        "status_path": str(STATUS_PATH),
        "config_path": str(CONFIG_PATH if CONFIG_PATH.exists() else CONFIG_EXAMPLE_PATH),
        **(extra or {}),
    }

    write_json(STATUS_PATH, payload)


def maybe_push_ipdb(config: dict[str, Any]) -> int:
    if not bool_cfg(config, ["ipdb", "enabled"], False):
        log("IPDB push disabled.")
        return 0

    if not PUSH_IPDB.exists():
        log(f"IPDB push skipped. Missing file: {PUSH_IPDB}")
        return 0

    result = run_command([sys.executable, str(PUSH_IPDB)], cwd=APP_ROOT, check=False)
    return result.returncode


def run_cycle(config: dict[str, Any], daemon_cycle: bool = False) -> int:
    started = utc_now()

    write_status(config, "cycle-started", {"cycle_started_at": utc_iso(started)})

    if bool_cfg(config, ["crawler", "enabled"], True):
        write_status(config, "crawl-started")

        crawl = run_command(
            build_crawl_command(config, daemon_cycle=daemon_cycle),
            cwd=APP_ROOT,
            check=False,
        )

        if crawl.returncode != 0:
            write_status(
                config,
                "crawl-failed",
                {
                    "last_exit_code": crawl.returncode,
                    "cycle_runtime_seconds": utc_now() - started,
                },
            )
            return crawl.returncode
    else:
        log("Crawler disabled.")

    ipdb_code = maybe_push_ipdb(config)

    if ipdb_code != 0:
        write_status(
            config,
            "ipdb-failed",
            {
                "last_exit_code": ipdb_code,
                "cycle_runtime_seconds": utc_now() - started,
            },
        )
        return ipdb_code

    if bool_cfg(config, ["enrichment", "enabled"], True):
        write_status(config, "enrichment-started")

        enrich = run_command(
            build_enrich_command(config),
            cwd=APP_ROOT,
            check=False,
        )

        if enrich.returncode != 0:
            write_status(
                config,
                "enrichment-failed",
                {
                    "last_exit_code": enrich.returncode,
                    "cycle_runtime_seconds": utc_now() - started,
                },
            )
            return enrich.returncode
    else:
        log("Enrichment disabled.")

    if bool_cfg(config, ["maps", "enabled"], True):
        write_status(config, "maps-started")

        maps = run_command(
            build_maps_command(config),
            cwd=APP_ROOT,
            check=False,
        )

        if maps.returncode != 0:
            write_status(
                config,
                "maps-failed",
                {
                    "last_exit_code": maps.returncode,
                    "cycle_runtime_seconds": utc_now() - started,
                },
            )
            return maps.returncode
    else:
        log("Map build disabled.")

    git_commit_and_push(config)

    write_status(
        config,
        "cycle-complete",
        {
            "last_exit_code": 0,
            "cycle_started_at": utc_iso(started),
            "cycle_finished_at": utc_iso(),
            "cycle_runtime_seconds": utc_now() - started,
        },
    )

    return 0


def export_once() -> int:
    ensure_dirs()
    config = load_config()
    return run_cycle(config, daemon_cycle=False)


def enrich_once() -> int:
    ensure_dirs()
    config = load_config()

    result = run_command(build_enrich_command(config), cwd=APP_ROOT, check=False)

    write_status(
        config,
        "enrichment-once-complete",
        {"last_exit_code": result.returncode},
    )

    return result.returncode


def maps_once() -> int:
    ensure_dirs()
    config = load_config()

    result = run_command(build_maps_command(config), cwd=APP_ROOT, check=False)

    write_status(
        config,
        "maps-once-complete",
        {"last_exit_code": result.returncode},
    )

    return result.returncode


def geo_index_once() -> int:
    ensure_dirs()

    result = run_command(
        [sys.executable, str(BUILD_GEO_INDEXES), "--download"],
        cwd=APP_ROOT,
        check=False,
        timeout=None,
    )

    return result.returncode


def start_background() -> int:
    ensure_dirs()

    if current_pid_running():
        pid = read_pid()
        print(f"bitnodesd already running: {pid}")
        return 0

    if PID_PATH.exists():
        remove_pid()

    creationflags = 0

    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS

    subprocess.Popen(
        [sys.executable, str(Path(__file__).resolve()), "run"],
        cwd=str(APP_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        close_fds=os.name != "nt",
        creationflags=creationflags,
    )

    time.sleep(1)

    pid = read_pid()

    if pid:
        print(f"bitnodesd started: {pid}")
        return 0

    print("bitnodesd start requested.")
    return 0


def daemon_loop() -> int:
    ensure_dirs()

    if current_pid_running():
        pid = read_pid()
        print(f"bitnodesd already running: {pid}")
        return 1

    write_pid()

    config = load_config()
    interval = int(cfg_get(config, ["crawler", "crawl_interval_seconds"], 900))

    stop_requested = False

    def stop_handler(_signum, _frame) -> None:
        nonlocal stop_requested
        stop_requested = True
        log("Stop signal received.")

    signal.signal(signal.SIGTERM, stop_handler)
    signal.signal(signal.SIGINT, stop_handler)

    log("bitnodesd started.")
    write_status(config, "started")

    try:
        while not stop_requested:
            config = load_config()
            interval = int(cfg_get(config, ["crawler", "crawl_interval_seconds"], interval))

            result = run_cycle(config, daemon_cycle=True)

            if result != 0:
                log(f"Daemon cycle failed with exit code {result}.")

            write_status(
                config,
                "sleeping",
                {
                    "last_exit_code": result,
                    "next_cycle_at": utc_iso(utc_now() + interval),
                    "sleep_seconds": interval,
                },
            )

            slept = 0

            while slept < interval and not stop_requested:
                time.sleep(1)
                slept += 1

    finally:
        remove_pid()
        write_status(load_config(), "stopped")
        log("bitnodesd stopped.")

    return 0


def status() -> int:
    ensure_dirs()

    pid = read_pid()
    running = bool(pid and process_running(pid))
    config = load_config()

    payload = read_json(STATUS_PATH, {})
    payload.update(
        {
            "schema": "zzx-bitnodes-daemon-status-v2",
            "app": APP_NAME,
            "version": APP_VERSION,
            "daemon_running": running,
            "pid": pid,
            "app_root": str(APP_ROOT),
            "tools_dir": str(TOOLS_DIR),
            "crawler": str(selected_crawler(config)),
            "original_crawler": str(CRAWLER),
            "zzx_crawler": str(ZZX_CRAWLER),
            "enrich": str(ENRICH),
            "maps": str(MAPS),
            "api_dir": str(cfg_get(config, ["export", "base_dir"], str(DEFAULT_API_DIR))),
            "archive_dir": str(cfg_get(config, ["export", "archive_dir"], str(DEFAULT_ARCHIVE_DIR))),
            "state_dir": str(cfg_get(config, ["export", "state_dir"], str(DEFAULT_STATE_DIR))),
            "snapshot_24h_dir": str(cfg_get(config, ["export", "snapshot_24h_dir"], str(DEFAULT_SNAPSHOT_24H_DIR))),
            "enriched_latest": str(DEFAULT_ENRICHED_LATEST),
            "map_dir": str(DEFAULT_MAP_DIR),
            "live_map_dir": str(DEFAULT_LIVE_MAP_DIR),
            "log_path": str(LOG_PATH),
            "status_path": str(STATUS_PATH),
            "config_path": str(CONFIG_PATH if CONFIG_PATH.exists() else CONFIG_EXAMPLE_PATH),
            "updated_at": utc_iso(),
        }
    )

    print(json.dumps(payload, indent=2, sort_keys=True))

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

    os.kill(pid, signal.SIGTERM)
    print(f"stop signal sent to {pid}")

    return 0


def restart_daemon() -> int:
    stop_daemon()

    for _ in range(30):
        if not current_pid_running():
            break
        time.sleep(1)

    return start_background()


def tail_log(lines: int = 80) -> int:
    ensure_dirs()

    if not LOG_PATH.exists():
        print("No bitnodesd log yet.")
        return 1

    content = LOG_PATH.read_text(encoding="utf-8", errors="replace").splitlines()

    for line in content[-lines:]:
        print(line)

    return 0


def write_config_example() -> int:
    payload = {
        "crawler": {
            "enabled": True,
            "prefer_zzx": True,
            "max_nodes_per_run": 100000,
            "batch_size": 5000,
            "connection_timeout": 5,
            "handshake_timeout": 5,
            "max_parallel_connections": 512,
            "getaddr_rounds": 8,
            "crawl_interval_seconds": 900,
        },
        "export": {
            "mode": "reachable_24h",
            "base_dir": str(DEFAULT_API_DIR),
            "archive_dir": str(DEFAULT_ARCHIVE_DIR),
            "state_dir": str(DEFAULT_STATE_DIR),
            "snapshot_24h_dir": str(DEFAULT_SNAPSHOT_24H_DIR),
            "compact": False,
        },
        "geoip": {
            "enabled": True,
        },
        "ipdb": {
            "enabled": False,
        },
        "enrichment": {
            "enabled": True,
            "source": "zzxbitnodes",
            "output": str(DEFAULT_ENRICHED_LATEST),
            "report": str(DEFAULT_ENRICHMENT_REPORT),
            "modules": default_modules().split(","),
            "strict": False,
            "w3w_no_api": False,
            "w3w_no_fallback": False,
        },
        "maps": {
            "enabled": True,
            "source": "zzxbitnodes",
            "map_dir": str(DEFAULT_MAP_DIR),
            "live_map_dir": str(DEFAULT_LIVE_MAP_DIR),
            "theme": "zzx_dark_olive",
            "settings": "default",
            "tile_provider": "cartodb_dark",
            "strict": False,
            "no_modules": False,
        },
        "github": {
            "auto_push": False,
            "auto_push_from_crawler": False,
            "branch": "main",
            "commit_message": "Update Bitnodes global node snapshots",
            "paths": [
                "bitcoin/bitnodes/api",
                "bitcoin/bitnodes/archive",
                "bitcoin/bitnodes/data",
                "bitcoin/bitnodes/maps",
                "bitcoin/bitnodes/live-map",
            ],
        },
    }

    write_json(CONFIG_EXAMPLE_PATH, payload)
    print(CONFIG_EXAMPLE_PATH)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog=APP_NAME,
        description="ZZX-Labs Bitnodes persistent server/controller daemon.",
    )

    parser.add_argument("--version", action="store_true")

    sub = parser.add_subparsers(dest="command")

    sub.add_parser("start")
    sub.add_parser("run")
    sub.add_parser("status")
    sub.add_parser("stop")
    sub.add_parser("restart")
    sub.add_parser("export-once")
    sub.add_parser("native-crawl")
    sub.add_parser("enrich-once")
    sub.add_parser("maps-once")
    sub.add_parser("geo-index")
    sub.add_parser("write-config-example")
    sub.add_parser("redis-start")
    sub.add_parser("redis-status")
    sub.add_parser("clone")

    tail = sub.add_parser("tail")
    tail.add_argument("--lines", type=int, default=80)

    args = parser.parse_args()

    if args.version:
        print(f"{APP_NAME} {APP_VERSION}")
        return 0

    if not args.command:
        parser.print_help()
        return 1

    if args.command == "start":
        return start_background()

    if args.command == "run":
        return daemon_loop()

    if args.command == "status":
        return status()

    if args.command == "stop":
        return stop_daemon()

    if args.command == "restart":
        return restart_daemon()

    if args.command in {"export-once", "native-crawl"}:
        return export_once()

    if args.command == "enrich-once":
        return enrich_once()

    if args.command == "maps-once":
        return maps_once()

    if args.command == "geo-index":
        return geo_index_once()

    if args.command == "write-config-example":
        return write_config_example()

    if args.command == "redis-start":
        print("Redis is not required by the native persistent crawler.")
        return 0

    if args.command == "redis-status":
        print(
            json.dumps(
                {
                    "redis_required": False,
                    "redis_running": False,
                    "message": "Native persistent crawler does not require Redis.",
                },
                indent=2,
            )
        )
        return 0

    if args.command == "clone":
        print("Original Bitnodes source cloning is handled by configured crawler modules.")
        return 0

    if args.command == "tail":
        return tail_log(args.lines)

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
