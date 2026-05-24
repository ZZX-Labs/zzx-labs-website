#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import socket
import subprocess
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import dns.resolver

from bitcoin_p2p import (
    getaddr,
    handshake,
    version_info_to_bitnodes_array
)

from export_json import (
    export_all,
    write_json
)

from geoip import (
    enrich_snapshot_payload
)


DNS_SEEDS = [
    "seed.bitcoin.sipa.be",
    "dnsseed.bluematt.me",
    "dnsseed.bitcoin.dashjr.org",
    "seed.bitcoinstats.com",
    "seed.bitcoin.jonasschnelli.ch",
    "seed.btc.petertodd.net",
    "seed.bitcoin.sprovoost.nl",
    "dnsseed.emzy.de"
]


DEFAULT_OUTPUT = Path("bitcoin/bitnodes/api")
DEFAULT_ARCHIVE = Path("bitcoin/bitnodes/archive")
DEFAULT_HISTORY = Path("data/bitnodes/history")
DEFAULT_CITY_DB = Path("data/geoip/GeoLite2-City.mmdb")
DEFAULT_ASN_DB = Path("data/geoip/GeoLite2-ASN.mmdb")


def utc_now() -> int:
    return int(time.time())


def utc_iso(ts: int | None = None) -> str:
    if ts is None:
        ts = utc_now()

    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def history_path(base_dir: Path, timestamp: int) -> Path:
    t = time.gmtime(timestamp)

    return (
        base_dir
        / f"{t.tm_year:04d}"
        / f"{t.tm_mon:02d}"
        / f"{t.tm_mday:02d}"
        / f"{t.tm_hour:02d}"
        / f"{timestamp}.json"
    )


def save_history_snapshot(payload: dict[str, Any], history_dir: Path) -> Path:
    path = history_path(history_dir, payload["timestamp"])
    mkdir(path.parent)
    write_json(path, payload)
    return path


def resolve_seed(seed: str, timeout: float = 5.0) -> list[str]:
    output = []

    for record_type in ("A", "AAAA"):
        try:
            answers = dns.resolver.resolve(seed, record_type, lifetime=timeout)
            output.extend(str(answer) for answer in answers)
        except Exception:
            pass

    return output


def normalize_address(host: str) -> str:
    value = str(host).strip()

    if value.startswith("[") and "]:" in value:
        return value

    if value.startswith("[") and value.endswith("]"):
        return f"{value}:8333"

    if ".onion:" in value:
        return value

    if ".onion" in value:
        return f"{value}:8333"

    if value.count(":") == 1 and value.rsplit(":", 1)[1].isdigit():
        return value

    if value.count(":") > 1:
        return f"[{value}]:8333"

    return f"{value}:8333"


def discover_dns(limit: int, timeout: float = 5.0) -> list[str]:
    discovered = []

    for seed in DNS_SEEDS:
        discovered.extend(resolve_seed(seed, timeout=timeout))

    unique = sorted(set(discovered))

    return [normalize_address(host) for host in unique[:limit]]


def discover_getaddr(
    seeds: list[str],
    limit: int,
    timeout: float,
    workers: int,
    rounds: int
) -> list[str]:
    seen = set(seeds)
    queue = deque(seeds)
    usable = list(seeds)

    for _round in range(rounds):
        if len(seen) >= limit:
            break

        batch = []

        while queue and len(batch) < workers:
            batch.append(queue.popleft())

        if not batch:
            break

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(getaddr, address, timeout): address
                for address in batch
            }

            for future in as_completed(futures):
                try:
                    found = future.result()
                except Exception:
                    found = []

                for address in found:
                    normalized = normalize_address(address)

                    if normalized in seen:
                        continue

                    seen.add(normalized)
                    queue.append(normalized)
                    usable.append(normalized)

                    if len(seen) >= limit:
                        break

                if len(seen) >= limit:
                    break

    return usable[:limit]


def crawl_address(address: str, timeout: float) -> tuple[str, list[Any]] | None:
    try:
        info = handshake(address, timeout=timeout)

        if not info.connected:
            return None

        row = version_info_to_bitnodes_array(info)

        return info.address, row

    except (socket.timeout, TimeoutError, OSError, ValueError):
        return None

    except Exception:
        return None


def crawl(
    addresses: list[str],
    timeout: float,
    workers: int = 128
) -> dict[str, list[Any]]:
    nodes: dict[str, list[Any]] = {}

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [
            executor.submit(crawl_address, address, timeout)
            for address in addresses
        ]

        for future in as_completed(futures):
            try:
                result = future.result()
            except Exception:
                result = None

            if not result:
                continue

            address, row = result
            nodes[address] = row

    return nodes


def latest_height(nodes: dict[str, list[Any]]) -> int | None:
    heights = []

    for values in nodes.values():
        if len(values) > 4 and isinstance(values[4], int):
            heights.append(values[4])

    return max(heights) if heights else None


def load_previous_snapshot(history_dir: Path) -> dict[str, Any] | None:
    if not history_dir.exists():
        return None

    files = sorted(history_dir.rglob("*.json"))

    if not files:
        return None

    try:
        return load_json(files[-1])
    except Exception:
        return None


def build_uptime_map(
    current_nodes: dict[str, list[Any]],
    previous_snapshot: dict[str, Any] | None
) -> dict[str, float]:
    uptimes: dict[str, float] = {}
    previous_nodes = previous_snapshot.get("nodes", {}) if previous_snapshot else {}
    previous_uptime = previous_snapshot.get("uptime", {}) if previous_snapshot else {}

    previous_timestamp = previous_snapshot.get("timestamp") if previous_snapshot else None
    now = utc_now()

    elapsed = max(0, now - int(previous_timestamp)) if previous_timestamp else 0

    for address in current_nodes:
        if address in previous_nodes:
            uptimes[address] = float(previous_uptime.get(address, 0)) + elapsed
        else:
            uptimes[address] = 0.0

    return uptimes


def build_latency_map(nodes: dict[str, list[Any]]) -> dict[str, float]:
    latencies = {}

    for address, row in nodes.items():
        if len(row) > 13 and row[13] is not None:
            try:
                latencies[address] = float(row[13])
                continue
            except Exception:
                pass

        latencies[address] = 0.0

    return latencies


def build_snapshot_diff(
    nodes: dict[str, list[Any]],
    previous_snapshot: dict[str, Any] | None
) -> dict[str, Any]:
    previous_nodes = previous_snapshot.get("nodes", {}) if previous_snapshot else {}

    current_set = set(nodes)
    previous_set = set(previous_nodes)

    added = sorted(current_set - previous_set)
    removed = sorted(previous_set - current_set)
    retained = sorted(current_set & previous_set)

    height_changes = {}

    for address in retained:
        current_height = nodes[address][4] if len(nodes[address]) > 4 else None
        previous_height = previous_nodes[address][4] if len(previous_nodes[address]) > 4 else None

        if current_height != previous_height:
            height_changes[address] = {
                "previous": previous_height,
                "current": current_height
            }

    return {
        "added_count": len(added),
        "removed_count": len(removed),
        "retained_count": len(retained),
        "added": added[:1000],
        "removed": removed[:1000],
        "height_changes": height_changes
    }


def build_payload(
    nodes: dict[str, list[Any]],
    timestamp: int,
    uptime: dict[str, float],
    latency: dict[str, float],
    diff: dict[str, Any]
) -> dict[str, Any]:
    return {
        "source": "zzx-labs-native-bitnodes-p2p-getaddr-crawler",
        "timestamp": timestamp,
        "updated_at": utc_iso(timestamp),
        "total_nodes": len(nodes),
        "reachable_nodes": len(nodes),
        "latest_height": latest_height(nodes),
        "uptime": uptime,
        "latency": latency,
        "changes": diff,
        "nodes": nodes
    }


def git_commit_and_push(repo_root: Path, message: str) -> None:
    commands = [
        ["git", "add", "."],
        ["git", "commit", "-m", message],
        ["git", "push"]
    ]

    for command in commands:
        subprocess.run(command, cwd=repo_root, check=False)


def crawl_once(
    output_dir: Path,
    history_dir: Path,
    archive_dir: Path,
    raw_output: Path | None,
    limit: int,
    timeout: float,
    workers: int,
    geoip_enabled: bool,
    getaddr_rounds: int
) -> dict[str, Any]:
    timestamp = utc_now()

    dns_limit = min(limit, max(workers * 4, 500))
    seed_addresses = discover_dns(dns_limit, timeout=timeout)

    all_addresses = discover_getaddr(
        seeds=seed_addresses,
        limit=limit,
        timeout=timeout,
        workers=workers,
        rounds=getaddr_rounds
    )

    nodes = crawl(
        addresses=all_addresses,
        timeout=timeout,
        workers=workers
    )

    previous_snapshot = load_previous_snapshot(history_dir)

    uptime = build_uptime_map(nodes, previous_snapshot)
    latency = build_latency_map(nodes)
    diff = build_snapshot_diff(nodes, previous_snapshot)

    payload = build_payload(
        nodes=nodes,
        timestamp=timestamp,
        uptime=uptime,
        latency=latency,
        diff=diff
    )

    payload = enrich_snapshot_payload(
        payload,
        city_db=DEFAULT_CITY_DB,
        asn_db=DEFAULT_ASN_DB,
        enabled=geoip_enabled
    )

    if raw_output:
        write_json(raw_output, payload)

    temp = output_dir / "_native_latest_raw.json"
    write_json(temp, payload)

    export_all(
        input_path=temp,
        output_dir=output_dir,
        source=payload["source"],
        pretty=True,
        archive_dir=archive_dir,
        gzip_archive=True
    )

    try:
        temp.unlink()
    except FileNotFoundError:
        pass

    save_history_snapshot(payload, history_dir)

    print(
        f"[{utc_iso()}] exported {len(nodes)} reachable nodes "
        f"from {len(all_addresses)} discovered addresses"
    )

    return payload


def daemon_loop(
    output_dir: Path,
    history_dir: Path,
    archive_dir: Path,
    raw_output: Path | None,
    limit: int,
    timeout: float,
    workers: int,
    interval: int,
    geoip_enabled: bool,
    git_push_enabled: bool,
    getaddr_rounds: int
) -> None:
    while True:
        try:
            crawl_once(
                output_dir=output_dir,
                history_dir=history_dir,
                archive_dir=archive_dir,
                raw_output=raw_output,
                limit=limit,
                timeout=timeout,
                workers=workers,
                geoip_enabled=geoip_enabled,
                getaddr_rounds=getaddr_rounds
            )

            if git_push_enabled:
                git_commit_and_push(
                    repo_root=Path.cwd(),
                    message="Update Bitnodes API snapshots"
                )

        except KeyboardInterrupt:
            raise

        except Exception as exc:
            print(exc)

        time.sleep(interval)


def main() -> int:
    parser = argparse.ArgumentParser()

    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE))
    parser.add_argument("--history-dir", default=str(DEFAULT_HISTORY))
    parser.add_argument("--raw-output", default="")
    parser.add_argument("--limit", type=int, default=10000)
    parser.add_argument("--timeout", type=float, default=5.0)
    parser.add_argument("--workers", type=int, default=256)
    parser.add_argument("--interval", type=int, default=900)
    parser.add_argument("--getaddr-rounds", type=int, default=8)
    parser.add_argument("--daemon", action="store_true")
    parser.add_argument("--disable-geoip", action="store_true")
    parser.add_argument("--git-push", action="store_true")

    args = parser.parse_args()

    output_dir = Path(args.output)
    archive_dir = Path(args.archive_dir)
    history_dir = Path(args.history_dir)

    mkdir(output_dir)
    mkdir(archive_dir)
    mkdir(history_dir)

    raw_output = Path(args.raw_output) if args.raw_output else None

    if args.daemon:
        daemon_loop(
            output_dir=output_dir,
            history_dir=history_dir,
            archive_dir=archive_dir,
            raw_output=raw_output,
            limit=args.limit,
            timeout=args.timeout,
            workers=args.workers,
            interval=args.interval,
            geoip_enabled=not args.disable_geoip,
            git_push_enabled=args.git_push,
            getaddr_rounds=args.getaddr_rounds
        )

        return 0

    crawl_once(
        output_dir=output_dir,
        history_dir=history_dir,
        archive_dir=archive_dir,
        raw_output=raw_output,
        limit=args.limit,
        timeout=args.timeout,
        workers=args.workers,
        geoip_enabled=not args.disable_geoip,
        getaddr_rounds=args.getaddr_rounds
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())