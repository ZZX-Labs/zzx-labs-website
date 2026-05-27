#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import socket
import subprocess
import time
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

from geoip import enrich_snapshot_payload

from state import (
    BitnodesState,
    DEFAULT_STATE_DIR,
    DEFAULT_SNAPSHOT_24H_DIR,
    normalize_address,
    utc_iso,
    utc_now
)


APP_ROOT = Path(__file__).resolve().parents[2]

DNS_SEEDS = [
    "seed.bitcoin.sipa.be",
    "dnsseed.bluematt.me",
    "seed.bitcoinstats.com",
    "seed.bitcoin.jonasschnelli.ch",
    "seed.btc.petertodd.net",
    "seed.bitcoin.sprovoost.nl",
    "dnsseed.emzy.de",
    "seed.bitcoin.wiz.biz",
    "seed.bitcoin.sipa.be",
    "seed.bitcoin.sprovoost.nl"
]

DEFAULT_OUTPUT = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_ARCHIVE = APP_ROOT / "bitcoin" / "bitnodes" / "archive"

DEFAULT_GEOIP_DIR = (
    APP_ROOT
    / "bitcoin"
    / "bitnodes"
    / "data"
    / "geoip"
)

DEFAULT_SEEDER_DIR = (
    APP_ROOT
    / "bitcoin"
    / "bitnodes"
    / "data"
    / "seeders"
)

DEFAULT_CITY_DB = DEFAULT_GEOIP_DIR / "dbip-city-lite.mmdb"
DEFAULT_ASN_DB = DEFAULT_GEOIP_DIR / "dbip-asn-lite.mmdb"
DEFAULT_COUNTRY_DB = DEFAULT_GEOIP_DIR / "dbip-country-lite.mmdb"


def mkdir(path: Path) -> None:
    path.mkdir(
        parents=True,
        exist_ok=True
    )


def read_json_any(path: Path) -> Any:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def extract_nodes_from_payload(payload: Any) -> list[str]:
    found: list[str] = []

    if isinstance(payload, dict):
        nodes = payload.get("nodes")

        if isinstance(nodes, dict):
            found.extend(str(address) for address in nodes.keys())

        for key in (
            "addresses",
            "peers",
            "queue",
            "known",
            "reachable",
            "unreachable"
        ):
            values = payload.get(key)

            if isinstance(values, list):
                found.extend(str(item) for item in values)

            if isinstance(values, dict):
                found.extend(str(item) for item in values.keys())

        for value in payload.values():
            if isinstance(value, dict):
                found.extend(extract_nodes_from_payload(value))
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, str) and (
                        ":" in item or ".onion" in item.lower()
                    ):
                        found.append(item)

    elif isinstance(payload, list):
        for item in payload:
            if isinstance(item, str):
                found.append(item)
            elif isinstance(item, dict):
                found.extend(extract_nodes_from_payload(item))

    normalized: list[str] = []

    for address in found:
        item = normalize_address(address)

        if item:
            normalized.append(item)

    return sorted(set(normalized))


def collect_seed_files(
    archive_dir: Path,
    seeder_dir: Path,
    state_dir: Path,
    output_dir: Path,
    max_files: int = 500
) -> list[Path]:
    files: list[Path] = []

    roots = [
        archive_dir,
        seeder_dir,
        state_dir,
        output_dir
    ]

    for root in roots:
        if not root.exists():
            continue

        files.extend(sorted(root.rglob("*.json")))
        files.extend(sorted(root.rglob("*.json.gz")))

    files = [
        path
        for path in files
        if path.is_file()
    ]

    files.sort(
        key=lambda path: path.stat().st_mtime,
        reverse=True
    )

    return files[:max_files]


def discover_from_existing_files(
    archive_dir: Path,
    seeder_dir: Path,
    state_dir: Path,
    output_dir: Path,
    limit: int,
    max_files: int
) -> list[str]:
    discovered: list[str] = []

    files = collect_seed_files(
        archive_dir=archive_dir,
        seeder_dir=seeder_dir,
        state_dir=state_dir,
        output_dir=output_dir,
        max_files=max_files
    )

    for path in files:
        try:
            payload = read_json_any(path)
        except Exception:
            continue

        discovered.extend(
            extract_nodes_from_payload(payload)
        )

        if len(discovered) >= limit:
            break

    return sorted(set(discovered))[:limit]


def resolve_seed(
    seed: str,
    timeout: float = 5.0
) -> list[str]:
    output: list[str] = []

    resolver = dns.resolver.Resolver()
    resolver.lifetime = timeout
    resolver.timeout = timeout

    for record_type in ("A", "AAAA"):
        try:
            answers = resolver.resolve(
                seed,
                record_type
            )

            output.extend(
                str(answer)
                for answer in answers
            )

        except Exception:
            pass

    return output


def discover_dns(
    limit: int,
    timeout: float = 5.0
) -> list[str]:
    discovered: list[str] = []

    for seed in DNS_SEEDS:
        discovered.extend(
            resolve_seed(
                seed,
                timeout=timeout
            )
        )

    unique = sorted(set(discovered))

    return [
        normalize_address(host)
        for host in unique[:limit]
        if normalize_address(host)
    ]


def getaddr_from_node(
    address: str,
    timeout: float
) -> list[str]:
    try:
        return [
            normalize_address(item)
            for item in getaddr(
                address,
                timeout=timeout
            )
            if item and normalize_address(item)
        ]

    except Exception:
        return []


def expand_getaddr(
    state: BitnodesState,
    seed_addresses: list[str],
    limit: int,
    timeout: float,
    workers: int,
    rounds: int
) -> list[str]:
    state.add_to_queue(seed_addresses)

    discovered_total: list[str] = []

    for round_index in range(rounds):
        if len(state.nodes) + len(state.queue) >= limit:
            break

        batch = state.pop_batch(
            max(1, workers)
        )

        if not batch:
            break

        discovered_round: list[str] = []

        with ThreadPoolExecutor(
            max_workers=workers
        ) as executor:
            futures = [
                executor.submit(
                    getaddr_from_node,
                    address,
                    timeout
                )
                for address in batch
            ]

            for future in as_completed(futures):
                try:
                    found = future.result()
                except Exception:
                    found = []

                for address in found:
                    normalized = normalize_address(address)

                    if not normalized:
                        continue

                    discovered_round.append(normalized)

                    if len(discovered_total) >= limit:
                        break

                if len(discovered_total) >= limit:
                    break

        state.add_to_queue(discovered_round)
        discovered_total.extend(discovered_round)

        unique_round = len(set(discovered_round))

        print(
            f"[getaddr] round={round_index + 1} "
            f"batch={len(batch)} "
            f"discovered={unique_round} "
            f"queue={len(state.queue)} "
            f"known={len(state.nodes)}"
        )

        if not discovered_round:
            break

    return sorted(set(discovered_total))


def crawl_address(
    address: str,
    timeout: float
) -> tuple[str, list[Any]] | None:
    try:
        start = time.perf_counter()

        info = handshake(
            address,
            timeout=timeout
        )

        latency_ms = round(
            (time.perf_counter() - start) * 1000.0,
            2
        )

        if not info.connected:
            return None

        row = version_info_to_bitnodes_array(info)

        while len(row) < 28:
            row.append(None)

        row[25] = latency_ms

        return (
            normalize_address(info.address),
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


def crawl_batch(
    addresses: list[str],
    timeout: float,
    workers: int
) -> tuple[dict[str, list[Any]], list[str]]:
    successes: dict[str, list[Any]] = {}
    failures: list[str] = []

    with ThreadPoolExecutor(
        max_workers=workers
    ) as executor:
        future_map = {
            executor.submit(
                crawl_address,
                address,
                timeout
            ): address
            for address in addresses
        }

        for future in as_completed(future_map):
            requested_address = future_map[future]

            try:
                result = future.result()
            except Exception:
                result = None

            if not result:
                failures.append(
                    normalize_address(requested_address)
                )

                continue

            address, row = result

            if address:
                successes[address] = row

    return successes, failures


def build_changes(
    state_before: dict[str, dict[str, Any]],
    state_after: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    before = set(state_before)
    after = set(state_after)

    added = sorted(after - before)
    removed = sorted(before - after)
    retained = sorted(before & after)

    became_reachable = []
    became_unreachable = []
    height_changes = {}
    agent_changes = {}
    services_changes = {}
    port_changes = {}

    for address in retained:
        old = state_before[address]
        new = state_after[address]

        if not old.get("reachable") and new.get("reachable"):
            became_reachable.append(address)

        if old.get("reachable") and not new.get("reachable"):
            became_unreachable.append(address)

        if old.get("height") != new.get("height"):
            height_changes[address] = {
                "previous": old.get("height"),
                "current": new.get("height")
            }

        if old.get("agent") != new.get("agent"):
            agent_changes[address] = {
                "previous": old.get("agent"),
                "current": new.get("agent")
            }

        if old.get("services") != new.get("services"):
            services_changes[address] = {
                "previous": old.get("services"),
                "current": new.get("services")
            }

        if old.get("port") != new.get("port"):
            port_changes[address] = {
                "previous": old.get("port"),
                "current": new.get("port")
            }

    return {
        "added_count": len(added),
        "removed_count": len(removed),
        "retained_count": len(retained),
        "became_reachable_count": len(became_reachable),
        "became_unreachable_count": len(became_unreachable),
        "height_changes_count": len(height_changes),
        "agent_changes_count": len(agent_changes),
        "services_changes_count": len(services_changes),
        "port_changes_count": len(port_changes),
        "added": added[:5000],
        "removed": removed[:5000],
        "became_reachable": became_reachable[:5000],
        "became_unreachable": became_unreachable[:5000],
        "height_changes": height_changes,
        "agent_changes": agent_changes,
        "services_changes": services_changes,
        "port_changes": port_changes
    }


def geoip_available(
    geoip_enabled: bool,
    city_db: Path,
    asn_db: Path,
    country_db: Path
) -> bool:
    if not geoip_enabled:
        return False

    if city_db.exists() and asn_db.exists():
        return True

    if country_db.exists() and asn_db.exists():
        return True

    missing = []

    if not city_db.exists():
        missing.append(str(city_db))

    if not asn_db.exists():
        missing.append(str(asn_db))

    if not country_db.exists():
        missing.append(str(country_db))

    print(
        "[geoip] GeoIP enabled, but local DB-IP mmdb files are incomplete. "
        "Crawler will continue without full GeoIP enrichment. Missing: "
        + ", ".join(missing)
    )

    return False


def enrich_state_records(
    state: BitnodesState,
    geoip_enabled: bool,
    city_db: Path,
    asn_db: Path,
    country_db: Path
) -> None:
    if not geoip_available(
        geoip_enabled=geoip_enabled,
        city_db=city_db,
        asn_db=asn_db,
        country_db=country_db
    ):
        return

    payload = {
        "nodes": state.to_bitnodes_nodes("all")
    }

    payload = enrich_snapshot_payload(
        payload,
        city_db=city_db,
        asn_db=asn_db,
        enabled=True
    )

    enriched_nodes = payload.get("nodes", {})
    now = utc_now()

    for address, values in enriched_nodes.items():
        record = state.nodes.get(address)

        if not record:
            continue

        row = list(values)

        while len(row) < 20:
            row.append(None)

        record["city"] = row[6]
        record["country"] = row[7]
        record["latitude"] = row[8]
        record["longitude"] = row[9]
        record["timezone"] = row[10]
        record["asn"] = row[11]
        record["organization"] = row[12]
        record["provider"] = row[13]
        record["county"] = row[14] if len(row) > 14 else None
        record["zip"] = row[15] if len(row) > 15 else None
        record["w3w"] = row[16] if len(row) > 16 else None
        record["geohash"] = row[17] if len(row) > 17 else None
        record["asn_location"] = row[18] if len(row) > 18 else None
        record["last_geoip_update"] = now


def export_state(
    state: BitnodesState,
    output_dir: Path,
    archive_dir: Path,
    mode: str,
    changes: dict[str, Any],
    pretty: bool = True
) -> dict[str, Any]:
    payload = state.build_export_payload(
        mode=mode
    )

    payload["changes"] = changes

    temp = output_dir / "_state_latest_raw.json"

    write_json(
        temp,
        payload,
        pretty=pretty
    )

    export_all(
        input_path=temp,
        output_dir=output_dir,
        source=payload["source"],
        pretty=pretty,
        archive_dir=archive_dir,
        gzip_archive=True
    )

    try:
        temp.unlink()
    except FileNotFoundError:
        pass

    return payload


def git_commit_and_push(
    repo_root: Path,
    message: str,
    branch: str = "main"
) -> None:
    commands = [
        [
            "git",
            "add",
            "bitcoin/bitnodes/api",
            "bitcoin/bitnodes/archive",
            "bitcoin/bitnodes/data"
        ],
        [
            "git",
            "commit",
            "-m",
            message
        ],
        [
            "git",
            "pull",
            "--rebase",
            "origin",
            branch
        ],
        [
            "git",
            "push",
            "origin",
            branch
        ]
    ]

    for command in commands:
        result = subprocess.run(
            command,
            cwd=repo_root,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False
        )

        if result.stdout.strip():
            print(result.stdout.strip())

        if result.stderr.strip():
            print(result.stderr.strip())


def seed_state_before_crawl(
    state: BitnodesState,
    seed_addresses: list[str],
    archive_dir: Path,
    seeder_dir: Path,
    output_dir: Path,
    state_dir: Path,
    limit: int,
    replay_archives: bool,
    archive_replay_files: int
) -> list[str]:
    seeds = list(seed_addresses)

    if replay_archives:
        replay_limit = max(
            limit,
            len(seed_addresses)
        )

        replayed = discover_from_existing_files(
            archive_dir=archive_dir,
            seeder_dir=seeder_dir,
            state_dir=state_dir,
            output_dir=output_dir,
            limit=replay_limit,
            max_files=archive_replay_files
        )

        seeds.extend(replayed)

    for address in state.nodes.keys():
        seeds.append(address)

    seeds = sorted(set(
        normalize_address(address)
        for address in seeds
        if normalize_address(address)
    ))

    state.add_to_queue(seeds)

    return seeds[:limit]


def crawl_once(
    state_dir: Path,
    snapshot_24h_dir: Path,
    output_dir: Path,
    archive_dir: Path,
    seeder_dir: Path,
    raw_output: Path | None,
    limit: int,
    batch_size: int,
    timeout: float,
    workers: int,
    getaddr_rounds: int,
    dns_seed_limit: int,
    replay_archives: bool,
    archive_replay_files: int,
    geoip_enabled: bool,
    city_db: Path,
    asn_db: Path,
    country_db: Path,
    export_mode: str,
    pretty: bool
) -> dict[str, Any]:
    mkdir(output_dir)
    mkdir(archive_dir)
    mkdir(seeder_dir)
    mkdir(state_dir)
    mkdir(snapshot_24h_dir)
    mkdir(city_db.parent)

    state = BitnodesState(
        state_dir=state_dir,
        snapshot_24h_dir=snapshot_24h_dir
    )

    before = json.loads(
        json.dumps(state.nodes)
    )

    now = utc_now()

    dns_limit = min(
        limit,
        max(dns_seed_limit, batch_size, workers * 4, 1000)
    )

    seed_addresses = discover_dns(
        limit=dns_limit,
        timeout=timeout
    )

    expanded_seed_addresses = seed_state_before_crawl(
        state=state,
        seed_addresses=seed_addresses,
        archive_dir=archive_dir,
        seeder_dir=seeder_dir,
        output_dir=output_dir,
        state_dir=state_dir,
        limit=limit,
        replay_archives=replay_archives,
        archive_replay_files=archive_replay_files
    )

    discovered = expand_getaddr(
        state=state,
        seed_addresses=expanded_seed_addresses,
        limit=limit,
        timeout=timeout,
        workers=workers,
        rounds=getaddr_rounds
    )

    candidates = state.all_candidate_addresses(
        seed_addresses=expanded_seed_addresses + discovered,
        limit=limit
    )

    if batch_size > 0:
        candidates = candidates[:batch_size]

    successes, failures = crawl_batch(
        addresses=candidates,
        timeout=timeout,
        workers=workers
    )

    state.update_successes(
        successes,
        now=now
    )

    state.update_failures(
        failures,
        now=now
    )

    enrich_state_records(
        state,
        geoip_enabled=geoip_enabled,
        city_db=city_db,
        asn_db=asn_db,
        country_db=country_db
    )

    state.meta["last_crawl"] = now
    state.meta["last_crawl_iso"] = utc_iso(now)
    state.meta["last_candidate_count"] = len(candidates)
    state.meta["last_success_count"] = len(successes)
    state.meta["last_failure_count"] = len(failures)
    state.meta["last_dns_seed_count"] = len(seed_addresses)
    state.meta["last_expanded_seed_count"] = len(expanded_seed_addresses)
    state.meta["last_discovered_count"] = len(discovered)
    state.meta["last_getaddr_rounds"] = getaddr_rounds
    state.meta["last_limit"] = limit
    state.meta["last_batch_size"] = batch_size
    state.meta["last_workers"] = workers
    state.meta["last_timeout"] = timeout
    state.meta["archive_replay_enabled"] = replay_archives
    state.meta["archive_replay_files"] = archive_replay_files
    state.meta["geoip_enabled"] = geoip_enabled
    state.meta["geoip_city_db"] = str(city_db)
    state.meta["geoip_asn_db"] = str(asn_db)
    state.meta["geoip_country_db"] = str(country_db)

    state.write_24h_snapshot()
    state.save()

    changes = build_changes(
        state_before=before,
        state_after=state.nodes
    )

    payload = export_state(
        state=state,
        output_dir=output_dir,
        archive_dir=archive_dir,
        mode=export_mode,
        changes=changes,
        pretty=pretty
    )

    if raw_output:
        write_json(
            raw_output,
            payload,
            pretty=pretty
        )

    summary = state.state_summary()

    print(
        f"[{utc_iso()}] "
        f"known={summary['total_known_nodes']} "
        f"reachable_now={summary['reachable_now']} "
        f"unreachable_now={summary['unreachable_now']} "
        f"reachable_24h={summary['reachable_24h']} "
        f"stale={summary['stale_nodes']} "
        f"queue={summary['queue_size']} "
        f"dns={len(seed_addresses)} "
        f"seeds={len(expanded_seed_addresses)} "
        f"discovered={len(discovered)} "
        f"candidates={len(candidates)} "
        f"successes={len(successes)} "
        f"failures={len(failures)}"
    )

    return payload


def daemon_loop(
    state_dir: Path,
    snapshot_24h_dir: Path,
    output_dir: Path,
    archive_dir: Path,
    seeder_dir: Path,
    raw_output: Path | None,
    limit: int,
    batch_size: int,
    timeout: float,
    workers: int,
    getaddr_rounds: int,
    dns_seed_limit: int,
    replay_archives: bool,
    archive_replay_files: int,
    interval: int,
    run_seconds: int,
    geoip_enabled: bool,
    city_db: Path,
    asn_db: Path,
    country_db: Path,
    export_mode: str,
    pretty: bool,
    git_push: bool
) -> None:
    started = time.time()

    while True:
        if run_seconds > 0 and time.time() - started >= run_seconds:
            print(
                f"[daemon] run_seconds reached: {run_seconds}"
            )

            return

        try:
            crawl_once(
                state_dir=state_dir,
                snapshot_24h_dir=snapshot_24h_dir,
                output_dir=output_dir,
                archive_dir=archive_dir,
                seeder_dir=seeder_dir,
                raw_output=raw_output,
                limit=limit,
                batch_size=batch_size,
                timeout=timeout,
                workers=workers,
                getaddr_rounds=getaddr_rounds,
                dns_seed_limit=dns_seed_limit,
                replay_archives=replay_archives,
                archive_replay_files=archive_replay_files,
                geoip_enabled=geoip_enabled,
                city_db=city_db,
                asn_db=asn_db,
                country_db=country_db,
                export_mode=export_mode,
                pretty=pretty
            )

            if git_push:
                git_commit_and_push(
                    repo_root=APP_ROOT,
                    message="Update Bitnodes global node snapshots"
                )

        except KeyboardInterrupt:
            raise

        except Exception as exc:
            print(exc)

        if run_seconds > 0 and time.time() - started >= run_seconds:
            return

        time.sleep(interval)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="ZZX-Labs persistent Bitnodes global crawler."
    )

    parser.add_argument(
        "--state-dir",
        default=str(DEFAULT_STATE_DIR)
    )

    parser.add_argument(
        "--snapshot-24h-dir",
        default=str(DEFAULT_SNAPSHOT_24H_DIR)
    )

    parser.add_argument(
        "--history-dir",
        default="",
        help=(
            "Compatibility alias for old workflows. "
            "This crawler uses --state-dir and --snapshot-24h-dir."
        )
    )

    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT)
    )

    parser.add_argument(
        "--archive-dir",
        default=str(DEFAULT_ARCHIVE)
    )

    parser.add_argument(
        "--seeder-dir",
        default=str(DEFAULT_SEEDER_DIR)
    )

    parser.add_argument(
        "--raw-output",
        default=""
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=5000000
    )

    parser.add_argument(
        "--batch-size",
        type=int,
        default=20000
    )

    parser.add_argument(
        "--timeout",
        type=float,
        default=8.0
    )

    parser.add_argument(
        "--workers",
        type=int,
        default=2048
    )

    parser.add_argument(
        "--getaddr-rounds",
        type=int,
        default=128
    )

    parser.add_argument(
        "--dns-seed-limit",
        type=int,
        default=10000
    )

    parser.add_argument(
        "--disable-archive-replay",
        action="store_true"
    )

    parser.add_argument(
        "--archive-replay-files",
        type=int,
        default=500
    )

    parser.add_argument(
        "--interval",
        type=int,
        default=30
    )

    parser.add_argument(
        "--run-seconds",
        type=int,
        default=0
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
        "--geoip-dir",
        default=str(DEFAULT_GEOIP_DIR)
    )

    parser.add_argument(
        "--city-db",
        default=""
    )

    parser.add_argument(
        "--asn-db",
        default=""
    )

    parser.add_argument(
        "--country-db",
        default=""
    )

    parser.add_argument(
        "--export-mode",
        choices=[
            "all",
            "reachable",
            "unreachable",
            "reachable_24h",
            "stale"
        ],
        default="reachable_24h"
    )

    parser.add_argument(
        "--compact",
        action="store_true"
    )

    parser.add_argument(
        "--git-push",
        action="store_true"
    )

    args = parser.parse_args()

    geoip_dir = Path(args.geoip_dir)

    city_db = (
        Path(args.city_db)
        if args.city_db
        else geoip_dir / "dbip-city-lite.mmdb"
    )

    asn_db = (
        Path(args.asn_db)
        if args.asn_db
        else geoip_dir / "dbip-asn-lite.mmdb"
    )

    country_db = (
        Path(args.country_db)
        if args.country_db
        else geoip_dir / "dbip-country-lite.mmdb"
    )

    raw_output = (
        Path(args.raw_output)
        if args.raw_output
        else None
    )

    state_dir = Path(args.state_dir)

    if args.history_dir and args.state_dir == str(DEFAULT_STATE_DIR):
        state_dir = Path(args.history_dir)

    common = {
        "state_dir": state_dir,
        "snapshot_24h_dir": Path(args.snapshot_24h_dir),
        "output_dir": Path(args.output),
        "archive_dir": Path(args.archive_dir),
        "seeder_dir": Path(args.seeder_dir),
        "raw_output": raw_output,
        "limit": args.limit,
        "batch_size": args.batch_size,
        "timeout": args.timeout,
        "workers": args.workers,
        "getaddr_rounds": args.getaddr_rounds,
        "dns_seed_limit": args.dns_seed_limit,
        "replay_archives": not args.disable_archive_replay,
        "archive_replay_files": args.archive_replay_files,
        "geoip_enabled": not args.disable_geoip,
        "city_db": city_db,
        "asn_db": asn_db,
        "country_db": country_db,
        "export_mode": args.export_mode,
        "pretty": not args.compact
    }

    if args.daemon:
        daemon_loop(
            **common,
            interval=args.interval,
            run_seconds=args.run_seconds,
            git_push=args.git_push
        )

        return 0

    crawl_once(**common)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
