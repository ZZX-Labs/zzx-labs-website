#!/usr/bin/env python3
from __future__ import annotations

import argparse
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

DEFAULT_GEOIP_CITY_DB = DEFAULT_GEOIP_DIR / "dbip-city-lite.mmdb"
DEFAULT_GEOIP_ASN_DB = DEFAULT_GEOIP_DIR / "dbip-asn-lite.mmdb"
DEFAULT_GEOIP_COUNTRY_DB = DEFAULT_GEOIP_DIR / "dbip-country-lite.mmdb"

DEFAULT_TERRITORY_DIR = DEFAULT_GEO_ROOT / "territories"
DEFAULT_COUNTY_DIR = DEFAULT_GEO_ROOT / "counties"
DEFAULT_CITY_DIR = DEFAULT_GEO_ROOT / "cities"
DEFAULT_ZIP_DIR = DEFAULT_GEO_ROOT / "postal"
DEFAULT_TIMEZONE_DIR = DEFAULT_GEO_ROOT / "timezones"

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


def has_valid_coordinates(node: Mapping[str, Any]) -> bool:
    lat = first_present(
        node,
        (
            "latitude",
            "lat",
            "geo.latitude",
            "geo.lat",
            "geoip.latitude",
            "geoip.lat",
            "geoip_data.latitude",
            "geoip_data.lat",
            "geoloc.latitude",
            "geoloc.lat",
            "location.latitude",
            "location.lat",
            "metadata.latitude",
            "metadata.lat",
        ),
    )

    lon = first_present(
        node,
        (
            "longitude",
            "lon",
            "lng",
            "geo.longitude",
            "geo.lon",
            "geo.lng",
            "geoip.longitude",
            "geoip.lon",
            "geoip.lng",
            "geoip_data.longitude",
            "geoip_data.lon",
            "geoip_data.lng",
            "geoloc.longitude",
            "geoloc.lon",
            "geoloc.lng",
            "location.longitude",
            "location.lon",
            "location.lng",
            "metadata.longitude",
            "metadata.lon",
            "metadata.lng",
        ),
    )

    lat_f = number(lat)
    lon_f = number(lon)

    return (
        lat_f is not None
        and lon_f is not None
        and -90 <= lat_f <= 90
        and -180 <= lon_f <= 180
    )


def coordinate_count(nodes: list[dict[str, Any]]) -> int:
    return sum(1 for node in nodes if isinstance(node, Mapping) and has_valid_coordinates(node))


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


def preserve_coordinate_mirrors(record: dict[str, Any]) -> None:
    lat = first_present(
        record,
        (
            "latitude",
            "lat",
            "geo.latitude",
            "geo.lat",
            "geoip.latitude",
            "geoip.lat",
            "geoip_data.latitude",
            "geoip_data.lat",
            "geoloc.latitude",
            "geoloc.lat",
            "location.latitude",
            "location.lat",
            "metadata.latitude",
            "metadata.lat",
        ),
    )

    lon = first_present(
        record,
        (
            "longitude",
            "lon",
            "lng",
            "geo.longitude",
            "geo.lon",
            "geo.lng",
            "geoip.longitude",
            "geoip.lon",
            "geoip.lng",
            "geoip_data.longitude",
            "geoip_data.lon",
            "geoip_data.lng",
            "geoloc.longitude",
            "geoloc.lon",
            "geoloc.lng",
            "location.longitude",
            "location.lon",
            "location.lng",
            "metadata.longitude",
            "metadata.lon",
            "metadata.lng",
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

    if not isinstance(record.get("enrichment"), dict):
        record["enrichment"] = {}

    metadata = normalize_metadata(record)

    for key in (
        "reachable",
        "reachable_now",
        "reachable_24h",
        "latency_ms",
        "uptime_seconds",
        "total_uptime",
        "peer_index",
        "peer_health",
        "is_tor",
        "is_i2p",
        "is_ipv4",
        "is_ipv6",
        "is_vpn",
        "suspected_vpn",
        "is_proxy",
        "suspected_proxy",
        "network",
        "first_seen",
        "last_seen",
        "last_failure",
        "success_count",
        "failure_count",
        "country",
        "country_code",
        "country_name",
        "continent",
        "region",
        "territory",
        "city",
        "county",
        "postal",
        "postal_code",
        "zip",
        "timezone",
        "latitude",
        "longitude",
        "lat",
        "lon",
        "lng",
        "asn",
        "provider",
        "organization",
        "org",
        "isp",
        "datacenter",
        "government",
        "military",
        "land_parcel",
        "building_perimeter",
        "asn_footprint",
    ):
        if key not in record and key in metadata:
            record[key] = metadata.get(key)

    if record.get("peer_health") is not None and not isinstance(record.get("peer_health"), dict):
        record["peer_health"] = {}

    preserve_coordinate_mirrors(record)
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

    for key in (
        "rows",
        "results",
        "data",
        "reachable",
        "unreachable",
        "node_records",
        "peers",
        "reachable_nodes",
    ):
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
            str(node.get("address") or index): node
            for index, node in enumerate(nodes)
        }
        return output

    if isinstance(original_nodes, list):
        output["nodes"] = nodes
        return output

    for key in (
        "rows",
        "results",
        "data",
        "reachable",
        "unreachable",
        "node_records",
        "peers",
        "reachable_nodes",
    ):
        if isinstance(output.get(key), list):
            output[key] = nodes
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
    for name in (
        "enrich_nodes",
        "enrich_payload",
        "enrich",
        "process_nodes",
        "process",
        "run",
    ):
        fn = getattr(module, name, None)

        if callable(fn):
            return fn

    return None


def call_enricher(
    name: str,
    fn: Callable[..., Any],
    nodes: list[dict[str, Any]],
    context: dict[str, Any],
) -> list[dict[str, Any]]:
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
        if not isinstance(node, dict):
            continue

        normalize_enrichment(node)
        normalize_metadata(node)

        address = str(node.get("address", "")).lower()

        if name == "ipv4":
            node["is_ipv4"] = address.count(".") == 3 and ":" not in address and ".onion" not in address and ".i2p" not in address

        elif name == "ipv6":
            node["is_ipv6"] = ":" in address and ".onion" not in address and ".i2p" not in address

        elif name == "tor":
            node["is_tor"] = ".onion" in address

        elif name == "i2p":
            node["is_i2p"] = ".i2p" in address

        elif name == "proxy":
            node.setdefault("suspected_proxy", False)
            node.setdefault("is_proxy", False)

        elif name == "vpn":
            text = " ".join(
                str(node.get(key, ""))
                for key in (
                    "provider",
                    "organization",
                    "org",
                    "hostname",
                    "hosting_type",
                    "network_type",
                    "asn",
                )
            ).lower()

            suspected = any(
                token in text
                for token in (
                    "vpn",
                    "proxy",
                    "mullvad",
                    "proton",
                    "nordvpn",
                    "expressvpn",
                    "surfshark",
                    "private internet access",
                    "pia",
                )
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

        elif name == "peer_health":
            peer_health = node.get("peer_health")

            if not isinstance(peer_health, dict):
                peer_health = {}

            reachable = node.get("reachable")

            if reachable is None:
                reachable = node.get("reachable_now")

            peer_health.setdefault("reachable", reachable)
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

        preserve_coordinate_mirrors(node)

    return nodes


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
        "schema": "zzx-bitnodes-enrichment-report-v7",
        "generated_at": utc_now(),
        "node_count": len(nodes),
        "initial_coordinate_count": coordinate_count(nodes),
        "selected_modules": selected_modules,
        "modules": [],
        "context": {
            "source": context.get("source", ""),
            "input": context.get("input", ""),
            "output": context.get("output", ""),
            "api_dir": context.get("api_dir", ""),
            "state_dir": context.get("state_dir", ""),
            "geo_root": context.get("geo_root", ""),
            "geoip_dir": context.get("geoip_dir", ""),
            "city_db": context.get("city_db", ""),
            "asn_db": context.get("asn_db", ""),
            "country_db": context.get("country_db", ""),
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
            module_report["message"] = f"{name} module not found at {module_path(name)}; fallback enrichment applied."
            module_report["coordinate_count_after"] = coordinate_count(enriched)
            report["modules"].append(module_report)
            continue

        fn = find_enricher(module)

        if fn is None:
            enriched = fallback_enrich(name, enriched)
            module_report["status"] = "fallback"
            module_report["message"] = f"{name} has no supported enrichment function; fallback enrichment applied."
            module_report["coordinate_count_after"] = coordinate_count(enriched)
            report["modules"].append(module_report)
            continue

        try:
            enriched = call_enricher(name, fn, enriched, context)

            for node in enriched:
                if not isinstance(node, dict):
                    continue

                normalize_enrichment(node)
                preserve_coordinate_mirrors(node)
                node["enrichment"][name] = {
                    "status": "ok",
                    "updated_at": utc_now(),
                    "module_path": str(module_path(name)),
                }

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

    enriched_nodes, report = enrich_nodes(
        nodes,
        modules=modules,
        context=context,
        strict=strict,
    )

    output = put_nodes(payload, enriched_nodes)

    if isinstance(output, dict):
        output.setdefault("metadata", {})

        if not isinstance(output["metadata"], dict):
            output["metadata"] = {}

        output["metadata"]["enriched_at"] = report["generated_at"]
        output["metadata"]["enrichment_schema"] = report["schema"]
        output["metadata"]["enrichment_modules"] = [item["name"] for item in report["modules"]]
        output["metadata"]["enrichment_module_status"] = {
            item["name"]: item["status"]
            for item in report["modules"]
        }
        output["metadata"]["coordinate_count"] = report["final_coordinate_count"]

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
    parser = argparse.ArgumentParser(
        description="Run ZZX Bitnodes enrichment modules over crawler JSON output.",
        allow_abbrev=False,
    )

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

    parser.add_argument("--territory-dir", default=str(DEFAULT_TERRITORY_DIR))
    parser.add_argument("--county-dir", default=str(DEFAULT_COUNTY_DIR))
    parser.add_argument("--city-dir", default=str(DEFAULT_CITY_DIR))
    parser.add_argument("--zip-dir", default=str(DEFAULT_ZIP_DIR))
    parser.add_argument("--timezone-dir", default=str(DEFAULT_TIMEZONE_DIR))

    parser.add_argument("--land-parcel-dir", default=str(DEFAULT_GEO_ROOT / "parcels"))
    parser.add_argument("--building-perimeter-dir", default=str(DEFAULT_GEO_ROOT / "buildings"))
    parser.add_argument("--asn-footprint-dir", default=str(DEFAULT_GEO_ROOT / "asn-footprints"))
    parser.add_argument("--boundary-dir", default=str(DEFAULT_GEO_ROOT / "boundaries"))

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

    territory_dir = Path(args.territory_dir).resolve()
    county_dir = Path(args.county_dir).resolve()
    city_dir = Path(args.city_dir).resolve()
    zip_dir = Path(args.zip_dir).resolve()
    timezone_dir = Path(args.timezone_dir).resolve()
    w3w_cache = Path(args.w3w_cache).resolve()
    geohash_cache = Path(args.geohash_cache).resolve()
    sanctions_policy = Path(args.sanctions_policy).resolve()

    land_parcel_dir = Path(args.land_parcel_dir).resolve()
    building_perimeter_dir = Path(args.building_perimeter_dir).resolve()
    asn_footprint_dir = Path(args.asn_footprint_dir).resolve()
    boundary_dir = Path(args.boundary_dir).resolve()

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

        "territory_dir": str(territory_dir),
        "territories_dir": str(territory_dir),
        "county_dir": str(county_dir),
        "counties_dir": str(county_dir),
        "city_dir": str(city_dir),
        "cities_dir": str(city_dir),
        "zip_dir": str(zip_dir),
        "postal_dir": str(zip_dir),
        "timezone_dir": str(timezone_dir),
        "timezones_dir": str(timezone_dir),

        "boundary_dir": str(boundary_dir),
        "boundaries_dir": str(boundary_dir),
        "land_parcel_dir": str(land_parcel_dir),
        "parcels_dir": str(land_parcel_dir),
        "building_perimeter_dir": str(building_perimeter_dir),
        "buildings_dir": str(building_perimeter_dir),
        "asn_footprint_dir": str(asn_footprint_dir),
        "asn_footprints_dir": str(asn_footprint_dir),

        "w3w_cache": str(w3w_cache),
        "w3w_cache_path": str(w3w_cache),
        "w3w_api_key": args.w3w_api_key,
        "what3words_api_key": args.w3w_api_key,
        "w3w_language": args.w3w_language,
        "language": args.w3w_language,
        "w3w_allow_api": not args.w3w_no_api,
        "w3w_allow_fallback": not args.w3w_no_fallback,
        "w3w_sleep_seconds": args.w3w_sleep,
        "geohash_cache": str(geohash_cache),
        "geohash_cache_path": str(geohash_cache),
        "geohash_precision": args.geohash_precision,
        "precision": args.geohash_precision,
        "geohash_prefix": args.geohash_prefix,
        "prefix": args.geohash_prefix,
        "sanctions_policy": str(sanctions_policy),
        "sanctioned_policy": str(sanctions_policy),
        "policy_path": str(sanctions_policy),
    }

    output, report = enrich_payload(
        payload,
        modules=parse_modules(args.modules),
        context=context,
        strict=args.strict,
    )

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
