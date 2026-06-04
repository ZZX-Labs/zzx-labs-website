#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"
DEFAULT_NODE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "nodes"

SCHEMA = "zzx-bitnodes-map-nodes-v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}:
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


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    return str(value or "").strip().lower() in {
        "true",
        "yes",
        "y",
        "ok",
        "1",
        "reachable",
        "online",
        "success",
        "matched",
        "flagged",
    }


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
    vp = vectors(payload)

    for key in ("points", "results", "data"):
        value = vp.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    for key in ("points", "results", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    return []


def node_address(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("address", "node", "addr", "host", "hostname", "id")))


def node_id(point: Mapping[str, Any]) -> str:
    explicit = clean(first(point, (
        "node_id",
        "map_node",
        "id",
        "node_data.node_id",
        "metadata.node_id",
    )))

    if explicit:
        return explicit

    address = node_address(point)

    if address:
        digest = hashlib.sha3_256(address.encode("utf-8")).hexdigest()[:20]
        return f"node:{digest}"

    basis = json.dumps(dict(point), ensure_ascii=False, sort_keys=True, default=str)
    digest = hashlib.sha3_256(basis.encode("utf-8")).hexdigest()[:20]
    return f"node:{digest}"


def point_network(point: Mapping[str, Any]) -> str:
    network = clean(first(point, ("network", "metadata.network"))).lower()
    if network:
        return network

    address = node_address(point).lower()

    if ".onion" in address:
        return "tor"
    if ".i2p" in address:
        return "i2p"
    if ":" in address and ".onion" not in address and ".i2p" not in address:
        return "ipv6"
    if address.count(".") >= 3:
        return "ipv4"

    return "unknown"


def point_status(point: Mapping[str, Any]) -> str:
    status = clean(first(point, ("status", "metadata.status"))).lower()

    if status:
        return status

    if boolish(first(point, ("reachable_now", "metadata.reachable_now"))):
        return "reachable-now"

    if boolish(first(point, ("reachable_24h", "metadata.reachable_24h"))):
        return "reachable-24h"

    if boolish(first(point, ("reachable", "metadata.reachable"))):
        return "synced"

    if first(point, ("reachable", "metadata.reachable")) is False:
        return "unreachable"

    return "unknown"


def owner_type(point: Mapping[str, Any]) -> str:
    checks = (
        ("military", ("is_military", "military_data.is_military", "metadata.is_military")),
        ("government", ("is_government", "government_data.is_government", "metadata.is_government")),
        ("university", ("is_university", "is_academic", "is_institute", "metadata.is_university")),
        ("datacenter", ("is_datacenter", "datacenter_data.is_datacenter", "provider_data.is_datacenter", "metadata.is_datacenter")),
        ("private", ("is_private", "is_commercial", "metadata.is_private")),
        ("public", ("is_public", "is_residential", "metadata.is_public")),
    )

    for label, keys in checks:
        if any(boolish(first(point, (key,))) for key in keys):
            return label

    return "unknown"


def point_lat_lon(point: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(first(point, (
        "latitude",
        "lat",
        "geoloc.latitude",
        "geo.latitude",
        "geo.lat",
        "geoip.latitude",
        "geoip.lat",
        "location.latitude",
        "metadata.latitude",
    )))

    lon = number(first(point, (
        "longitude",
        "lon",
        "lng",
        "geoloc.longitude",
        "geoloc.lon",
        "geo.longitude",
        "geo.lon",
        "geo.lng",
        "geoip.longitude",
        "geoip.lon",
        "location.longitude",
        "metadata.longitude",
    )))

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def load_node_reference(node_dir: Path) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    for candidate in (
        node_dir / "nodes.json",
        node_dir / "mapnodes.json",
        node_dir / "node-index.json",
    ):
        data = read_json(candidate, fallback={})

        if not isinstance(data, dict):
            continue

        rows = data.get("nodes", data.get("entries", data))

        if isinstance(rows, dict):
            for key, row in rows.items():
                if isinstance(row, dict):
                    refs[str(key)] = row
                    address = clean(row.get("address") or row.get("node") or row.get("addr"))
                    if address:
                        refs[address] = row

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue

                nid = clean(row.get("node_id") or row.get("id"))
                address = clean(row.get("address") or row.get("node") or row.get("addr"))

                if nid:
                    refs[nid] = row
                if address:
                    refs[address] = row

    return refs


def build_node_record(point: Mapping[str, Any], refs: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    nid = node_id(point)
    address = node_address(point)
    ref = refs.get(nid) or refs.get(address) or {}

    lat, lon = point_lat_lon(point)

    record = {
        "id": nid,
        "node_id": nid,
        "address": address,
        "host": clean(first(point, ("host", "hostname"))) or address,
        "port": first(point, ("port", "metadata.port")),
        "network": point_network(point),
        "status": point_status(point),
        "owner_type": owner_type(point),
        "country": clean(first(point, ("map_country", "country", "country_code", "geoip.country_code"))).upper() or "UNKNOWN",
        "territory": clean(first(point, ("map_territory", "map_territory_code", "territory", "state", "admin1_code"))),
        "county": clean(first(point, ("map_county", "map_county_code", "county", "admin2_code"))),
        "city": clean(first(point, ("map_city", "map_city_name", "city", "city_name"))),
        "parcel": clean(first(point, ("map_parcel", "parcel_id", "parcel_code"))),
        "building": clean(first(point, ("map_building", "building_id", "building_code"))),
        "timezone": clean(first(point, ("map_timezone", "timezone", "iana_timezone"))),
        "w3w": clean(first(point, ("map_w3w", "w3w", "what3words"))),
        "zzxgcs": clean(first(point, ("map_zzxgcs", "zzxgcs", "zzx_gcs"))),
        "geohash": clean(first(point, ("map_geohash", "geohash"))),
        "geohashid": clean(first(point, ("map_geohashid", "geohashid"))),
        "asn": clean(first(point, ("asn", "asn_data.asn", "geoip.asn"))),
        "organization": clean(first(point, ("organization", "org", "organization_data.organization", "geoip.organization"))),
        "provider": clean(first(point, ("provider", "provider_data.provider", "geoip.provider"))),
        "agent": clean(first(point, ("agent", "user_agent"))),
        "protocol": first(point, ("protocol",)),
        "services": first(point, ("services",)),
        "height": first(point, ("height",)),
        "latency_ms": first(point, ("latency_ms", "metadata.latency_ms")),
        "peer_index": first(point, ("peer_index", "metadata.peer_index")),
        "reachable": first(point, ("reachable", "metadata.reachable")),
        "reachable_now": first(point, ("reachable_now", "metadata.reachable_now")),
        "reachable_24h": first(point, ("reachable_24h", "metadata.reachable_24h")),
        "uptime_seconds": first(point, ("uptime_seconds", "metadata.uptime_seconds")),
        "duplicate_count": int(number(first(point, ("duplicate_count", "metadata.duplicate_count")), 1) or 1),
        "latitude": lat,
        "longitude": lon,
        "map_url_hint": f"./?node={nid}",
        "source": clean(ref.get("source")) or "map-vectors",
        "tags": sorted(set([
            tag for tag in [
                "vpn" if boolish(first(point, ("is_vpn", "suspected_vpn", "metadata.is_vpn"))) else "",
                "proxy" if boolish(first(point, ("is_proxy", "suspected_proxy", "metadata.is_proxy"))) else "",
                "datacenter" if boolish(first(point, ("is_datacenter", "metadata.is_datacenter"))) else "",
                "government" if boolish(first(point, ("is_government", "metadata.is_government"))) else "",
                "military" if boolish(first(point, ("is_military", "metadata.is_military"))) else "",
                "sanctioned" if boolish(first(point, ("is_sanctioned", "metadata.is_sanctioned"))) else "",
                "apt" if boolish(first(point, ("is_apt", "metadata.is_apt"))) else "",
                "threat-actor" if boolish(first(point, ("is_threat_actor", "metadata.is_threat_actor"))) else "",
                "known-malactor" if boolish(first(point, ("is_known_malactor", "metadata.is_known_malactor"))) else "",
            ]
            if tag
        ])),
    }

    if isinstance(ref, Mapping):
        record["reference"] = {
            key: value
            for key, value in ref.items()
            if key not in record
        }

    return record


def build_node_summary(rows: list[dict[str, Any]], refs: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}

    for row in rows:
        record = build_node_record(row, refs)
        nodes[record["node_id"]] = record

    network_counts: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    owner_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}
    tag_counts: dict[str, int] = {}

    for record in nodes.values():
        network_counts[record["network"]] = network_counts.get(record["network"], 0) + 1
        status_counts[record["status"]] = status_counts.get(record["status"], 0) + 1
        owner_counts[record["owner_type"]] = owner_counts.get(record["owner_type"], 0) + 1
        country_counts[record["country"]] = country_counts.get(record["country"], 0) + 1

        for tag in record.get("tags", []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "node_count": len(nodes),
        "network_counts": dict(sorted(network_counts.items())),
        "status_counts": dict(sorted(status_counts.items())),
        "owner_counts": dict(sorted(owner_counts.items())),
        "country_counts": dict(sorted(country_counts.items(), key=lambda pair: (-pair[1], pair[0]))),
        "tag_counts": dict(sorted(tag_counts.items())),
        "nodes": dict(sorted(nodes.items(), key=lambda pair: pair[0])),
    }


def build_node_layers(payload: Mapping[str, Any]) -> dict[str, Any]:
    nodes = payload.get("nodes", {})

    if not isinstance(nodes, Mapping):
        nodes = {}

    layers = []

    for nid, item in nodes.items():
        if not isinstance(item, Mapping):
            continue

        layers.append({
            "id": f"node:{nid}",
            "label": item.get("address", str(nid)),
            "kind": "node-filter",
            "enabled": True,
            "visible": False,
            "color": {
                "tor": "#9d67ad",
                "i2p": "#b889ff",
                "ipv4": "#c0d674",
                "ipv6": "#70b7ff",
            }.get(str(item.get("network", "unknown")), "#8c927e"),
            "point_count": 1,
            "filter": {
                "type": "node",
                "key": "map_node",
                "value": nid,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-node-layers-v1",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: item["id"]),
    }


def annotate_points(rows: list[dict[str, Any]], refs: Mapping[str, Mapping[str, Any]]) -> list[dict[str, Any]]:
    output = []

    for row in rows:
        item = dict(row)
        record = build_node_record(item, refs)

        item["map_node"] = record["node_id"]
        item["map_node_label"] = record["address"] or record["node_id"]
        item["map_node_network"] = record["network"]
        item["map_node_status"] = record["status"]
        item["map_node_owner_type"] = record["owner_type"]
        item["map_node_tags"] = record["tags"]

        output.append(item)

    return output


def merge_nodes(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    node_dir = Path(context.get("node_dir") or context.get("map_node_dir") or DEFAULT_NODE_DIR)

    output = dict(payload)
    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    refs = load_node_reference(node_dir)

    annotated = annotate_points(rows, refs)
    node_payload = build_node_summary(annotated, refs)
    node_layers = build_node_layers(node_payload)

    if vectors_payload:
        vectors_payload["points"] = annotated
        output["vectors"] = vectors_payload

    output["nodes"] = node_payload
    output["node_layers"] = node_layers

    settings = dict(output.get("settings", {}))
    settings["nodes"] = {
        "url": "./data/map-nodes.json",
        "layers_url": "./data/map-node-layers.json",
        "node_dir": str(node_dir),
        "enabled": True,
        "user_selectable": True,
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_nodes(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    node_dir: Path = DEFAULT_NODE_DIR,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})

    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_nodes(payload, {"node_dir": str(node_dir)})
    node_payload = merged["nodes"]
    node_layers = merged["node_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"

        write_json(data_dir / "map-nodes.json", node_payload, compact=compact)
        write_json(data_dir / "map-node-layers.json", node_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})

        if not isinstance(settings, dict):
            settings = {}

        settings["nodes"] = merged["settings"]["nodes"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapnodes-build-report-v1",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "node_dir": str(node_dir),
        "node_count": node_payload.get("node_count", 0),
        "total_points": node_payload.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Bitnodes map node registry, node summaries, and node filters.")

    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--node-dir", default=str(DEFAULT_NODE_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        node_dir=Path(args.node_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map nodes complete: "
        f"{report['node_count']} nodes, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
