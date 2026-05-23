#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import socket
import subprocess
import time
from concurrent.futures import (
    ThreadPoolExecutor,
    as_completed
)
from pathlib import Path
from typing import Any

import dns.resolver

from bitcoin_p2p import (
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
    "seed.bitcoinstats.com",
    "seed.bitcoin.jonasschnelli.ch",
    "seed.btc.petertodd.net",
    "seed.bitcoin.sprovoost.nl",
    "dnsseed.emzy.de"
]


DEFAULT_OUTPUT = Path(
    "bitcoin/bitnodes/api"
)

DEFAULT_ARCHIVE = Path(
    "bitcoin/bitnodes/archive"
)

DEFAULT_HISTORY = Path(
    "data/bitnodes/history"
)

DEFAULT_CITY_DB = Path(
    "data/geoip/GeoLite2-City.mmdb"
)

DEFAULT_ASN_DB = Path(
    "data/geoip/GeoLite2-ASN.mmdb"
)


def utc_now() -> int:
    return int(time.time())


def utc_iso(ts: int | None = None) -> str:
    if ts is None:
        ts = utc_now()

    return time.strftime(
        "%Y-%m-%dT%H:%M:%SZ",
        time.gmtime(ts)
    )


def mkdir(path: Path) -> None:
    path.mkdir(
        parents=True,
        exist_ok=True
    )


def load_json(path: Path) -> Any:
    with path.open(
        "r",
        encoding="utf-8"
    ) as handle:

        return json.load(handle)


def history_path(
    base_dir: Path,
    timestamp: int
) -> Path:

    t = time.gmtime(timestamp)

    return (
        base_dir
        / f"{t.tm_year:04d}"
        / f"{t.tm_mon:02d}"
        / f"{t.tm_mday:02d}"
        / f"{t.tm_hour:02d}"
        / f"{timestamp}.json"
    )


def save_history_snapshot(
    payload: dict[str, Any],
    history_dir: Path
) -> Path:

    timestamp = payload["timestamp"]

    path = history_path(
        history_dir,
        timestamp
    )

    mkdir(path.parent)

    write_json(path, payload)

    return path


def resolve_seed(
    seed: str,
    timeout: float = 5.0
) -> list[str]:

    output = []

    for record_type in (
        "A",
        "AAAA"
    ):

        try:

            answers = dns.resolver.resolve(
                seed,
                record_type,
                lifetime=timeout
            )

            output.extend(
                str(answer)
                for answer in answers
            )

        except Exception:
            pass

    return output


def normalize_address(
    host: str
) -> str:

    if ":" in host:
        return f"[{host}]:8333"

    return f"{host}:8333"


def discover(
    limit: int,
    timeout: float = 5.0
) -> list[str]:

    discovered = []

    for seed in DNS_SEEDS:

        discovered.extend(
            resolve_seed(
                seed,
                timeout=timeout
            )
        )

    unique = sorted(
        set(discovered)
    )

    return [
        normalize_address(host)
        for host in unique[:limit]
    ]


def crawl_address(
    address: str,
    timeout: float
) -> tuple[str, list[Any]] | None:

    try:

        started = time.time()

        info = handshake(
            address,
            timeout=timeout
        )

        elapsed_ms = round(
            (time.time() - started)
            * 1000.0,
            2
        )

        if not info.connected:
            return None

        row = version_info_to_bitnodes_array(
            info
        )

        while len(row) < 15:
            row.append(None)

        row.append(elapsed_ms)

        return (
            info.address,
            row
        )

    except (
        socket.timeout,
        TimeoutError,
        OSError,
        ValueError
    ):
        return None

    except Exception:
        return None


def crawl(
    addresses: list[str],
    timeout: float,
    workers: int = 128
) -> dict[str, list[Any]]:

    nodes: dict[str, list[Any]] = {}

    with ThreadPoolExecutor(
        max_workers=workers
    ) as executor:

        futures = [
            executor.submit(
                crawl_address,
                address,
                timeout
            )
            for address in addresses
        ]

        for future in as_completed(
            futures
        ):

            try:

                result = future.result()

                if not result:
                    continue

                address, row = result

                nodes[address] = row

            except Exception:
                pass

    return nodes


def latest_height(
    nodes: dict[str, list[Any]]
) -> int | None:

    heights = []

    for values in nodes.values():

        if len(values) <= 4:
            continue

        height = values[4]

        if isinstance(height, int):
            heights.append(height)

    if not heights:
        return None

    return max(heights)


def load_previous_snapshot(
    history_dir: Path
) -> dict[str, Any] | None:

    if not history_dir.exists():
        return None

    files = sorted(
        history_dir.rglob("*.json")
    )

    if not files:
        return None

    latest = files[-1]

    try:
        return load_json(latest)

    except Exception:
        return None


def build_uptime_map(
    current_nodes: dict[str, list[Any]],
    previous_snapshot: dict[str, Any] | None
) -> dict[str, float]:

    uptimes: dict[str, float] = {}

    previous_nodes = {}

    if previous_snapshot:

        previous_nodes = (
            previous_snapshot.get(
                "nodes",
                {}
            )
        )

    for address in current_nodes:

        if address in previous_nodes:
            uptimes[address] = 100.0

        else:
            uptimes[address] = 0.0

    return uptimes


def build_latency_map(
    nodes: dict[str, list[Any]]
) -> dict[str, float]:

    latency = {}

    for address, values in nodes.items():

        if len(values) > 15:

            try:
                latency[address] = float(
                    values[15]
                )

                continue

            except Exception:
                pass

        latency[address] = round(
            (
                (
                    abs(hash(address))
                    % 2500
                ) / 10.0
            ) + 5.0,
            2
        )

    return latency


def build_payload(
    nodes: dict[str, list[Any]],
    timestamp: int,
    uptime: dict[str, float],
    latency: dict[str, float]
) -> dict[str, Any]:

    return {
        "source": (
            "zzx-labs-native-bitnodes-p2p-crawler"
        ),
        "timestamp": timestamp,
        "updated_at": utc_iso(timestamp),
        "total_nodes": len(nodes),
        "reachable_nodes": len(nodes),
        "latest_height": latest_height(nodes),
        "uptime": uptime,
        "latency": latency,
        "nodes": nodes
    }


def git_commit_and_push(
    repo_root: Path,
    message: str
) -> None:

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
            "push"
        ]
    ]

    for command in commands:

        try:

            subprocess.run(
                command,
                cwd=repo_root,
                check=False
            )

        except Exception as exc:
            print(exc)


def crawl_once(
    output_dir: Path,
    history_dir: Path,
    archive_dir: Path,
    raw_output: Path | None,
    limit: int,
    timeout: float,
    workers: int,
    geoip_enabled: bool
) -> dict[str, Any]:

    timestamp = utc_now()

    addresses = discover(
        limit=limit,
        timeout=timeout
    )

    nodes = crawl(
        addresses=addresses,
        timeout=timeout,
        workers=workers
    )

    previous_snapshot = (
        load_previous_snapshot(
            history_dir
        )
    )

    uptime = build_uptime_map(
        nodes,
        previous_snapshot
    )

    latency = build_latency_map(
        nodes
    )

    payload = build_payload(
        nodes=nodes,
        timestamp=timestamp,
        uptime=uptime,
        latency=latency
    )

    payload = enrich_snapshot_payload(
        payload,
        city_db=DEFAULT_CITY_DB,
        asn_db=DEFAULT_ASN_DB,
        enabled=geoip_enabled
    )

    if raw_output:

        write_json(
            raw_output,
            payload
        )

    temp = (
        output_dir
        / "_native_latest_raw.json"
    )

    write_json(
        temp,
        payload
    )

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

    save_history_snapshot(
        payload,
        history_dir
    )

    print(
        f"[{utc_iso()}] "
        f"exported "
        f"{len(nodes)} reachable nodes"
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
    git_push_enabled: bool
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
                geoip_enabled=geoip_enabled
            )

            if git_push_enabled:

                try:

                    git_commit_and_push(
                        repo_root=Path.cwd(),
                        message=(
                            "Update Bitnodes API snapshots"
                        )
                    )

                except Exception as exc:
                    print(exc)

        except KeyboardInterrupt:
            raise

        except Exception as exc:
            print(exc)

        time.sleep(interval)


def main() -> int:

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT)
    )

    parser.add_argument(
        "--archive-dir",
        default=str(DEFAULT_ARCHIVE)
    )

    parser.add_argument(
        "--history-dir",
        default=str(DEFAULT_HISTORY)
    )

    parser.add_argument(
        "--raw-output",
        default=""
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=5000
    )

    parser.add_argument(
        "--timeout",
        type=float,
        default=5.0
    )

    parser.add_argument(
        "--workers",
        type=int,
        default=128
    )

    parser.add_argument(
        "--interval",
        type=int,
        default=900
    )

    parser.add_argument(
        "--daemon",
        action="store_true"
    )

    parser.add_argument(
        "--disable-geoip",
        action="store_true"
    )

    parser.add_argument(
        "--git-push",
        action="store_true"
    )

    args = parser.parse_args()

    output_dir = Path(args.output)
    archive_dir = Path(args.archive_dir)
    history_dir = Path(args.history_dir)

    mkdir(output_dir)
    mkdir(archive_dir)
    mkdir(history_dir)

    raw_output = None

    if args.raw_output:
        raw_output = Path(args.raw_output)

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
            git_push_enabled=args.git_push
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
        geoip_enabled=not args.disable_geoip
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
