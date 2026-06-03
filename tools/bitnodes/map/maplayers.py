#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"


DEFAULT_LAYER_ORDER = [
    "all_nodes",
    "ipv4_nodes",
    "ipv6_nodes",
    "tor_nodes",
    "i2p_nodes",
    "duplicate_locations",
    "not_yet_synced",
    "stable_48h_plus",
    "synced_10m_plus",
    "synced",
    "unknown",
    "clusters",
    "heatmap",
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


def points(payload: dict[str, Any]) -> list[dict[str, Any]]:
    vectors = payload.get("vectors", {})

    if not isinstance(vectors, dict):
        return []

    items = vectors.get("points", [])

    return items if isinstance(items, list) else []


def count_matching(rows: list[dict[str, Any]], key: str, value: str) -> int:
    return sum(1 for row in rows if clean(row.get(key)) == value)


def layer_definition(
    *,
    layer_id: str,
    label: str,
    description: str,
    kind: str,
    enabled: bool,
    visible: bool,
    color: str,
    filter_key: str = "",
    filter_value: str = "",
    min_zoom: int = 2,
    max_zoom: int = 19,
    opacity: float = 0.88,
    point_count: int = 0,
    z_index: int = 10,
) -> dict[str, Any]:
    return {
        "id": layer_id,
        "label": label,
        "description": description,
        "kind": kind,
        "enabled": enabled,
        "visible": visible,
        "color": color,
        "filter": {
            "key": filter_key,
            "value": filter_value,
        },
        "min_zoom": min_zoom,
        "max_zoom": max_zoom,
        "opacity": opacity,
        "point_count": point_count,
        "z_index": z_index,
    }


def build_layers(payload: dict[str, Any]) -> dict[str, Any]:
    rows = points(payload)
    vectors = payload.get("vectors", {}) if isinstance(payload.get("vectors"), dict) else {}
    clusters = vectors.get("clusters", {}) if isinstance(vectors.get("clusters"), dict) else {}
    heatmap = vectors.get("heatmap", []) if isinstance(vectors.get("heatmap"), list) else []

    total = len(rows)

    layers = [
        layer_definition(
            layer_id="all_nodes",
            label="All Nodes",
            description="Every geocoded Bitcoin node loaded from the selected source.",
            kind="point",
            enabled=True,
            visible=True,
            color="#c0d674",
            point_count=total,
            z_index=100,
        ),
        layer_definition(
            layer_id="ipv4_nodes",
            label="IPv4 Nodes",
            description="IPv4 Bitcoin node endpoints.",
            kind="point",
            enabled=True,
            visible=False,
            color="#c0d674",
            filter_key="network",
            filter_value="ipv4",
            point_count=count_matching(rows, "network", "ipv4"),
            z_index=110,
        ),
        layer_definition(
            layer_id="ipv6_nodes",
            label="IPv6 Nodes",
            description="IPv6 Bitcoin node endpoints.",
            kind="point",
            enabled=True,
            visible=False,
            color="#70b7ff",
            filter_key="network",
            filter_value="ipv6",
            point_count=count_matching(rows, "network", "ipv6"),
            z_index=111,
        ),
        layer_definition(
            layer_id="tor_nodes",
            label="Tor Nodes",
            description="Onion nodes displayed at the overlay coordinate channel.",
            kind="point",
            enabled=True,
            visible=False,
            color="#9d67ad",
            filter_key="network",
            filter_value="tor",
            point_count=count_matching(rows, "network", "tor"),
            z_index=112,
        ),
        layer_definition(
            layer_id="i2p_nodes",
            label="I2P Nodes",
            description="I2P nodes displayed at the overlay coordinate channel.",
            kind="point",
            enabled=True,
            visible=False,
            color="#b889ff",
            filter_key="network",
            filter_value="i2p",
            point_count=count_matching(rows, "network", "i2p"),
            z_index=113,
        ),
        layer_definition(
            layer_id="duplicate_locations",
            label="Duplicate Locations",
            description="Multiple nodes sharing the same rounded map coordinate.",
            kind="point",
            enabled=True,
            visible=False,
            color="#d95c5c",
            filter_key="status",
            filter_value="duplicate-location",
            point_count=count_matching(rows, "status", "duplicate-location"),
            z_index=130,
        ),
        layer_definition(
            layer_id="not_yet_synced",
            label="Not Yet Synced",
            description="Nodes reporting below-tip block height.",
            kind="point",
            enabled=True,
            visible=False,
            color="#9d67ad",
            filter_key="status",
            filter_value="not-yet-synced",
            point_count=count_matching(rows, "status", "not-yet-synced"),
            z_index=125,
        ),
        layer_definition(
            layer_id="stable_48h_plus",
            label="Stable 48h+",
            description="Synced nodes with observed uptime over 48 hours.",
            kind="point",
            enabled=True,
            visible=False,
            color="#c0d674",
            filter_key="status",
            filter_value="stable-48h-plus",
            point_count=count_matching(rows, "status", "stable-48h-plus"),
            z_index=120,
        ),
        layer_definition(
            layer_id="synced_10m_plus",
            label="Synced 10m+",
            description="Synced nodes with observed uptime over 10 minutes.",
            kind="point",
            enabled=True,
            visible=False,
            color="#e6a42b",
            filter_key="status",
            filter_value="synced-10m-plus",
            point_count=count_matching(rows, "status", "synced-10m-plus"),
            z_index=119,
        ),
        layer_definition(
            layer_id="synced",
            label="Synced",
            description="Synced nodes without higher uptime classification.",
            kind="point",
            enabled=True,
            visible=False,
            color="#edf7b9",
            filter_key="status",
            filter_value="synced",
            point_count=count_matching(rows, "status", "synced"),
            z_index=118,
        ),
        layer_definition(
            layer_id="unknown",
            label="Unknown",
            description="Nodes with incomplete or ambiguous telemetry.",
            kind="point",
            enabled=True,
            visible=False,
            color="#8c927e",
            filter_key="status",
            filter_value="unknown",
            point_count=count_matching(rows, "status", "unknown"),
            z_index=80,
        ),
        layer_definition(
            layer_id="clusters",
            label="Clusters",
            description="Rounded-coordinate aggregate clusters for wide zoom levels.",
            kind="cluster",
            enabled=bool(clusters),
            visible=False,
            color="#e6a42b",
            point_count=sum(
                len(value)
                for value in clusters.values()
                if isinstance(value, list)
            ),
            z_index=60,
        ),
        layer_definition(
            layer_id="heatmap",
            label="Heatmap",
            description="Weighted map intensity surface from node concentration and telemetry priority.",
            kind="heatmap",
            enabled=bool(heatmap),
            visible=False,
            color="#c0d674",
            point_count=len(heatmap),
            z_index=40,
            opacity=0.42,
        ),
    ]

    layer_map = {
        item["id"]: item
        for item in layers
    }

    ordered = [
        layer_map[layer_id]
        for layer_id in DEFAULT_LAYER_ORDER
        if layer_id in layer_map
    ]

    return {
        "schema": "zzx-bitnodes-map-layers-v1",
        "generated_at": utc_now(),
        "default_layer": "all_nodes",
        "exclusive_point_layers": True,
        "layer_order": DEFAULT_LAYER_ORDER,
        "layers": ordered,
    }


def merge_layers(payload: dict[str, Any]) -> dict[str, Any]:
    output = dict(payload)
    layer_payload = build_layers(output)

    output["layers"] = layer_payload

    settings = dict(output.get("settings", {}))
    settings["layers"] = layer_payload
    output["settings"] = settings

    return output


def build(
    payload: dict[str, Any],
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return merge_layers(payload)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
) -> dict[str, Any]:
    vectors = read_json(vectors_path, fallback={})
    payload = {
        "vectors": vectors,
    }

    merged = merge_layers(payload)
    layers = merged["layers"]

    for directory in (map_dir, live_map_dir):
        write_json(directory / "data" / "map-layers.json", layers)

        settings_path = directory / "data" / "map-settings.json"
        settings = read_json(settings_path, fallback={})
        settings["layers"] = layers
        write_json(settings_path, settings)

    return {
        "schema": "zzx-bitnodes-maplayers-build-report-v1",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "layer_count": len(layers["layers"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map layer definitions for maps and live-map."
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
        "map layers complete: "
        f"{report['layer_count']} layers, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
