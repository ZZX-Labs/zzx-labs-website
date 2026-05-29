#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import socket
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

try:
    import dns.resolver
except Exception:
    dns = None  # type: ignore

APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from bitcoin_p2p import getaddr, handshake, version_info_to_bitnodes_array
from export_json import export_all, write_json
from geoip import enrich_snapshot_payload
from state import BitnodesState, normalize_address, utc_iso, utc_now

ENRICH = TOOLS_DIR / "enrich.py"
AGGREGATE = TOOLS_DIR / "aggregate.py"
CHUNK_REGISTRY_BACKUP = TOOLS_DIR / "chunk_registry_backup.py"
UPDATE_DAILY_INDEX = TOOLS_DIR / "update_daily_index.py"
PUSH_SNAPSHOTS = TOOLS_DIR / "push_snapshots.py"

BITNODES_ROOT = APP_ROOT / "bitcoin" / "bitnodes"

DNS_SEEDS = [
    "seed.bitcoin.sipa.be",
    "dnsseed.bluematt.me",
    "seed.bitcoinstats.com",
    "seed.bitcoin.jonasschnelli.ch",
    "seed.btc.petertodd.net",
    "seed.bitcoin.sprovoost.nl",
    "dnsseed.emzy.de",
    "seed.bitcoin.wiz.biz",
]

DEFAULT_OUTPUT = BITNODES_ROOT / "api" / "zzxbitnodes"
DEFAULT_ARCHIVE = BITNODES_ROOT / "archive" / "zzxbitnodes"
DEFAULT_LEGACY_API = BITNODES_ROOT / "api"

DEFAULT_GEOIP_DIR = BITNODES_ROOT / "data" / "geoip"
DEFAULT_SEEDER_DIR = BITNODES_ROOT / "data" / "seeders" / "zzxbitnodes"
DEFAULT_STATE_DIR = BITNODES_ROOT / "data" / "state" / "zzxbitnodes"
DEFAULT_SNAPSHOT_24H_DIR = BITNODES_ROOT / "data" / "snapshots" / "24h" / "zzxbitnodes"

DEFAULT_ENRICHED_DIR = BITNODES_ROOT / "api" / "enriched" / "zzxbitnodes"
DEFAULT_ENRICHED_LATEST = DEFAULT_ENRICHED_DIR / "latest.json"
DEFAULT_ENRICHMENT_REPORT = DEFAULT_ENRICHED_DIR / "enrichment-report.json"

DEFAULT_AGGREGATE_DIR = BITNODES_ROOT / "api" / "aggregate" / "zzxbitnodes"
DEFAULT_AGGREGATE_LATEST = DEFAULT_AGGREGATE_DIR / "latest.json"

DEFAULT_REGISTRY_DIR = BITNODES_ROOT / "registry"
DEFAULT_REGISTRY_LATEST_DIR = BITNODES_ROOT / "registry" / "latest"

DEFAULT_CITY_DB = DEFAULT_GEOIP_DIR / "dbip-city-lite.mmdb"
DEFAULT_ASN_DB = DEFAULT_GEOIP_DIR / "dbip-asn-lite.mmdb"
DEFAULT_COUNTRY_DB = DEFAULT_GEOIP_DIR / "dbip-country-lite.mmdb"


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def read_json_any(path: Path) -> Any:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def py(script: Path, *args: str) -> list[str]:
    return [sys.executable, str(script), *args]


def run_command(command: list[str], *, cwd: Path = APP_ROOT, check: bool = False) -> subprocess.CompletedProcess[str]:
    print("$ " + " ".join(str(part) for part in command))

    result = subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    if result.stdout.strip():
        print(result.stdout.strip())

    if result.stderr.strip():
        print(result.stderr.strip())

    if check and result.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(command)}")

    return result


def extract_nodes_from_payload(payload: Any) -> list[str]:
    found: list[str] = []

    if isinstance(payload, dict):
        nodes = payload.get("nodes")

        if isinstance(nodes, dict):
            found.extend(str(address) for address in nodes.keys())

        for key in ("addresses", "peers", "queue", "known", "reachable", "unreachable", "results", "rows"):
            values = payload.get(key)

            if isinstance(values, list):
                for item in values:
                    if isinstance(item, str):
                        found.append(item)
                    elif isinstance(item, dict):
                        address = item.get("address") or item.get("node") or item.get("addr") or item.get("host")
                        if address:
                            found.append(str(address))

            elif isinstance(values, dict):
                found.extend(str(item) for item in values.keys())

        for value in payload.values():
            if isinstance(value, dict):
                found.extend(extract_nodes_from_payload(value))
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, str) and (":" in item or ".onion" in item.lower() or ".i2p" in item.lower()):
                        found.append(item)
                    elif isinstance(item, dict):
                        found.extend(extract_nodes_from_payload(item))

    elif isinstance(payload, list):
        for item in payload:
            if isinstance(item, str):
                found.append(item)
            elif isinstance(item, dict):
                found.extend(extract_nodes_from_payload(item))

    normalized = []

    for address in found:
        item = normalize_address(str(address))
        if item:
            normalized.append(item)

    return sorted(set(normalized))


def collect_seed_files(
    archive_dir: Path,
    seeder_dir: Path,
    state_dir: Path,
    output_dir: Path,
    max_files: int = 500,
) -> list[Path]:
    files: list[Path] = []

    for root in (archive_dir, seeder_dir, state_dir, output_dir):
        if not root.exists():
            continue

        files.extend(sorted(root.rglob("*.json")))
        files.extend(sorted(root.rglob("*.json.gz")))

    files = [path for path in files if path.is_file()]
    files.sort(key=lambda path: path.stat().st_mtime, reverse=True)

    return files[:max_files]


def discover_from_existing_files(
    archive_dir: Path,
    seeder_dir: Path,
    state_dir: Path,
    output_dir: Path,
    limit: int,
    max_files: int,
) -> list[str]:
    discovered: list[str] = []

    files = collect_seed_files(
        archive_dir=archive_dir,
        seeder_dir=seeder_dir,
        state_dir=state_dir,
        output_dir=output_dir,
        max_files=max_files,
    )

    for path in files:
        try:
            payload = read_json_any(path)
        except Exception:
            continue

        discovered.extend(extract_nodes_from_payload(payload))

        if len(discovered) >= limit:
            break

    return sorted(set(discovered))[:limit]


def resolve_seed(seed: str, timeout: float = 5.0) -> list[str]:
    output: list[str] = []

    if dns is None:
        try:
            for info in socket.getaddrinfo(seed, 8333):
                host = info[4][0]
                output.append(host)
        except Exception:
            pass

        return sorted(set(output))

    resolver = dns.resolver.Resolver()
    resolver.lifetime = timeout
    resolver.timeout = timeout

    for record_type in ("A", "AAAA"):
        try:
            answers = resolver.resolve(seed, record_type)
            output.extend(str(answer) for answer in answers)
        except Exception:
            pass

    return sorted(set(output))


def discover_dns(limit: int, timeout: float = 5.0) -> list[str]:
    discovered: list[str] = []

    for seed in DNS_SEEDS:
        discovered.extend(resolve_seed(seed, timeout=timeout))

    unique = sorted(set(discovered))

    return [
        normalized
        for host in unique[:limit]
        for normalized in [normalize_address(host)]
        if normalized
    ]


def getaddr_from_node(address: str, timeout: float) -> list[str]:
    try:
        return [
            normalized
            for item in getaddr(address, timeout=timeout)
            for normalized in [normalize_address(item)]
            if normalized
        ]
    except Exception:
        return []


def expand_getaddr(
    state: BitnodesState,
    seed_addresses: list[str],
    limit: int,
    timeout: float,
    workers: int,
    rounds: int,
) -> list[str]:
    state.add_to_queue(seed_addresses)

    discovered_total: list[str] = []

    for round_index in range(rounds):
        if len(state.nodes) + len(state.queue) >= limit:
            break

        batch = state.pop_batch(max(1, workers))

        if not batch:
            break

        discovered_round: list[str] = []

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [
                executor.submit(getaddr_from_node, address, timeout)
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

                    if len(discovered_total) + len(discovered_round) >= limit:
                        break

                if len(discovered_total) + len(discovered_round) >= limit:
                    break

        state.add_to_queue(discovered_round)
        discovered_total.extend(discovered_round)

        print(
            f"[getaddr] round={round_index + 1} "
            f"batch={len(batch)} "
            f"discovered={len(set(discovered_round))} "
            f"queue={len(state.queue)} "
            f"known={len(state.nodes)}"
        )

        if not discovered_round:
            break

    return sorted(set(discovered_total))[:limit]


def crawl_address(address: str, timeout: float) -> tuple[str, list[Any]] | None:
    try:
        start = time.perf_counter()
        info = handshake(address, timeout=timeout)
        latency_ms = round((time.perf_counter() - start) * 1000.0, 2)

        if not info.connected:
            return None

        row = version_info_to_bitnodes_array(info)

        while len(row) < 20:
            row.append(None)

        metadata = row[19] if isinstance(row[19], dict) else {}
        metadata["latency_ms"] = latency_ms
        metadata["reachable"] = True
        metadata["network"] = info.network
        metadata["is_tor"] = info.network == "tor"
        metadata["is_i2p"] = info.network == "i2p"
        metadata["is_ipv4"] = info.network == "ipv4"
        metadata["is_ipv6"] = info.network == "ipv6"

        row[19] = metadata

        return normalize_address(info.address), row

    except (socket.timeout, TimeoutError, OSError, ValueError):
        return None
    except Exception:
        return None


def crawl_batch(addresses: list[str], timeout: float, workers: int) -> tuple[dict[str, list[Any]], list[str]]:
    successes: dict[str, list[Any]] = {}
    failures: list[str] = []

    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_map = {
            executor.submit(crawl_address, address, timeout): address
            for address in addresses
        }

        for future in as_completed(future_map):
            requested_address = future_map[future]

            try:
                result = future.result()
            except Exception:
                result = None

            if not result:
                normalized_failure = normalize_address(requested_address)
                if normalized_failure:
                    failures.append(normalized_failure)
                continue

            address, row = result

            if address:
                successes[address] = row

    return successes, failures


def build_changes(
    state_before: dict[str, dict[str, Any]],
    state_after: dict[str, dict[str, Any]],
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
            height_changes[address] = {"previous": old.get("height"), "current": new.get("height")}

        if old.get("agent") != new.get("agent"):
            agent_changes[address] = {"previous": old.get("agent"), "current": new.get("agent")}

        if old.get("services") != new.get("services"):
            services_changes[address] = {"previous": old.get("services"), "current": new.get("services")}

        if old.get("port") != new.get("port"):
            port_changes[address] = {"previous": old.get("port"), "current": new.get("port")}

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
        "port_changes": port_changes,
    }


def geoip_available(geoip_enabled: bool, city_db: Path, asn_db: Path, country_db: Path) -> bool:
    if not geoip_enabled:
        return False

    if city_db.exists() and asn_db.exists():
        return True

    if country_db.exists() and asn_db.exists():
        return True

    missing = [
        str(path)
        for path in (city_db, asn_db, country_db)
        if not path.exists()
    ]

    print(
        "[geoip] GeoIP enabled, but local mmdb files are incomplete. "
        "Crawler continues without inline GeoIP. Missing: "
        + ", ".join(missing)
    )

    return False


def enrich_state_records(
    state: BitnodesState,
    geoip_enabled: bool,
    city_db: Path,
    asn_db: Path,
    country_db: Path,
) -> None:
    if not geoip_available(geoip_enabled, city_db, asn_db, country_db):
        return

    payload = {"nodes": state.to_bitnodes_nodes("all")}

    payload = enrich_snapshot_payload(
        payload,
        city_db=city_db,
        asn_db=asn_db,
        country_db=country_db,
        enabled=True,
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
    pretty: bool = True,
) -> dict[str, Any]:
    payload = state.build_export_payload(mode=mode)
    payload["source"] = "zzxbitnodes"
    payload["crawler"] = "zzxbitnodes"
    payload["changes"] = changes

    temp = output_dir / "_state_latest_raw.json"

    write_json(temp, payload, pretty=pretty)

    export_all(
        input_path=temp,
        output_dir=output_dir,
        source=payload["source"],
        pretty=pretty,
        archive_dir=archive_dir,
        gzip_archive=True,
    )

    try:
        temp.unlink()
    except FileNotFoundError:
        pass

    return payload


def mirror_latest_to_legacy_api(source_dir: Path, legacy_dir: Path, pretty: bool = True) -> None:
    latest = source_dir / "latest.json"

    if not latest.exists():
        return

    try:
        payload = read_json_any(latest)
    except Exception:
        return

    payload["source"] = "zzxbitnodes"
    payload["crawler"] = "zzxbitnodes"

    mkdir(legacy_dir)

    write_json(legacy_dir / "latest.json", payload, pretty=pretty)


def run_enrichment(
    *,
    input_path: Path,
    output_path: Path,
    report_path: Path,
    source: str,
    api_dir: Path,
    state_dir: Path,
    compact: bool,
) -> int:
    command = py(
        ENRICH,
        "--input",
        str(input_path),
        "--output",
        str(output_path),
        "--report",
        str(report_path),
        "--source",
        source,
        "--api-dir",
        str(api_dir.parent),
        "--state-dir",
        str(state_dir),
    )

    if compact:
        pass

    return run_command(command).returncode


def run_aggregate(*, input_path: Path, output_path: Path, api_dir: Path, state_dir: Path, source: str) -> int:
    command = py(
        AGGREGATE,
        "--input",
        str(input_path),
        "--output",
        str(output_path),
        "--api-dir",
        str(api_dir.parent),
        "--state-dir",
        str(state_dir),
        "--source",
        source,
    )

    return run_command(command).returncode


def run_registry_backup(
    *,
    input_dir: Path,
    api_dir: Path,
    output_dir: Path,
    latest_dir: Path,
    enabled: bool,
) -> int:
    if not enabled:
        return 0

    dated = output_dir / datetime_date_slug()

    command = py(
        CHUNK_REGISTRY_BACKUP,
        "--input",
        str(input_dir),
        "--api",
        str(api_dir.parent),
        "--output",
        str(dated),
        "--latest-output",
        str(latest_dir),
    )

    return run_command(command).returncode


def run_registry_index(*, registry_root: Path, enabled: bool) -> int:
    if not enabled:
        return 0

    command = py(
        UPDATE_DAILY_INDEX,
        "--repo-root",
        str(registry_root),
    )

    return run_command(command).returncode


def datetime_date_slug() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def push_snapshots(enabled: bool, message: str) -> int:
    if not enabled:
        return 0

    command = py(
        PUSH_SNAPSHOTS,
        "--message",
        message,
    )

    return run_command(command).returncode


def seed_state_before_crawl(
    state: BitnodesState,
    seed_addresses: list[str],
    archive_dir: Path,
    seeder_dir: Path,
    output_dir: Path,
    state_dir: Path,
    limit: int,
    replay_archives: bool,
    archive_replay_files: int,
) -> list[str]:
    seeds = list(seed_addresses)

    if replay_archives:
        replayed = discover_from_existing_files(
            archive_dir=archive_dir,
            seeder_dir=seeder_dir,
            state_dir=state_dir,
            output_dir=output_dir,
            limit=max(limit, len(seed_addresses)),
            max_files=archive_replay_files,
        )

        seeds.extend(replayed)

    seeds.extend(state.nodes.keys())

    seeds = sorted(set(
        normalized
        for address in seeds
        for normalized in [normalize_address(address)]
        if normalized
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
    pretty: bool,
    mirror_legacy: bool,
    run_enrich_after: bool,
    run_aggregate_after: bool,
    registry_backup: bool,
    registry_root: Path,
    registry_latest_dir: Path,
    git_push: bool,
) -> dict[str, Any]:
    for path in (output_dir, archive_dir, seeder_dir, state_dir, snapshot_24h_dir, city_db.parent):
        mkdir(path)

    state = BitnodesState(state_dir=state_dir, snapshot_24h_dir=snapshot_24h_dir)
    before = json.loads(json.dumps(state.nodes))

    now = utc_now()

    dns_limit = min(limit, max(dns_seed_limit, batch_size, workers * 4, 1000))
    seed_addresses = discover_dns(limit=dns_limit, timeout=timeout)

    expanded_seed_addresses = seed_state_before_crawl(
        state=state,
        seed_addresses=seed_addresses,
        archive_dir=archive_dir,
        seeder_dir=seeder_dir,
        output_dir=output_dir,
        state_dir=state_dir,
        limit=limit,
        replay_archives=replay_archives,
        archive_replay_files=archive_replay_files,
    )

    discovered = expand_getaddr(
        state=state,
        seed_addresses=expanded_seed_addresses,
        limit=limit,
        timeout=timeout,
        workers=workers,
        rounds=getaddr_rounds,
    )

    candidates = state.all_candidate_addresses(
        seed_addresses=expanded_seed_addresses + discovered,
        limit=limit,
    )

    if batch_size > 0:
        candidates = candidates[:batch_size]

    successes, failures = crawl_batch(
        addresses=candidates,
        timeout=timeout,
        workers=workers,
    )

    state.update_successes(successes, now=now)
    state.update_failures(failures, now=now)

    enrich_state_records(
        state,
        geoip_enabled=geoip_enabled,
        city_db=city_db,
        asn_db=asn_db,
        country_db=country_db,
    )

    state.meta.update({
        "crawler": "zzxbitnodes",
        "source": "zzxbitnodes",
        "last_crawl": now,
        "last_crawl_iso": utc_iso(now),
        "last_candidate_count": len(candidates),
        "last_success_count": len(successes),
        "last_failure_count": len(failures),
        "last_dns_seed_count": len(seed_addresses),
        "last_expanded_seed_count": len(expanded_seed_addresses),
        "last_discovered_count": len(discovered),
        "last_getaddr_rounds": getaddr_rounds,
        "last_limit": limit,
        "last_batch_size": batch_size,
        "last_workers": workers,
        "last_timeout": timeout,
        "archive_replay_enabled": replay_archives,
        "archive_replay_files": archive_replay_files,
        "geoip_enabled": geoip_enabled,
        "geoip_city_db": str(city_db),
        "geoip_asn_db": str(asn_db),
        "geoip_country_db": str(country_db),
        "maphost_note": "Map serving is handled separately by .github/workflows/maphost.yml; this crawler does not invoke maps.py.",
    })

    state.write_24h_snapshot()
    state.save()

    changes = build_changes(state_before=before, state_after=state.nodes)

    payload = export_state(
        state=state,
        output_dir=output_dir,
        archive_dir=archive_dir,
        mode=export_mode,
        changes=changes,
        pretty=pretty,
    )

    latest_path = output_dir / "latest.json"

    if raw_output:
        write_json(raw_output, payload, pretty=pretty)

    if mirror_legacy:
        mirror_latest_to_legacy_api(
            source_dir=output_dir,
            legacy_dir=DEFAULT_LEGACY_API,
            pretty=pretty,
        )

    if run_enrich_after:
        code = run_enrichment(
            input_path=latest_path,
            output_path=DEFAULT_ENRICHED_LATEST,
            report_path=DEFAULT_ENRICHMENT_REPORT,
            source="zzxbitnodes",
            api_dir=output_dir,
            state_dir=state_dir,
            compact=not pretty,
        )
        if code != 0:
            print(f"[enrich] exited with code {code}")

    aggregate_input = DEFAULT_ENRICHED_LATEST if DEFAULT_ENRICHED_LATEST.exists() else latest_path

    if run_aggregate_after:
        code = run_aggregate(
            input_path=aggregate_input,
            output_path=DEFAULT_AGGREGATE_LATEST,
            api_dir=output_dir,
            state_dir=state_dir,
            source="zzxbitnodes",
        )
        if code != 0:
            print(f"[aggregate] exited with code {code}")

    run_registry_backup(
        input_dir=archive_dir,
        api_dir=output_dir,
        output_dir=registry_root,
        latest_dir=registry_latest_dir,
        enabled=registry_backup,
    )

    run_registry_index(
        registry_root=registry_root,
        enabled=registry_backup,
    )

    push_snapshots(
        enabled=git_push,
        message="Update ZZX Bitnodes global node snapshots",
    )

    summary = state.state_summary()

    print(
        f"[{utc_iso()}] "
        f"crawler=zzxbitnodes "
        f"known={summary['total_known_nodes']} "
        f"reachable_now={summary['reachable_now']} "
        f"unreachable_now={summary['unreachable_now']} "
        f"reachable_24h={summary['reachable_24h']} "
        f"stale={summary['stale_nodes']} "
        f"ipv4={summary.get('ipv4_nodes', 0)} "
        f"ipv6={summary.get('ipv6_nodes', 0)} "
        f"tor={summary.get('tor_nodes', 0)} "
        f"i2p={summary.get('i2p_nodes', 0)} "
        f"vpn={summary.get('vpn_nodes', 0)} "
        f"proxy={summary.get('proxy_nodes', 0)} "
        f"queue={summary['queue_size']} "
        f"dns={len(seed_addresses)} "
        f"seeds={len(expanded_seed_addresses)} "
        f"discovered={len(discovered)} "
        f"candidates={len(candidates)} "
        f"successes={len(successes)} "
        f"failures={len(failures)}"
    )

    return payload


def daemon_loop(**kwargs: Any) -> None:
    interval = int(kwargs.pop("interval"))
    run_seconds = int(kwargs.pop("run_seconds"))

    started = time.time()

    while True:
        if run_seconds > 0 and time.time() - started >= run_seconds:
            print(f"[daemon] run_seconds reached: {run_seconds}")
            return

        try:
            crawl_once(**kwargs)
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            print(exc)

        if run_seconds > 0 and time.time() - started >= run_seconds:
            return

        time.sleep(interval)


def build_parser(description: str = "ZZX-Labs persistent Bitnodes global crawler.") -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)

    parser.add_argument("--state-dir", default=str(DEFAULT_STATE_DIR))
    parser.add_argument("--snapshot-24h-dir", default=str(DEFAULT_SNAPSHOT_24H_DIR))
    parser.add_argument("--history-dir", default="")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE))
    parser.add_argument("--seeder-dir", default=str(DEFAULT_SEEDER_DIR))
    parser.add_argument("--raw-output", default="")

    parser.add_argument("--limit", type=int, default=5_000_000)
    parser.add_argument("--batch-size", type=int, default=20_000)
    parser.add_argument("--timeout", type=float, default=8.0)
    parser.add_argument("--workers", type=int, default=2048)
    parser.add_argument("--getaddr-rounds", type=int, default=128)
    parser.add_argument("--dns-seed-limit", type=int, default=10_000)

    parser.add_argument("--disable-archive-replay", action="store_true")
    parser.add_argument("--archive-replay-files", type=int, default=500)

    parser.add_argument("--interval", type=int, default=3600)
    parser.add_argument("--run-seconds", type=int, default=0)
    parser.add_argument("--daemon", action="store_true")

    parser.add_argument("--disable-geoip", action="store_true")
    parser.add_argument("--geoip-dir", default=str(DEFAULT_GEOIP_DIR))
    parser.add_argument("--city-db", default="")
    parser.add_argument("--asn-db", default="")
    parser.add_argument("--country-db", default="")

    parser.add_argument(
        "--export-mode",
        choices=["all", "reachable", "unreachable", "reachable_24h", "stale"],
        default="reachable_24h",
    )

    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--git-push", action="store_true")
    parser.add_argument("--mirror-legacy-api", action="store_true")

    parser.add_argument("--no-enrich-after", action="store_true")
    parser.add_argument("--no-aggregate-after", action="store_true")

    parser.add_argument("--registry-backup", action="store_true")
    parser.add_argument("--registry-root", default=str(DEFAULT_REGISTRY_DIR))
    parser.add_argument("--registry-latest-dir", default=str(DEFAULT_REGISTRY_LATEST_DIR))

    return parser


def run_from_args(args: argparse.Namespace) -> int:
    geoip_dir = Path(args.geoip_dir)

    city_db = Path(args.city_db) if args.city_db else geoip_dir / "dbip-city-lite.mmdb"
    asn_db = Path(args.asn_db) if args.asn_db else geoip_dir / "dbip-asn-lite.mmdb"
    country_db = Path(args.country_db) if args.country_db else geoip_dir / "dbip-country-lite.mmdb"

    raw_output = Path(args.raw_output) if args.raw_output else None

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
        "pretty": not args.compact,
        "mirror_legacy": args.mirror_legacy_api,
        "run_enrich_after": not args.no_enrich_after,
        "run_aggregate_after": not args.no_aggregate_after,
        "registry_backup": args.registry_backup,
        "registry_root": Path(args.registry_root),
        "registry_latest_dir": Path(args.registry_latest_dir),
        "git_push": args.git_push,
    }

    if args.daemon:
        daemon_loop(
            **common,
            interval=args.interval,
            run_seconds=args.run_seconds,
        )
        return 0

    crawl_once(**common)
    return 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    return run_from_args(args)


if __name__ == "__main__":
    raise SystemExit(main())
