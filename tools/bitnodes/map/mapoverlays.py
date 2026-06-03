#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"


OVERLAY_ORDER = [
    "legend",
    "telemetry_hud",
    "network_filter",
    "status_filter",
    "source_badge",
    "sync_badge",
    "duplicate_badge",
    "tor_atlantic_channel",
    "i2p_indian_ocean_channel",
    "heatmap_overlay",
    "cluster_overlay",
    "attribution",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in {
        "",
        "unknown",
        "none",
        "null",
        "undefined",
        "—",
        "-",
        "n/a",
        "na",
    }:
        return ""

    return " ".join(text.split())


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if not math.isfinite(n):
        return fallback

    return n


def vectors(payload: dict[str, Any]) -> dict[str, Any]:
    value = payload.get("vectors", {})

    return value if isinstance(value, dict) else {}


def points(payload: dict[str, Any]) -> list[dict[str, Any]]:
    value = vectors(payload).get("points", [])

    return value if isinstance(value, list) else []


def count_by(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}

    for row in rows:
        value = clean(row.get(key)) or "Unknown"
        counts[value] = counts.get(value, 0) + 1

    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def sum_status(rows: list[dict[str, Any]], status: str) -> int:
    return sum(1 for row in rows if clean(row.get("status")) == status)


def sum_network(rows: list[dict[str, Any]], network: str) -> int:
    return sum(1 for row in rows if clean(row.get("network")) == network)


def stable_count(rows: list[dict[str, Any]]) -> int:
    return (
        sum_status(rows, "stable-48h-plus")
        + sum_status(rows, "synced-10m-plus")
        + sum_status(rows, "synced")
    )


def duplicate_count(rows: list[dict[str, Any]]) -> int:
    return sum_status(rows, "duplicate-location")


def unsynced_count(rows: list[dict[str, Any]]) -> int:
    return sum_status(rows, "not-yet-synced")


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


def build_legend_payload(vectors_payload: dict[str, Any]) -> dict[str, Any]:
    legend = vectors_payload.get("legend", {})

    if not isinstance(legend, dict):
        legend = {}

    return {
        "title": "Node Status Legend",
        "items": [
            {
                "id": key,
                "label": clean(item.get("label")) or key.replace("-", " ").title(),
                "description": clean(item.get("description")),
                "color": clean(item.get("color")) or "#8c927e",
            }
            for key, item in legend.items()
            if isinstance(item, dict)
        ],
    }


def build_telemetry_payload(rows: list[dict[str, Any]], vectors_payload: dict[str, Any]) -> dict[str, Any]:
    total = len(rows)
    networks = vectors_payload.get("network_counts", count_by(rows, "network"))
    statuses = vectors_payload.get("status_counts", count_by(rows, "status"))
    countries = vectors_payload.get("country_counts", count_by(rows, "country"))

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
        "ipv4_nodes": networks.get("ipv4", 0),
        "ipv6_nodes": networks.get("ipv6", 0),
        "tor_nodes": networks.get("tor", 0),
        "i2p_nodes": networks.get("i2p", 0),
        "unknown_nodes": networks.get("unknown", 0),
        "top_countries": [
            {
                "country": key,
                "count": value,
            }
            for key, value in list(countries.items())[:10]
        ],
        "status_counts": statuses,
        "network_counts": networks,
    }


def build_filter_payload(rows: list[dict[str, Any]], key: str, title: str) -> dict[str, Any]:
    counts = count_by(rows, key)

    return {
        "title": title,
        "key": key,
        "options": [
            {
                "value": value,
                "label": value.replace("-", " ").title() if key == "status" else value.upper() if key == "network" else value,
                "count": count,
            }
            for value, count in counts.items()
        ],
    }


def build_source_payload(vectors_payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": clean(vectors_payload.get("source")) or "zzxbitnodes",
        "generated_at": clean(vectors_payload.get("generated_at")),
        "schema": clean(vectors_payload.get("schema")),
        "point_count": int(number(vectors_payload.get("point_count"), 0) or 0),
    }


def build_sync_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    heights = [
        int(number(row.get("height"), 0) or 0)
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
    }


def build_duplicate_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    duplicates = [
        row for row in rows
        if clean(row.get("status")) == "duplicate-location"
        or int(number(row.get("duplicate_count"), 1) or 1) > 1
    ]

    top = sorted(
        duplicates,
        key=lambda row: (
            -int(number(row.get("duplicate_count"), 1) or 1),
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
                "duplicate_count": int(number(row.get("duplicate_count"), 1) or 1),
                "latitude": number(row.get("latitude")),
                "longitude": number(row.get("longitude")),
            }
            for row in top
        ],
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
        if clean(row.get("network")) == network
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
                "height": int(number(row.get("height"), 0) or 0),
                "status": clean(row.get("status")) or "unknown",
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

    if not isinstance(settings, dict):
        settings = {}

    openstreetmaps = payload.get("openstreetmaps", {})

    if not isinstance(openstreetmaps, dict):
        openstreetmaps = {}

    return {
        "title": "Map Attribution",
        "tile_attribution": clean(settings.get("tile_attribution")) or "© OpenStreetMap contributors",
        "tile_provider": clean(settings.get("tile_provider")) or "openstreetmap",
        "engine": clean(openstreetmaps.get("engine")) or "leaflet",
        "project": "ZZX-Labs R&D Bitnodes Mirror",
    }


def build_overlays(payload: dict[str, Any]) -> dict[str, Any]:
    rows = points(payload)
    vectors_payload = vectors(payload)

    overlays = [
        overlay_definition(
            overlay_id="legend",
            label="Legend",
            description="Color and status legend for node markers.",
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
            overlay_id="network_filter",
            label="Network Filter",
            description="IPv4, IPv6, Tor, I2P, and unknown network filters.",
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
            overlay_id="source_badge",
            label="Source Badge",
            description="Selected crawler source and map build metadata.",
            kind="badge",
            position="bottomleft",
            z_index=1150,
            payload=build_source_payload(vectors_payload),
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
            description="Map tile, engine, and project attribution.",
            kind="attribution",
            position="bottomright",
            z_index=1000,
            payload=build_attribution_payload(payload),
        ),
    ]

    overlay_map = {
        item["id"]: item
        for item in overlays
    }

    ordered = [
        overlay_map[overlay_id]
        for overlay_id in OVERLAY_ORDER
        if overlay_id in overlay_map
    ]

    return {
        "schema": "zzx-bitnodes-map-overlays-v1",
        "generated_at": utc_now(),
        "overlay_order": OVERLAY_ORDER,
        "overlays": ordered,
    }


def merge_overlays(payload: dict[str, Any]) -> dict[str, Any]:
    output = dict(payload)
    overlays = build_overlays(output)

    output["overlays"] = overlays

    settings = dict(output.get("settings", {}))
    settings["overlays"] = overlays
    output["settings"] = settings

    return output


def build(
    payload: dict[str, Any],
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return merge_overlays(payload)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
        "openstreetmaps": read_json(map_dir / "data" / "openstreetmaps.json", fallback={}),
    }

    merged = merge_overlays(payload)
    overlays = merged["overlays"]

    for directory in (map_dir, live_map_dir):
        write_json(directory / "data" / "map-overlays.json", overlays)

        settings_path = directory / "data" / "map-settings.json"
        settings = read_json(settings_path, fallback={})
        settings["overlays"] = overlays
        write_json(settings_path, settings)

    return {
        "schema": "zzx-bitnodes-mapoverlays-build-report-v1",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "overlay_count": len(overlays["overlays"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map overlay HUD, legend, filter, heatmap, cluster, and attribution metadata."
    )

    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--report", default="")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
    )

    if args.report:
        write_json(Path(args.report), report)

    print(
        "map overlays complete: "
        f"{report['overlay_count']} overlays, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
