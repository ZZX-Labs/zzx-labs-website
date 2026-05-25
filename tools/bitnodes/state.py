#!/usr/bin/env python3
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_STATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state"
DEFAULT_SNAPSHOT_24H_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "snapshots" / "24h"

STATE_NODES = "nodes.json"
STATE_QUEUE = "queue.json"
STATE_META = "meta.json"


def utc_now() -> int:
    return int(time.time())


def utc_iso(ts: int | None = None) -> str:
    if ts is None:
        ts = utc_now()

    return time.strftime(
        "%Y-%m-%dT%H:%M:%SZ",
        time.gmtime(ts)
    )


def ensure_dir(path: Path) -> None:
    path.mkdir(
        parents=True,
        exist_ok=True
    )


def read_json(
    path: Path,
    default: Any
) -> Any:

    if not path.exists():
        return default

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    except Exception:
        return default


def write_json(
    path: Path,
    payload: Any,
    pretty: bool = True
) -> None:

    ensure_dir(path.parent)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            indent=2 if pretty else None,
            ensure_ascii=False,
            sort_keys=True
        )

        handle.write("\n")


def extract_host(address: str) -> str:
    value = str(address).strip()

    if value.startswith("[") and "]:" in value:
        return value.split("]:", 1)[0].lstrip("[")

    if value.startswith("[") and value.endswith("]"):
        return value[1:-1]

    if ".onion:" in value:
        return value.rsplit(":", 1)[0]

    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)

        if port.isdigit():
            return host

    return value


def extract_port(address: str) -> int | None:
    value = str(address).strip()

    try:
        if value.startswith("[") and "]:" in value:
            return int(value.rsplit(":", 1)[1])

        if ".onion:" in value:
            return int(value.rsplit(":", 1)[1])

        if value.count(":") == 1:
            host, port = value.rsplit(":", 1)

            if port.isdigit():
                return int(port)

    except Exception:
        return None

    return None


def classify_network(address: str) -> str:
    host = extract_host(address).lower()

    if host.endswith(".onion"):
        return "tor"

    if ":" in host:
        return "ipv6"

    return "ipv4"


def normalize_address(address: str) -> str:
    value = str(address).strip()

    if not value:
        return value

    if value.startswith("[") and "]:" in value:
        return value

    if value.startswith("[") and value.endswith("]"):
        return f"{value}:8333"

    if ".onion:" in value:
        return value

    if value.endswith(".onion"):
        return f"{value}:8333"

    if value.count(":") == 1 and value.rsplit(":", 1)[1].isdigit():
        return value

    if value.count(":") > 1:
        return f"[{value}]:8333"

    return f"{value}:8333"


def bitnodes_array_to_record(
    address: str,
    values: list[Any],
    now: int | None = None
) -> dict[str, Any]:

    if now is None:
        now = utc_now()

    row = list(values)

    while len(row) < 20:
        row.append(None)

    return {
        "address": address,
        "host": extract_host(address),
        "port": extract_port(address),
        "network": classify_network(address),

        "reachable": True,
        "first_seen": now,
        "last_seen": now,
        "last_checked": now,
        "last_success": now,
        "last_failure": None,
        "failures": 0,
        "successes": 1,

        "protocol": row[0],
        "agent": row[1],
        "connected_since": row[2],
        "services": row[3],
        "height": row[4],
        "hostname": row[5],

        "city": row[6],
        "country": row[7],
        "latitude": row[8],
        "longitude": row[9],
        "timezone": row[10],
        "asn": row[11],
        "organization": row[12],
        "provider": row[13],
        "county": row[14],
        "zip": row[15],
        "w3w": row[16],
        "geohash": row[17],
        "asn_location": row[18],

        "latency_ms": row[19],
        "latency_samples": [
            {
                "t": now,
                "v": row[19]
            }
        ] if row[19] is not None else [],

        "height_samples": [
            {
                "t": now,
                "v": row[4]
            }
        ] if row[4] is not None else [],

        "observations": [
            {
                "t": now,
                "reachable": True,
                "height": row[4],
                "latency_ms": row[19]
            }
        ],

        "uptime_24h_percent": 100.0,
        "reachable_24h": True,
        "new_24h": True,
        "stale": False,
        "tor": classify_network(address) == "tor"
    }


def record_to_bitnodes_array(record: dict[str, Any]) -> list[Any]:
    return [
        record.get("protocol"),
        record.get("agent"),
        record.get("connected_since"),
        record.get("services"),
        record.get("height"),
        record.get("hostname"),
        record.get("city"),
        record.get("country"),
        record.get("latitude"),
        record.get("longitude"),
        record.get("timezone"),
        record.get("asn"),
        record.get("organization"),
        record.get("provider"),
        record.get("county"),
        record.get("zip"),
        record.get("w3w"),
        record.get("geohash"),
        record.get("asn_location"),
        record.get("latency_ms")
    ]


def prune_samples(
    samples: list[dict[str, Any]],
    cutoff: int
) -> list[dict[str, Any]]:

    return [
        sample
        for sample in samples
        if int(sample.get("t", 0)) >= cutoff
    ]


def calculate_uptime_24h(
    observations: list[dict[str, Any]],
    now: int
) -> float:

    cutoff = now - 86400

    recent = [
        item
        for item in observations
        if int(item.get("t", 0)) >= cutoff
    ]

    if not recent:
        return 0.0

    successes = sum(
        1
        for item in recent
        if bool(item.get("reachable"))
    )

    return round(
        (successes / len(recent)) * 100.0,
        4
    )


def merge_success(
    previous: dict[str, Any] | None,
    address: str,
    values: list[Any],
    now: int
) -> dict[str, Any]:

    fresh = bitnodes_array_to_record(
        address,
        values,
        now=now
    )

    if not previous:
        return fresh

    record = dict(previous)

    record["address"] = address
    record["host"] = extract_host(address)
    record["port"] = extract_port(address)
    record["network"] = classify_network(address)
    record["tor"] = classify_network(address) == "tor"

    record["reachable"] = True
    record["last_seen"] = now
    record["last_checked"] = now
    record["last_success"] = now
    record["successes"] = int(record.get("successes", 0)) + 1

    record["protocol"] = fresh.get("protocol")
    record["agent"] = fresh.get("agent")
    record["connected_since"] = fresh.get("connected_since")
    record["services"] = fresh.get("services")
    record["height"] = fresh.get("height")
    record["hostname"] = fresh.get("hostname")
    record["latency_ms"] = fresh.get("latency_ms")

    for key in [
        "city",
        "country",
        "latitude",
        "longitude",
        "timezone",
        "asn",
        "organization",
        "provider",
        "county",
        "zip",
        "w3w",
        "geohash",
        "asn_location"
    ]:
        if fresh.get(key) not in ("", None):
            record[key] = fresh.get(key)

    cutoff = now - 86400

    latency_samples = list(record.get("latency_samples", []))
    if fresh.get("latency_ms") is not None:
        latency_samples.append({
            "t": now,
            "v": fresh.get("latency_ms")
        })
    record["latency_samples"] = prune_samples(latency_samples, cutoff)

    height_samples = list(record.get("height_samples", []))
    if fresh.get("height") is not None:
        height_samples.append({
            "t": now,
            "v": fresh.get("height")
        })
    record["height_samples"] = prune_samples(height_samples, cutoff)

    observations = list(record.get("observations", []))
    observations.append({
        "t": now,
        "reachable": True,
        "height": fresh.get("height"),
        "latency_ms": fresh.get("latency_ms")
    })
    record["observations"] = prune_samples(observations, cutoff)

    record["uptime_24h_percent"] = calculate_uptime_24h(
        record["observations"],
        now
    )

    record["reachable_24h"] = True
    record["new_24h"] = int(record.get("first_seen", now)) >= cutoff
    record["stale"] = False

    return record


def merge_failure(
    previous: dict[str, Any] | None,
    address: str,
    now: int
) -> dict[str, Any]:

    if previous:
        record = dict(previous)
    else:
        record = {
            "address": address,
            "host": extract_host(address),
            "port": extract_port(address),
            "network": classify_network(address),
            "first_seen": now,
            "successes": 0,
            "failures": 0,
            "observations": [],
            "latency_samples": [],
            "height_samples": [],
            "tor": classify_network(address) == "tor"
        }

    record["reachable"] = False
    record["last_checked"] = now
    record["last_failure"] = now
    record["failures"] = int(record.get("failures", 0)) + 1

    cutoff = now - 86400

    observations = list(record.get("observations", []))
    observations.append({
        "t": now,
        "reachable": False,
        "height": record.get("height"),
        "latency_ms": None
    })

    record["observations"] = prune_samples(observations, cutoff)
    record["latency_samples"] = prune_samples(
        list(record.get("latency_samples", [])),
        cutoff
    )
    record["height_samples"] = prune_samples(
        list(record.get("height_samples", [])),
        cutoff
    )

    record["uptime_24h_percent"] = calculate_uptime_24h(
        record["observations"],
        now
    )

    record["reachable_24h"] = any(
        bool(item.get("reachable"))
        for item in record["observations"]
    )

    record["new_24h"] = int(record.get("first_seen", now)) >= cutoff

    last_success = record.get("last_success")
    record["stale"] = (
        last_success is None
        or int(last_success) < cutoff
    )

    return record


class BitnodesState:
    def __init__(
        self,
        state_dir: str | Path = DEFAULT_STATE_DIR,
        snapshot_24h_dir: str | Path = DEFAULT_SNAPSHOT_24H_DIR
    ) -> None:

        self.state_dir = Path(state_dir)
        self.snapshot_24h_dir = Path(snapshot_24h_dir)

        ensure_dir(self.state_dir)
        ensure_dir(self.snapshot_24h_dir)

        self.nodes_path = self.state_dir / STATE_NODES
        self.queue_path = self.state_dir / STATE_QUEUE
        self.meta_path = self.state_dir / STATE_META

        self.nodes: dict[str, dict[str, Any]] = read_json(
            self.nodes_path,
            {}
        )

        self.queue: list[str] = read_json(
            self.queue_path,
            []
        )

        self.meta: dict[str, Any] = read_json(
            self.meta_path,
            {}
        )

    def save(self) -> None:
        write_json(
            self.nodes_path,
            self.nodes
        )

        write_json(
            self.queue_path,
            sorted(set(self.queue))
        )

        write_json(
            self.meta_path,
            self.meta
        )

    def add_to_queue(
        self,
        addresses: list[str]
    ) -> None:

        existing = set(self.queue)
        known = set(self.nodes)

        for address in addresses:
            normalized = normalize_address(address)

            if not normalized:
                continue

            if normalized in existing:
                continue

            if normalized in known:
                continue

            self.queue.append(normalized)
            existing.add(normalized)

    def pop_batch(
        self,
        limit: int
    ) -> list[str]:

        batch = []

        while self.queue and len(batch) < limit:
            address = self.queue.pop(0)

            if address in batch:
                continue

            batch.append(address)

        return batch

    def known_addresses(self) -> list[str]:
        return sorted(set(self.nodes.keys()))

    def all_candidate_addresses(
        self,
        seed_addresses: list[str],
        limit: int
    ) -> list[str]:

        candidates = []

        seen = set()

        for source in [
            seed_addresses,
            self.queue,
            self.known_addresses()
        ]:
            for address in source:
                normalized = normalize_address(address)

                if not normalized or normalized in seen:
                    continue

                candidates.append(normalized)
                seen.add(normalized)

                if len(candidates) >= limit:
                    return candidates

        return candidates

    def update_successes(
        self,
        successes: dict[str, list[Any]],
        now: int
    ) -> None:

        for address, values in successes.items():
            normalized = normalize_address(address)

            previous = self.nodes.get(normalized)

            self.nodes[normalized] = merge_success(
                previous,
                normalized,
                values,
                now
            )

    def update_failures(
        self,
        failed_addresses: list[str],
        now: int
    ) -> None:

        for address in failed_addresses:
            normalized = normalize_address(address)

            if not normalized:
                continue

            previous = self.nodes.get(normalized)

            self.nodes[normalized] = merge_failure(
                previous,
                normalized,
                now
            )

    def latest_height(self) -> int | None:
        heights = [
            int(record["height"])
            for record in self.nodes.values()
            if isinstance(record.get("height"), int)
        ]

        return max(heights) if heights else None

    def reachable_now(self) -> dict[str, dict[str, Any]]:
        return {
            address: record
            for address, record in self.nodes.items()
            if bool(record.get("reachable"))
        }

    def unreachable_now(self) -> dict[str, dict[str, Any]]:
        return {
            address: record
            for address, record in self.nodes.items()
            if not bool(record.get("reachable"))
        }

    def reachable_24h(self) -> dict[str, dict[str, Any]]:
        cutoff = utc_now() - 86400

        return {
            address: record
            for address, record in self.nodes.items()
            if int(record.get("last_success") or 0) >= cutoff
        }

    def stale(self) -> dict[str, dict[str, Any]]:
        cutoff = utc_now() - 86400

        return {
            address: record
            for address, record in self.nodes.items()
            if int(record.get("last_success") or 0) < cutoff
        }

    def to_bitnodes_nodes(
        self,
        mode: str = "all"
    ) -> dict[str, list[Any]]:

        if mode == "reachable":
            source = self.reachable_now()
        elif mode == "unreachable":
            source = self.unreachable_now()
        elif mode == "reachable_24h":
            source = self.reachable_24h()
        elif mode == "stale":
            source = self.stale()
        else:
            source = self.nodes

        return {
            address: record_to_bitnodes_array(record)
            for address, record in source.items()
        }

    def state_summary(self) -> dict[str, Any]:
        now = utc_now()

        reachable_now = self.reachable_now()
        unreachable_now = self.unreachable_now()
        reachable_24h = self.reachable_24h()
        stale = self.stale()

        tor_nodes = {
            address: record
            for address, record in self.nodes.items()
            if record.get("tor")
        }

        ipv4_nodes = {
            address: record
            for address, record in self.nodes.items()
            if record.get("network") == "ipv4"
        }

        ipv6_nodes = {
            address: record
            for address, record in self.nodes.items()
            if record.get("network") == "ipv6"
        }

        countries = {
            record.get("country")
            for record in self.nodes.values()
            if record.get("country")
        }

        asns = {
            record.get("asn")
            for record in self.nodes.values()
            if record.get("asn")
        }

        return {
            "timestamp": now,
            "updated_at": utc_iso(now),
            "total_known_nodes": len(self.nodes),
            "reachable_now": len(reachable_now),
            "unreachable_now": len(unreachable_now),
            "reachable_24h": len(reachable_24h),
            "stale_nodes": len(stale),
            "tor_nodes": len(tor_nodes),
            "ipv4_nodes": len(ipv4_nodes),
            "ipv6_nodes": len(ipv6_nodes),
            "countries_count": len(countries),
            "asns_count": len(asns),
            "latest_height": self.latest_height(),
            "queue_size": len(self.queue)
        }

    def build_24h_snapshot(self) -> dict[str, Any]:
        now = utc_now()

        return {
            "source": "zzx-labs-bitnodes-persistent-state",
            "timestamp": now,
            "updated_at": utc_iso(now),
            "summary": self.state_summary(),
            "nodes": self.to_bitnodes_nodes("reachable_24h"),
            "records": self.reachable_24h()
        }

    def write_24h_snapshot(self) -> Path:
        snapshot = self.build_24h_snapshot()
        now = int(snapshot["timestamp"])

        t = time.gmtime(now)

        path = (
            self.snapshot_24h_dir
            / f"{t.tm_year:04d}"
            / f"{t.tm_mon:02d}"
            / f"{t.tm_mday:02d}"
            / f"{t.tm_hour:02d}"
            / f"{now}.json"
        )

        write_json(path, snapshot)

        write_json(
            self.snapshot_24h_dir / "latest.json",
            snapshot
        )

        return path

    def build_export_payload(
        self,
        mode: str = "reachable_24h"
    ) -> dict[str, Any]:

        now = utc_now()
        nodes = self.to_bitnodes_nodes(mode)

        summary = self.state_summary()

        return {
            "source": "zzx-labs-bitnodes-persistent-crawler",
            "timestamp": now,
            "updated_at": utc_iso(now),
            "mode": mode,
            "total_nodes": len(nodes),
            "reachable_nodes": summary["reachable_now"],
            "known_nodes": summary["total_known_nodes"],
            "reachable_24h": summary["reachable_24h"],
            "unreachable_now": summary["unreachable_now"],
            "stale_nodes": summary["stale_nodes"],
            "latest_height": summary["latest_height"],
            "summary": summary,
            "nodes": nodes,
            "records": {
                address: self.nodes[address]
                for address in nodes
                if address in self.nodes
            }
        }


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description="Inspect ZZX-Labs Bitnodes persistent crawler state."
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
        "command",
        choices=[
            "summary",
            "write-24h",
            "save"
        ]
    )

    args = parser.parse_args()

    state = BitnodesState(
        state_dir=args.state_dir,
        snapshot_24h_dir=args.snapshot_24h_dir
    )

    if args.command == "summary":
        print(
            json.dumps(
                state.state_summary(),
                indent=2,
                ensure_ascii=False
            )
        )

        return 0

    if args.command == "write-24h":
        path = state.write_24h_snapshot()

        print(path)

        return 0

    if args.command == "save":
        state.save()

        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())