#!/usr/bin/env python3
from __future__ import annotations

import argparse
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
    "dnsseed.emzy.de"
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

DEFAULT_CITY_DB = DEFAULT_GEOIP_DIR / "dbip-city-lite.mmdb"
DEFAULT_ASN_DB = DEFAULT_GEOIP_DIR / "dbip-asn-lite.mmdb"
DEFAULT_COUNTRY_DB = DEFAULT_GEOIP_DIR / "dbip-country-lite.mmdb"


def mkdir(path: Path) -> None:
    path.mkdir(
        parents=True,
        exist_ok=True
    )


def resolve_seed(
    seed: str,
    timeout: float = 5.0
) -> list[str]:
    output: list[str] = []

    for record_type in ("A", "AAAA"):
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
            if item
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

    for _round in range(rounds):
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

        while len(row) < 20:
            row.append(None)

        row[19] = latency_ms

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
        record["county"] = row[14]
        record["zip"] = row[15]
        record["w3w"] = row[16]
        record["geohash"] = row[17]
        record["asn_location"] = row[18]
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


def crawl_once(
    state_dir: Path,
    snapshot_24h_dir: Path,
    output_dir: Path,
    archive_dir: Path,
    raw_output: Path | None,
    limit: int,
    batch_size: int,
    timeout: float,
    workers: int,
    getaddr_rounds: int,
    geoip_enabled: bool,
    city_db: Path,
    asn_db: Path,
    country_db: Path,
    export_mode: str,
    pretty: bool
) -> dict[str, Any]:
    mkdir(output_dir)
    mkdir(archive_dir)
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
        max(batch_size, workers * 4, 1000)
    )

    seed_addresses = discover_dns(
        limit=dns_limit,
        timeout=timeout
    )

    state.add_to_queue(seed_addresses)

    expand_getaddr(
        state=state,
        seed_addresses=seed_addresses,
        limit=limit,
        timeout=timeout,
        workers=workers,
        rounds=getaddr_rounds
    )

    candidates = state.all_candidate_addresses(
        seed_addresses=seed_addresses,
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
    state.meta["last_getaddr_rounds"] = getaddr_rounds
    state.meta["last_limit"] = limit
    state.meta["last_batch_size"] = batch_size
    state.meta["last_workers"] = workers
    state.meta["last_timeout"] = timeout
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
        f"successes={len(successes)} "
        f"failures={len(failures)}"
    )

    return payload


def daemon_loop(
    state_dir: Path,
    snapshot_24h_dir: Path,
    output_dir: Path,
    archive_dir: Path,
    raw_output: Path | None,
    limit: int,
    batch_size: int,
    timeout: float,
    workers: int,
    getaddr_rounds: int,
    interval: int,
    geoip_enabled: bool,
    city_db: Path,
    asn_db: Path,
    country_db: Path,
    export_mode: str,
    pretty: bool,
    git_push: bool
) -> None:
    while True:
        try:
            crawl_once(
                state_dir=state_dir,
                snapshot_24h_dir=snapshot_24h_dir,
                output_dir=output_dir,
                archive_dir=archive_dir,
                raw_output=raw_output,
                limit=limit,
                batch_size=batch_size,
                timeout=timeout,
                workers=workers,
                getaddr_rounds=getaddr_rounds,
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
        "--raw-output",
        default=""
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=100000
    )

    parser.add_argument(
        "--batch-size",
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
        default=512
    )

    parser.add_argument(
        "--getaddr-rounds",
        type=int,
        default=8
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

    if args.history_dir and not args.state_dir:
        state_dir = Path(args.history_dir)

    if args.daemon:
        daemon_loop(
            state_dir=state_dir,
            snapshot_24h_dir=Path(args.snapshot_24h_dir),
            output_dir=Path(args.output),
            archive_dir=Path(args.archive_dir),
            raw_output=raw_output,
            limit=args.limit,
            batch_size=args.batch_size,
            timeout=args.timeout,
            workers=args.workers,
            getaddr_rounds=args.getaddr_rounds,
            interval=args.interval,
            geoip_enabled=not args.disable_geoip,
            city_db=city_db,
            asn_db=asn_db,
            country_db=country_db,
            export_mode=args.export_mode,
            pretty=not args.compact,
            git_push=args.git_push
        )

        return 0

    crawl_once(
        state_dir=state_dir,
        snapshot_24h_dir=Path(args.snapshot_24h_dir),
        output_dir=Path(args.output),
        archive_dir=Path(args.archive_dir),
        raw_output=raw_output,
        limit=args.limit,
        batch_size=args.batch_size,
        timeout=args.timeout,
        workers=args.workers,
        getaddr_rounds=args.getaddr_rounds,
        geoip_enabled=not args.disable_geoip,
        city_db=city_db,
        asn_db=asn_db,
        country_db=country_db,
        export_mode=args.export_mode,
        pretty=not args.compact
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
