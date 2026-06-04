#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"

SCHEMA = "zzx-bitnodes-vector-types-v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    text = json.dumps(
        payload,
        ensure_ascii=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
        sort_keys=not compact,
    )

    path.write_text(text + "\n", encoding="utf-8")


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


VECTOR_TYPES: dict[str, dict[str, Any]] = {
    "duplicate-location": {
        "id": "duplicate-location",
        "label": "Duplicate IP / Multiple Nodes at Location",
        "description": "Two or more advertised nodes share the same rounded map coordinate.",
        "color": "#d95c5c",
        "symbol": "◎",
        "shape": "double-ring",
        "priority": 95,
        "kind": "status",
    },
    "not-yet-synced": {
        "id": "not-yet-synced",
        "label": "Not Yet Synced",
        "description": "Node reports a block height below the current observed chain tip.",
        "color": "#9d67ad",
        "symbol": "△",
        "shape": "triangle",
        "priority": 75,
        "kind": "status",
    },
    "synced-under-10m": {
        "id": "synced-under-10m",
        "label": "Synced / Uptime Less Than 10m",
        "description": "Node appears synced but has less than ten minutes of observed uptime.",
        "color": "#edf7b9",
        "symbol": "·",
        "shape": "small-dot",
        "priority": 45,
        "kind": "status",
    },
    "synced-10m-plus": {
        "id": "synced-10m-plus",
        "label": "Synced / Uptime Over 10m",
        "description": "Node is synced with more than ten minutes of observed uptime.",
        "color": "#e6a42b",
        "symbol": "●",
        "shape": "dot",
        "priority": 55,
        "kind": "status",
    },
    "stable-48h-plus": {
        "id": "stable-48h-plus",
        "label": "Synced / Uptime Over 48h",
        "description": "Node is synced with more than forty-eight hours of observed uptime.",
        "color": "#c0d674",
        "symbol": "⬢",
        "shape": "hex",
        "priority": 65,
        "kind": "status",
    },
    "stable-1w-plus": {
        "id": "stable-1w-plus",
        "label": "Synced / Uptime Over 1 Week",
        "description": "Node is synced with more than one week of observed uptime.",
        "color": "#9fdb6d",
        "symbol": "◆",
        "shape": "diamond",
        "priority": 70,
        "kind": "status",
    },
    "i2p": {
        "id": "i2p",
        "label": "I2P Node",
        "description": "Node is reachable through the I2P overlay network.",
        "color": "#b889ff",
        "symbol": "I",
        "shape": "square",
        "priority": 82,
        "kind": "network",
    },
    "tor": {
        "id": "tor",
        "label": "Tor Node",
        "description": "Node is reachable through the Tor onion overlay network.",
        "color": "#9d67ad",
        "symbol": "T",
        "shape": "square",
        "priority": 83,
        "kind": "network",
    },
    "suspected-vpn": {
        "id": "suspected-vpn",
        "label": "Suspected VPN Node",
        "description": "Node is associated with VPN-like provider, ASN, or heuristic signals.",
        "color": "#e6a42b",
        "symbol": "V",
        "shape": "badge",
        "priority": 72,
        "kind": "intelligence",
    },
    "suspected-proxy": {
        "id": "suspected-proxy",
        "label": "Suspected Proxy Node",
        "description": "Node is associated with proxy-like provider, ASN, or heuristic signals.",
        "color": "#d9a65c",
        "symbol": "P",
        "shape": "badge",
        "priority": 73,
        "kind": "intelligence",
    },
    "became-unreachable": {
        "id": "became-unreachable",
        "label": "Node Became Unreachable",
        "description": "Node was previously known but failed the latest reachability check.",
        "color": "#d95c5c",
        "symbol": "×",
        "shape": "x",
        "priority": 85,
        "kind": "status",
    },
    "unknown": {
        "id": "unknown",
        "label": "Unknown / Unclassified",
        "description": "Node does not yet have enough telemetry for reliable classification.",
        "color": "#8c927e",
        "symbol": "?",
        "shape": "dot",
        "priority": 10,
        "kind": "status",
    },
}


OWNER_SYMBOLS: dict[str, dict[str, Any]] = {
    "public": {
        "id": "public",
        "label": "Public / Residential / Civilian",
        "symbol": "●",
        "shape": "circle",
        "stroke": "#c0d674",
        "fill": "#c0d674",
        "description": "Ordinary public internet, residential, or civilian node classification.",
    },
    "private": {
        "id": "private",
        "label": "Private Company / Commercial Network",
        "symbol": "■",
        "shape": "square",
        "stroke": "#70b7ff",
        "fill": "#70b7ff",
        "description": "Commercial, enterprise, hosting, or privately operated network.",
    },
    "government": {
        "id": "government",
        "label": "Government",
        "symbol": "◆",
        "shape": "diamond",
        "stroke": "#edf7b9",
        "fill": "#edf7b9",
        "description": "Government-associated organization, ASN, domain, or attribution match.",
    },
    "military": {
        "id": "military",
        "label": "Military / Defense",
        "symbol": "★",
        "shape": "star",
        "stroke": "#c0d674",
        "fill": "#c0d674",
        "description": "Military, defense, or armed-forces-associated network attribution.",
    },
    "university": {
        "id": "university",
        "label": "University / Academia / Institute",
        "symbol": "▲",
        "shape": "triangle",
        "stroke": "#e6a42b",
        "fill": "#e6a42b",
        "description": "Academic, research institute, university, or educational network attribution.",
    },
    "datacenter": {
        "id": "datacenter",
        "label": "Datacenter / Hosting / Cloud",
        "symbol": "⬡",
        "shape": "hex-outline",
        "stroke": "#70b7ff",
        "fill": "transparent",
        "description": "Hosting, cloud, VPS, CDN, colocation, or datacenter network.",
    },
    "ngo": {
        "id": "ngo",
        "label": "NGO / Nonprofit / Civic Institution",
        "symbol": "◇",
        "shape": "diamond-outline",
        "stroke": "#b889ff",
        "fill": "transparent",
        "description": "Nonprofit, civic, foundation, or public-interest institutional network.",
    },
    "unknown": {
        "id": "unknown",
        "label": "Unknown Owner Type",
        "symbol": "?",
        "shape": "circle-outline",
        "stroke": "#8c927e",
        "fill": "transparent",
        "description": "No reliable owner-type classification available.",
    },
}


def vector_type_for_node(row: Mapping[str, Any]) -> dict[str, Any]:
    network = str(row.get("network") or "").lower()
    status = str(row.get("status") or "").lower()

    if bool(row.get("duplicate_count", 1) and int(row.get("duplicate_count", 1) or 1) > 1):
        return VECTOR_TYPES["duplicate-location"]

    if status in VECTOR_TYPES:
        return VECTOR_TYPES[status]

    if network in {"tor", "i2p"}:
        return VECTOR_TYPES[network]

    if row.get("is_vpn") or row.get("suspected_vpn"):
        return VECTOR_TYPES["suspected-vpn"]

    if row.get("is_proxy") or row.get("suspected_proxy"):
        return VECTOR_TYPES["suspected-proxy"]

    if row.get("reachable") is False or row.get("reachable_now") is False:
        return VECTOR_TYPES["became-unreachable"]

    return VECTOR_TYPES["unknown"]


def owner_symbol_for_node(row: Mapping[str, Any]) -> dict[str, Any]:
    if row.get("is_military"):
        return OWNER_SYMBOLS["military"]

    if row.get("is_government"):
        return OWNER_SYMBOLS["government"]

    if row.get("is_university") or row.get("is_academic") or row.get("is_institute"):
        return OWNER_SYMBOLS["university"]

    if row.get("is_datacenter"):
        return OWNER_SYMBOLS["datacenter"]

    if row.get("is_private") or row.get("is_commercial"):
        return OWNER_SYMBOLS["private"]

    if row.get("is_ngo") or row.get("is_nonprofit"):
        return OWNER_SYMBOLS["ngo"]

    if row.get("is_public") or row.get("is_residential"):
        return OWNER_SYMBOLS["public"]

    return OWNER_SYMBOLS["unknown"]


def default_payload() -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "vector_types": VECTOR_TYPES,
        "owner_symbols": OWNER_SYMBOLS,
        "rendering": {
            "status_drives_color": True,
            "owner_type_drives_symbol": True,
            "network_overlay_may_override_shape": True,
            "higher_priority_wins": True,
            "default_vector_type": "unknown",
            "default_owner_symbol": "unknown",
        },
    }


def merge_into_settings(settings: dict[str, Any]) -> dict[str, Any]:
    output = dict(settings)
    output["vector_types"] = default_payload()
    return output


def build_standalone(
    *,
    map_dir: Path,
    live_map_dir: Path,
    compact: bool = False,
) -> dict[str, Any]:
    payload = default_payload()

    for directory in (map_dir, live_map_dir):
        write_json(directory / "data" / "vector-types.json", payload, compact=compact)

        settings_path = directory / "data" / "map-settings.json"
        settings = read_json(settings_path, fallback={})

        if not isinstance(settings, dict):
            settings = {}

        settings = merge_into_settings(settings)
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-vector-types-build-report-v1",
        "generated_at": utc_now(),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "vector_type_count": len(VECTOR_TYPES),
        "owner_symbol_count": len(OWNER_SYMBOLS),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build ZZX Bitnodes vector type, color, status, and owner-symbol metadata."
    )

    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "vector types complete: "
        f"{report['vector_type_count']} vector types, "
        f"{report['owner_symbol_count']} owner symbols"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
