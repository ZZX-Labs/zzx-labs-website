#!/usr/bin/env python3
from __future__ import annotations

import ipaddress
import json
import math
import time
from collections import deque
from pathlib import Path
from typing import Any


DEFAULT_STATE_DIR = Path("bitcoin/bitnodes/data/state")
DEFAULT_SNAPSHOT_24H_DIR = Path("bitcoin/bitnodes/data/snapshots/24h")
DEFAULT_PORT = 8333


def utc_now() -> int:
    return int(time.time())


def utc_iso(ts: int | None = None) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts or utc_now()))


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def write_json(path: Path, payload: Any, pretty: bool = True) -> None:
    mkdir(path.parent)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
            ensure_ascii=False,
            sort_keys=pretty,
        )
        handle.write("\n")


def safe_int(value: Any, default: int | None = None) -> int | None:
    try:
        if value in ("", None):
            return default
        return int(value)
    except Exception:
        return default


def safe_float(value: Any, default: float | None = None) -> float | None:
    try:
        if value in ("", None):
            return default
        n = float(value)
        if math.isnan(n) or math.isinf(n):
            return default
        return n
    except Exception:
        return default


def strip_ipv6_brackets(host: str) -> str:
    value = str(host or "").strip()

    if value.startswith("[") and "]" in value:
        return value[1:value.index("]")]

    return value


def is_ipv6_literal(host: str) -> bool:
    try:
        return isinstance(ipaddress.ip_address(strip_ipv6_brackets(host)), ipaddress.IPv6Address)
    except Exception:
        return False


def parse_address(address: str, default_port: int = DEFAULT_PORT) -> tuple[str | None, int]:
    value = str(address or "").strip()

    if not value:
        return None, default_port

    if value.startswith("[") and "]:" in value:
        host = value.split("]:", 1)[0][1:]
        port = safe_int(value.rsplit(":", 1)[1], default_port) or default_port
        return host, port

    if value.startswith("[") and value.endswith("]"):
        return value[1:-1], default_port

    lower = value.lower()

    if lower.endswith(".onion") or lower.endswith(".i2p"):
        return value, default_port

    if ".onion:" in lower or ".i2p:" in lower:
        host, port_text = value.rsplit(":", 1)
        return host, safe_int(port_text, default_port) or default_port

    colon_count = value.count(":")

    if colon_count == 0:
        return value, default_port

    if colon_count == 1:
        host, port_text = value.rsplit(":", 1)
        return host, safe_int(port_text, default_port) or default_port

    possible_host, possible_port = value.rsplit(":", 1)

    if possible_port.isdigit():
        return possible_host, int(possible_port)

    return value, default_port


def normalize_address(address: str, default_port: int = DEFAULT_PORT) -> str:
    host, port = parse_address(address, default_port)

    if not host:
        return ""

    host = strip_ipv6_brackets(host)

    if is_ipv6_literal(host):
        return f"[{host}]:{port}"

    return f"{host}:{port}"


def split_address(address: str) -> tuple[str, int | None]:
    normalized = normalize_address(address)

    if normalized.startswith("["):
        host = normalized.split("]:", 1)[0][1:]
        return host, safe_int(normalized.rsplit(":", 1)[1])

    if ":" in normalized:
        host, port_text = normalized.rsplit(":", 1)
        return host, safe_int(port_text)

    return normalized, None


def classify_network(address: str) -> str:
    host, _port = split_address(address)
    host = strip_ipv6_brackets(host).lower()

    if host.endswith(".onion"):
        return "tor"

    if host.endswith(".i2p"):
        return "i2p"

    try:
        ip = ipaddress.ip_address(host)

        if ip.version == 4:
            return "ipv4"

        if ip.version == 6:
            if ip in ipaddress.ip_network("fc00::/8"):
                return "cjdns"
            return "ipv6"

    except Exception:
        pass

    return "dns" if host else "unknown"


def uptime_human(seconds: float | int | None) -> str:
    seconds = int(seconds or 0)

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

    return f"{weeks // 52}y"


def row_value(row: list[Any], index: int, default: Any = None) -> Any:
    return row[index] if len(row) > index else default


def row_metadata(row: list[Any]) -> dict[str, Any]:
    value = row[19] if len(row) > 19 and isinstance(row[19], dict) else {}
    return dict(value)


class BitnodesState:

    def __init__(
        self,
        state_dir: Path = DEFAULT_STATE_DIR,
        snapshot_24h_dir: Path = DEFAULT_SNAPSHOT_24H_DIR,
    ) -> None:
        self.state_dir = Path(state_dir)
        self.snapshot_24h_dir = Path(snapshot_24h_dir)

        mkdir(self.state_dir)
        mkdir(self.snapshot_24h_dir)

        self.nodes_path = self.state_dir / "nodes.json"
        self.queue_path = self.state_dir / "queue.json"
        self.meta_path = self.state_dir / "meta.json"

        self.nodes: dict[str, dict[str, Any]] = read_json(self.nodes_path, {})
        self.queue: deque[str] = deque(read_json(self.queue_path, []))
        self.meta: dict[str, Any] = read_json(self.meta_path, {})

        self._queue_set = set(self.queue)

    def save(self) -> None:
        self.meta["saved_at"] = utc_iso()

        write_json(self.nodes_path, self.nodes)
        write_json(self.queue_path, list(self.queue))
        write_json(self.meta_path, self.meta)

    def add_to_queue(self, addresses: list[str]) -> None:
        added = 0

        for address in addresses:
            normalized = normalize_address(address)

            if not normalized:
                continue

            if normalized in self._queue_set:
                continue

            self.queue.append(normalized)
            self._queue_set.add(normalized)
            added += 1

        self.meta["queue_last_added"] = added
        self.meta["queue_last_updated_at"] = utc_iso()

    def pop_batch(self, size: int) -> list[str]:
        batch: list[str] = []

        while self.queue and len(batch) < size:
            address = self.queue.popleft()
            self._queue_set.discard(address)
            batch.append(address)

        self.meta["queue_last_popped"] = len(batch)
        self.meta["queue_last_popped_at"] = utc_iso()

        return batch

    def update_successes(self, nodes: dict[str, list[Any]], now: int | None = None) -> None:
        now = now or utc_now()

        for address, row in nodes.items():
            normalized = normalize_address(address)
            if not normalized:
                continue

            host, port = split_address(normalized)
            existing = self.nodes.get(normalized, {})

            first_seen = safe_int(existing.get("first_seen"), now) or now
            previous_last_seen = safe_int(existing.get("last_seen"))
            total_uptime = safe_float(existing.get("total_uptime"), 0.0) or 0.0

            if existing.get("reachable") and previous_last_seen:
                total_uptime += max(0, now - previous_last_seen)

            metadata = row_metadata(row)

            latency_ms = safe_float(
                metadata.get("latency_ms"),
                safe_float(existing.get("latency_ms"), 0.0),
            )

            network = classify_network(normalized)

            self.nodes[normalized] = {
                **existing,
                "address": normalized,
                "host": host,
                "port": port,
                "network": network,
                "reachable": True,
                "reachable_24h": True,
                "first_seen": first_seen,
                "first_seen_iso": utc_iso(first_seen),
                "last_seen": now,
                "last_seen_iso": utc_iso(now),
                "protocol": row_value(row, 0),
                "agent": row_value(row, 1),
                "connected_since": row_value(row, 2),
                "services": row_value(row, 3),
                "height": row_value(row, 4),
                "hostname": row_value(row, 5),
                "city": row_value(row, 6, existing.get("city")),
                "country": row_value(row, 7, existing.get("country")),
                "latitude": row_value(row, 8, existing.get("latitude")),
                "longitude": row_value(row, 9, existing.get("longitude")),
                "timezone": row_value(row, 10, existing.get("timezone")),
                "asn": row_value(row, 11, existing.get("asn")),
                "organization": row_value(row, 12, existing.get("organization")),
                "provider": row_value(row, 13, existing.get("provider")),
                "county": row_value(row, 14, existing.get("county")),
                "zip": row_value(row, 15, existing.get("zip")),
                "w3w": row_value(row, 16, existing.get("w3w")),
                "geohash": row_value(row, 17, existing.get("geohash")),
                "asn_location": row_value(row, 18, existing.get("asn_location")),
                "metadata": metadata,
                "latency_ms": latency_ms,
                "peer_index": safe_float(metadata.get("peer_index"), safe_float(existing.get("peer_index"), 0.0)) or 0.0,
                "success_count": safe_int(existing.get("success_count"), 0) + 1,
                "failure_count": safe_int(existing.get("failure_count"), 0) or 0,
                "total_uptime": total_uptime,
                "uptime_human": uptime_human(total_uptime),
                "tor": network == "tor",
                "i2p": network == "i2p",
                "is_tor": network == "tor",
                "is_i2p": network == "i2p",
                "is_ipv4": network == "ipv4",
                "is_ipv6": network == "ipv6",
                "is_vpn": bool(metadata.get("is_vpn") or metadata.get("vpn") or existing.get("is_vpn")),
                "is_proxy": bool(metadata.get("is_proxy") or metadata.get("proxy") or existing.get("is_proxy")),
            }

    def update_failures(self, addresses: list[str], now: int | None = None) -> None:
        now = now or utc_now()

        for address in addresses:
            normalized = normalize_address(address)
            if not normalized:
                continue

            existing = self.nodes.get(normalized, {})
            host, port = split_address(normalized)
            network = classify_network(normalized)

            first_seen = safe_int(existing.get("first_seen"), now) or now

            self.nodes[normalized] = {
                **existing,
                "address": normalized,
                "host": host,
                "port": port,
                "network": network,
                "reachable": False,
                "reachable_24h": bool(existing.get("last_seen") and now - int(existing["last_seen"]) <= 86400),
                "first_seen": first_seen,
                "first_seen_iso": utc_iso(first_seen),
                "last_failure": now,
                "last_failure_iso": utc_iso(now),
                "last_seen": existing.get("last_seen"),
                "last_seen_iso": existing.get("last_seen_iso"),
                "protocol": existing.get("protocol"),
                "agent": existing.get("agent"),
                "services": existing.get("services"),
                "height": existing.get("height"),
                "hostname": existing.get("hostname"),
                "connected_since": existing.get("connected_since"),
                "latency_ms": safe_float(existing.get("latency_ms"), 0.0) or 0.0,
                "peer_index": safe_float(existing.get("peer_index"), 0.0) or 0.0,
                "success_count": safe_int(existing.get("success_count"), 0) or 0,
                "failure_count": safe_int(existing.get("failure_count"), 0) + 1,
                "total_uptime": safe_float(existing.get("total_uptime"), 0.0) or 0.0,
                "uptime_human": uptime_human(existing.get("total_uptime")),
                "tor": network == "tor",
                "i2p": network == "i2p",
                "is_tor": network == "tor",
                "is_i2p": network == "i2p",
                "is_ipv4": network == "ipv4",
                "is_ipv6": network == "ipv6",
            }

    def all_candidate_addresses(self, seed_addresses: list[str], limit: int) -> list[str]:
        combined = set()

        for address in seed_addresses:
            normalized = normalize_address(address)
            if normalized:
                combined.add(normalized)

        combined.update(self.nodes.keys())
        combined.update(self.queue)

        addresses = sorted(combined)
        return addresses[:limit]

    def compute_peer_index(self, node: dict[str, Any]) -> float:
        total_uptime = safe_float(node.get("total_uptime"), 0.0) or 0.0
        success_count = safe_float(node.get("success_count"), 0.0) or 0.0
        failure_count = safe_float(node.get("failure_count"), 0.0) or 0.0
        latency_ms = safe_float(node.get("latency_ms"), None)

        uptime_score = min(100.0, total_uptime / 3600.0)
        reliability_total = success_count + failure_count
        reliability_score = (success_count / reliability_total) * 100.0 if reliability_total else 0.0
        height_score = 25.0 if node.get("height") else 0.0
        services_score = 25.0 if node.get("services") else 0.0

        latency_score = 0.0
        if latency_ms is not None:
            latency_score = max(0.0, 100.0 - min(100.0, latency_ms / 5.0))

        reachable_score = 50.0 if node.get("reachable") else 0.0

        return round(
            uptime_score
            + reliability_score
            + height_score
            + services_score
            + latency_score
            + reachable_score,
            4,
        )

    def state_summary(self) -> dict[str, Any]:
        reachable_now = 0
        unreachable_now = 0
        reachable_24h = 0
        stale_nodes = 0
        tor_nodes = 0
        i2p_nodes = 0
        ipv4_nodes = 0
        ipv6_nodes = 0
        vpn_nodes = 0
        proxy_nodes = 0

        now = utc_now()

        for node in self.nodes.values():
            if node.get("reachable"):
                reachable_now += 1
            else:
                unreachable_now += 1

            last_seen = safe_int(node.get("last_seen"))
            if last_seen and now - last_seen <= 86400:
                reachable_24h += 1

            if last_seen and now - last_seen > 86400:
                stale_nodes += 1

            tor_nodes += int(bool(node.get("is_tor") or node.get("tor")))
            i2p_nodes += int(bool(node.get("is_i2p") or node.get("i2p")))
            ipv4_nodes += int(bool(node.get("is_ipv4") or node.get("network") == "ipv4"))
            ipv6_nodes += int(bool(node.get("is_ipv6") or node.get("network") == "ipv6"))
            vpn_nodes += int(bool(node.get("is_vpn")))
            proxy_nodes += int(bool(node.get("is_proxy")))

        return {
            "timestamp": now,
            "updated_at": utc_iso(now),
            "total_known_nodes": len(self.nodes),
            "reachable_now": reachable_now,
            "unreachable_now": unreachable_now,
            "reachable_24h": reachable_24h,
            "stale_nodes": stale_nodes,
            "ipv4_nodes": ipv4_nodes,
            "ipv6_nodes": ipv6_nodes,
            "tor_nodes": tor_nodes,
            "i2p_nodes": i2p_nodes,
            "vpn_nodes": vpn_nodes,
            "proxy_nodes": proxy_nodes,
            "queue_size": len(self.queue),
        }

    def leaderboard(self, limit: int = 1000) -> list[dict[str, Any]]:
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
                "network": node.get("network"),
                "tor": node.get("tor"),
                "i2p": node.get("i2p"),
                "is_vpn": node.get("is_vpn"),
                "is_proxy": node.get("is_proxy"),
            })

        output.sort(key=lambda item: item["peer_index"], reverse=True)
        return output[:limit]

    def write_24h_snapshot(self) -> Path:
        now = utc_now()
        path = self.snapshot_24h_dir / f"{now}.json"
        payload = self.build_export_payload(mode="all")

        write_json(path, payload)
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

    def to_bitnodes_nodes(self, mode: str = "all") -> dict[str, list[Any]]:
        output: dict[str, list[Any]] = {}
        now = utc_now()

        for address, node in self.nodes.items():
            reachable = bool(node.get("reachable"))
            last_seen = safe_int(node.get("last_seen"))

            if mode == "reachable" and not reachable:
                continue

            if mode == "unreachable" and reachable:
                continue

            if mode == "reachable_24h":
                if not last_seen or now - last_seen > 86400:
                    continue

            if mode == "stale":
                if not last_seen or now - last_seen <= 86400:
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
                    "total_uptime": node.get("total_uptime"),
                    "reachable": node.get("reachable"),
                    "peer_index": node.get("peer_index"),
                    "tor": node.get("tor"),
                    "i2p": node.get("i2p"),
                    "is_tor": node.get("is_tor"),
                    "is_i2p": node.get("is_i2p"),
                    "is_ipv4": node.get("is_ipv4"),
                    "is_ipv6": node.get("is_ipv6"),
                    "is_vpn": node.get("is_vpn"),
                    "is_proxy": node.get("is_proxy"),
                    "success_count": node.get("success_count"),
                    "failure_count": node.get("failure_count"),
                    "first_seen": node.get("first_seen"),
                    "first_seen_iso": node.get("first_seen_iso"),
                    "last_seen": node.get("last_seen"),
                    "last_seen_iso": node.get("last_seen_iso"),
                    "last_failure": node.get("last_failure"),
                    "last_failure_iso": node.get("last_failure_iso"),
                    "network": node.get("network"),
                },
            ]

        return output

    def build_export_payload(self, mode: str = "all") -> dict[str, Any]:
        summary = self.state_summary()
        nodes = self.to_bitnodes_nodes(mode)

        latest_height = 0
        countries = set()
        cities = set()
        asns = set()

        for address, row in nodes.items():
            if len(row) > 4:
                height = row[4]
                if isinstance(height, int):
                    latest_height = max(latest_height, height)

            if len(row) > 7 and row[7]:
                countries.add(row[7])

            if len(row) > 6 and row[6]:
                cities.add(row[6])

            if len(row) > 11 and row[11]:
                asns.add(row[11])

        leaderboard = self.leaderboard(1000)

        return {
            "schema": "zzx-bitnodes-state-export-v2",
            "source": "zzx-labs-global-bitnodes-crawler",
            "timestamp": utc_now(),
            "updated_at": utc_iso(),
            "mode": mode,
            "summary": summary,
            "total_nodes": len(nodes),
            "known_nodes": summary["total_known_nodes"],
            "reachable_nodes": summary["reachable_now"],
            "unreachable_nodes": summary["unreachable_now"],
            "reachable_24h": summary["reachable_24h"],
            "stale_nodes": summary["stale_nodes"],
            "latest_height": latest_height,
            "countries_count": len(countries),
            "cities_count": len(cities),
            "asns_count": len(asns),
            "tor_nodes": summary["tor_nodes"],
            "i2p_nodes": summary["i2p_nodes"],
            "ipv4_nodes": summary["ipv4_nodes"],
            "ipv6_nodes": summary["ipv6_nodes"],
            "vpn_nodes": summary["vpn_nodes"],
            "proxy_nodes": summary["proxy_nodes"],
            "leaderboard": leaderboard,
            "nodes": nodes,
        }
