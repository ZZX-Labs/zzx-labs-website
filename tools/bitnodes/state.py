#!/usr/bin/env python3
from __future__ import annotations

import json
import time
from collections import deque
from pathlib import Path
from typing import Any


DEFAULT_STATE_DIR = Path("bitcoin/bitnodes/data/state")
DEFAULT_SNAPSHOT_24H_DIR = Path("bitcoin/bitnodes/data/snapshots/24h")


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


def read_json(
    path: Path,
    default: Any
) -> Any:

    if not path.exists():
        return default

    try:
        with path.open(
            "r",
            encoding="utf-8"
        ) as handle:

            return json.load(handle)

    except Exception:
        return default


def write_json(
    path: Path,
    payload: Any,
    pretty: bool = True
) -> None:

    mkdir(path.parent)

    with path.open(
        "w",
        encoding="utf-8"
    ) as handle:

        json.dump(
            payload,
            handle,
            indent=2 if pretty else None,
            sort_keys=pretty
        )

        handle.write("\n")


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

    if ".onion" in value:
        return f"{value}:8333"

    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)

        if port.isdigit():
            return value

    if value.count(":") > 1:
        return f"[{value}]:8333"

    return f"{value}:8333"


def split_address(address: str) -> tuple[str, int | None]:

    address = normalize_address(address)

    if address.startswith("["):

        host = address.split("]:", 1)[0][1:]

        try:
            port = int(address.rsplit(":", 1)[1])
        except Exception:
            port = None

        return host, port

    if ":" in address:

        host, port_text = address.rsplit(":", 1)

        try:
            port = int(port_text)
        except Exception:
            port = None

        return host, port

    return address, None


def uptime_human(seconds: float | int | None) -> str:

    if seconds is None:
        return "0m"

    seconds = int(seconds)

    if seconds < 60:
        return f"{seconds}s"

    minutes = seconds // 60

    if minutes < 60:
        return f"{minutes}m"

    hours = minutes // 60

    if hours < 24:
        return f"{hours}h"

    days = hours // 24

    if days < 7:
        return f"{days}d"

    weeks = days // 7

    if weeks < 52:
        return f"{weeks}w"

    years = weeks // 52

    return f"{years}y"


class BitnodesState:

    def __init__(
        self,
        state_dir: Path = DEFAULT_STATE_DIR,
        snapshot_24h_dir: Path = DEFAULT_SNAPSHOT_24H_DIR
    ) -> None:

        self.state_dir = Path(state_dir)
        self.snapshot_24h_dir = Path(snapshot_24h_dir)

        mkdir(self.state_dir)
        mkdir(self.snapshot_24h_dir)

        self.nodes_path = self.state_dir / "nodes.json"
        self.queue_path = self.state_dir / "queue.json"
        self.meta_path = self.state_dir / "meta.json"

        self.nodes: dict[str, dict[str, Any]] = read_json(
            self.nodes_path,
            {}
        )

        self.queue: deque[str] = deque(
            read_json(
                self.queue_path,
                []
            )
        )

        self.meta: dict[str, Any] = read_json(
            self.meta_path,
            {}
        )

        self._queue_set = set(self.queue)

    def save(self) -> None:

        write_json(
            self.nodes_path,
            self.nodes
        )

        write_json(
            self.queue_path,
            list(self.queue)
        )

        write_json(
            self.meta_path,
            self.meta
        )

    def add_to_queue(
        self,
        addresses: list[str]
    ) -> None:

        for address in addresses:

            normalized = normalize_address(address)

            if not normalized:
                continue

            if normalized in self._queue_set:
                continue

            self.queue.append(normalized)
            self._queue_set.add(normalized)

    def pop_batch(
        self,
        size: int
    ) -> list[str]:

        batch: list[str] = []

        while self.queue and len(batch) < size:

            address = self.queue.popleft()

            self._queue_set.discard(address)

            batch.append(address)

        return batch

    def update_successes(
        self,
        nodes: dict[str, list[Any]],
        now: int | None = None
    ) -> None:

        if now is None:
            now = utc_now()

        for address, row in nodes.items():

            normalized = normalize_address(address)

            host, port = split_address(normalized)

            protocol = row[0] if len(row) > 0 else None
            agent = row[1] if len(row) > 1 else None
            connected_since = row[2] if len(row) > 2 else None
            services = row[3] if len(row) > 3 else None
            height = row[4] if len(row) > 4 else None
            hostname = row[5] if len(row) > 5 else None

            existing = self.nodes.get(normalized, {})

            first_seen = existing.get(
                "first_seen",
                now
            )

            total_uptime = existing.get(
                "total_uptime",
                0
            )

            if existing.get("reachable"):
                last_seen = existing.get(
                    "last_seen",
                    now
                )

                delta = max(
                    0,
                    now - last_seen
                )

                total_uptime += delta

            latency_ms = existing.get(
                "latency_ms",
                0.0
            )

            peer_index = existing.get(
                "peer_index",
                0.0
            )

            self.nodes[normalized] = {
                "address": normalized,
                "host": host,
                "port": port,
                "reachable": True,
                "first_seen": first_seen,
                "first_seen_iso": utc_iso(first_seen),
                "last_seen": now,
                "last_seen_iso": utc_iso(now),
                "protocol": protocol,
                "agent": agent,
                "services": services,
                "height": height,
                "hostname": hostname,
                "connected_since": connected_since,
                "latency_ms": latency_ms,
                "peer_index": peer_index,
                "success_count": existing.get("success_count", 0) + 1,
                "failure_count": existing.get("failure_count", 0),
                "reachable_24h": True,
                "total_uptime": total_uptime,
                "uptime_human": uptime_human(total_uptime),
                "tor": ".onion" in normalized,
                "city": existing.get("city"),
                "country": existing.get("country"),
                "latitude": existing.get("latitude"),
                "longitude": existing.get("longitude"),
                "timezone": existing.get("timezone"),
                "asn": existing.get("asn"),
                "organization": existing.get("organization"),
                "provider": existing.get("provider"),
                "county": existing.get("county"),
                "zip": existing.get("zip"),
                "w3w": existing.get("w3w"),
                "geohash": existing.get("geohash"),
                "asn_location": existing.get("asn_location")
            }

    def update_failures(
        self,
        addresses: list[str],
        now: int | None = None
    ) -> None:

        if now is None:
            now = utc_now()

        for address in addresses:

            normalized = normalize_address(address)

            existing = self.nodes.get(
                normalized,
                {}
            )

            if not existing:

                host, port = split_address(normalized)

                self.nodes[normalized] = {
                    "address": normalized,
                    "host": host,
                    "port": port,
                    "reachable": False,
                    "reachable_24h": False,
                    "first_seen": now,
                    "first_seen_iso": utc_iso(now),
                    "last_seen": None,
                    "last_seen_iso": None,
                    "protocol": None,
                    "agent": None,
                    "services": None,
                    "height": None,
                    "hostname": None,
                    "connected_since": None,
                    "latency_ms": 0.0,
                    "peer_index": 0.0,
                    "success_count": 0,
                    "failure_count": 1,
                    "total_uptime": 0,
                    "uptime_human": "0m",
                    "tor": ".onion" in normalized
                }

                continue

            existing["reachable"] = False
            existing["reachable_24h"] = False
            existing["failure_count"] = existing.get(
                "failure_count",
                0
            ) + 1

    def all_candidate_addresses(
        self,
        seed_addresses: list[str],
        limit: int
    ) -> list[str]:

        combined = set(seed_addresses)

        combined.update(self.nodes.keys())
        combined.update(self.queue)

        addresses = sorted(combined)

        return addresses[:limit]

    def compute_peer_index(
        self,
        node: dict[str, Any]
    ) -> float:

        uptime_bonus = min(
            100,
            node.get("total_uptime", 0) / 3600
        )

        success_bonus = min(
            100,
            node.get("success_count", 0)
        )

        height_bonus = 0

        if node.get("height"):
            height_bonus = 25

        service_bonus = 0

        if node.get("services"):
            try:
                service_bonus = min(
                    25,
                    int(node["services"]) / 1000
                )
            except Exception:
                service_bonus = 0

        latency_bonus = max(
            0,
            100 - float(node.get("latency_ms", 0.0))
        )

        return round(
            uptime_bonus
            + success_bonus
            + height_bonus
            + service_bonus
            + latency_bonus,
            2
        )

    def state_summary(self) -> dict[str, Any]:

        reachable_now = 0
        unreachable_now = 0
        reachable_24h = 0
        stale_nodes = 0

        now = utc_now()

        for node in self.nodes.values():

            if node.get("reachable"):
                reachable_now += 1
            else:
                unreachable_now += 1

            if node.get("reachable_24h"):
                reachable_24h += 1

            last_seen = node.get("last_seen")

            if last_seen:

                if (now - int(last_seen)) > 86400:
                    stale_nodes += 1

        return {
            "timestamp": now,
            "updated_at": utc_iso(now),
            "total_known_nodes": len(self.nodes),
            "reachable_now": reachable_now,
            "unreachable_now": unreachable_now,
            "reachable_24h": reachable_24h,
            "stale_nodes": stale_nodes,
            "queue_size": len(self.queue)
        }

    def leaderboard(
        self,
        limit: int = 1000
    ) -> list[dict[str, Any]]:

        output = []

        for address, node in self.nodes.items():

            peer_index = self.compute_peer_index(node)

            node["peer_index"] = peer_index

            output.append({
                "address": address,
                "peer_index": peer_index,
                "height": node.get("height"),
                "agent": node.get("agent"),
                "country": node.get("country"),
                "city": node.get("city"),
                "asn": node.get("asn"),
                "organization": node.get("organization"),
                "latency_ms": node.get("latency_ms"),
                "uptime_human": node.get("uptime_human"),
                "reachable": node.get("reachable"),
                "tor": node.get("tor")
            })

        output.sort(
            key=lambda item: item["peer_index"],
            reverse=True
        )

        return output[:limit]

    def write_24h_snapshot(self) -> Path:

        now = utc_now()

        filename = (
            f"{now}.json"
        )

        path = self.snapshot_24h_dir / filename

        payload = self.build_export_payload(
            mode="all"
        )

        write_json(
            path,
            payload
        )

        self.cleanup_old_snapshots()

        return path

    def cleanup_old_snapshots(self) -> None:

        cutoff = utc_now() - 86400

        for path in self.snapshot_24h_dir.glob("*.json"):

            try:
                timestamp = int(path.stem)
            except Exception:
                continue

            if timestamp < cutoff:

                try:
                    path.unlink()
                except Exception:
                    pass

    def to_bitnodes_nodes(
        self,
        mode: str = "all"
    ) -> dict[str, list[Any]]:

        output: dict[str, list[Any]] = {}

        now = utc_now()

        for address, node in self.nodes.items():

            reachable = node.get("reachable", False)

            if mode == "reachable" and not reachable:
                continue

            if mode == "unreachable" and reachable:
                continue

            if mode == "reachable_24h":

                last_seen = node.get("last_seen")

                if not last_seen:
                    continue

                if (now - int(last_seen)) > 86400:
                    continue

            if mode == "stale":

                last_seen = node.get("last_seen")

                if not last_seen:
                    continue

                if (now - int(last_seen)) <= 86400:
                    continue

            output[address] = [
                node.get("protocol"),
                node.get("agent"),
                node.get("connected_since"),
                node.get("services"),
                node.get("height"),
                node.get("hostname"),
                node.get("city"),
                node.get("country"),
                node.get("latitude"),
                node.get("longitude"),
                node.get("timezone"),
                node.get("asn"),
                node.get("organization"),
                node.get("provider"),
                node.get("county"),
                node.get("zip"),
                node.get("w3w"),
                node.get("geohash"),
                node.get("asn_location"),
                {
                    "latency_ms": node.get("latency_ms"),
                    "uptime_human": node.get("uptime_human"),
                    "reachable": node.get("reachable"),
                    "peer_index": node.get("peer_index"),
                    "tor": node.get("tor"),
                    "success_count": node.get("success_count"),
                    "failure_count": node.get("failure_count"),
                    "first_seen": node.get("first_seen_iso"),
                    "last_seen": node.get("last_seen_iso")
                }
            ]

        return output

    def build_export_payload(
        self,
        mode: str = "all"
    ) -> dict[str, Any]:

        summary = self.state_summary()

        nodes = self.to_bitnodes_nodes(mode)

        latest_height = 0

        for row in nodes.values():

            if len(row) > 4:

                height = row[4]

                if isinstance(height, int):
                    latest_height = max(
                        latest_height,
                        height
                    )

        countries = set()
        cities = set()
        asns = set()
        tor_nodes = 0

        for node in self.nodes.values():

            if node.get("country"):
                countries.add(node["country"])

            if node.get("city"):
                cities.add(node["city"])

            if node.get("asn"):
                asns.add(node["asn"])

            if node.get("tor"):
                tor_nodes += 1

        leaderboard = self.leaderboard(1000)

        return {
            "source": "zzx-labs-global-bitnodes-crawler",
            "timestamp": utc_now(),
            "updated_at": utc_iso(),
            "mode": mode,
            "summary": summary,
            "total_nodes": len(nodes),
            "reachable_nodes": summary["reachable_now"],
            "unreachable_nodes": summary["unreachable_now"],
            "reachable_24h": summary["reachable_24h"],
            "latest_height": latest_height,
            "countries_count": len(countries),
            "cities_count": len(cities),
            "asns_count": len(asns),
            "tor_nodes": tor_nodes,
            "leaderboard": leaderboard,
            "nodes": nodes
        }