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


DEFAULT_LAYER_ORDER = [
    "all_nodes",

    "ipv4_nodes",
    "ipv6_nodes",

    "tor_nodes",
    "i2p_nodes",

    "vpn_nodes",
    "proxy_nodes",

    "datacenter_nodes",
    "government_nodes",
    "military_nodes",

    "sanctioned_nodes",

    "apt_nodes",
    "threat_actor_nodes",
    "known_malactor_nodes",

    "duplicate_locations",

    "unreachable",
    "not_yet_synced",
    "synced",
    "synced_10m_plus",
    "stable_48h_plus",

    "clusters",
    "heatmap",

    "unknown",
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

    if not path.exists():
        return fallback

    try:
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
    )

    path.write_text(text + "\n", encoding="utf-8")


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
    }


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return row.get(key)

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


def vectors(payload: Mapping[str, Any]) -> dict[str, Any]:
    value = payload.get("vectors", {})

    return value if isinstance(value, dict) else {}


def points(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    vectors_payload = vectors(payload)

    for key in ("points", "results", "data"):
        value = vectors_payload.get(key)

        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    for key in ("points", "results", "data"):
        value = payload.get(key)

        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    live_map = payload.get("live_map")

    if isinstance(live_map, Mapping):
        value = live_map.get("points")

        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    return []


def row_network(row: Mapping[str, Any]) -> str:
    network = clean(first(row, ("network", "metadata.network", "network_type", "geoip.network_type"))).lower()

    if network:
        return network

    address = clean(first(row, ("address", "addr", "node", "host", "hostname"))).lower()

    if ".onion" in address or boolish(first(row, ("is_tor", "tor", "metadata.is_tor", "metadata.tor"))):
        return "tor"

    if ".i2p" in address or boolish(first(row, ("is_i2p", "i2p", "metadata.is_i2p", "metadata.i2p"))):
        return "i2p"

    if boolish(first(row, ("is_ipv6", "metadata.is_ipv6"))) or address.startswith("["):
        return "ipv6"

    if boolish(first(row, ("is_ipv4", "metadata.is_ipv4"))) or address.count(".") >= 3:
        return "ipv4"

    return "unknown"


def row_status(row: Mapping[str, Any]) -> str:
    status = clean(first(row, ("status", "metadata.status"))).lower()

    if status:
        return status

    if boolish(first(row, ("reachable_now", "metadata.reachable_now"))):
        return "reachable-now"

    if boolish(first(row, ("reachable_24h", "metadata.reachable_24h"))):
        return "reachable-24h"

    if boolish(first(row, ("reachable", "metadata.reachable"))):
        return "synced"

    if first(row, ("reachable", "metadata.reachable")) is False:
        return "unreachable"

    return "unknown"


def row_has_flag(row: Mapping[str, Any], keys: tuple[str, ...]) -> bool:
    return any(boolish(first(row, (key,))) for key in keys)


def count_network(rows: list[dict[str, Any]], network: str) -> int:
    return sum(1 for row in rows if row_network(row) == network)


def count_status(rows: list[dict[str, Any]], status: str) -> int:
    return sum(1 for row in rows if row_status(row) == status)


def count_flag(rows: list[dict[str, Any]], keys: tuple[str, ...]) -> int:
    return sum(1 for row in rows if row_has_flag(row, keys))


def count_duplicates(rows: list[dict[str, Any]]) -> int:
    return sum(
        1
        for row in rows
        if row_status(row) == "duplicate-location"
        or int(first(row, ("duplicate_count", "metadata.duplicate_count")) or 1) > 1
    )


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
    filter_type: str = "equals",
    filter_keys: list[str] | None = None,
    min_zoom: int = 2,
    max_zoom: int = 20,
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
            "type": filter_type,
            "key": filter_key,
            "value": filter_value,
            "keys": filter_keys or [],
        },
        "min_zoom": min_zoom,
        "max_zoom": max_zoom,
        "opacity": opacity,
        "point_count": point_count,
        "z_index": z_index,
    }


def point_layer(
    *,
    layer_id: str,
    label: str,
    description: str,
    color: str,
    point_count: int,
    filter_key: str = "",
    filter_value: str = "",
    filter_type: str = "equals",
    filter_keys: list[str] | None = None,
    visible: bool = False,
    z_index: int = 100,
) -> dict[str, Any]:
    return layer_definition(
        layer_id=layer_id,
        label=label,
        description=description,
        kind="point",
        enabled=True,
        visible=visible,
        color=color,
        filter_key=filter_key,
        filter_value=filter_value,
        filter_type=filter_type,
        filter_keys=filter_keys,
        point_count=point_count,
        z_index=z_index,
    )


def build_layers(payload: dict[str, Any]) -> dict[str, Any]:
    rows = points(payload)
    vectors_payload = vectors(payload)

    clusters = vectors_payload.get("clusters", {})
    heatmap = vectors_payload.get("heatmap", [])

    if not isinstance(clusters, dict):
        clusters = {}

    if not isinstance(heatmap, list):
        heatmap = []

    total = len(rows)

    layers = [
        point_layer(
            layer_id="all_nodes",
            label="All Nodes",
            description="Every geocoded Bitcoin node loaded from the selected source.",
            color="#c0d674",
            point_count=total,
            visible=True,
            z_index=100,
        ),

        point_layer(
            layer_id="ipv4_nodes",
            label="IPv4 Nodes",
            description="IPv4 Bitcoin node endpoints.",
            color="#c0d674",
            filter_key="network",
            filter_value="ipv4",
            point_count=count_network(rows, "ipv4"),
            z_index=110,
        ),
        point_layer(
            layer_id="ipv6_nodes",
            label="IPv6 Nodes",
            description="IPv6 Bitcoin node endpoints.",
            color="#70b7ff",
            filter_key="network",
            filter_value="ipv6",
            point_count=count_network(rows, "ipv6"),
            z_index=111,
        ),

        point_layer(
            layer_id="tor_nodes",
            label="Tor Nodes",
            description="Onion nodes displayed at the symbolic overlay coordinate channel.",
            color="#9d67ad",
            filter_key="network",
            filter_value="tor",
            point_count=count_network(rows, "tor"),
            z_index=112,
        ),
        point_layer(
            layer_id="i2p_nodes",
            label="I2P Nodes",
            description="I2P nodes displayed at the symbolic overlay coordinate channel.",
            color="#b889ff",
            filter_key="network",
            filter_value="i2p",
            point_count=count_network(rows, "i2p"),
            z_index=113,
        ),

        point_layer(
            layer_id="vpn_nodes",
            label="VPN / Suspected VPN",
            description="Nodes flagged by local VPN heuristics or provider intelligence.",
            color="#e6a42b",
            filter_type="truthy-any",
            filter_keys=[
                "is_vpn",
                "vpn",
                "suspected_vpn",
                "vpn_data.is_vpn",
                "vpn_data.suspected_vpn",
                "metadata.is_vpn",
                "metadata.suspected_vpn",
            ],
            point_count=count_flag(rows, (
                "is_vpn",
                "vpn",
                "suspected_vpn",
                "vpn_data.is_vpn",
                "vpn_data.suspected_vpn",
                "metadata.is_vpn",
                "metadata.suspected_vpn",
            )),
            z_index=121,
        ),
        point_layer(
            layer_id="proxy_nodes",
            label="Proxy / Suspected Proxy",
            description="Nodes flagged by local proxy heuristics or proxy intelligence.",
            color="#d9a65c",
            filter_type="truthy-any",
            filter_keys=[
                "is_proxy",
                "proxy",
                "suspected_proxy",
                "proxy_data.is_proxy",
                "proxy_data.suspected_proxy",
                "metadata.is_proxy",
                "metadata.suspected_proxy",
            ],
            point_count=count_flag(rows, (
                "is_proxy",
                "proxy",
                "suspected_proxy",
                "proxy_data.is_proxy",
                "proxy_data.suspected_proxy",
                "metadata.is_proxy",
                "metadata.suspected_proxy",
            )),
            z_index=122,
        ),

        point_layer(
            layer_id="datacenter_nodes",
            label="Datacenter / Hosting",
            description="Nodes associated with hosting, VPS, cloud, CDN, or datacenter networks.",
            color="#70b7ff",
            filter_type="truthy-any",
            filter_keys=[
                "is_datacenter",
                "datacenter",
                "datacenter_data.is_datacenter",
                "provider_data.is_datacenter",
                "metadata.is_datacenter",
            ],
            point_count=count_flag(rows, (
                "is_datacenter",
                "datacenter",
                "datacenter_data.is_datacenter",
                "provider_data.is_datacenter",
                "metadata.is_datacenter",
            )),
            z_index=123,
        ),
        point_layer(
            layer_id="government_nodes",
            label="Government",
            description="Nodes associated with government networks by local attribution rules.",
            color="#edf7b9",
            filter_type="truthy-any",
            filter_keys=[
                "is_government",
                "government",
                "government_data.is_government",
                "organization_data.is_government",
                "metadata.is_government",
            ],
            point_count=count_flag(rows, (
                "is_government",
                "government",
                "government_data.is_government",
                "organization_data.is_government",
                "metadata.is_government",
            )),
            z_index=124,
        ),
        point_layer(
            layer_id="military_nodes",
            label="Military",
            description="Nodes associated with military networks by local attribution rules.",
            color="#c0d674",
            filter_type="truthy-any",
            filter_keys=[
                "is_military",
                "military",
                "military_data.is_military",
                "organization_data.is_military",
                "metadata.is_military",
            ],
            point_count=count_flag(rows, (
                "is_military",
                "military",
                "military_data.is_military",
                "organization_data.is_military",
                "metadata.is_military",
            )),
            z_index=125,
        ),

        point_layer(
            layer_id="sanctioned_nodes",
            label="Sanctioned / Restricted Jurisdiction",
            description="Nodes flagged by local sanctioned/restricted jurisdiction policy.",
            color="#d95c5c",
            filter_type="truthy-any",
            filter_keys=[
                "is_sanctioned",
                "is_sanctioned_node",
                "policy_restricted",
                "is_policy_restricted_node",
                "sanctions_data.is_sanctioned",
                "sanctions_data.is_policy_restricted",
                "metadata.is_sanctioned",
            ],
            point_count=count_flag(rows, (
                "is_sanctioned",
                "is_sanctioned_node",
                "policy_restricted",
                "is_policy_restricted_node",
                "sanctions_data.is_sanctioned",
                "sanctions_data.is_policy_restricted",
                "metadata.is_sanctioned",
            )),
            z_index=131,
        ),

        point_layer(
            layer_id="apt_nodes",
            label="APT Attribution",
            description="Nodes with advanced persistent threat attribution flags.",
            color="#ff6b6b",
            filter_type="truthy-any",
            filter_keys=[
                "is_apt",
                "apt",
                "apt_data.is_apt",
                "aptattribution.is_apt",
                "apt_attribution.is_apt",
                "metadata.is_apt",
            ],
            point_count=count_flag(rows, (
                "is_apt",
                "apt",
                "apt_data.is_apt",
                "aptattribution.is_apt",
                "apt_attribution.is_apt",
                "metadata.is_apt",
            )),
            z_index=140,
        ),
        point_layer(
            layer_id="threat_actor_nodes",
            label="Threat Actor Group Attribution",
            description="Nodes with threat actor group attribution flags.",
            color="#ff8c42",
            filter_type="truthy-any",
            filter_keys=[
                "is_threat_actor",
                "threat_actor",
                "tagattribution.is_threat_actor",
                "tag_attribution.is_threat_actor",
                "threat_actor_data.is_threat_actor",
                "metadata.is_threat_actor",
            ],
            point_count=count_flag(rows, (
                "is_threat_actor",
                "threat_actor",
                "tagattribution.is_threat_actor",
                "tag_attribution.is_threat_actor",
                "threat_actor_data.is_threat_actor",
                "metadata.is_threat_actor",
            )),
            z_index=141,
        ),
        point_layer(
            layer_id="known_malactor_nodes",
            label="Known Malactor",
            description="Nodes matched by local known-malactor intelligence.",
            color="#ff3333",
            filter_type="truthy-any",
            filter_keys=[
                "is_known_malactor",
                "known_malactor",
                "knownmalactor.is_known_malactor",
                "known_malactor_data.is_known_malactor",
                "metadata.is_known_malactor",
            ],
            point_count=count_flag(rows, (
                "is_known_malactor",
                "known_malactor",
                "knownmalactor.is_known_malactor",
                "known_malactor_data.is_known_malactor",
                "metadata.is_known_malactor",
            )),
            z_index=142,
        ),

        point_layer(
            layer_id="duplicate_locations",
            label="Duplicate Locations",
            description="Multiple nodes sharing the same rounded map coordinate.",
            color="#d95c5c",
            filter_key="status",
            filter_value="duplicate-location",
            point_count=count_duplicates(rows),
            z_index=130,
        ),

        point_layer(
            layer_id="unreachable",
            label="Unreachable",
            description="Nodes that failed the latest reachability check.",
            color="#d95c5c",
            filter_key="status",
            filter_value="unreachable",
            point_count=count_status(rows, "unreachable"),
            z_index=80,
        ),
        point_layer(
            layer_id="not_yet_synced",
            label="Not Yet Synced",
            description="Nodes reporting below-tip block height.",
            color="#9d67ad",
            filter_key="status",
            filter_value="not-yet-synced",
            point_count=count_status(rows, "not-yet-synced"),
            z_index=126,
        ),
        point_layer(
            layer_id="synced",
            label="Synced",
            description="Synced nodes without higher uptime classification.",
            color="#edf7b9",
            filter_key="status",
            filter_value="synced",
            point_count=count_status(rows, "synced"),
            z_index=118,
        ),
        point_layer(
            layer_id="synced_10m_plus",
            label="Synced 10m+",
            description="Synced nodes with observed uptime over 10 minutes.",
            color="#e6a42b",
            filter_key="status",
            filter_value="synced-10m-plus",
            point_count=count_status(rows, "synced-10m-plus"),
            z_index=119,
        ),
        point_layer(
            layer_id="stable_48h_plus",
            label="Stable 48h+",
            description="Synced nodes with observed uptime over 48 hours.",
            color="#c0d674",
            filter_key="status",
            filter_value="stable-48h-plus",
            point_count=count_status(rows, "stable-48h-plus"),
            z_index=120,
        ),

        layer_definition(
            layer_id="clusters",
            label="Clusters",
            description="Rounded-coordinate aggregate clusters for wide zoom levels.",
            kind="cluster",
            enabled=bool(clusters),
            visible=False,
            color="#e6a42b",
            point_count=sum(len(value) for value in clusters.values() if isinstance(value, list)),
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

        point_layer(
            layer_id="unknown",
            label="Unknown",
            description="Nodes with incomplete or ambiguous telemetry.",
            color="#8c927e",
            filter_key="status",
            filter_value="unknown",
            point_count=count_status(rows, "unknown"),
            z_index=70,
        ),
    ]

    layer_map = {item["id"]: item for item in layers}

    ordered = [
        layer_map[layer_id]
        for layer_id in DEFAULT_LAYER_ORDER
        if layer_id in layer_map
    ]

    return {
        "schema": "zzx-bitnodes-map-layers-v2",
        "generated_at": utc_now(),
        "default_layer": "all_nodes",
        "exclusive_point_layers": True,
        "layer_order": DEFAULT_LAYER_ORDER,
        "layers": ordered,
        "point_count": total,
    }


def merge_layers(payload: dict[str, Any]) -> dict[str, Any]:
    output = dict(payload)
    layer_payload = build_layers(output)

    output["layers"] = layer_payload

    settings = dict(output.get("settings", {}))
    settings["layers"] = layer_payload
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_layers(payload)


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
    }

    merged = merge_layers(payload)
    layers = merged["layers"]

    for directory in (map_dir, live_map_dir):
        write_json(directory / "data" / "map-layers.json", layers, compact=compact)

        settings_path = directory / "data" / "map-settings.json"
        settings = read_json(settings_path, fallback={})

        if not isinstance(settings, dict):
            settings = {}

        settings["layers"] = layers
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-maplayers-build-report-v2",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "layer_count": len(layers["layers"]),
        "point_count": layers.get("point_count", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map layer definitions for maps and live-map."
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
        "map layers complete: "
        f"{report['layer_count']} layers, "
        f"points={report['point_count']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
