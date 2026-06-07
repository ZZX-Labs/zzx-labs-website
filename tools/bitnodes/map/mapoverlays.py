#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]

BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))
DEFAULT_MAP_DIR = BITNODES_ROOT / "maps"
DEFAULT_LIVE_MAP_DIR = BITNODES_ROOT / "live-map"

SCHEMA = "zzx-bitnodes-map-overlays-v3"


OVERLAY_ORDER = [
    "legend",
    "telemetry_hud",
    "security_hud",
    "network_filter",
    "status_filter",
    "security_filter",
    "source_badge",
    "sync_badge",
    "duplicate_badge",
    "sanctions_badge",
    "threat_badge",
    "tor_atlantic_channel",
    "i2p_indian_ocean_channel",
    "heatmap_overlay",
    "cluster_overlay",
    "attribution",
]


UNKNOWN_VALUES = {
    "",
    "unknown",
    "none",
    "null",
    "undefined",
    "—",
    "-",
    "n/a",
    "na",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


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


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return " ".join(text.split())


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        if value in ("", None):
            return fallback

        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if not math.isfinite(n):
        return fallback

    return n


def integer(value: Any, fallback: int = 0) -> int:
    n = number(value)

    if n is None:
        return fallback

    return int(n)


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    text = str(value or "").strip().lower()

    return text in {
        "true",
        "yes",
        "y",
        "ok",
        "1",
        "reachable",
        "online",
        "success",
        "flagged",
        "matched",
        "listed",
        "hit",
        "confirmed",
    }


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None

        current = current.get(part)

    return current


def first(row: Mapping[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)

        if value not in ("", None):
            return value

    return None


def vectors(payload: Mapping[str, Any]) -> dict[str, Any]:
    value = payload.get("vectors", {})
    return value if isinstance(value, dict) else {}


def points(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    vectors_payload = vectors(payload)

    for key in ("points", "results", "data", "rows"):
        value = vectors_payload.get(key)

        if isinstance(value, list):
            return [dict(row) for row in value if isinstance(row, Mapping)]

    for key in ("points", "results", "data", "rows"):
        value = payload.get(key)

        if isinstance(value, list):
            return [dict(row) for row in value if isinstance(row, Mapping)]

    geojson = payload.get("geojson")

    if isinstance(geojson, Mapping) and isinstance(geojson.get("features"), list):
        output: list[dict[str, Any]] = []

        for index, feature in enumerate(geojson["features"]):
            if not isinstance(feature, Mapping):
                continue

            props = feature.get("properties") if isinstance(feature.get("properties"), Mapping) else {}
            geom = feature.get("geometry") if isinstance(feature.get("geometry"), Mapping) else {}
            coords = geom.get("coordinates") if isinstance(geom.get("coordinates"), list) else []

            row = dict(props)
            row.setdefault("id", feature.get("id") or f"feature-{index:08d}")

            if len(coords) >= 2:
                row.setdefault("longitude", coords[0])
                row.setdefault("latitude", coords[1])

            output.append(row)

        return output

    live_map = payload.get("live_map")

    if isinstance(live_map, Mapping):
        value = live_map.get("points") or live_map.get("nodes")

        if isinstance(value, list):
            return [dict(row) for row in value if isinstance(row, Mapping)]

    return []


def count_by(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}

    for row in rows:
        value = clean(deep_get(row, key)) or "Unknown"
        counts[value] = counts.get(value, 0) + 1

    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def row_has_flag(row: Mapping[str, Any], keys: tuple[str, ...]) -> bool:
    return any(boolish(first(row, (key,))) for key in keys)


def threat_level(row: Mapping[str, Any]) -> str:
    return clean(first(row, (
        "threat_level",
        "tag_threat_level",
        "threat_infrastructure.threat_level",
        "tag_attribution.threat_level",
        "metadata.threat_level",
    ))).lower()


def sum_status(rows: list[dict[str, Any]], status: str) -> int:
    return sum(1 for row in rows if clean(row.get("status")).lower() == status)


def sum_network(rows: list[dict[str, Any]], network: str) -> int:
    return sum(1 for row in rows if clean(row.get("network")).lower() == network)


def sum_flag(rows: list[dict[str, Any]], keys: tuple[str, ...]) -> int:
    return sum(1 for row in rows if row_has_flag(row, keys))


def stable_count(rows: list[dict[str, Any]]) -> int:
    return (
        sum_status(rows, "stable-1w-plus")
        + sum_status(rows, "stable-48h-plus")
        + sum_status(rows, "synced-10m-plus")
        + sum_status(rows, "synced")
        + sum(1 for row in rows if boolish(row.get("reachable_now")))
    )


def duplicate_count(rows: list[dict[str, Any]]) -> int:
    total = sum_status(rows, "duplicate-location")

    for row in rows:
        if integer(row.get("duplicate_count"), 1) > 1:
            total += 1

    return total


def unsynced_count(rows: list[dict[str, Any]]) -> int:
    return sum_status(rows, "not-yet-synced") + sum_status(rows, "unreachable")


def sanctioned_keys() -> tuple[str, ...]:
    return (
        "is_sanctioned",
        "is_sanctioned_node",
        "sanctions_data.is_sanctioned",
        "metadata.is_sanctioned",
        "metadata.is_sanctioned_node",
    )


def restricted_keys() -> tuple[str, ...]:
    return (
        "policy_restricted",
        "is_policy_restricted_node",
        "sanctions_data.is_policy_restricted",
        "metadata.is_policy_restricted_node",
    )


def threat_keys() -> tuple[str, ...]:
    return (
        "is_threat_infrastructure",
        "suspected_threat_infrastructure",
        "threat_infrastructure.is_threat_infrastructure",
        "threat_infrastructure.suspected_threat_infrastructure",
        "metadata.is_threat_infrastructure",
    )


def confirmed_threat_keys() -> tuple[str, ...]:
    return (
        "confirmed_intelligence_match",
        "trusted_intel_feed_match",
        "threat_infrastructure.confirmed_intelligence_match",
        "threat_infrastructure.trusted_intel_feed_match",
        "metadata.confirmed_intelligence_match",
    )


def actor_keys() -> tuple[str, ...]:
    return (
        "is_threat_actor",
        "threat_actor",
        "suspected_threat_actor_group_related",
        "confirmed_threat_actor_group_match",
        "tag_attribution.suspected_threat_actor_group_related",
        "tag_attribution.confirmed_threat_actor_group_match",
        "metadata.is_threat_actor",
    )


def known_malactor_keys() -> tuple[str, ...]:
    return (
        "is_known_malactor",
        "known_malactor",
        "knownmalactor.is_known_malactor",
        "known_malactor_data.is_known_malactor",
        "metadata.is_known_malactor",
    )


def overlay_definition(
    *,
    overlay_id: str,
    label: str,
    description: str,
    kind: str,
    enabled: bool = True,
    visible: bool = True,
    position: str = "topright",
    z_index: int = 1000,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": overlay_id,
        "label": label,
        "description": description,
        "kind": kind,
        "enabled": enabled,
        "visible": visible,
        "position": position,
        "z_index": z_index,
        "payload": payload or {},
    }


def default_legend_item(key: str) -> dict[str, str]:
    defaults = {
        "reachable_now": {
            "label": "Reachable Now",
            "description": "Node was reachable in the latest crawl.",
            "color": "#c0d674",
        },
        "reachable_24h": {
            "label": "Reachable 24H",
            "description": "Node was seen within the last 24 hours.",
            "color": "#e6a42b",
        },
        "stable_48h_plus": {
            "label": "Stable 48H+",
            "description": "Synced node with observed uptime over 48 hours.",
            "color": "#c0d674",
        },
        "stable_1w_plus": {
            "label": "Stable 1W+",
            "description": "Synced node with observed uptime over 1 week.",
            "color": "#9fdb6d",
        },
        "unreachable": {
            "label": "Unreachable",
            "description": "Node failed the latest connection attempt.",
            "color": "#d95c5c",
        },
        "tor": {
            "label": "Tor",
            "description": "Onion overlay node, symbolically plotted.",
            "color": "#9d67ad",
        },
        "i2p": {
            "label": "I2P",
            "description": "I2P overlay node, symbolically plotted.",
            "color": "#b889ff",
        },
        "sanctioned": {
            "label": "Sanctioned Nation Node",
            "description": "Node is marked by the local sanctioned-jurisdiction policy classifier and receives a red ring.",
            "color": "#ff0000",
        },
        "policy_restricted": {
            "label": "Policy Restricted Node",
            "description": "Node is marked by the local policy-restricted classifier and receives a red-orange ring.",
            "color": "#ff3b30",
        },
        "threat_infrastructure": {
            "label": "Threat Infrastructure",
            "description": "Defensive threat-infrastructure correlation. Not country-to-APT attribution.",
            "color": "#ff9500",
        },
        "confirmed_threat": {
            "label": "Confirmed Intelligence Match",
            "description": "Explicit trusted intelligence feed or confirmed metadata match.",
            "color": "#ff0000",
        },
        "unknown": {
            "label": "Unknown",
            "description": "Insufficient data for classification.",
            "color": "#8c927e",
        },
    }

    return defaults.get(
        key,
        {
            "label": key.replace("-", " ").replace("_", " ").title(),
            "description": "",
            "color": "#8c927e",
        },
    )


def build_legend_payload(vectors_payload: dict[str, Any]) -> dict[str, Any]:
    legend = vectors_payload.get("legend", {})

    if not isinstance(legend, dict) or not legend:
        legend = {
            key: default_legend_item(key)
            for key in (
                "reachable_now",
                "reachable_24h",
                "stable_48h_plus",
                "stable_1w_plus",
                "unreachable",
                "tor",
                "i2p",
                "sanctioned",
                "policy_restricted",
                "threat_infrastructure",
                "confirmed_threat",
                "unknown",
            )
        }

    items = []

    for key, item in legend.items():
        if not isinstance(item, Mapping):
            item = default_legend_item(key)

        items.append(
            {
                "id": key,
                "label": clean(item.get("label")) or key.replace("-", " ").replace("_", " ").title(),
                "description": clean(item.get("description")),
                "color": clean(item.get("color")) or "#8c927e",
                "marker_ring": boolish(item.get("marker_ring")),
            }
        )

    return {
        "title": "Node Status Legend",
        "items": items,
        "red_ring_semantics": {
            "sanctioned": "red ring",
            "policy_restricted": "red-orange ring",
            "confirmed_threat": "red ring",
        },
    }


def build_telemetry_payload(rows: list[dict[str, Any]], vectors_payload: dict[str, Any]) -> dict[str, Any]:
    total = len(rows)

    networks = vectors_payload.get("network_counts")
    statuses = vectors_payload.get("status_counts")
    countries = vectors_payload.get("country_counts")

    if not isinstance(networks, dict):
        networks = count_by(rows, "network")

    if not isinstance(statuses, dict):
        statuses = count_by(rows, "status")

    if not isinstance(countries, dict):
        countries = count_by(rows, "country")

    return {
        "title": "Bitcoin Network Map HUD",
        "total_points": total,
        "stable_nodes": stable_count(rows),
        "duplicate_locations": duplicate_count(rows),
        "not_yet_synced": unsynced_count(rows),
        "ipv4_nodes": int(networks.get("ipv4", 0) or 0),
        "ipv6_nodes": int(networks.get("ipv6", 0) or 0),
        "cjdns_nodes": int(networks.get("cjdns", 0) or 0),
        "tor_nodes": int(networks.get("tor", 0) or 0),
        "i2p_nodes": int(networks.get("i2p", 0) or 0),
        "unknown_nodes": int(networks.get("unknown", 0) or 0),
        "top_countries": [
            {"country": key, "count": value}
            for key, value in list(countries.items())[:10]
        ],
        "status_counts": statuses,
        "network_counts": networks,
    }


def build_security_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    confirmed = sum_flag(rows, confirmed_threat_keys()) + sum(1 for row in rows if threat_level(row) == "confirmed")

    return {
        "title": "Security / Policy HUD",
        "sanctioned_nodes": sum_flag(rows, sanctioned_keys()),
        "policy_restricted_nodes": sum_flag(rows, restricted_keys()),
        "threat_infrastructure_nodes": sum_flag(rows, threat_keys()),
        "confirmed_threat_nodes": confirmed,
        "threat_actor_label_nodes": sum_flag(rows, actor_keys()),
        "known_malactor_nodes": sum_flag(rows, known_malactor_keys()),
        "warning": "Threat layers are defensive infrastructure/feed correlations. Actor labels require explicit trusted metadata.",
        "false_positive_control": {
            "no_country_to_apt_inference": True,
            "confirmed_requires_trusted_feed_or_explicit_metadata": True,
        },
    }


def build_filter_payload(rows: list[dict[str, Any]], key: str, title: str) -> dict[str, Any]:
    counts = count_by(rows, key)

    return {
        "title": title,
        "key": key,
        "options": [
            {
                "value": value,
                "label": (
                    value.replace("-", " ").replace("_", " ").title()
                    if key == "status"
                    else value.upper()
                    if key == "network"
                    else value
                ),
                "count": count,
            }
            for value, count in counts.items()
        ],
    }


def build_security_filter_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    options = [
        ("sanctioned", "Sanctioned", sum_flag(rows, sanctioned_keys()), list(sanctioned_keys()), "#ff0000"),
        ("policy_restricted", "Policy Restricted", sum_flag(rows, restricted_keys()), list(restricted_keys()), "#ff3b30"),
        ("threat_infrastructure", "Threat Infrastructure", sum_flag(rows, threat_keys()), list(threat_keys()), "#ff9500"),
        ("confirmed_threat", "Confirmed Intelligence Match", sum_flag(rows, confirmed_threat_keys()), list(confirmed_threat_keys()), "#ff0000"),
        ("threat_actor", "Threat Actor Label", sum_flag(rows, actor_keys()), list(actor_keys()), "#ff8c42"),
        ("known_malactor", "Known Malactor", sum_flag(rows, known_malactor_keys()), list(known_malactor_keys()), "#ff3333"),
    ]

    return {
        "title": "Security / Policy Filters",
        "options": [
            {
                "value": value,
                "label": label,
                "count": count,
                "filter_type": "truthy-any",
                "filter_keys": keys,
                "color": color,
            }
            for value, label, count, keys, color in options
        ],
    }


def build_source_payload(payload: dict[str, Any], vectors_payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": clean(vectors_payload.get("source")) or clean(payload.get("source")) or "zzxbitnodes",
        "generated_at": clean(vectors_payload.get("generated_at")) or clean(vectors_payload.get("updated_at")),
        "schema": clean(vectors_payload.get("schema")),
        "point_count": integer(vectors_payload.get("point_count") or vectors_payload.get("total_points"), 0),
        "input_mode": clean(vectors_payload.get("input_mode")) or clean(payload.get("input_mode")),
    }


def build_sync_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    heights = [
        integer(row.get("height"), 0)
        for row in rows
        if number(row.get("height"), None) is not None
    ]

    max_height = max(heights) if heights else 0
    min_height = min(heights) if heights else 0

    return {
        "title": "Sync State",
        "max_height": max_height,
        "min_height": min_height,
        "height_spread": max(0, max_height - min_height),
        "stable_nodes": stable_count(rows),
        "not_yet_synced": unsynced_count(rows),
        "synced": sum_status(rows, "synced"),
        "synced_10m_plus": sum_status(rows, "synced-10m-plus"),
        "stable_48h_plus": sum_status(rows, "stable-48h-plus"),
        "stable_1w_plus": sum_status(rows, "stable-1w-plus"),
    }


def build_duplicate_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    duplicates = [
        row for row in rows
        if clean(row.get("status")).lower() == "duplicate-location"
        or integer(row.get("duplicate_count"), 1) > 1
    ]

    top = sorted(
        duplicates,
        key=lambda row: (
            -integer(row.get("duplicate_count"), 1),
            clean(row.get("country")),
            clean(row.get("city")),
        ),
    )[:50]

    return {
        "title": "Duplicate Location Intelligence",
        "duplicate_points": len(duplicates),
        "top_duplicates": [
            {
                "address": clean(row.get("address")),
                "city": clean(row.get("city")),
                "country": clean(row.get("country")),
                "duplicate_count": integer(row.get("duplicate_count"), 1),
                "latitude": number(row.get("latitude")),
                "longitude": number(row.get("longitude")),
            }
            for row in top
        ],
    }


def build_sanctions_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    sanctioned = [row for row in rows if row_has_flag(row, sanctioned_keys())]
    restricted = [row for row in rows if row_has_flag(row, restricted_keys())]

    country_counts: dict[str, int] = {}

    for row in sanctioned:
        country = clean(row.get("country") or row.get("country_code")) or "Unknown"
        country_counts[country] = country_counts.get(country, 0) + 1

    return {
        "title": "Sanctions / Policy Watch",
        "sanctioned_nodes": len(sanctioned),
        "policy_restricted_nodes": len(restricted),
        "red_ring_enabled": True,
        "top_sanctioned_countries": [
            {"country": country, "count": count}
            for country, count in sorted(country_counts.items(), key=lambda item: (-item[1], item[0]))[:25]
        ],
        "note": "Sanctioned nodes are clearly marked with a red map ring and SANCTIONED table badge.",
    }


def build_threat_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    threat_rows = [
        row for row in rows
        if row_has_flag(row, threat_keys()) or row_has_flag(row, confirmed_threat_keys()) or threat_level(row) in {"confirmed", "high", "medium", "low"}
    ]

    level_counts: dict[str, int] = {}

    for row in threat_rows:
        level = threat_level(row) or "unknown"
        level_counts[level] = level_counts.get(level, 0) + 1

    return {
        "title": "Threat Infrastructure Correlation",
        "threat_nodes": len(threat_rows),
        "confirmed_threat_nodes": sum_flag(rows, confirmed_threat_keys()),
        "threat_actor_label_nodes": sum_flag(rows, actor_keys()),
        "known_malactor_nodes": sum_flag(rows, known_malactor_keys()),
        "threat_level_counts": dict(sorted(level_counts.items(), key=lambda item: (-item[1], item[0]))),
        "warning": "This overlay does not infer APT attribution from country, ASN, provider, VPN/proxy/Tor/I2P usage, or hosting status alone.",
    }


def build_overlay_channel_payload(
    *,
    overlay_id: str,
    label: str,
    network: str,
    latitude: float,
    longitude: float,
    color: str,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    network_rows = [
        row for row in rows
        if clean(row.get("network")).lower() == network
    ]

    return {
        "id": overlay_id,
        "label": label,
        "network": network,
        "latitude": latitude,
        "longitude": longitude,
        "color": color,
        "count": len(network_rows),
        "note": "Overlay-network nodes are intentionally plotted to a symbolic ocean channel because physical attribution is limited.",
        "points": [
            {
                "address": clean(row.get("address")),
                "agent": clean(row.get("agent")),
                "height": integer(row.get("height"), 0),
                "status": clean(row.get("status")) or "unknown",
                "threat_level": threat_level(row) or "none",
            }
            for row in network_rows[:250]
        ],
    }


def build_heatmap_payload(vectors_payload: dict[str, Any]) -> dict[str, Any]:
    heatmap = vectors_payload.get("heatmap", [])

    if not isinstance(heatmap, list):
        heatmap = []

    return {
        "title": "Node Density Heatmap",
        "enabled": bool(heatmap),
        "point_count": len(heatmap),
        "radius": 24,
        "blur": 18,
        "max_zoom": 8,
        "points": heatmap,
    }


def build_cluster_payload(vectors_payload: dict[str, Any]) -> dict[str, Any]:
    clusters = vectors_payload.get("clusters", {})

    if not isinstance(clusters, dict):
        clusters = {}

    return {
        "title": "Node Clusters",
        "enabled": bool(clusters),
        "precision_levels": sorted(clusters.keys()),
        "clusters": clusters,
    }


def build_attribution_payload(payload: dict[str, Any]) -> dict[str, Any]:
    settings = payload.get("settings", {})
    openstreetmaps = payload.get("openstreetmaps", {})

    if not isinstance(settings, dict):
        settings = {}

    if not isinstance(openstreetmaps, dict):
        openstreetmaps = {}

    return {
        "title": "Map Attribution",
        "tile_attribution": clean(settings.get("tile_attribution")) or "© OpenStreetMap contributors",
        "tile_provider": clean(settings.get("tile_provider")) or "openstreetmap",
        "engine": clean(openstreetmaps.get("engine")) or "leaflet",
        "project": "ZZX-Labs R&D Bitnodes Mirror",
        "data_warning": "Geo/security overlays are enrichment and policy classification outputs, not legal or intelligence determinations.",
    }


def build_overlays(payload: dict[str, Any]) -> dict[str, Any]:
    rows = points(payload)
    vectors_payload = vectors(payload)

    overlays = [
        overlay_definition(
            overlay_id="legend",
            label="Legend",
            description="Color, status, sanctions, and threat marker legend.",
            kind="legend",
            position="bottomright",
            z_index=1200,
            payload=build_legend_payload(vectors_payload),
        ),
        overlay_definition(
            overlay_id="telemetry_hud",
            label="Telemetry HUD",
            description="Live map counters and network category totals.",
            kind="hud",
            position="topleft",
            z_index=1250,
            payload=build_telemetry_payload(rows, vectors_payload),
        ),
        overlay_definition(
            overlay_id="security_hud",
            label="Security HUD",
            description="Sanctions, policy, defensive threat-infrastructure, and explicit actor-label counters.",
            kind="hud",
            position="topleft",
            z_index=1240,
            payload=build_security_payload(rows),
        ),
        overlay_definition(
            overlay_id="network_filter",
            label="Network Filter",
            description="IPv4, IPv6, CJDNS, Tor, I2P, and unknown network filters.",
            kind="filter",
            position="topright",
            z_index=1300,
            payload=build_filter_payload(rows, "network", "Network Filters"),
        ),
        overlay_definition(
            overlay_id="status_filter",
            label="Status Filter",
            description="Sync, uptime, duplicate, and unknown status filters.",
            kind="filter",
            position="topright",
            z_index=1290,
            payload=build_filter_payload(rows, "status", "Status Filters"),
        ),
        overlay_definition(
            overlay_id="security_filter",
            label="Security / Policy Filter",
            description="Sanctioned, restricted, threat, actor-label, and known-malactor filters.",
            kind="filter",
            position="topright",
            z_index=1280,
            payload=build_security_filter_payload(rows),
        ),
        overlay_definition(
            overlay_id="source_badge",
            label="Source Badge",
            description="Selected crawler source and map build metadata.",
            kind="badge",
            position="bottomleft",
            z_index=1150,
            payload=build_source_payload(payload, vectors_payload),
        ),
        overlay_definition(
            overlay_id="sync_badge",
            label="Sync Badge",
            description="Observed chain-height and sync-state summary.",
            kind="badge",
            position="bottomleft",
            z_index=1140,
            payload=build_sync_payload(rows),
        ),
        overlay_definition(
            overlay_id="duplicate_badge",
            label="Duplicate Location Badge",
            description="Duplicate coordinate/IP-location summary.",
            kind="badge",
            position="bottomleft",
            z_index=1130,
            payload=build_duplicate_payload(rows),
        ),
        overlay_definition(
            overlay_id="sanctions_badge",
            label="Sanctions Badge",
            description="Sanctioned and policy-restricted node summary.",
            kind="badge",
            position="bottomleft",
            z_index=1120,
            payload=build_sanctions_payload(rows),
        ),
        overlay_definition(
            overlay_id="threat_badge",
            label="Threat Badge",
            description="Defensive threat infrastructure and trusted feed correlation summary.",
            kind="badge",
            position="bottomleft",
            z_index=1110,
            payload=build_threat_payload(rows),
        ),
        overlay_definition(
            overlay_id="tor_atlantic_channel",
            label="Tor Atlantic Channel",
            description="Symbolic Atlantic plotting channel for Onion network nodes.",
            kind="overlay-channel",
            position="map",
            z_index=400,
            payload=build_overlay_channel_payload(
                overlay_id="tor_atlantic_channel",
                label="Tor Atlantic Channel",
                network="tor",
                latitude=0.0,
                longitude=-32.0,
                color="#9d67ad",
                rows=rows,
            ),
        ),
        overlay_definition(
            overlay_id="i2p_indian_ocean_channel",
            label="I2P Indian Ocean Channel",
            description="Symbolic Indian Ocean plotting channel for I2P nodes.",
            kind="overlay-channel",
            position="map",
            z_index=390,
            payload=build_overlay_channel_payload(
                overlay_id="i2p_indian_ocean_channel",
                label="I2P Indian Ocean Channel",
                network="i2p",
                latitude=0.0,
                longitude=32.0,
                color="#b889ff",
                rows=rows,
            ),
        ),
        overlay_definition(
            overlay_id="heatmap_overlay",
            label="Heatmap Overlay",
            description="Weighted density overlay for node concentration.",
            kind="heatmap",
            position="map",
            enabled=bool(vectors_payload.get("heatmap")),
            visible=False,
            z_index=250,
            payload=build_heatmap_payload(vectors_payload),
        ),
        overlay_definition(
            overlay_id="cluster_overlay",
            label="Cluster Overlay",
            description="Zoom-level cluster overlays generated from rounded coordinates.",
            kind="cluster",
            position="map",
            enabled=bool(vectors_payload.get("clusters")),
            visible=False,
            z_index=260,
            payload=build_cluster_payload(vectors_payload),
        ),
        overlay_definition(
            overlay_id="attribution",
            label="Attribution",
            description="Map tile, engine, data caution, and project attribution.",
            kind="attribution",
            position="bottomright",
            z_index=1000,
            payload=build_attribution_payload(payload),
        ),
    ]

    overlay_map = {item["id"]: item for item in overlays}

    ordered = [
        overlay_map[overlay_id]
        for overlay_id in OVERLAY_ORDER
        if overlay_id in overlay_map
    ]

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "overlay_order": OVERLAY_ORDER,
        "overlays": ordered,
        "point_count": len(rows),
        "red_ring_semantics": {
            "sanctions_badge": "sanctioned nodes are red-ringed and table-badged",
            "threat_badge": "confirmed/high threat infrastructure receives red or threat marker emphasis",
        },
        "false_positive_control": {
            "threat_infrastructure": "defensive correlation only",
            "threat_actor_labels": "explicit trusted metadata/feed labels only",
            "no_country_to_apt_inference": True,
        },
    }


def merge_overlays(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    output = dict(payload)
    overlays = build_overlays(output)

    output["overlays"] = overlays

    settings = dict(output.get("settings", {}))
    settings["overlays"] = overlays
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_overlays(payload, context)


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_overlays(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})

    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
        "openstreetmaps": read_json(map_dir / "data" / "openstreetmaps.json", fallback={}),
    }

    merged = merge_overlays(payload)
    overlays = merged["overlays"]

    for directory in (map_dir, live_map_dir):
        write_json(directory / "data" / "map-overlays.json", overlays, compact=compact)

        settings_path = directory / "data" / "map-settings.json"
        settings = read_json(settings_path, fallback={})

        if not isinstance(settings, dict):
            settings = {}

        settings["overlays"] = overlays
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapoverlays-build-report-v3",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "overlay_count": len(overlays["overlays"]),
        "point_count": len(points(payload)),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map overlay HUD, legend, filter, heatmap, cluster, sanctions, threat, and attribution metadata.",
        allow_abbrev=False,
    )

    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map overlays complete: "
        f"{report['overlay_count']} overlays, "
        f"points={report['point_count']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
