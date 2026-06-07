#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]

BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))
DEFAULT_MAP_DIR = BITNODES_ROOT / "maps"
DEFAULT_LIVE_MAP_DIR = BITNODES_ROOT / "live-map"
DEFAULT_NODE_DIR = BITNODES_ROOT / "data" / "nodes"
DEFAULT_SQLITE = BITNODES_ROOT / "data" / "mariadb" / "api" / "bitnodes.sqlite3"
DEFAULT_DB_SHARDS = BITNODES_ROOT / "data" / "mariadb"

SCHEMA = "zzx-bitnodes-map-nodes-v2"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}:
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
        "listed",
        "hit",
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
        value = deep_get(row, key) if "." in key else row.get(key)

        if value not in ("", None):
            return value

    return None


def split_host_port(address: str) -> tuple[str, int | None]:
    value = clean(address)

    if not value:
        return "", None

    if value.startswith("[") and "]" in value:
        host = value[1:value.index("]")]
        rest = value[value.index("]") + 1:]

        if rest.startswith(":") and rest[1:].isdigit():
            return host, int(rest[1:])

        return host, None

    lower = value.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        host, port = value.rsplit(":", 1)
        return host, int(port) if port.isdigit() else None

    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)
        return host, int(port) if port.isdigit() else None

    return value, None


def vectors(payload: Mapping[str, Any]) -> dict[str, Any]:
    value = payload.get("vectors", {})
    return value if isinstance(value, dict) else {}


def points(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    vp = vectors(payload)

    for key in ("points", "results", "data", "rows"):
        value = vp.get(key)
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

    return []


def node_address(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("address", "canonical_address", "node", "addr", "host", "hostname", "id")))


def node_id(point: Mapping[str, Any]) -> str:
    explicit = clean(first(point, ("node_id", "map_node", "id", "node_data.node_id", "metadata.node_id")))

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
    network = clean(first(point, ("network", "metadata.network", "address_family"))).lower()

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

    if boolish(first(point, ("is_sanctioned_node", "is_sanctioned", "sanctions_data.is_sanctioned"))):
        return "sanctioned-node"

    if boolish(first(point, ("is_policy_restricted_node", "sanctions_data.is_policy_restricted"))):
        return "policy-restricted-node"

    if clean(first(point, ("threat_level", "tag_threat_level", "threat_infrastructure.threat_level"))).lower() in {"confirmed", "high"}:
        return "high-threat-infrastructure"

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
        ("military", ("is_military", "military_data.is_military", "military.is_military", "metadata.is_military")),
        ("government", ("is_government", "government_data.is_government", "government.is_government", "metadata.is_government")),
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
        "city_data.latitude",
        "postal_data.latitude",
        "w3w_data.center_latitude",
        "zzxgcs_data.center_latitude",
        "geohashid_data.center_latitude",
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
        "city_data.longitude",
        "postal_data.longitude",
        "w3w_data.center_longitude",
        "zzxgcs_data.center_longitude",
        "geohashid_data.center_longitude",
        "geo.longitude",
        "geo.lon",
        "geo.lng",
        "geoip.longitude",
        "geoip.lon",
        "location.longitude",
        "metadata.longitude",
    )))

    network = point_network(point)

    if lat is None or lon is None:
        if network == "tor":
            return 0.0, -32.0

        if network == "i2p":
            return 0.0, 32.0

        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def sqlite_reference(sqlite_path: Path) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    if not sqlite_path.exists():
        return refs

    conn = sqlite3.connect(str(sqlite_path))
    conn.row_factory = sqlite3.Row

    try:
        rows = conn.execute("SELECT * FROM bitnodes_api_nodes").fetchall()
    except Exception:
        conn.close()
        return refs

    for row in rows:
        record = dict(row)
        address = clean(record.get("address"))
        nid = clean(record.get("node_id"))

        if nid:
            refs[nid] = record

        if address:
            refs[address] = record

    conn.close()
    return refs


def load_sql_gz_reference(root: Path, limit: int = 0) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    if not root.exists():
        return refs

    count = 0

    for path in sorted(root.rglob("*.sql.gz")):
        try:
            with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
                text = handle.read(16 * 1024 * 1024)
        except Exception:
            continue

        for match in __import__("re").finditer(r"\{.*?\}", text, flags=__import__("re").DOTALL):
            try:
                payload = json.loads(match.group(0))
            except Exception:
                continue

            if not isinstance(payload, Mapping):
                continue

            record = dict(payload)
            address = clean(record.get("address") or record.get("canonical_address") or record.get("node") or record.get("addr"))
            nid = clean(record.get("node_id") or record.get("id"))

            if not nid and address:
                digest = hashlib.sha3_256(address.encode("utf-8")).hexdigest()[:20]
                nid = f"node:{digest}"

            if nid:
                refs[nid] = record

            if address:
                refs[address] = record

            count += 1

            if limit > 0 and count >= limit:
                return refs

    return refs


def load_node_reference(
    node_dir: Path,
    sqlite_path: Path = DEFAULT_SQLITE,
    db_shards: Path = DEFAULT_DB_SHARDS,
    use_db: bool = True,
) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    if use_db:
        refs.update(sqlite_reference(sqlite_path))

        if not refs:
            refs.update(load_sql_gz_reference(db_shards))

    for candidate in (
        node_dir / "nodes.json",
        node_dir / "mapnodes.json",
        node_dir / "node-index.json",
        node_dir / "nodes.json.gz",
        node_dir / "mapnodes.json.gz",
        node_dir / "node-index.json.gz",
    ):
        data = read_json(candidate, fallback={})

        if not isinstance(data, Mapping):
            continue

        rows = data.get("nodes", data.get("entries", data))

        if isinstance(rows, Mapping):
            for key, row in rows.items():
                if isinstance(row, Mapping):
                    record = dict(row)
                    refs[str(key)] = record

                    address = clean(record.get("address") or record.get("node") or record.get("addr"))
                    nid = clean(record.get("node_id") or record.get("id"))

                    if nid:
                        refs[nid] = record

                    if address:
                        refs[address] = record

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, Mapping):
                    continue

                record = dict(row)
                nid = clean(record.get("node_id") or record.get("id"))
                address = clean(record.get("address") or record.get("node") or record.get("addr"))

                if nid:
                    refs[nid] = record

                if address:
                    refs[address] = record

    return refs


def tags_for(point: Mapping[str, Any]) -> list[str]:
    pairs = [
        ("tor", ("is_tor", "tor.is_tor", "metadata.is_tor")),
        ("i2p", ("is_i2p", "i2p.is_i2p", "metadata.is_i2p")),
        ("vpn", ("is_vpn", "suspected_vpn", "vpn.is_vpn", "metadata.is_vpn")),
        ("proxy", ("is_proxy", "suspected_proxy", "proxy.is_proxy", "metadata.is_proxy")),
        ("datacenter", ("is_datacenter", "datacenter.is_datacenter", "metadata.is_datacenter")),
        ("government", ("is_government", "government.is_government", "metadata.is_government")),
        ("military", ("is_military", "military.is_military", "metadata.is_military")),
        ("sanctioned", ("is_sanctioned", "is_sanctioned_node", "sanctions_data.is_sanctioned", "metadata.is_sanctioned")),
        ("policy-restricted", ("is_policy_restricted_node", "sanctions_data.is_policy_restricted")),
        ("threat-infrastructure", ("is_threat_infrastructure", "threat_infrastructure.is_threat_infrastructure")),
        ("apt-label", ("suspected_apt_related", "confirmed_intelligence_match")),
        ("threat-actor", ("is_threat_actor", "suspected_threat_actor_group_related", "confirmed_threat_actor_group_match")),
        ("known-malactor", ("is_known_malactor", "knownmalactor.is_known_malactor")),
    ]

    tags = []

    for label, keys in pairs:
        if any(boolish(first(point, (key,))) for key in keys):
            tags.append(label)

    return sorted(set(tags))


def build_node_record(point: Mapping[str, Any], refs: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    nid = node_id(point)
    address = node_address(point)
    ref = refs.get(nid) or refs.get(address) or {}

    merged = dict(ref)
    merged.update(dict(point))

    lat, lon = point_lat_lon(merged)
    host, port_from_address = split_host_port(address)

    record = {
        "id": nid,
        "node_id": nid,
        "address": address,
        "host": clean(first(merged, ("host", "hostname"))) or host,
        "port": first(merged, ("port", "metadata.port")) or port_from_address or 8333,
        "network": point_network(merged),
        "status": point_status(merged),
        "owner_type": owner_type(merged),
        "country": clean(first(merged, ("map_country", "country_code", "country", "geoip.country_code"))).upper() or "UNKNOWN",
        "country_name": clean(first(merged, ("country_name", "country_data.country_name", "metadata.country_name"))),
        "continent": clean(first(merged, ("continent", "continent_data.continent", "metadata.continent"))),
        "region": clean(first(merged, ("region", "region_name", "metadata.region"))),
        "territory": clean(first(merged, ("map_territory", "map_territory_code", "territory", "state", "admin1_code"))),
        "county": clean(first(merged, ("map_county", "map_county_code", "county", "admin2_code"))),
        "city": clean(first(merged, ("map_city", "map_city_name", "city", "city_name"))),
        "zip": clean(first(merged, ("zip", "zipcode", "postal_code", "postcode"))),
        "parcel": clean(first(merged, ("map_parcel", "parcel_id", "parcel_code"))),
        "building": clean(first(merged, ("map_building", "building_id", "building_code"))),
        "timezone": clean(first(merged, ("map_timezone", "timezone", "iana_timezone"))),
        "w3w": clean(first(merged, ("map_w3w", "w3w", "what3words", "w3w_data.w3w"))),
        "zzxgcs": clean(first(merged, ("map_zzxgcs", "zzxgcs", "zzx_gcs", "zzxgcs_data.zzxgcs"))),
        "geohash": clean(first(merged, ("map_geohash", "geohash", "geohashid_data.geohash"))),
        "geohashid": clean(first(merged, ("map_geohashid", "geohashid", "geohashid_data.geohashid"))),
        "asn": clean(first(merged, ("asn", "asn_data.asn", "geoip.asn"))),
        "organization": clean(first(merged, ("organization", "org", "organization_data.organization", "geoip.organization"))),
        "provider": clean(first(merged, ("provider", "provider_data.provider", "geoip.provider"))),
        "agent": clean(first(merged, ("agent", "user_agent", "subver"))),
        "protocol": first(merged, ("protocol", "version")),
        "services": first(merged, ("services",)),
        "height": first(merged, ("height", "block_height")),
        "latency_ms": first(merged, ("latency_ms", "metadata.latency_ms")),
        "peer_index": first(merged, ("peer_index", "metadata.peer_index")),
        "reachable": first(merged, ("reachable", "metadata.reachable")),
        "reachable_now": first(merged, ("reachable_now", "metadata.reachable_now")),
        "reachable_24h": first(merged, ("reachable_24h", "metadata.reachable_24h")),
        "uptime_seconds": first(merged, ("uptime_seconds", "metadata.uptime_seconds")),
        "duplicate_count": integer(first(merged, ("duplicate_count", "metadata.duplicate_count")), 1),
        "latitude": lat,
        "longitude": lon,
        "map_url_hint": f"./?node={nid}",
        "source": clean(ref.get("source") or merged.get("source")) or "map-vectors",
        "threat_level": clean(first(merged, ("threat_level", "tag_threat_level", "threat_infrastructure.threat_level"))) or "none",
        "threat_color": clean(first(merged, ("threat_color", "tag_threat_color", "threat_infrastructure.map.threat_color"))),
        "is_sanctioned_node": boolish(first(merged, ("is_sanctioned_node", "is_sanctioned", "sanctions_data.is_sanctioned"))),
        "is_policy_restricted_node": boolish(first(merged, ("is_policy_restricted_node", "sanctions_data.is_policy_restricted"))),
        "is_threat_infrastructure": boolish(first(merged, ("is_threat_infrastructure", "threat_infrastructure.is_threat_infrastructure"))),
        "tags": tags_for(merged),
    }

    record["marker_ring"] = (
        record["is_sanctioned_node"]
        or record["is_policy_restricted_node"]
        or record["is_threat_infrastructure"]
    )

    if isinstance(ref, Mapping):
        record["reference"] = {
            key: value
            for key, value in ref.items()
            if key not in record
        }

    return record


def sorted_counts(counter: dict[str, int]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda pair: (-pair[1], pair[0])))


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
    threat_level_counts: dict[str, int] = {}

    for record in nodes.values():
        network_counts[record["network"]] = network_counts.get(record["network"], 0) + 1
        status_counts[record["status"]] = status_counts.get(record["status"], 0) + 1
        owner_counts[record["owner_type"]] = owner_counts.get(record["owner_type"], 0) + 1
        country_counts[record["country"]] = country_counts.get(record["country"], 0) + 1
        threat_level_counts[record["threat_level"]] = threat_level_counts.get(record["threat_level"], 0) + 1

        for tag in record.get("tags", []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "node_count": len(nodes),
        "network_counts": sorted_counts(network_counts),
        "status_counts": sorted_counts(status_counts),
        "owner_counts": sorted_counts(owner_counts),
        "country_counts": sorted_counts(country_counts),
        "tag_counts": sorted_counts(tag_counts),
        "threat_level_counts": sorted_counts(threat_level_counts),
        "red_ring_semantics": {
            "is_sanctioned_node": "red marker ring and sanctioned table badge",
            "is_policy_restricted_node": "red-orange marker ring and policy table badge",
            "is_threat_infrastructure": "threat marker ring and threat table badge",
        },
        "nodes": dict(sorted(nodes.items(), key=lambda pair: pair[0])),
    }


def build_node_layers(payload: Mapping[str, Any]) -> dict[str, Any]:
    nodes = payload.get("nodes", {})

    if not isinstance(nodes, Mapping):
        nodes = {}

    layers = []

    colors = {
        "tor": "#9d67ad",
        "i2p": "#b889ff",
        "ipv4": "#c0d674",
        "ipv6": "#70b7ff",
        "cjdns": "#00d1b2",
    }

    for nid, item in nodes.items():
        if not isinstance(item, Mapping):
            continue

        color = colors.get(str(item.get("network", "unknown")), "#8c927e")

        if item.get("is_sanctioned_node"):
            color = "#ff0000"
        elif item.get("is_policy_restricted_node"):
            color = "#ff3b30"
        elif item.get("is_threat_infrastructure"):
            color = item.get("threat_color") or "#ff9500"

        layers.append({
            "id": f"node:{nid}",
            "label": item.get("address", str(nid)),
            "kind": "node-filter",
            "enabled": True,
            "visible": False,
            "color": color,
            "point_count": 1,
            "filter": {
                "type": "node",
                "key": "map_node",
                "value": nid,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-node-layers-v2",
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
        item["map_node_threat_level"] = record["threat_level"]
        item["map_node_marker_ring"] = record["marker_ring"]

        output.append(item)

    return output


def merge_nodes(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}

    node_dir = Path(context.get("node_dir") or context.get("map_node_dir") or DEFAULT_NODE_DIR)
    sqlite_path = Path(context.get("sqlite") or context.get("sqlite_path") or DEFAULT_SQLITE)
    db_shards = Path(context.get("db_shards") or DEFAULT_DB_SHARDS)
    use_db = not bool(context.get("no_db", False))

    output = dict(payload)
    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    refs = load_node_reference(node_dir, sqlite_path=sqlite_path, db_shards=db_shards, use_db=use_db)

    annotated = annotate_points(rows, refs)
    node_payload = build_node_summary(annotated, refs)
    node_layers = build_node_layers(node_payload)

    if vectors_payload:
        vectors_payload["points"] = annotated
        vectors_payload.setdefault("vectors", {})
        if isinstance(vectors_payload["vectors"], dict):
            vectors_payload["vectors"]["points"] = annotated
        output["vectors"] = vectors_payload

    output["nodes"] = node_payload
    output["node_layers"] = node_layers

    settings = dict(output.get("settings", {}))
    settings["nodes"] = {
        "url": "./data/map-nodes.json",
        "layers_url": "./data/map-node-layers.json",
        "node_dir": str(node_dir),
        "sqlite": str(sqlite_path),
        "db_shards": str(db_shards),
        "enabled": True,
        "user_selectable": True,
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_nodes(payload, context)


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_nodes(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    node_dir: Path = DEFAULT_NODE_DIR,
    sqlite_path: Path = DEFAULT_SQLITE,
    db_shards: Path = DEFAULT_DB_SHARDS,
    compact: bool = False,
    no_db: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})

    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_nodes(
        payload,
        {
            "node_dir": str(node_dir),
            "sqlite": str(sqlite_path),
            "db_shards": str(db_shards),
            "no_db": no_db,
        },
    )

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
        "schema": "zzx-bitnodes-mapnodes-build-report-v2",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "node_dir": str(node_dir),
        "sqlite": str(sqlite_path),
        "db_shards": str(db_shards),
        "node_count": node_payload.get("node_count", 0),
        "total_points": node_payload.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map node registry, node summaries, and node filters.",
        allow_abbrev=False,
    )

    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--node-dir", default=str(DEFAULT_NODE_DIR))
    parser.add_argument("--sqlite", default=str(DEFAULT_SQLITE))
    parser.add_argument("--db-shards", default=str(DEFAULT_DB_SHARDS))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--no-db", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        node_dir=Path(args.node_dir).resolve(),
        sqlite_path=Path(args.sqlite).resolve(),
        db_shards=Path(args.db_shards).resolve(),
        compact=args.compact,
        no_db=args.no_db,
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
