#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"

SCHEMA = "zzx-bitnodes-vector-types-v4"


UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return " ".join(text.split())


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    return str(value or "").strip().lower() in {
        "true",
        "yes",
        "y",
        "ok",
        "1",
        "reachable",
        "connected",
        "online",
        "success",
        "flagged",
        "matched",
        "listed",
        "hit",
        "confirmed",
    }


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback

        if path.name.endswith(".gz"):
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)

        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    text = json.dumps(
        payload,
        ensure_ascii=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
        sort_keys=not compact,
        default=str,
    )

    path.write_text(text + "\n", encoding="utf-8")


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)

    return current


def first(row: Mapping[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = deep_get(row, key)
        if value not in ("", None):
            return value
    return None


def flag(row: Mapping[str, Any], keys: tuple[str, ...]) -> bool:
    return any(boolish(first(row, (key,))) for key in keys)


VECTOR_TYPES: dict[str, dict[str, Any]] = {
    "sanctioned-node": {
        "id": "sanctioned-node",
        "label": "Sanctioned / Restricted Nation Node",
        "description": "Node is marked by the local sanctioned-jurisdiction policy classifier. Red ring is mandatory.",
        "color": "#ff0000",
        "stroke": "#ff0000",
        "fill": "#ff0000",
        "symbol": "!",
        "shape": "ring-dot",
        "priority": 120,
        "kind": "policy",
        "marker_ring": True,
        "table_badge": "SANCTIONED",
        "table_badge_class": "bn-badge bn-badge-sanctioned",
    },
    "policy-restricted-node": {
        "id": "policy-restricted-node",
        "label": "Policy Restricted Node",
        "description": "Node is marked by local policy restriction rules. Red-orange ring is mandatory.",
        "color": "#ff3b30",
        "stroke": "#ff3b30",
        "fill": "#ff3b30",
        "symbol": "!",
        "shape": "ring-dot",
        "priority": 115,
        "kind": "policy",
        "marker_ring": True,
        "table_badge": "RESTRICTED",
        "table_badge_class": "bn-badge bn-badge-restricted",
    },
    "high-threat-infrastructure": {
        "id": "high-threat-infrastructure",
        "label": "Confirmed / High Threat Infrastructure",
        "description": "Defensive threat-infrastructure correlation or explicit trusted intelligence match. Not country-to-APT attribution.",
        "color": "#ff0000",
        "stroke": "#ff0000",
        "fill": "#ff0000",
        "symbol": "⚠",
        "shape": "ring-triangle",
        "priority": 110,
        "kind": "threat",
        "marker_ring": True,
        "table_badge": "THREAT",
        "table_badge_class": "bn-badge bn-badge-threat-high",
    },
    "confirmed-threat": {
        "id": "confirmed-threat",
        "label": "Confirmed Intelligence Match",
        "description": "Explicit trusted intelligence-feed or confirmed source-metadata match.",
        "color": "#ff0000",
        "stroke": "#ff0000",
        "fill": "#ff0000",
        "symbol": "C",
        "shape": "ring-square",
        "priority": 112,
        "kind": "threat",
        "marker_ring": True,
        "table_badge": "CONFIRMED",
        "table_badge_class": "bn-badge bn-badge-threat-confirmed",
    },
    "duplicate-location": {
        "id": "duplicate-location",
        "label": "Duplicate IP / Multiple Nodes at Location",
        "description": "Two or more advertised nodes share the same rounded map coordinate.",
        "color": "#d95c5c",
        "stroke": "#d95c5c",
        "fill": "#d95c5c",
        "symbol": "◎",
        "shape": "double-ring",
        "priority": 95,
        "kind": "status",
    },
    "became-unreachable": {
        "id": "became-unreachable",
        "label": "Node Became Unreachable",
        "description": "Node was previously known but failed the latest reachability check.",
        "color": "#d95c5c",
        "stroke": "#d95c5c",
        "fill": "#d95c5c",
        "symbol": "×",
        "shape": "x",
        "priority": 85,
        "kind": "status",
    },
    "unreachable": {
        "id": "unreachable",
        "label": "Unreachable",
        "description": "Node failed the latest reachability check.",
        "color": "#d95c5c",
        "stroke": "#d95c5c",
        "fill": "#d95c5c",
        "symbol": "×",
        "shape": "x",
        "priority": 85,
        "kind": "status",
    },
    "not-yet-synced": {
        "id": "not-yet-synced",
        "label": "Not Yet Synced",
        "description": "Node reports a block height below the current observed chain tip.",
        "color": "#9d67ad",
        "stroke": "#9d67ad",
        "fill": "#9d67ad",
        "symbol": "△",
        "shape": "triangle",
        "priority": 75,
        "kind": "status",
    },
    "reachable-now": {
        "id": "reachable-now",
        "label": "Reachable Now",
        "description": "Node was reachable in the latest crawl.",
        "color": "#c0d674",
        "stroke": "#c0d674",
        "fill": "#c0d674",
        "symbol": "●",
        "shape": "dot",
        "priority": 70,
        "kind": "status",
    },
    "reachable-24h": {
        "id": "reachable-24h",
        "label": "Reachable Within 24H",
        "description": "Node was seen during the 24-hour rolling window.",
        "color": "#e6a42b",
        "stroke": "#e6a42b",
        "fill": "#e6a42b",
        "symbol": "●",
        "shape": "dot",
        "priority": 50,
        "kind": "status",
    },
    "stable-1w-plus": {
        "id": "stable-1w-plus",
        "label": "Synced / Uptime Over 1 Week",
        "description": "Node is synced with more than one week of observed uptime.",
        "color": "#9fdb6d",
        "stroke": "#9fdb6d",
        "fill": "#9fdb6d",
        "symbol": "◆",
        "shape": "diamond",
        "priority": 70,
        "kind": "status",
    },
    "stable-48h-plus": {
        "id": "stable-48h-plus",
        "label": "Synced / Uptime Over 48h",
        "description": "Node is synced with more than forty-eight hours of observed uptime.",
        "color": "#c0d674",
        "stroke": "#c0d674",
        "fill": "#c0d674",
        "symbol": "⬢",
        "shape": "hex",
        "priority": 65,
        "kind": "status",
    },
    "synced-10m-plus": {
        "id": "synced-10m-plus",
        "label": "Synced / Uptime Over 10m",
        "description": "Node is synced with more than ten minutes of observed uptime.",
        "color": "#e6a42b",
        "stroke": "#e6a42b",
        "fill": "#e6a42b",
        "symbol": "●",
        "shape": "dot",
        "priority": 55,
        "kind": "status",
    },
    "synced-under-10m": {
        "id": "synced-under-10m",
        "label": "Synced / Uptime Less Than 10m",
        "description": "Node appears synced but has less than ten minutes of observed uptime.",
        "color": "#edf7b9",
        "stroke": "#edf7b9",
        "fill": "#edf7b9",
        "symbol": "·",
        "shape": "small-dot",
        "priority": 45,
        "kind": "status",
    },
    "synced": {
        "id": "synced",
        "label": "Synced",
        "description": "Node appears reachable/synced without enough uptime metadata for a higher tier.",
        "color": "#edf7b9",
        "stroke": "#edf7b9",
        "fill": "#edf7b9",
        "symbol": "●",
        "shape": "dot",
        "priority": 45,
        "kind": "status",
    },
    "unknown": {
        "id": "unknown",
        "label": "Unknown / Unclassified",
        "description": "Node does not yet have enough telemetry for reliable classification.",
        "color": "#8c927e",
        "stroke": "#8c927e",
        "fill": "#8c927e",
        "symbol": "?",
        "shape": "dot",
        "priority": 10,
        "kind": "status",
    },
}


NETWORK_TYPES: dict[str, dict[str, Any]] = {
    "ipv4": {
        "id": "ipv4",
        "label": "IPv4 Node",
        "description": "IPv4 Bitcoin P2P endpoint.",
        "color": "#c0d674",
        "symbol": "4",
        "shape": "circle",
        "priority": 50,
        "kind": "network",
    },
    "ipv6": {
        "id": "ipv6",
        "label": "IPv6 Node",
        "description": "IPv6 Bitcoin P2P endpoint.",
        "color": "#70b7ff",
        "symbol": "6",
        "shape": "circle",
        "priority": 52,
        "kind": "network",
    },
    "cjdns": {
        "id": "cjdns",
        "label": "CJDNS Node",
        "description": "CJDNS/fc00::/8 overlay-style IPv6 endpoint.",
        "color": "#00d1b2",
        "symbol": "C",
        "shape": "circle",
        "priority": 58,
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
        "symbolic_coordinate": {"latitude": 0.0, "longitude": -32.0},
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
        "symbolic_coordinate": {"latitude": 0.0, "longitude": 32.0},
    },
    "dns": {
        "id": "dns",
        "label": "DNS Hostname Node",
        "description": "Hostname endpoint whose resolved address family was not carried into this vector record.",
        "color": "#edf7b9",
        "symbol": "D",
        "shape": "circle",
        "priority": 35,
        "kind": "network",
    },
    "unknown": {
        "id": "unknown",
        "label": "Unknown Network",
        "description": "Network family could not be classified.",
        "color": "#8c927e",
        "symbol": "?",
        "shape": "circle-outline",
        "priority": 10,
        "kind": "network",
    },
}


INTELLIGENCE_TYPES: dict[str, dict[str, Any]] = {
    "suspected-vpn": {
        "id": "suspected-vpn",
        "label": "VPN / Suspected VPN Node",
        "description": "Node is associated with VPN-like provider, ASN, or heuristic signals.",
        "color": "#e6a42b",
        "symbol": "V",
        "shape": "badge",
        "priority": 72,
        "kind": "intelligence",
    },
    "suspected-proxy": {
        "id": "suspected-proxy",
        "label": "Proxy / Suspected Proxy Node",
        "description": "Node is associated with proxy-like provider, ASN, or heuristic signals.",
        "color": "#d9a65c",
        "symbol": "P",
        "shape": "badge",
        "priority": 73,
        "kind": "intelligence",
    },
    "datacenter": {
        "id": "datacenter",
        "label": "Datacenter / Hosting / Cloud",
        "description": "Hosting, VPS, cloud, CDN, colocation, or datacenter network.",
        "color": "#70b7ff",
        "symbol": "H",
        "shape": "hex-outline",
        "priority": 60,
        "kind": "intelligence",
    },
    "government": {
        "id": "government",
        "label": "Government Network",
        "description": "Government-associated organization, ASN, domain, or classifier hit.",
        "color": "#edf7b9",
        "symbol": "G",
        "shape": "diamond",
        "priority": 62,
        "kind": "intelligence",
    },
    "military": {
        "id": "military",
        "label": "Military / Defense Network",
        "description": "Military, defense, or armed-forces-associated network classification.",
        "color": "#c0d674",
        "symbol": "M",
        "shape": "star",
        "priority": 64,
        "kind": "intelligence",
    },
    "threat-actor-label": {
        "id": "threat-actor-label",
        "label": "Explicit Threat Actor Label",
        "description": "Actor/group label surfaced only from trusted metadata or feed fields.",
        "color": "#ff8c42",
        "symbol": "A",
        "shape": "badge",
        "priority": 90,
        "kind": "intelligence",
    },
    "known-malactor": {
        "id": "known-malactor",
        "label": "Known Malactor",
        "description": "Node matched a local known-malactor intelligence list.",
        "color": "#ff3333",
        "symbol": "K",
        "shape": "badge",
        "priority": 92,
        "kind": "intelligence",
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
        "description": "Government-associated organization, ASN, domain, or classification match.",
    },
    "military": {
        "id": "military",
        "label": "Military / Defense",
        "symbol": "★",
        "shape": "star",
        "stroke": "#c0d674",
        "fill": "#c0d674",
        "description": "Military, defense, or armed-forces-associated network classification.",
    },
    "university": {
        "id": "university",
        "label": "University / Academia / Institute",
        "symbol": "▲",
        "shape": "triangle",
        "stroke": "#e6a42b",
        "fill": "#e6a42b",
        "description": "Academic, research institute, university, or educational network classification.",
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


def threat_level(row: Mapping[str, Any]) -> str:
    return clean(first(row, (
        "threat_level",
        "tag_threat_level",
        "threat_infrastructure.threat_level",
        "tag_attribution.threat_level",
        "metadata.threat_level",
    ))).lower() or "none"


def vector_type_for_node(row: Mapping[str, Any]) -> dict[str, Any]:
    network = clean(first(row, ("network", "metadata.network", "address_family"))).lower()
    status = clean(first(row, ("status", "metadata.status"))).lower().replace("_", "-")
    level = threat_level(row)

    try:
        duplicate_count = int(float(first(row, ("duplicate_count", "metadata.duplicate_count")) or 1))
    except Exception:
        duplicate_count = 1

    if flag(row, ("is_sanctioned_node", "is_sanctioned", "sanctions_data.is_sanctioned")):
        return VECTOR_TYPES["sanctioned-node"]

    if flag(row, ("is_policy_restricted_node", "policy_restricted", "sanctions_data.is_policy_restricted")):
        return VECTOR_TYPES["policy-restricted-node"]

    if flag(row, ("confirmed_intelligence_match", "threat_infrastructure.confirmed_intelligence_match")) or level == "confirmed":
        return VECTOR_TYPES["confirmed-threat"]

    if flag(row, ("is_threat_infrastructure", "suspected_threat_infrastructure", "threat_infrastructure.is_threat_infrastructure")) or level in {"high", "medium", "low"}:
        return VECTOR_TYPES["high-threat-infrastructure"] if level in {"high", "confirmed"} else INTELLIGENCE_TYPES["threat-actor-label"]

    if duplicate_count > 1:
        return VECTOR_TYPES["duplicate-location"]

    if status in VECTOR_TYPES:
        return VECTOR_TYPES[status]

    if network in NETWORK_TYPES and network in {"tor", "i2p"}:
        return NETWORK_TYPES[network]

    if flag(row, ("is_vpn", "suspected_vpn", "vpn.is_vpn", "metadata.is_vpn")):
        return INTELLIGENCE_TYPES["suspected-vpn"]

    if flag(row, ("is_proxy", "suspected_proxy", "proxy.is_proxy", "metadata.is_proxy")):
        return INTELLIGENCE_TYPES["suspected-proxy"]

    if first(row, ("reachable", "reachable_now", "metadata.reachable")) is False:
        return VECTOR_TYPES["became-unreachable"]

    return VECTOR_TYPES["unknown"]


def owner_symbol_for_node(row: Mapping[str, Any]) -> dict[str, Any]:
    if flag(row, ("is_military", "military.is_military", "organization_data.is_military", "metadata.is_military")):
        return OWNER_SYMBOLS["military"]

    if flag(row, ("is_government", "government.is_government", "organization_data.is_government", "metadata.is_government")):
        return OWNER_SYMBOLS["government"]

    if flag(row, ("is_university", "is_academic", "is_institute", "organization_data.is_university", "metadata.is_university")):
        return OWNER_SYMBOLS["university"]

    if flag(row, ("is_datacenter", "datacenter.is_datacenter", "provider_data.is_datacenter", "metadata.is_datacenter")):
        return OWNER_SYMBOLS["datacenter"]

    if flag(row, ("is_private", "is_commercial", "organization_data.is_private", "metadata.is_private")):
        return OWNER_SYMBOLS["private"]

    if flag(row, ("is_ngo", "is_nonprofit", "organization_data.is_nonprofit", "metadata.is_nonprofit")):
        return OWNER_SYMBOLS["ngo"]

    if flag(row, ("is_public", "is_residential", "organization_data.is_public", "metadata.is_public")):
        return OWNER_SYMBOLS["public"]

    return OWNER_SYMBOLS["unknown"]


def network_type_for_node(row: Mapping[str, Any]) -> dict[str, Any]:
    network = clean(first(row, ("network", "metadata.network", "address_family"))).lower()
    return NETWORK_TYPES.get(network, NETWORK_TYPES["unknown"])


def decorate_node(row: Mapping[str, Any]) -> dict[str, Any]:
    vector_type = vector_type_for_node(row)
    owner_symbol = owner_symbol_for_node(row)
    network_type = network_type_for_node(row)

    return {
        **dict(row),
        "vector_type": vector_type["id"],
        "vector_type_label": vector_type["label"],
        "vector_type_color": vector_type["color"],
        "vector_type_symbol": vector_type["symbol"],
        "vector_type_shape": vector_type["shape"],
        "vector_type_priority": vector_type["priority"],
        "owner_symbol": owner_symbol["id"],
        "owner_symbol_label": owner_symbol["label"],
        "owner_symbol_symbol": owner_symbol["symbol"],
        "owner_symbol_shape": owner_symbol["shape"],
        "network_type": network_type["id"],
        "network_type_label": network_type["label"],
        "network_type_color": network_type["color"],
        "marker_ring": boolish(row.get("marker_ring")) or bool(vector_type.get("marker_ring")),
        "table_badge": vector_type.get("table_badge", ""),
        "table_badge_class": vector_type.get("table_badge_class", ""),
    }


def default_payload() -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "vector_types": VECTOR_TYPES,
        "network_types": NETWORK_TYPES,
        "intelligence_types": INTELLIGENCE_TYPES,
        "owner_symbols": OWNER_SYMBOLS,
        "rendering": {
            "policy_or_threat_overrides_status_color": True,
            "status_drives_default_color": True,
            "owner_type_drives_symbol": True,
            "network_overlay_may_override_shape": True,
            "higher_priority_wins": True,
            "red_ring_semantics": {
                "is_sanctioned_node": "red marker ring and SANCTIONED table badge",
                "is_policy_restricted_node": "red-orange marker ring and RESTRICTED table badge",
                "confirmed_or_high_threat": "red marker/ring and THREAT/CONFIRMED table badge",
            },
            "false_positive_control": {
                "threat_infrastructure": "defensive infrastructure correlation only",
                "threat_actor_labels": "explicit trusted metadata/feed labels only",
                "no_country_to_apt_inference": True,
            },
            "default_vector_type": "unknown",
            "default_network_type": "unknown",
            "default_owner_symbol": "unknown",
        },
    }


def merge_into_settings(settings: dict[str, Any]) -> dict[str, Any]:
    output = dict(settings)
    output["vector_types"] = default_payload()
    return output


def merge_vectors(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    output = dict(payload)
    vector_payload = default_payload()

    vectors = output.get("vectors")
    if isinstance(vectors, dict) and isinstance(vectors.get("points"), list):
        points = [
            decorate_node(point)
            if isinstance(point, Mapping)
            else point
            for point in vectors["points"]
        ]
        vectors = dict(vectors)
        vectors["points"] = points
        vectors.setdefault("vectors", {})
        if isinstance(vectors["vectors"], dict):
            vectors["vectors"]["points"] = points
        output["vectors"] = vectors

    output["vector_types"] = vector_payload

    settings = output.get("settings")
    if isinstance(settings, dict):
        output["settings"] = merge_into_settings(settings)
    else:
        output["settings"] = {"vector_types": vector_payload}

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_vectors(payload, context)


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_vectors(payload, context)


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

        vectors_path = directory / "data" / "map-vectors.json"
        vectors = read_json(vectors_path, fallback={})

        if isinstance(vectors, dict) and isinstance(vectors.get("points"), list):
            decorated = merge_vectors({"vectors": vectors}).get("vectors", vectors)
            write_json(vectors_path, decorated, compact=compact)

    return {
        "schema": "zzx-bitnodes-vector-types-build-report-v4",
        "generated_at": utc_now(),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "vector_type_count": len(VECTOR_TYPES),
        "network_type_count": len(NETWORK_TYPES),
        "intelligence_type_count": len(INTELLIGENCE_TYPES),
        "owner_symbol_count": len(OWNER_SYMBOLS),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build ZZX Bitnodes vector type, network type, policy/threat color, and owner-symbol metadata.",
        allow_abbrev=False,
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
        f"{report['network_type_count']} network types, "
        f"{report['intelligence_type_count']} intelligence types, "
        f"{report['owner_symbol_count']} owner symbols"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
