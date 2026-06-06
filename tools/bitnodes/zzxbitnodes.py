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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


try:
    import dns.resolver
except Exception:
    dns = None  # type: ignore


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"
MAP_TOOLS_DIR = TOOLS_DIR / "map"
GEOLOC_TOOLS_DIR = TOOLS_DIR / "geoloc"

for import_path in (TOOLS_DIR, MAP_TOOLS_DIR, GEOLOC_TOOLS_DIR):
    if str(import_path) not in sys.path:
        sys.path.insert(0, str(import_path))


from bitcoin_p2p import getaddr, handshake, version_info_to_bitnodes_array
from state import BitnodesState, normalize_address, utc_iso, utc_now


try:
    from geoip import enrich_snapshot_payload
except Exception:
    enrich_snapshot_payload = None  # type: ignore


BITNODES_ROOT = APP_ROOT / "bitcoin" / "bitnodes"

DATA_DIR = BITNODES_ROOT / "data"
API_DIR = BITNODES_ROOT / "api"
ARCHIVE_DIR = BITNODES_ROOT / "archive"
MAPS_DIR = BITNODES_ROOT / "maps"
LIVE_MAP_DIR = BITNODES_ROOT / "live-map"

SNAPSHOTS_ROOT = DATA_DIR / "snapshots"
SNAPSHOT_BUCKETS = ("24h", "week", "monthly", "quarterly", "yearly", "all-time")

SOURCE = "zzxbitnodes"

DEFAULT_OUTPUT = API_DIR / SOURCE
DEFAULT_ARCHIVE = ARCHIVE_DIR / SOURCE
DEFAULT_LEGACY_API = API_DIR

DEFAULT_GEOIP_DIR = DATA_DIR / "geoip"
DEFAULT_GEO_ROOT = DATA_DIR / "geo"
DEFAULT_SEEDER_DIR = DATA_DIR / "seeders" / SOURCE
DEFAULT_STATE_DIR = DATA_DIR / "state" / SOURCE
DEFAULT_SNAPSHOT_24H_DIR = SNAPSHOTS_ROOT / "24h" / SOURCE

DEFAULT_ENRICHED_DIR = API_DIR / "enriched" / SOURCE
DEFAULT_ENRICHED_LATEST = DEFAULT_ENRICHED_DIR / "latest.json"
DEFAULT_ENRICHMENT_REPORT = DEFAULT_ENRICHED_DIR / "enrichment-report.json"

DEFAULT_AGGREGATE_DIR = API_DIR / "aggregate" / SOURCE
DEFAULT_AGGREGATE_LATEST = DEFAULT_AGGREGATE_DIR / "latest.json"

DEFAULT_EXPORT_DIR = API_DIR / "data"

DEFAULT_REGISTRY_DIR = DATA_DIR / "registry" / SOURCE
DEFAULT_REGISTRY_LATEST_DIR = DEFAULT_REGISTRY_DIR / "latest"

DEFAULT_CITY_DB = DEFAULT_GEOIP_DIR / "dbip-city-lite.mmdb"
DEFAULT_ASN_DB = DEFAULT_GEOIP_DIR / "dbip-asn-lite.mmdb"
DEFAULT_COUNTRY_DB = DEFAULT_GEOIP_DIR / "dbip-country-lite.mmdb"

DEFAULT_MAX_PUBLIC_JSON_BYTES = 24_000_000
DEFAULT_DATAPLANE_DATABASE = "zzx_bitnodes"

ENRICH = TOOLS_DIR / "enrich.py"
AGGREGATE = TOOLS_DIR / "aggregate.py"
EXPORT = TOOLS_DIR / "export.py"
EXPORT_JSON = TOOLS_DIR / "export_json.py"
IP_DB = TOOLS_DIR / "ip_db.py"
PUSH_IPDB = TOOLS_DIR / "push_ipdb.py"
CHUNK_REGISTRY_BACKUP = TOOLS_DIR / "chunk_registry_backup.py"
UPDATE_DAILY_INDEX = TOOLS_DIR / "update_daily_index.py"
PUSH_SNAPSHOTS = TOOLS_DIR / "push_snapshots.py"
MAP_WRAPPER = MAP_TOOLS_DIR / "map.py"
MAPS = MAP_TOOLS_DIR / "maps.py"

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


def printf(message: str) -> None:
    print(message, flush=True)


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def py(script: Path, *args: str) -> list[str]:
    return [sys.executable, str(script), *args]


def now_dt() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return now_dt().replace(microsecond=0).isoformat()


def date_slug() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def month_slug() -> str:
    return time.strftime("%Y-%m", time.gmtime())


def year_slug() -> str:
    return time.strftime("%Y", time.gmtime())


def quarter_slug() -> str:
    dt = now_dt()
    quarter = ((dt.month - 1) // 3) + 1
    return f"{dt.year}-Q{quarter}"


def snapshot_name(timestamp: int | None = None) -> str:
    if timestamp is None:
        timestamp = utc_now()

    return time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(timestamp)) + ".json"


def read_json_any(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    try:
        if path.suffix == ".gz":
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)

        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return fallback


def write_json_file(path: Path, payload: Any, pretty: bool = True) -> None:
    mkdir(path.parent)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            ensure_ascii=False,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
            sort_keys=pretty,
        )
        handle.write("\n")


def run_command(
    command: list[str],
    *,
    cwd: Path = APP_ROOT,
    check: bool = False,
) -> subprocess.CompletedProcess[str]:
    printf("$ " + " ".join(str(part) for part in command))

    result = subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    if result.stdout.strip():
        printf(result.stdout.strip())

    if result.stderr.strip():
        printf(result.stderr.strip())

    if check and result.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(command)}")

    return result


def ensure_layout(source: str = SOURCE) -> None:
    base_paths = (
        BITNODES_ROOT,
        DATA_DIR,
        API_DIR,
        ARCHIVE_DIR,
        MAPS_DIR,
        LIVE_MAP_DIR,
        DEFAULT_GEOIP_DIR,
        DEFAULT_GEO_ROOT,
        DEFAULT_OUTPUT,
        DEFAULT_ARCHIVE,
        DEFAULT_SEEDER_DIR,
        DEFAULT_STATE_DIR,
        DEFAULT_ENRICHED_DIR,
        DEFAULT_AGGREGATE_DIR,
        DEFAULT_EXPORT_DIR,
        DEFAULT_REGISTRY_DIR,
        DEFAULT_REGISTRY_LATEST_DIR,
    )

    for path in base_paths:
        mkdir(path)

    for bucket in SNAPSHOT_BUCKETS:
        mkdir(SNAPSHOTS_ROOT / bucket / source)


def snapshot_bucket_dirs(source: str) -> dict[str, Path]:
    return {
        bucket: SNAPSHOTS_ROOT / bucket / source
        for bucket in SNAPSHOT_BUCKETS
    }


def write_bucket_snapshots(source: str, payload: dict[str, Any], pretty: bool = True) -> None:
    timestamp = int(payload.get("timestamp") or utc_now())
    dirs = snapshot_bucket_dirs(source)

    for directory in dirs.values():
        mkdir(directory)

    pointer = {
        "schema": "zzx-bitnodes-snapshot-pointer-v3",
        "source": source,
        "generated_at": iso_now(),
        "timestamp": timestamp,
        "canonical_latest": f"api/{source}/latest.json",
        "canonical_enriched": f"api/enriched/{source}/latest.json",
        "canonical_aggregate": f"api/aggregate/{source}/latest.json",
        "canonical_dataplane": "api/data/dataplane_manifest.json",
        "canonical_mariadb_manifest": "api/data/mariadb_manifest.json",
        "canonical_sqlite_manifest": "api/data/sqlite_manifest.json",
        "node_count": payload.get("total_nodes") or payload.get("known_nodes"),
        "reachable_nodes": payload.get("reachable_nodes"),
        "latest_height": payload.get("latest_height"),
        "policy": "No full node fan-out snapshots. Full node data lives in DB/dataplane artifacts.",
    }

    write_json_file(dirs["24h"] / "latest.json", pointer, pretty=pretty)
    write_json_file(dirs["week"] / f"{date_slug()}.json", pointer, pretty=pretty)
    write_json_file(dirs["monthly"] / f"{month_slug()}.json", pointer, pretty=pretty)
    write_json_file(dirs["quarterly"] / f"{quarter_slug()}.json", pointer, pretty=pretty)
    write_json_file(dirs["yearly"] / f"{year_slug()}.json", pointer, pretty=pretty)
    write_json_file(dirs["all-time"] / "latest.json", pointer, pretty=pretty)

    manifest = {
        "schema": "zzx-bitnodes-snapshot-buckets-v3",
        "source": source,
        "generated_at": iso_now(),
        "policy": pointer["policy"],
        "latest": pointer,
        "buckets": {
            bucket: {
                "index": (path / "index.json").relative_to(BITNODES_ROOT).as_posix(),
                "latest": (path / ("latest.json" if bucket in {"24h", "all-time"} else f"{date_slug()}.json")).relative_to(BITNODES_ROOT).as_posix()
                if bucket == "week"
                else None,
            }
            for bucket, path in dirs.items()
        },
    }

    for bucket, path in dirs.items():
        index = {
            "schema": "zzx-bitnodes-snapshot-bucket-index-v3",
            "source": source,
            "bucket": bucket,
            "generated_at": iso_now(),
            "policy": pointer["policy"],
            "latest": pointer,
            "entries": [pointer],
        }
        write_json_file(path / "index.json", index, pretty=pretty)

    write_json_file(SNAPSHOTS_ROOT / source / "manifest.json", manifest, pretty=pretty)


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
            "unreachable",
            "results",
            "rows",
            "data",
            "node_records",
        ):
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

    elif isinstance(payload, list):
        for item in payload:
            if isinstance(item, str):
                found.append(item)
            elif isinstance(item, dict):
                address = item.get("address") or item.get("node") or item.get("addr") or item.get("host")
                if address:
                    found.append(str(address))

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
    snapshot_root: Path,
    max_files: int = 500,
) -> list[Path]:
    files: list[Path] = []

    for root in (archive_dir, seeder_dir, state_dir, output_dir, snapshot_root):
        if not root.exists():
            continue

        files.extend(sorted(root.rglob("*.json")))
        files.extend(sorted(root.rglob("*.json.gz")))

    files = [path for path in files if path.is_file() and path.name != "index.json"]
    files.sort(key=lambda path: path.stat().st_mtime, reverse=True)

    return files[:max_files]


def discover_from_existing_files(
    archive_dir: Path,
    seeder_dir: Path,
    state_dir: Path,
    output_dir: Path,
    snapshot_root: Path,
    limit: int,
    max_files: int,
) -> list[str]:
    discovered: list[str] = []

    files = collect_seed_files(
        archive_dir=archive_dir,
        seeder_dir=seeder_dir,
        state_dir=state_dir,
        output_dir=output_dir,
        snapshot_root=snapshot_root,
        max_files=max_files,
    )

    for path in files:
        payload = read_json_any(path, fallback=None)

        if payload is None:
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

        printf(
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
        metadata["reachable_now"] = True
        metadata["network"] = info.network
        metadata["is_tor"] = info.network == "tor"
        metadata["is_i2p"] = info.network == "i2p"
        metadata["is_ipv4"] = info.network == "ipv4"
        metadata["is_ipv6"] = info.network == "ipv6"
        metadata["last_seen"] = utc_now()
        metadata["crawler"] = SOURCE
        metadata["source"] = SOURCE
        metadata["crawler_version"] = "zzxbitnodes-enhanced-v3"
        metadata["crawl_observed_at"] = iso_now()

        row[19] = metadata

        normalized = normalize_address(info.address)

        if not normalized:
            return None

        return normalized, row

    except (socket.timeout, TimeoutError, OSError, ValueError):
        return None
    except Exception:
        return None


def crawl_batch(
    addresses: list[str],
    timeout: float,
    workers: int,
) -> tuple[dict[str, list[Any]], list[str]]:
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
            height_changes[address] = {
                "previous": old.get("height"),
                "current": new.get("height"),
            }

        if old.get("agent") != new.get("agent"):
            agent_changes[address] = {
                "previous": old.get("agent"),
                "current": new.get("agent"),
            }

        if old.get("services") != new.get("services"):
            services_changes[address] = {
                "previous": old.get("services"),
                "current": new.get("services"),
            }

        if old.get("port") != new.get("port"):
            port_changes[address] = {
                "previous": old.get("port"),
                "current": new.get("port"),
            }

    return {
        "schema": "zzx-bitnodes-change-set-v3",
        "generated_at": iso_now(),
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


def geoip_available(
    geoip_enabled: bool,
    city_db: Path,
    asn_db: Path,
    country_db: Path,
) -> bool:
    if not geoip_enabled or enrich_snapshot_payload is None:
        return False

    if city_db.exists() and asn_db.exists():
        return True

    if country_db.exists() and asn_db.exists():
        return True

    missing = [str(path) for path in (city_db, asn_db, country_db) if not path.exists()]

    printf(
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

    if not isinstance(enriched_nodes, dict):
        return

    for address, values in enriched_nodes.items():
        record = state.nodes.get(address)

        if not record:
            continue

        row = list(values) if isinstance(values, list) else []

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


def export_state_direct(
    state: BitnodesState,
    output_dir: Path,
    archive_dir: Path,
    mode: str,
    changes: dict[str, Any],
    pretty: bool = True,
) -> dict[str, Any]:
    payload = state.build_export_payload(mode=mode)
    payload["source"] = SOURCE
    payload["crawler"] = SOURCE
    payload["crawler_version"] = "zzxbitnodes-enhanced-v3"
    payload["changes"] = changes
    payload["generated_at"] = iso_now()
    payload["dataplane"] = {
        "enabled": True,
        "canonical_output": "bitcoin/bitnodes/api/data",
        "database": DEFAULT_DATAPLANE_DATABASE,
        "max_public_json_bytes": DEFAULT_MAX_PUBLIC_JSON_BYTES,
        "policy": "latest.json is a runtime interchange artifact; DB/dataplane artifacts are canonical.",
    }

    mkdir(output_dir)
    mkdir(archive_dir)

    latest_path = output_dir / "latest.json"
    write_json_file(latest_path, payload, pretty=pretty)

    timestamp = int(payload.get("timestamp") or utc_now())
    archive_name = snapshot_name(timestamp)

    archive_pointer = {
        "schema": "zzx-bitnodes-runtime-archive-pointer-v1",
        "source": SOURCE,
        "generated_at": iso_now(),
        "timestamp": timestamp,
        "latest": str(latest_path.relative_to(BITNODES_ROOT)),
        "dataplane": "api/data/dataplane_manifest.json",
        "node_count": payload.get("total_nodes") or payload.get("known_nodes"),
        "reachable_nodes": payload.get("reachable_nodes"),
        "latest_height": payload.get("latest_height"),
        "policy": "Full historical node data is represented by DB/dataplane artifacts, not archive fan-out.",
    }

    write_json_file(archive_dir / archive_name, archive_pointer, pretty=pretty)

    try:
        gzip_path = archive_dir / f"{archive_name}.gz"
        with gzip.open(gzip_path, "wt", encoding="utf-8", compresslevel=9) as handle:
            json.dump(
                archive_pointer,
                handle,
                ensure_ascii=False,
                indent=None if not pretty else 2,
                separators=(",", ":") if not pretty else None,
                sort_keys=pretty,
            )
            handle.write("\n")
    except Exception:
        pass

    write_bucket_snapshots(SOURCE, payload, pretty=pretty)

    return payload


def mirror_latest_to_legacy_api(source_dir: Path, legacy_dir: Path, pretty: bool = True) -> None:
    latest = source_dir / "latest.json"

    if not latest.exists():
        return

    payload = read_json_any(latest, fallback={})

    if not isinstance(payload, dict) or not payload:
        return

    payload["source"] = SOURCE
    payload["crawler"] = SOURCE

    mkdir(legacy_dir)
    write_json_file(legacy_dir / "latest.json", payload, pretty=pretty)


def run_enrichment(
    *,
    input_path: Path,
    output_path: Path,
    report_path: Path,
    source: str,
    api_dir: Path,
    state_dir: Path,
    geoip_dir: Path,
    geo_root: Path,
    compact: bool,
    modules: str = "",
    strict: bool = False,
) -> int:
    if not ENRICH.exists():
        printf(f"[enrich] missing {ENRICH}")
        return 1

    base_command = py(
        ENRICH,
        "--input", str(input_path),
        "--output", str(output_path),
        "--report", str(report_path),
        "--source", source,
        "--api-dir", str(api_dir),
        "--state-dir", str(state_dir),
        "--geoip-dir", str(geoip_dir),
        "--geo-root", str(geo_root),
    )

    if modules:
        base_command.extend(["--modules", modules])

    if compact:
        base_command.append("--compact")

    if strict:
        base_command.append("--strict")

    code = run_command(base_command).returncode

    if code == 0:
        return 0

    fallback_command = [
        part
        for part in base_command
        if part not in {"--geo-root", str(geo_root)}
    ]

    return run_command(fallback_command).returncode


def run_aggregate(
    *,
    input_path: Path,
    output_path: Path,
    api_dir: Path,
    state_dir: Path,
    source: str,
) -> int:
    if not AGGREGATE.exists():
        printf(f"[aggregate] missing {AGGREGATE}")
        return 1

    command = py(
        AGGREGATE,
        "--input", str(input_path),
        "--output", str(output_path),
        "--api-dir", str(api_dir),
        "--state-dir", str(state_dir),
        "--source", source,
    )

    return run_command(command).returncode


def run_export_wrapper(
    *,
    input_path: Path,
    output_dir: Path,
    archive_dir: Path,
    source: str,
    compact: bool,
) -> int:
    if not EXPORT.exists():
        printf(f"[exports] missing {EXPORT}")
        return 1

    command = py(
        EXPORT,
        "dataplane",
        "--input", str(input_path),
        "--output-dir", str(DEFAULT_EXPORT_DIR),
        "--database", DEFAULT_DATAPLANE_DATABASE,
        "--max-bytes", str(DEFAULT_MAX_PUBLIC_JSON_BYTES),
        "--strict",
    )

    if compact:
        command.append("--compact")

    return run_command(command).returncode


def run_ipdb(
    *,
    input_path: Path,
    output_path: Path,
    log_dir: Path,
    max_segment_bytes: int,
    compact: bool,
) -> int:
    if not IP_DB.exists():
        return 0

    command = py(
        IP_DB,
        "--input", str(input_path),
        "--output", str(output_path),
        "--log-dir", str(log_dir),
        "--max-segment-bytes", str(max_segment_bytes),
    )

    if compact:
        command.append("--compact")

    result = run_command(command)

    if result.returncode == 0:
        return 0

    fallback = py(
        IP_DB,
        "--input", str(input_path),
        "--output", str(output_path),
    )

    return run_command(fallback).returncode


def run_push_ipdb(
    *,
    source_dir: Path,
    compact: bool,
) -> int:
    if not PUSH_IPDB.exists():
        return 0

    command = py(
        PUSH_IPDB,
        "--source-dir", str(source_dir),
        "--manifest", str(source_dir / "ip_db.manifest.json"),
    )

    if compact:
        command.append("--compact")

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

    if not CHUNK_REGISTRY_BACKUP.exists():
        printf(f"[registry] missing {CHUNK_REGISTRY_BACKUP}")
        return 1

    dated = output_dir / date_slug()

    command = py(
        CHUNK_REGISTRY_BACKUP,
        "--input", str(input_dir),
        "--api", str(api_dir),
        "--output", str(dated),
        "--latest-output", str(latest_dir),
        "--max-mb", "24",
    )

    return run_command(command).returncode


def run_registry_index(*, registry_root: Path, enabled: bool) -> int:
    if not enabled:
        return 0

    if not UPDATE_DAILY_INDEX.exists():
        printf(f"[registry] missing {UPDATE_DAILY_INDEX}")
        return 1

    command = py(
        UPDATE_DAILY_INDEX,
        "--repo-root", str(registry_root),
    )

    return run_command(command).returncode


def run_maps_after(
    *,
    latest_input: Path,
    api_dir: Path,
    state_dir: Path,
    enabled: bool,
    compact: bool,
) -> int:
    if not enabled:
        return 0

    if MAP_WRAPPER.exists():
        command = py(
            MAP_WRAPPER,
            "both",
            "--input", str(latest_input),
            "--api-dir", str(api_dir),
            "--state-dir", str(state_dir),
            "--map-dir", str(MAPS_DIR / SOURCE),
            "--live-map-dir", str(LIVE_MAP_DIR / SOURCE),
            "--source", SOURCE,
            "--theme", "zzx_dark_olive",
            "--settings", "default",
            "--tile-provider", "cartodb_dark",
        )

        if compact:
            command.append("--compact")

        return run_command(command).returncode

    if MAPS.exists():
        command = py(
            MAPS,
            "--input", str(latest_input),
            "--api-dir", str(api_dir),
            "--state-dir", str(state_dir),
            "--map-dir", str(MAPS_DIR / SOURCE),
            "--live-map-dir", str(LIVE_MAP_DIR / SOURCE),
            "--source", SOURCE,
            "--theme", "zzx_dark_olive",
            "--settings", "default",
            "--tile-provider", "cartodb_dark",
        )

        if compact:
            command.append("--compact")

        return run_command(command).returncode

    printf("[maps] no map wrapper found")
    return 1


def push_snapshots(enabled: bool, message: str) -> int:
    if not enabled:
        return 0

    if not PUSH_SNAPSHOTS.exists():
        printf(f"[push] missing {PUSH_SNAPSHOTS}")
        return 1

    command = py(
        PUSH_SNAPSHOTS,
        "--message", message,
        "--paths",
        "bitcoin/bitnodes/api/zzxbitnodes",
        "bitcoin/bitnodes/api/enriched/zzxbitnodes",
        "bitcoin/bitnodes/api/aggregate/zzxbitnodes",
        "bitcoin/bitnodes/api/data",
        "bitcoin/bitnodes/archive/zzxbitnodes",
        "bitcoin/bitnodes/data/state/zzxbitnodes",
        "bitcoin/bitnodes/data/snapshots",
        "bitcoin/bitnodes/data/registry/zzxbitnodes",
        "bitcoin/bitnodes/maps",
        "bitcoin/bitnodes/live-map",
    )

    return run_command(command).returncode


def seed_state_before_crawl(
    state: BitnodesState,
    seed_addresses: list[str],
    archive_dir: Path,
    seeder_dir: Path,
    output_dir: Path,
    state_dir: Path,
    snapshot_root: Path,
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
            snapshot_root=snapshot_root,
            limit=max(limit, len(seed_addresses)),
            max_files=archive_replay_files,
        )

        seeds.extend(replayed)

    seeds.extend(state.nodes.keys())

    seeds = sorted(
        set(
            normalized
            for address in seeds
            for normalized in [normalize_address(address)]
            if normalized
        )
    )

    state.add_to_queue(seeds)

    return seeds[:limit]


def crawl_once(
    *,
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
    geoip_dir: Path,
    geo_root: Path,
    city_db: Path,
    asn_db: Path,
    country_db: Path,
    export_mode: str,
    pretty: bool,
    mirror_legacy: bool,
    run_enrich_after: bool,
    run_aggregate_after: bool,
    run_exports_after: bool,
    run_ipdb_after: bool,
    run_maps: bool,
    enrich_modules: str,
    registry_backup: bool,
    registry_root: Path,
    registry_latest_dir: Path,
    max_segment_bytes: int,
    git_push: bool,
    strict: bool = False,
) -> dict[str, Any]:
    ensure_layout(SOURCE)

    for path in (
        output_dir,
        archive_dir,
        seeder_dir,
        state_dir,
        snapshot_24h_dir,
        geoip_dir,
        geo_root,
        city_db.parent,
    ):
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
        snapshot_root=SNAPSHOTS_ROOT,
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

    state.meta.update(
        {
            "crawler": SOURCE,
            "source": SOURCE,
            "crawler_version": "zzxbitnodes-enhanced-v3",
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
            "geoip_dir": str(geoip_dir),
            "geo_root": str(geo_root),
            "geoip_city_db": str(city_db),
            "geoip_asn_db": str(asn_db),
            "geoip_country_db": str(country_db),
            "snapshots_root": str(SNAPSHOTS_ROOT),
            "snapshot_buckets": list(SNAPSHOT_BUCKETS),
            "dataplane_dir": str(DEFAULT_EXPORT_DIR),
            "dataplane_database": DEFAULT_DATAPLANE_DATABASE,
        }
    )

    state.write_24h_snapshot()
    state.save()

    changes = build_changes(state_before=before, state_after=state.nodes)

    payload = export_state_direct(
        state=state,
        output_dir=output_dir,
        archive_dir=archive_dir,
        mode=export_mode,
        changes=changes,
        pretty=pretty,
    )

    latest_path = output_dir / "latest.json"

    if raw_output:
        write_json_file(raw_output, payload, pretty=pretty)

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
            source=SOURCE,
            api_dir=API_DIR,
            state_dir=state_dir,
            geoip_dir=geoip_dir,
            geo_root=geo_root,
            compact=not pretty,
            modules=enrich_modules,
            strict=strict,
        )

        if code != 0:
            printf(f"[enrich] exited with code {code}")

            if strict:
                raise RuntimeError("enrichment failed")

    aggregate_input = DEFAULT_ENRICHED_LATEST if DEFAULT_ENRICHED_LATEST.exists() else latest_path

    if run_aggregate_after:
        code = run_aggregate(
            input_path=aggregate_input,
            output_path=DEFAULT_AGGREGATE_LATEST,
            api_dir=API_DIR,
            state_dir=state_dir,
            source=SOURCE,
        )

        if code != 0:
            printf(f"[aggregate] exited with code {code}")

            if strict:
                raise RuntimeError("aggregate failed")

    export_input = DEFAULT_AGGREGATE_LATEST if DEFAULT_AGGREGATE_LATEST.exists() else aggregate_input

    if run_ipdb_after:
        ipdb_output = DEFAULT_ENRICHED_DIR / "latest.ipdb-enriched.json"

        code = run_ipdb(
            input_path=aggregate_input if aggregate_input.exists() else latest_path,
            output_path=ipdb_output,
            log_dir=geoip_dir,
            max_segment_bytes=max_segment_bytes,
            compact=not pretty,
        )

        if code != 0:
            printf(f"[ip_db] exited with code {code}")

            if strict:
                raise RuntimeError("ip_db failed")

        run_push_ipdb(source_dir=geoip_dir, compact=not pretty)

    if run_exports_after:
        code = run_export_wrapper(
            input_path=export_input if export_input.exists() else latest_path,
            output_dir=DEFAULT_EXPORT_DIR,
            archive_dir=archive_dir,
            source=SOURCE,
            compact=not pretty,
        )

        if code != 0:
            printf(f"[exports] exited with code {code}")

            if strict:
                raise RuntimeError("exports failed")

    if run_maps:
        code = run_maps_after(
            latest_input=export_input if export_input.exists() else latest_path,
            api_dir=API_DIR,
            state_dir=state_dir,
            enabled=run_maps,
            compact=not pretty,
        )

        if code != 0:
            printf(f"[maps] exited with code {code}")

            if strict:
                raise RuntimeError("maps failed")

    code = run_registry_backup(
        input_dir=archive_dir,
        api_dir=API_DIR,
        output_dir=registry_root,
        latest_dir=registry_latest_dir,
        enabled=registry_backup,
    )

    if code == 0:
        run_registry_index(registry_root=registry_root, enabled=registry_backup)
    elif strict:
        raise RuntimeError("registry backup failed")

    code = push_snapshots(
        enabled=git_push,
        message="Update ZZX Bitnodes global node dataplane snapshots",
    )

    if code != 0 and strict:
        raise RuntimeError("git push failed")

    summary = state.state_summary()

    printf(
        f"[{utc_iso()}] "
        f"crawler={SOURCE} "
        f"known={summary.get('total_known_nodes', 0)} "
        f"reachable_now={summary.get('reachable_now', 0)} "
        f"unreachable_now={summary.get('unreachable_now', 0)} "
        f"reachable_24h={summary.get('reachable_24h', 0)} "
        f"stale={summary.get('stale_nodes', 0)} "
        f"ipv4={summary.get('ipv4_nodes', 0)} "
        f"ipv6={summary.get('ipv6_nodes', 0)} "
        f"tor={summary.get('tor_nodes', 0)} "
        f"i2p={summary.get('i2p_nodes', 0)} "
        f"vpn={summary.get('vpn_nodes', 0)} "
        f"proxy={summary.get('proxy_nodes', 0)} "
        f"queue={summary.get('queue_size', 0)} "
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
            printf(f"[daemon] run_seconds reached: {run_seconds}")
            return

        try:
            crawl_once(**kwargs)
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            printf(f"[daemon] cycle error: {exc}")

            if kwargs.get("strict"):
                raise

        if run_seconds > 0 and time.time() - started >= run_seconds:
            return

        time.sleep(interval)


def parser_has_option(parser: argparse.ArgumentParser, option: str) -> bool:
    return option in parser._option_string_actions


def add_argument_if_missing(
    parser: argparse.ArgumentParser,
    *flags: str,
    **kwargs: Any,
) -> None:
    if any(parser_has_option(parser, flag) for flag in flags):
        return

    parser.add_argument(*flags, **kwargs)


def build_parser(description: str = "ZZX-Labs persistent enhanced Bitnodes global crawler.") -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=description,
        conflict_handler="resolve",
    )

    add_argument_if_missing(parser, "--state-dir", default=str(DEFAULT_STATE_DIR))
    add_argument_if_missing(parser, "--snapshot-24h-dir", default=str(DEFAULT_SNAPSHOT_24H_DIR))
    add_argument_if_missing(parser, "--history-dir", default="")
    add_argument_if_missing(parser, "--output", default=str(DEFAULT_OUTPUT))
    add_argument_if_missing(parser, "--archive-dir", default=str(DEFAULT_ARCHIVE))
    add_argument_if_missing(parser, "--seeder-dir", default=str(DEFAULT_SEEDER_DIR))
    add_argument_if_missing(parser, "--raw-output", default="")

    add_argument_if_missing(
        parser,
        "--profile",
        choices=["github", "local", "aggressive"],
        default="github",
    )

    add_argument_if_missing(parser, "--limit", type=int, default=500_000)
    add_argument_if_missing(parser, "--batch-size", type=int, default=4096)
    add_argument_if_missing(parser, "--timeout", type=float, default=5.0)
    add_argument_if_missing(parser, "--workers", type=int, default=256)
    add_argument_if_missing(parser, "--getaddr-rounds", type=int, default=16)
    add_argument_if_missing(parser, "--dns-seed-limit", type=int, default=4096)

    add_argument_if_missing(parser, "--disable-archive-replay", action="store_true")
    add_argument_if_missing(parser, "--archive-replay-files", type=int, default=250)

    add_argument_if_missing(parser, "--interval", type=int, default=3600)
    add_argument_if_missing(parser, "--run-seconds", type=int, default=0)
    add_argument_if_missing(parser, "--daemon", action="store_true")

    add_argument_if_missing(parser, "--disable-geoip", action="store_true")
    add_argument_if_missing(parser, "--geoip-dir", default=str(DEFAULT_GEOIP_DIR))
    add_argument_if_missing(parser, "--geo-root", default=str(DEFAULT_GEO_ROOT))
    add_argument_if_missing(parser, "--city-db", default="")
    add_argument_if_missing(parser, "--asn-db", default="")
    add_argument_if_missing(parser, "--country-db", default="")

    add_argument_if_missing(
        parser,
        "--export-mode",
        choices=["all", "reachable", "unreachable", "reachable_24h", "stale"],
        default="reachable_24h",
    )

    add_argument_if_missing(parser, "--compact", action="store_true")
    add_argument_if_missing(parser, "--strict", action="store_true")
    add_argument_if_missing(parser, "--git-push", action="store_true")
    add_argument_if_missing(parser, "--mirror-legacy-api", action="store_true")

    add_argument_if_missing(parser, "--no-enrich-after", action="store_true")
    add_argument_if_missing(parser, "--no-aggregate-after", action="store_true")
    add_argument_if_missing(parser, "--no-export-all-after", action="store_true")
    add_argument_if_missing(parser, "--no-ipdb-after", action="store_true")
    add_argument_if_missing(parser, "--enrich-modules", default="")

    add_argument_if_missing(parser, "--build-maps", action="store_true")

    add_argument_if_missing(parser, "--registry-backup", action="store_true")
    add_argument_if_missing(parser, "--registry-root", default=str(DEFAULT_REGISTRY_DIR))
    add_argument_if_missing(parser, "--registry-latest-dir", default=str(DEFAULT_REGISTRY_LATEST_DIR))

    add_argument_if_missing(
        parser,
        "--max-segment-bytes",
        type=int,
        default=DEFAULT_MAX_PUBLIC_JSON_BYTES,
    )

    return parser


def apply_profile(args: argparse.Namespace) -> argparse.Namespace:
    if args.profile == "github":
        args.timeout = min(float(args.timeout), 5.0)
        args.workers = min(int(args.workers), 256)
        args.batch_size = min(int(args.batch_size), 4096)
        args.getaddr_rounds = min(int(args.getaddr_rounds), 16)
        args.dns_seed_limit = min(int(args.dns_seed_limit), 4096)
        args.archive_replay_files = min(int(args.archive_replay_files), 250)

    elif args.profile == "local":
        args.timeout = min(float(args.timeout), 8.0)
        args.workers = min(int(args.workers), 1024)
        args.batch_size = min(int(args.batch_size), 12000)
        args.getaddr_rounds = min(int(args.getaddr_rounds), 64)
        args.dns_seed_limit = min(int(args.dns_seed_limit), 12000)

    elif args.profile == "aggressive":
        args.timeout = min(float(args.timeout), 10.0)
        args.workers = min(int(args.workers), 2048)
        args.batch_size = min(int(args.batch_size), 20000)
        args.getaddr_rounds = min(int(args.getaddr_rounds), 128)
        args.dns_seed_limit = min(int(args.dns_seed_limit), 20000)

    return args


def normalize_args(args: argparse.Namespace) -> argparse.Namespace:
    defaults = {
        "state_dir": str(DEFAULT_STATE_DIR),
        "snapshot_24h_dir": str(DEFAULT_SNAPSHOT_24H_DIR),
        "history_dir": "",
        "output": str(DEFAULT_OUTPUT),
        "archive_dir": str(DEFAULT_ARCHIVE),
        "seeder_dir": str(DEFAULT_SEEDER_DIR),
        "raw_output": "",
        "profile": "github",
        "limit": 500_000,
        "batch_size": 4096,
        "timeout": 5.0,
        "workers": 256,
        "getaddr_rounds": 16,
        "dns_seed_limit": 4096,
        "disable_archive_replay": False,
        "archive_replay_files": 250,
        "interval": 3600,
        "run_seconds": 0,
        "daemon": False,
        "disable_geoip": False,
        "geoip_dir": str(DEFAULT_GEOIP_DIR),
        "geo_root": str(DEFAULT_GEO_ROOT),
        "city_db": "",
        "asn_db": "",
        "country_db": "",
        "export_mode": "reachable_24h",
        "compact": False,
        "strict": False,
        "git_push": False,
        "mirror_legacy_api": False,
        "no_enrich_after": False,
        "no_aggregate_after": False,
        "no_export_all_after": False,
        "no_ipdb_after": False,
        "enrich_modules": "",
        "build_maps": False,
        "registry_backup": False,
        "registry_root": str(DEFAULT_REGISTRY_DIR),
        "registry_latest_dir": str(DEFAULT_REGISTRY_LATEST_DIR),
        "max_segment_bytes": DEFAULT_MAX_PUBLIC_JSON_BYTES,
    }

    for key, value in defaults.items():
        if not hasattr(args, key):
            setattr(args, key, value)

    return args


def run_from_args(args: argparse.Namespace) -> int:
    ensure_layout(SOURCE)

    args = normalize_args(args)
    args = apply_profile(args)

    geoip_dir = Path(args.geoip_dir)
    geo_root = Path(args.geo_root)

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
        "limit": int(args.limit),
        "batch_size": int(args.batch_size),
        "timeout": float(args.timeout),
        "workers": int(args.workers),
        "getaddr_rounds": int(args.getaddr_rounds),
        "dns_seed_limit": int(args.dns_seed_limit),
        "replay_archives": not bool(args.disable_archive_replay),
        "archive_replay_files": int(args.archive_replay_files),
        "geoip_enabled": not bool(args.disable_geoip),
        "geoip_dir": geoip_dir,
        "geo_root": geo_root,
        "city_db": city_db,
        "asn_db": asn_db,
        "country_db": country_db,
        "export_mode": args.export_mode,
        "pretty": not bool(args.compact),
        "mirror_legacy": bool(args.mirror_legacy_api),
        "run_enrich_after": not bool(args.no_enrich_after),
        "run_aggregate_after": not bool(args.no_aggregate_after),
        "run_exports_after": not bool(args.no_export_all_after),
        "run_ipdb_after": not bool(args.no_ipdb_after),
        "run_maps": bool(args.build_maps),
        "enrich_modules": args.enrich_modules,
        "registry_backup": bool(args.registry_backup),
        "registry_root": Path(args.registry_root),
        "registry_latest_dir": Path(args.registry_latest_dir),
        "max_segment_bytes": int(args.max_segment_bytes),
        "git_push": bool(args.git_push),
        "strict": bool(args.strict),
    }

    if args.daemon:
        daemon_loop(
            **common,
            interval=int(args.interval),
            run_seconds=int(args.run_seconds),
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
