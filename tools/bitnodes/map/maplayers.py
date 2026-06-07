#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]

BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))
DEFAULT_MAP_DIR = BITNODES_ROOT / "maps"
DEFAULT_LIVE_MAP_DIR = BITNODES_ROOT / "live-map"

SCHEMA = "zzx-bitnodes-map-layers-v3"


DEFAULT_LAYER_ORDER = [
    "all_nodes",
    "ipv4_nodes",
    "ipv6_nodes",
    "cjdns_nodes",
    "tor_nodes",
    "i2p_nodes",
    "vpn_nodes",
    "proxy_nodes",
    "datacenter_nodes",
    "government_nodes",
    "military_nodes",
    "university_nodes",
    "sanctioned_nodes",
    "policy_restricted_nodes",
    "threat_infrastructure_nodes",
    "confirmed_threat_nodes",
    "threat_actor_nodes",
    "known_malactor_nodes",
    "duplicate_locations",
    "unreachable",
    "not_yet_synced",
    "synced",
    "synced_10m_plus",
    "stable_48h_plus",
    "stable_1w_plus",
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
        rows: list[dict[str, Any]] = []

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

            rows.append(row)

        return rows

    live_map = payload.get("live_map")

    if isinstance(live_map, Mapping):
        value = live_map.get("points") or live_map.get("nodes")

        if isinstance(value, list):
            return [dict(row) for row in value if isinstance(row, Mapping)]

    return []


def row_network(row: Mapping[str, Any]) -> str:
    network = clean(first(row, ("network", "metadata.network", "network_type", "geoip.network_type", "address_family"))).lower()

    if network:
        return network

    address = clean(first(row, ("address", "addr", "node", "host", "hostname"))).lower()

    if ".onion" in address or boolish(first(row, ("is_tor", "tor", "tor.is_tor", "metadata.is_tor", "metadata.tor"))):
        return "tor"

    if ".i2p" in address or boolish(first(row, ("is_i2p", "i2p", "i2p.is_i2p", "metadata.is_i2p", "metadata.i2p"))):
        return "i2p"

    if boolish(first(row, ("is_cjdns", "ipv6.is_cjdns_ipv6", "metadata.is_cjdns"))):
        return "cjdns"

    if boolish(first(row, ("is_ipv6", "metadata.is_ipv6"))) or address.startswith("["):
        return "ipv6"

    if boolish(first(row, ("is_ipv4", "metadata.is_ipv4"))) or address.count(".") >= 3:
        return "ipv4"

    return "unknown"


def row_status(row: Mapping[str, Any]) -> str:
    status = clean(first(row, ("status", "metadata.status"))).lower()

    if status:
        return status

    if row_has_flag(row, ("is_sanctioned", "is_sanctioned_node", "sanctions_data.is_sanctioned")):
        return "sanctioned-node"

    if row_has_flag(row, ("is_policy_restricted_node", "sanctions_data.is_policy_restricted")):
        return "policy-restricted-node"

    threat_level = clean(first(row, ("threat_level", "tag_threat_level", "threat_infrastructure.threat_level", "metadata.threat_level"))).lower()

    if threat_level in {"confirmed", "high"}:
        return "high-threat-infrastructure"

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


def threat_level(row: Mapping[str, Any]) -> str:
    return clean(first(row, (
        "threat_level",
        "tag_threat_level",
        "threat_infrastructure.threat_level",
        "tag_attribution.threat_level",
        "metadata.threat_level",
    ))).lower()


def count_network(rows: list[dict[str, Any]], network: str) -> int:
    return sum(1 for row in rows if row_network(row) == network)


def count_status(rows: list[dict[str, Any]], status: str) -> int:
    return sum(1 for row in rows if row_status(row) == status)


def count_flag(rows: list[dict[str, Any]], keys: tuple[str, ...]) -> int:
    return sum(1 for row in rows if row_has_flag(row, keys))


def count_threat_level(rows: list[dict[str, Any]], levels: set[str]) -> int:
    return sum(1 for row in rows if threat_level(row) in levels)


def count_duplicates(rows: list[dict[str, Any]]) -> int:
    total = 0

    for row in rows:
        duplicate_count = first(row, ("duplicate_count", "metadata.duplicate_count"))

        try:
            duplicates = int(float(duplicate_count or 1))
        except Exception:
            duplicates = 1

        if row_status(row) == "duplicate-location" or duplicates > 1:
            total += 1

    return total


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
    marker_ring: bool = False,
    table_badge: str = "",
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
        "marker_ring": marker_ring,
        "table_badge": table_badge,
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
    marker_ring: bool = False,
    table_badge: str = "",
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
        marker_ring=marker_ring,
        table_badge=table_badge,
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

    vpn_keys = (
        "is_vpn",
        "vpn",
        "suspected_vpn",
        "vpn_data.is_vpn",
        "vpn_data.suspected_vpn",
        "vpn.is_vpn",
        "vpn.suspected_vpn",
        "metadata.is_vpn",
        "metadata.suspected_vpn",
    )

    proxy_keys = (
        "is_proxy",
        "proxy",
        "suspected_proxy",
        "proxy_data.is_proxy",
        "proxy_data.suspected_proxy",
        "proxy.is_proxy",
        "proxy.suspected_proxy",
        "metadata.is_proxy",
        "metadata.suspected_proxy",
    )

    datacenter_keys = (
        "is_datacenter",
        "datacenter",
        "datacenter_data.is_datacenter",
        "datacenter.is_datacenter",
        "provider_data.is_datacenter",
        "metadata.is_datacenter",
    )

    government_keys = (
        "is_government",
        "government",
        "government_data.is_government",
        "government.is_government",
        "organization_data.is_government",
        "metadata.is_government",
    )

    military_keys = (
        "is_military",
        "military",
        "military_data.is_military",
        "military.is_military",
        "organization_data.is_military",
        "metadata.is_military",
    )

    university_keys = (
        "is_university",
        "is_academic",
        "is_institute",
        "organization_data.is_university",
        "organization_data.is_academic",
        "metadata.is_university",
        "metadata.is_academic",
    )

    sanctioned_keys = (
        "is_sanctioned",
        "is_sanctioned_node",
        "sanctions_data.is_sanctioned",
        "metadata.is_sanctioned",
        "metadata.is_sanctioned_node",
    )

    restricted_keys = (
        "policy_restricted",
        "is_policy_restricted_node",
        "sanctions_data.is_policy_restricted",
        "metadata.is_policy_restricted_node",
    )

    threat_keys = (
        "is_threat_infrastructure",
        "suspected_threat_infrastructure",
        "threat_infrastructure.is_threat_infrastructure",
        "threat_infrastructure.suspected_threat_infrastructure",
        "metadata.is_threat_infrastructure",
    )

    confirmed_threat_keys = (
        "confirmed_intelligence_match",
        "threat_infrastructure.confirmed_intelligence_match",
        "trusted_intel_feed_match",
        "threat_infrastructure.trusted_intel_feed_match",
        "metadata.confirmed_intelligence_match",
    )

    actor_keys = (
        "is_threat_actor",
        "threat_actor",
        "suspected_threat_actor_group_related",
        "confirmed_threat_actor_group_match",
        "tagattribution.is_threat_actor",
        "tag_attribution.is_threat_actor",
        "tag_attribution.suspected_threat_actor_group_related",
        "tag_attribution.confirmed_threat_actor_group_match",
        "threat_actor_data.is_threat_actor",
        "metadata.is_threat_actor",
    )

    known_malactor_keys = (
        "is_known_malactor",
        "known_malactor",
        "knownmalactor.is_known_malactor",
        "known_malactor_data.is_known_malactor",
        "metadata.is_known_malactor",
    )

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
            layer_id="cjdns_nodes",
            label="CJDNS Nodes",
            description="CJDNS/fc00::/8 IPv6 Bitcoin node endpoints.",
            color="#00d1b2",
            filter_key="network",
            filter_value="cjdns",
            point_count=count_network(rows, "cjdns"),
            z_index=112,
        ),
        point_layer(
            layer_id="tor_nodes",
            label="Tor Nodes",
            description="Onion nodes displayed at the symbolic overlay coordinate channel.",
            color="#9d67ad",
            filter_key="network",
            filter_value="tor",
            point_count=count_network(rows, "tor"),
            z_index=113,
        ),
        point_layer(
            layer_id="i2p_nodes",
            label="I2P Nodes",
            description="I2P nodes displayed at the symbolic overlay coordinate channel.",
            color="#b889ff",
            filter_key="network",
            filter_value="i2p",
            point_count=count_network(rows, "i2p"),
            z_index=114,
        ),
        point_layer(
            layer_id="vpn_nodes",
            label="VPN / Suspected VPN",
            description="Nodes flagged by local VPN heuristics or provider intelligence.",
            color="#e6a42b",
            filter_type="truthy-any",
            filter_keys=list(vpn_keys),
            point_count=count_flag(rows, vpn_keys),
            z_index=121,
        ),
        point_layer(
            layer_id="proxy_nodes",
            label="Proxy / Suspected Proxy",
            description="Nodes flagged by local proxy heuristics or proxy intelligence.",
            color="#d9a65c",
            filter_type="truthy-any",
            filter_keys=list(proxy_keys),
            point_count=count_flag(rows, proxy_keys),
            z_index=122,
        ),
        point_layer(
            layer_id="datacenter_nodes",
            label="Datacenter / Hosting",
            description="Nodes associated with hosting, VPS, cloud, CDN, or datacenter networks.",
            color="#70b7ff",
            filter_type="truthy-any",
            filter_keys=list(datacenter_keys),
            point_count=count_flag(rows, datacenter_keys),
            z_index=123,
        ),
        point_layer(
            layer_id="government_nodes",
            label="Government",
            description="Nodes associated with government networks by local classification rules.",
            color="#edf7b9",
            filter_type="truthy-any",
            filter_keys=list(government_keys),
            point_count=count_flag(rows, government_keys),
            z_index=124,
        ),
        point_layer(
            layer_id="military_nodes",
            label="Military",
            description="Nodes associated with military networks by local classification rules.",
            color="#c0d674",
            filter_type="truthy-any",
            filter_keys=list(military_keys),
            point_count=count_flag(rows, military_keys),
            z_index=125,
        ),
        point_layer(
            layer_id="university_nodes",
            label="University / Academic",
            description="Nodes associated with academic, university, institute, or research networks.",
            color="#8fd694",
            filter_type="truthy-any",
            filter_keys=list(university_keys),
            point_count=count_flag(rows, university_keys),
            z_index=126,
        ),
        point_layer(
            layer_id="sanctioned_nodes",
            label="Sanctioned Nation Nodes",
            description="Nodes flagged by local sanctioned-nation policy classification. These are circled in red on the map and table views.",
            color="#ff0000",
            filter_type="truthy-any",
            filter_keys=list(sanctioned_keys),
            point_count=count_flag(rows, sanctioned_keys),
            z_index=151,
            marker_ring=True,
            table_badge="SANCTIONED",
        ),
        point_layer(
            layer_id="policy_restricted_nodes",
            label="Policy Restricted Nodes",
            description="Nodes flagged by local policy-restricted jurisdiction classification. These are circled red-orange on the map and table views.",
            color="#ff3b30",
            filter_type="truthy-any",
            filter_keys=list(restricted_keys),
            point_count=count_flag(rows, restricted_keys),
            z_index=150,
            marker_ring=True,
            table_badge="RESTRICTED",
        ),
        point_layer(
            layer_id="threat_infrastructure_nodes",
            label="Threat Infrastructure",
            description="Nodes classified by defensive threat-infrastructure correlation. This is not country-to-APT attribution.",
            color="#ff9500",
            filter_type="truthy-any",
            filter_keys=list(threat_keys),
            point_count=count_flag(rows, threat_keys),
            z_index=160,
            marker_ring=True,
            table_badge="THREAT",
        ),
        point_layer(
            layer_id="confirmed_threat_nodes",
            label="Confirmed Intelligence Match",
            description="Nodes with explicit trusted intelligence-feed match or confirmed source metadata.",
            color="#ff0000",
            filter_type="truthy-any",
            filter_keys=list(confirmed_threat_keys),
            point_count=count_flag(rows, confirmed_threat_keys) + count_threat_level(rows, {"confirmed"}),
            z_index=165,
            marker_ring=True,
            table_badge="CONFIRMED",
        ),
        point_layer(
            layer_id="threat_actor_nodes",
            label="Threat Actor Group Label",
            description="Nodes with explicit threat actor/group labels from trusted metadata or feed correlation only.",
            color="#ff8c42",
            filter_type="truthy-any",
            filter_keys=list(actor_keys),
            point_count=count_flag(rows, actor_keys),
            z_index=141,
            table_badge="ACTOR",
        ),
        point_layer(
            layer_id="known_malactor_nodes",
            label="Known Malactor",
            description="Nodes matched by local known-malactor intelligence.",
            color="#ff3333",
            filter_type="truthy-any",
            filter_keys=list(known_malactor_keys),
            point_count=count_flag(rows, known_malactor_keys),
            z_index=142,
            table_badge="MALACTOR",
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
        point_layer(
            layer_id="stable_1w_plus",
            label="Stable 1w+",
            description="Synced nodes with observed uptime over 1 week.",
            color="#9fdb6d",
            filter_key="status",
            filter_value="stable-1w-plus",
            point_count=count_status(rows, "stable-1w-plus"),
            z_index=121,
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

    layer_counts = {
        item["id"]: item["point_count"]
        for item in ordered
    }

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "default_layer": "all_nodes",
        "exclusive_point_layers": False,
        "layer_order": DEFAULT_LAYER_ORDER,
        "layers": ordered,
        "layer_counts": layer_counts,
        "point_count": total,
        "red_ring_semantics": {
            "sanctioned_nodes": "red ring and SANCTIONED badge",
            "policy_restricted_nodes": "red-orange ring and RESTRICTED badge",
            "threat_infrastructure_nodes": "threat ring and THREAT badge",
            "confirmed_threat_nodes": "red ring and CONFIRMED badge",
        },
        "false_positive_control": {
            "threat_infrastructure_nodes": "defensive infrastructure correlation only",
            "threat_actor_nodes": "explicit trusted metadata/feed labels only",
            "no_country_to_apt_inference": True,
        },
    }


def merge_layers(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    output = dict(payload)
    layer_payload = build_layers(output)

    output["layers"] = layer_payload

    settings = dict(output.get("settings", {}))
    settings["layers"] = layer_payload
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_layers(payload, context)


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_layers(payload, context)


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
        "schema": "zzx-bitnodes-maplayers-build-report-v3",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "layer_count": len(layers["layers"]),
        "point_count": layers.get("point_count", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map layer definitions for maps and live-map.",
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
        "map layers complete: "
        f"{report['layer_count']} layers, "
        f"points={report['point_count']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
