#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import importlib.util
import json
import math
import os
import re
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))
BITNODES_DATA = Path(os.environ.get("BITNODES_DATA", str(BITNODES_ROOT / "data")))

DEFAULT_GEO_ROOT = BITNODES_DATA / "geo"
DEFAULT_GEOIP_DIR = BITNODES_DATA / "geoip"

DEFAULT_W3W_CACHE = DEFAULT_GEO_ROOT / "w3w" / "w3w-cache.json"
DEFAULT_GEOHASH_CACHE = DEFAULT_GEO_ROOT / "geohash" / "geohash-cache.json"
DEFAULT_SANCTIONS_POLICY = TOOLS_DIR / "data" / "policy" / "sanctioned-jurisdictions.json"

ENRICHMENT_ORDER = [
    "ip_db",
    "ipv4",
    "ipv6",
    "tor",
    "i2p",
    "proxy",
    "vpn",
    "geoip",
    "geoloc",
    "boundary_zone",
    "continent",
    "region",
    "country",
    "territory",
    "county",
    "city",
    "zip",
    "timezone",
    "land_parcel",
    "building_perimeter",
    "asn_footprint",
    "isp",
    "organization",
    "provider",
    "datacenter",
    "government",
    "military",
    "sanctioned_nodes",
    "knownmalactor",
    "tagattribution",
    "w3w_lookup",
    "geohashid_lookup",
    "peers",
    "peer_index",
    "peer_health",
    "dns_seeder_health",
]

MODULE_PATHS = {
    "geoip": "geoloc/geoip.py",
    "ipv4": "network/ipv4.py",
    "ipv6": "network/ipv6.py",
    "tor": "network/tor.py",
    "i2p": "network/i2p.py",
    "proxy": "network/proxy.py",
    "vpn": "network/vpn.py",
    "isp": "geoclass/isp.py",
    "organization": "geoclass/organization.py",
    "provider": "geoclass/provider.py",
    "datacenter": "geoclass/datacenter.py",
    "government": "geoclass/government.py",
    "military": "geoclass/military.py",
    "sanctioned_nodes": "geoclass/sanctioned_nodes.py",
    "boundary_zone": "geoclass/boundary_zone.py",
    "land_parcel": "geoclass/land_parcel.py",
    "building_perimeter": "geoclass/building_perimeter.py",
    "asn_footprint": "geoclass/asn_footprint.py",
    "knownmalactor": "threat-detection/knownmalactor.py",
    "tagattribution": "threat-detection/tagattribution.py",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback

        if path.suffix == ".gz":
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)

        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
            default=str,
        )
        + "\n",
        encoding="utf-8",
    )


def clean_address(value: Any) -> str:
    return str(value or "").strip()


def number(value: Any) -> float | None:
    try:
        if value in ("", None):
            return None
        parsed = float(value)
    except Exception:
        return None

    if not math.isfinite(parsed):
        return None

    return parsed


def boolish(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    text = str(value or "").strip().lower()

    if text in {"true", "yes", "y", "on", "ok", "up", "online", "reachable", "connected", "success"}:
        return True

    if text in {"false", "no", "n", "off", "down", "offline", "unreachable", "failed", "fail", "timeout", "error"}:
        return False

    return None


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    cur: Any = row

    for part in key.split("."):
        if not isinstance(cur, Mapping):
            return None
        cur = cur.get(part)

    return cur


def first_present(row: Mapping[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)
        if value not in ("", None):
            return value
    return None


def normalize_metadata(record: dict[str, Any]) -> dict[str, Any]:
    metadata = record.get("metadata")

    if isinstance(metadata, dict):
        return metadata

    record["metadata"] = {}
    return record["metadata"]


def normalize_enrichment(record: dict[str, Any]) -> dict[str, Any]:
    enrichment = record.get("enrichment")

    if isinstance(enrichment, dict):
        return enrichment

    record["enrichment"] = {}
    return record["enrichment"]


def split_address(address: str, default_port: int = 8333) -> tuple[str, int]:
    value = str(address or "").strip()

    if not value:
        return "", default_port

    if value.startswith("[") and "]:" in value:
        host, port = value.split("]:", 1)
        return host[1:], int(port) if port.isdigit() else default_port

    if value.startswith("[") and value.endswith("]"):
        return value[1:-1], default_port

    lower = value.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        host, port = value.rsplit(":", 1)
        return host, int(port) if port.isdigit() else default_port

    if value.count(":") == 1 and "." in value:
        host, port = value.rsplit(":", 1)
        return host, int(port) if port.isdigit() else default_port

    if value.count(":") > 1:
        possible_host, possible_port = value.rsplit(":", 1)
        if possible_port.isdigit():
            return possible_host.strip("[]"), int(possible_port)
        return value.strip("[]"), default_port

    return value, default_port


def canonical_address(record: Mapping[str, Any]) -> str:
    address = clean_address(
        record.get("address")
        or record.get("node")
        or record.get("addr")
        or record.get("host")
        or record.get("hostname")
    )

    host, port = split_address(address)
    explicit_port = number(record.get("port") or deep_get(record, "metadata.port"))

    if explicit_port is not None:
        port = int(explicit_port)

    if ":" in host and not host.startswith("[") and ".onion" not in host and ".i2p" not in host:
        return f"[{host}]:{port}"

    return f"{host}:{port}" if host else ""


def host_port_mirrors(record: dict[str, Any]) -> None:
    address = clean_address(record.get("address"))
    host, port = split_address(address)

    if host:
        record.setdefault("host", host)
        record.setdefault("hostname", host)

    record.setdefault("port", port)
    record["canonical_address"] = canonical_address(record)


def preserve_coordinate_mirrors(record: dict[str, Any]) -> None:
    lat = first_present(
        record,
        (
            "latitude", "lat",
            "geo.latitude", "geo.lat",
            "geoip.latitude", "geoip.lat",
            "geoip_data.latitude", "geoip_data.lat",
            "geoloc.latitude", "geoloc.lat",
            "location.latitude", "location.lat",
            "metadata.latitude", "metadata.lat",
        ),
    )

    lon = first_present(
        record,
        (
            "longitude", "lon", "lng",
            "geo.longitude", "geo.lon", "geo.lng",
            "geoip.longitude", "geoip.lon", "geoip.lng",
            "geoip_data.longitude", "geoip_data.lon", "geoip_data.lng",
            "geoloc.longitude", "geoloc.lon", "geoloc.lng",
            "location.longitude", "location.lon", "location.lng",
            "metadata.longitude", "metadata.lon", "metadata.lng",
        ),
    )

    lat_f = number(lat)
    lon_f = number(lon)

    if lat_f is None or lon_f is None:
        return

    if not (-90 <= lat_f <= 90 and -180 <= lon_f <= 180):
        return

    record["latitude"] = lat_f
    record["longitude"] = lon_f
    record["lat"] = lat_f
    record["lon"] = lon_f
    record["lng"] = lon_f

    for key in ("metadata", "geo", "geoip", "geoip_data", "geoloc", "location"):
        block = record.get(key)
        if not isinstance(block, dict):
            block = {}
            record[key] = block

        block["latitude"] = lat_f
        block["longitude"] = lon_f
        block["lat"] = lat_f
        block["lon"] = lon_f
        block["lng"] = lon_f


def has_valid_coordinates(node: Mapping[str, Any]) -> bool:
    lat = first_present(node, ("latitude", "lat", "metadata.latitude", "geoip.latitude", "geo.latitude"))
    lon = first_present(node, ("longitude", "lon", "lng", "metadata.longitude", "geoip.longitude", "geo.longitude"))

    lat_f = number(lat)
    lon_f = number(lon)

    return lat_f is not None and lon_f is not None and -90 <= lat_f <= 90 and -180 <= lon_f <= 180


def coordinate_count(nodes: list[dict[str, Any]]) -> int:
    return sum(1 for node in nodes if isinstance(node, Mapping) and has_valid_coordinates(node))


def network_fallback(record: dict[str, Any]) -> None:
    address = clean_address(record.get("address")).lower()
    host = clean_address(record.get("host") or record.get("hostname")).lower()

    if record.get("network"):
        return

    if ".onion" in address or host.endswith(".onion"):
        record["network"] = "tor"
        record["is_tor"] = True
        return

    if ".i2p" in address or host.endswith(".i2p"):
        record["network"] = "i2p"
        record["is_i2p"] = True
        return

    if ":" in host and "." not in host:
        record["network"] = "ipv6"
        record["is_ipv6"] = True
        return

    if host.count(".") == 3:
        record["network"] = "ipv4"
        record["is_ipv4"] = True
        return

    record["network"] = "unknown"


def normalize_node_record(node: Any) -> dict[str, Any]:
    if isinstance(node, Mapping):
        record = dict(node)
    else:
        record = {"address": str(node)}

    address = (
        record.get("address")
        or record.get("node")
        or record.get("addr")
        or record.get("host")
        or record.get("hostname")
        or record.get("ip")
        or record.get("id")
        or ""
    )

    record["address"] = clean_address(address)

    metadata = normalize_metadata(record)
    normalize_enrichment(record)

    for key, value in list(metadata.items()):
        record.setdefault(key, value)

    if record.get("peer_health") is not None and not isinstance(record.get("peer_health"), dict):
        record["peer_health"] = {}

    host_port_mirrors(record)
    network_fallback(record)
    preserve_coordinate_mirrors(record)

    metadata = normalize_metadata(record)

    for key in (
        "canonical_address", "host", "hostname", "port", "network",
        "latitude", "longitude", "lat", "lon", "lng",
        "reachable", "reachable_now", "reachable_24h",
        "latency_ms", "uptime_seconds", "total_uptime",
        "peer_index", "peer_health",
        "is_tor", "is_i2p", "is_ipv4", "is_ipv6", "is_cjdns",
        "is_vpn", "suspected_vpn", "is_proxy", "suspected_proxy",
        "first_seen", "last_seen", "last_failure",
        "success_count", "failure_count",
        "country", "country_code", "country_name",
        "continent", "region", "territory", "city", "county",
        "postal", "postal_code", "zip", "timezone",
        "asn", "provider", "organization", "org", "isp",
        "provider_kind", "organization_type", "network_classification",
        "datacenter", "government", "military",
        "w3w", "what3words", "geohash", "geohashid", "zzxgcs", "zzxgms",
        "is_sanctioned_node", "is_policy_restricted_node", "policy_restricted", "policy_watch",
        "suspected_government", "suspected_military", "suspected_datacenter",
        "suspected_apt_related", "suspected_threat_actor_group_related", "suspected_known_malicious_actor",
        "apt_attribution_score", "apt_attribution_confidence",
        "tag_attribution_score", "tag_attribution_confidence",
        "known_malactor_score", "known_malactor_confidence",
    ):
        if key in record:
            metadata.setdefault(key, record.get(key))

    return record


def bitnodes_array_to_record(address: str, data: list[Any]) -> dict[str, Any]:
    row = list(data)

    while len(row) < 20:
        row.append(None)

    metadata = row[19] if isinstance(row[19], Mapping) else {}

    record = {
        "address": address,
        "protocol_version": row[0],
        "protocol": row[0],
        "agent": row[1],
        "user_agent": row[1],
        "connected_since": row[2],
        "services": row[3],
        "height": row[4],
        "hostname": row[5],
        "city": row[6],
        "country": row[7],
        "country_code": row[7],
        "latitude": row[8],
        "longitude": row[9],
        "timezone": row[10],
        "asn": row[11],
        "organization": row[12],
        "provider": row[13],
        "county": row[14],
        "zip": row[15],
        "postal": row[15],
        "postal_code": row[15],
        "w3w": row[16],
        "what3words": row[16],
        "geohash": row[17],
        "geohashid": row[17],
        "asn_location": row[18],
        "metadata": dict(metadata),
    }

    for key, value in dict(metadata).items():
        record.setdefault(key, value)

    return normalize_node_record(record)


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [normalize_node_record(item) for item in payload]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [normalize_node_record(item) for item in nodes]

    if isinstance(nodes, Mapping):
        output: list[dict[str, Any]] = []

        for address, data in nodes.items():
            if isinstance(data, list):
                output.append(bitnodes_array_to_record(str(address), data))
            elif isinstance(data, Mapping):
                output.append(normalize_node_record({"address": address, **dict(data)}))
            else:
                output.append(normalize_node_record({"address": address, "value": data}))

        return output

    for key in ("rows", "results", "data", "reachable", "unreachable", "node_records", "peers", "reachable_nodes"):
        value = payload.get(key)

        if isinstance(value, list):
            return [normalize_node_record(item) for item in value]

        if isinstance(value, Mapping):
            extracted = extract_nodes({"nodes": value})
            if extracted:
                return extracted

    for key in ("latest", "snapshot", "payload"):
        value = payload.get(key)
        extracted = extract_nodes(value)
        if extracted:
            return extracted

    return []


def put_nodes(payload: Any, nodes: list[dict[str, Any]]) -> Any:
    if isinstance(payload, list):
        return nodes

    if not isinstance(payload, Mapping):
        return {"nodes": nodes}

    output = dict(payload)
    original_nodes = output.get("nodes")

    if isinstance(original_nodes, Mapping):
        output["nodes"] = {
            str(node.get("canonical_address") or node.get("address") or index): node
            for index, node in enumerate(nodes)
        }
        return output

    output["nodes"] = nodes
    return output


def module_path(module_name: str) -> Path:
    rel = MODULE_PATHS.get(module_name, f"{module_name}.py")
    return TOOLS_DIR / rel


def load_module(module_name: str) -> Any | None:
    path = module_path(module_name)

    if not path.exists():
        return None

    safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", module_name)
    import_name = f"zzx_bitnodes_enrichment_{safe_name}"

    spec = importlib.util.spec_from_file_location(import_name, path)

    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)
    sys.modules[import_name] = module

    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(import_name, None)
        raise

    return module


def find_enricher(module: Any) -> Callable[..., Any] | None:
    for name in ("enrich_nodes", "enrich_payload", "enrich", "process_nodes", "process", "run"):
        fn = getattr(module, name, None)
        if callable(fn):
            return fn
    return None


def call_enricher(name: str, fn: Callable[..., Any], nodes: list[dict[str, Any]], context: dict[str, Any]) -> list[dict[str, Any]]:
    attempts = (
        lambda: fn(nodes, context),
        lambda: fn(nodes=nodes, context=context),
        lambda: fn(nodes),
        lambda: fn({"nodes": nodes}, context),
        lambda: fn(payload={"nodes": nodes}, context=context),
    )

    last_type_error: Exception | None = None

    for attempt in attempts:
        try:
            result = attempt()

            if result is None:
                return nodes

            if isinstance(result, list):
                return [normalize_node_record(item) for item in result]

            if isinstance(result, Mapping):
                extracted = extract_nodes(result)
                if extracted:
                    return extracted
                return nodes

            return nodes

        except TypeError as err:
            last_type_error = err
            continue

    if last_type_error:
        raise RuntimeError(f"{name} signature mismatch: {last_type_error}") from last_type_error

    return nodes


def fallback_enrich(name: str, nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for node in nodes:
        normalize_enrichment(node)
        normalize_metadata(node)

        address = str(node.get("address", "")).lower()
        host = str(node.get("host") or node.get("hostname") or "").lower()

        if name == "ipv4":
            node["is_ipv4"] = host.count(".") == 3 and ":" not in host and ".onion" not in host and ".i2p" not in host

        elif name == "ipv6":
            node["is_ipv6"] = ":" in host and ".onion" not in host and ".i2p" not in host

        elif name == "tor":
            node["is_tor"] = ".onion" in address or host.endswith(".onion")

        elif name == "i2p":
            node["is_i2p"] = ".i2p" in address or host.endswith(".i2p")

        elif name == "proxy":
            node.setdefault("suspected_proxy", False)
            node.setdefault("is_proxy", False)

        elif name == "vpn":
            text = " ".join(
                str(node.get(key, ""))
                for key in ("provider", "organization", "org", "hostname", "hosting_type", "network_type", "asn")
            ).lower()

            suspected = any(
                token in text
                for token in ("vpn", "proxy", "mullvad", "proton", "nordvpn", "expressvpn", "surfshark", "private internet access", "pia")
            )

            node["suspected_vpn"] = suspected
            node["is_vpn"] = suspected

        elif name == "timezone":
            node.setdefault("timezone", "Unknown")

        elif name == "w3w_lookup":
            node.setdefault("w3w", "")
            node.setdefault("what3words", node.get("w3w", ""))

        elif name == "geohashid_lookup":
            node.setdefault("geohashid", node.get("geohash", ""))

        elif name == "sanctioned_nodes":
            node.setdefault("is_sanctioned_node", False)
            node.setdefault("is_policy_restricted_node", False)
            node.setdefault("is_policy_watch_node", False)
            node.setdefault("jurisdiction_risk_level", "unknown")

        elif name == "peer_index":
            latency = number(node.get("latency_ms"))
            latency_score = 0.0 if latency is None else max(0.0, 100.0 - min(100.0, latency / 5.0))
            reachable_score = 50.0 if boolish(node.get("reachable") or node.get("reachable_now")) is True else 0.0
            height_score = 25.0 if number(node.get("height")) else 0.0
            services_score = 25.0 if number(node.get("services")) else 0.0
            node.setdefault("peer_index", round(latency_score + reachable_score + height_score + services_score, 4))

        elif name == "peer_health":
            peer_health = node.get("peer_health")
            if not isinstance(peer_health, dict):
                peer_health = {}

            peer_health.setdefault("reachable", node.get("reachable"))
            peer_health.setdefault("reachable_now", node.get("reachable_now"))
            peer_health.setdefault("reachable_24h", node.get("reachable_24h"))
            peer_health.setdefault("latency_ms", node.get("latency_ms"))
            peer_health.setdefault("success_count", node.get("success_count"))
            peer_health.setdefault("failure_count", node.get("failure_count"))
            peer_health.setdefault("first_seen", node.get("first_seen"))
            peer_health.setdefault("last_seen", node.get("last_seen"))
            node["peer_health"] = peer_health

        node["enrichment"][name] = {
            "status": "fallback",
            "updated_at": utc_now(),
            "module_path": str(module_path(name)),
        }

        host_port_mirrors(node)
        network_fallback(node)
        preserve_coordinate_mirrors(node)

    return [normalize_node_record(node) for node in nodes]


def enrich_nodes(
    nodes: list[dict[str, Any]],
    *,
    modules: list[str] | None = None,
    context: dict[str, Any] | None = None,
    strict: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    selected_modules = modules or ENRICHMENT_ORDER
    context = context or {}

    report = {
        "schema": "zzx-bitnodes-enrichment-report-v8",
        "generated_at": utc_now(),
        "node_count": len(nodes),
        "initial_coordinate_count": coordinate_count(nodes),
        "selected_modules": selected_modules,
        "modules": [],
        "context": {
            key: context.get(key, "")
            for key in (
                "source", "input", "output", "api_dir", "state_dir",
                "geo_root", "geoip_dir", "city_db", "asn_db", "country_db",
            )
        },
    }

    enriched = [normalize_node_record(node) for node in nodes]

    for name in selected_modules:
        before_coords = coordinate_count(enriched)

        module_report = {
            "name": name,
            "module_path": str(module_path(name)),
            "status": "skipped",
            "message": "",
            "updated_at": utc_now(),
            "coordinate_count_before": before_coords,
            "coordinate_count_after": before_coords,
        }

        try:
            module = load_module(name)
        except Exception as err:
            module = None
            module_report["status"] = "error"
            module_report["message"] = f"{name} failed to load: {err}"
            module_report["traceback"] = traceback.format_exc(limit=5)

            if strict:
                report["modules"].append(module_report)
                raise

            enriched = fallback_enrich(name, enriched)
            module_report["coordinate_count_after"] = coordinate_count(enriched)
            report["modules"].append(module_report)
            continue

        if module is None:
            enriched = fallback_enrich(name, enriched)
            module_report["status"] = "fallback"
            module_report["message"] = f"{name} module not found; fallback enrichment applied."
            module_report["coordinate_count_after"] = coordinate_count(enriched)
            report["modules"].append(module_report)
            continue

        fn = find_enricher(module)

        if fn is None:
            enriched = fallback_enrich(name, enriched)
            module_report["status"] = "fallback"
            module_report["message"] = f"{name} has no supported enrichment function; fallback applied."
            module_report["coordinate_count_after"] = coordinate_count(enriched)
            report["modules"].append(module_report)
            continue

        try:
            enriched = call_enricher(name, fn, enriched, context)

            for node in enriched:
                normalize_enrichment(node)
                preserve_coordinate_mirrors(node)
                host_port_mirrors(node)
                network_fallback(node)
                node["enrichment"][name] = {
                    "status": "ok",
                    "updated_at": utc_now(),
                    "module_path": str(module_path(name)),
                }

            enriched = [normalize_node_record(node) for node in enriched]
            module_report["status"] = "ok"
            module_report["message"] = f"{name} enrichment completed."

        except Exception as err:
            module_report["status"] = "error"
            module_report["message"] = str(err)
            module_report["traceback"] = traceback.format_exc(limit=5)

            if strict:
                report["modules"].append(module_report)
                raise

            enriched = fallback_enrich(name, enriched)

        module_report["coordinate_count_after"] = coordinate_count(enriched)
        report["modules"].append(module_report)

    report["node_count"] = len(enriched)
    report["final_coordinate_count"] = coordinate_count(enriched)
    report["completed_at"] = utc_now()

    return enriched, report


def enrich_payload(
    payload: Any,
    *,
    modules: list[str] | None = None,
    context: dict[str, Any] | None = None,
    strict: bool = False,
) -> tuple[Any, dict[str, Any]]:
    nodes = extract_nodes(payload)

    enriched_nodes, report = enrich_nodes(nodes, modules=modules, context=context, strict=strict)
    output = put_nodes(payload, enriched_nodes)

    if isinstance(output, dict):
        output.setdefault("metadata", {})
        if not isinstance(output["metadata"], dict):
            output["metadata"] = {}

        output["metadata"]["enriched_at"] = report["generated_at"]
        output["metadata"]["enrichment_schema"] = report["schema"]
        output["metadata"]["enrichment_modules"] = [item["name"] for item in report["modules"]]
        output["metadata"]["enrichment_module_status"] = {item["name"]: item["status"] for item in report["modules"]}
        output["metadata"]["coordinate_count"] = report["final_coordinate_count"]
        output["source"] = context.get("source", output.get("source", "zzxbitnodes")) if context else output.get("source", "zzxbitnodes")

    return output, report


def parse_modules(value: str | None) -> list[str] | None:
    if not value:
        return None

    output = [item.strip() for item in value.split(",") if item.strip()]
    return output or None


def db_status(path: Path) -> dict[str, Any]:
    return {
        "path": str(path),
        "exists": path.exists(),
        "size_bytes": path.stat().st_size if path.exists() else 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run ZZX Bitnodes enrichment modules over crawler JSON output.", allow_abbrev=False)

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", default="")
    parser.add_argument("--modules", default="")
    parser.add_argument("--source", default="zzxbitnodes")
    parser.add_argument("--api-dir", default="")
    parser.add_argument("--state-dir", default="")
    parser.add_argument("--geo-root", default=str(DEFAULT_GEO_ROOT))
    parser.add_argument("--geoip-dir", default=str(DEFAULT_GEOIP_DIR))
    parser.add_argument("--city-db", default="")
    parser.add_argument("--asn-db", default="")
    parser.add_argument("--country-db", default="")
    parser.add_argument("--w3w-cache", default=str(DEFAULT_W3W_CACHE))
    parser.add_argument("--w3w-api-key", default="")
    parser.add_argument("--w3w-language", default="en")
    parser.add_argument("--w3w-no-api", action="store_true")
    parser.add_argument("--w3w-no-fallback", action="store_true")
    parser.add_argument("--w3w-sleep", type=float, default=0.0)
    parser.add_argument("--geohash-cache", default=str(DEFAULT_GEOHASH_CACHE))
    parser.add_argument("--geohash-precision", type=int, default=12)
    parser.add_argument("--geohash-prefix", default="gh")
    parser.add_argument("--sanctions-policy", default=str(DEFAULT_SANCTIONS_POLICY))
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    report_path = Path(args.report).resolve() if args.report else None

    payload = read_json(input_path, fallback={})

    geo_root = Path(args.geo_root).resolve()
    geoip_dir = Path(args.geoip_dir).resolve()
    city_db = Path(args.city_db).resolve() if args.city_db else geoip_dir / "dbip-city-lite.mmdb"
    asn_db = Path(args.asn_db).resolve() if args.asn_db else geoip_dir / "dbip-asn-lite.mmdb"
    country_db = Path(args.country_db).resolve() if args.country_db else geoip_dir / "dbip-country-lite.mmdb"

    context = {
        "app_root": str(APP_ROOT),
        "tools_dir": str(TOOLS_DIR),
        "bitnodes_root": str(BITNODES_ROOT),
        "bitnodes_data": str(BITNODES_DATA),
        "source": args.source,
        "api_dir": args.api_dir,
        "state_dir": args.state_dir,
        "input": str(input_path),
        "output": str(output_path),
        "geo_root": str(geo_root),
        "geo_dir": str(geo_root),
        "geoip_dir": str(geoip_dir),
        "city_db": str(city_db),
        "geoip_city_db": str(city_db),
        "asn_db": str(asn_db),
        "geoip_asn_db": str(asn_db),
        "country_db": str(country_db),
        "geoip_country_db": str(country_db),
        "geoip_db_status": {
            "city": db_status(city_db),
            "asn": db_status(asn_db),
            "country": db_status(country_db),
        },
        "w3w_cache": str(Path(args.w3w_cache).resolve()),
        "w3w_api_key": args.w3w_api_key,
        "w3w_language": args.w3w_language,
        "w3w_allow_api": not args.w3w_no_api,
        "w3w_allow_fallback": not args.w3w_no_fallback,
        "w3w_sleep_seconds": args.w3w_sleep,
        "geohash_cache": str(Path(args.geohash_cache).resolve()),
        "geohash_precision": args.geohash_precision,
        "geohash_prefix": args.geohash_prefix,
        "sanctions_policy": str(Path(args.sanctions_policy).resolve()),
    }

    output, report = enrich_payload(payload, modules=parse_modules(args.modules), context=context, strict=args.strict)
    report["geoip_db_status"] = context["geoip_db_status"]

    write_json(output_path, output, compact=args.compact)

    if report_path:
        write_json(report_path, report, compact=args.compact)

    print(
        "enrichment complete: "
        f"{report['node_count']} nodes, "
        f"coordinates={report['final_coordinate_count']}, "
        f"{len(report['modules'])} modules, "
        f"output={output_path}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
