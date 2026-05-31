#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

DEFAULT_GEO_ROOT = TOOLS_DIR / "data" / "geo"
DEFAULT_GEOIP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geoip"

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
    "continent",
    "region",
    "country",
    "territory",
    "county",
    "city",
    "zip",
    "timezone",
    "isp",
    "w3w_lookup",
    "geohashid_lookup",
    "sanctioned_nodes",
    "peers",
    "peer_index",
    "peer_health",
    "dns_seeder_health",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return fallback


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def clean_address(value: Any) -> str:
    return str(value or "").strip()


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


def normalize_peer_health(record: dict[str, Any]) -> dict[str, Any]:
    peer_health = record.get("peer_health")

    if isinstance(peer_health, dict):
        return peer_health

    record["peer_health"] = {}

    return record["peer_health"]


def normalize_node_record(node: Any) -> dict[str, Any]:
    if isinstance(node, dict):
        record = dict(node)
    else:
        record = {"address": str(node)}

    address = (
        record.get("address")
        or record.get("node")
        or record.get("addr")
        or record.get("host")
        or ""
    )

    record["address"] = clean_address(address)

    enrichment = record.get("enrichment")

    if not isinstance(enrichment, dict):
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
        "is_proxy",
        "network",
        "first_seen",
        "last_seen",
        "last_failure",
        "success_count",
        "failure_count",
    ):
        if key not in record and key in metadata:
            record[key] = metadata.get(key)

    if record.get("peer_health") is not None and not isinstance(record.get("peer_health"), dict):
        record["peer_health"] = {}

    return record


def bitnodes_array_to_record(address: str, data: list[Any]) -> dict[str, Any]:
    row = list(data)

    while len(row) < 20:
        row.append(None)

    metadata = row[19] if isinstance(row[19], dict) else {}

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
        "postal_code": row[15],
        "w3w": row[16],
        "what3words": row[16],
        "geohash": row[17],
        "geohashid": row[17],
        "asn_location": row[18],
        "metadata": metadata,
    }

    if isinstance(metadata, dict):
        for key, value in metadata.items():
            record.setdefault(key, value)

    return normalize_node_record(record)


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [normalize_node_record(item) for item in payload]

    if not isinstance(payload, dict):
        return []

    for key in (
        "rows",
        "results",
        "data",
        "reachable",
        "unreachable",
        "node_records",
        "peers",
    ):
        value = payload.get(key)

        if isinstance(value, list):
            return [normalize_node_record(item) for item in value]

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [normalize_node_record(item) for item in nodes]

    if isinstance(nodes, dict):
        output: list[dict[str, Any]] = []

        for address, data in nodes.items():
            if isinstance(data, list):
                output.append(bitnodes_array_to_record(str(address), data))
            elif isinstance(data, dict):
                output.append(normalize_node_record({"address": address, **data}))
            else:
                output.append(normalize_node_record({"address": address, "value": data}))

        return output

    return []


def put_nodes(payload: Any, nodes: list[dict[str, Any]]) -> Any:
    if isinstance(payload, list):
        return nodes

    if not isinstance(payload, dict):
        return {"nodes": nodes}

    output = dict(payload)

    for key in (
        "rows",
        "results",
        "data",
        "reachable",
        "unreachable",
        "node_records",
        "peers",
    ):
        if isinstance(output.get(key), list):
            output[key] = nodes
            return output

    output["nodes"] = nodes

    return output


def load_module(module_name: str) -> Any | None:
    path = TOOLS_DIR / f"{module_name}.py"

    if not path.exists():
        return None

    import_name = f"zzx_bitnodes_enrichment_{module_name}"

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
    )

    last_type_error: Exception | None = None

    for attempt in attempts:
        try:
            result = attempt()

            if result is None:
                return nodes

            if isinstance(result, list):
                return [normalize_node_record(item) for item in result]

            if isinstance(result, dict):
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
            node["is_ipv4"] = address.count(".") == 3 and ":" not in address

        elif name == "ipv6":
            node["is_ipv6"] = (
                ":" in address
                and ".onion" not in address
                and ".i2p" not in address
            )

        elif name == "tor":
            node["is_tor"] = ".onion" in address

        elif name == "i2p":
            node["is_i2p"] = ".i2p" in address

        elif name == "proxy":
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

            node["is_vpn"] = any(
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
        }

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
        "schema": "zzx-bitnodes-enrichment-report-v4",
        "generated_at": utc_now(),
        "node_count": len(nodes),
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
        },
    }

    enriched = [normalize_node_record(node) for node in nodes]

    for name in selected_modules:
        module_report = {
            "name": name,
            "status": "skipped",
            "message": "",
            "updated_at": utc_now(),
        }

        try:
            module = load_module(name)
        except Exception as err:
            module = None
            module_report["status"] = "error"
            module_report["message"] = f"{name}.py failed to load: {err}"
            module_report["traceback"] = traceback.format_exc(limit=5)

            if strict:
                report["modules"].append(module_report)
                raise

            enriched = fallback_enrich(name, enriched)
            report["modules"].append(module_report)
            continue

        if module is None:
            enriched = fallback_enrich(name, enriched)
            module_report["status"] = "fallback"
            module_report["message"] = f"{name}.py not found; fallback enrichment applied."
            report["modules"].append(module_report)
            continue

        fn = find_enricher(module)

        if fn is None:
            enriched = fallback_enrich(name, enriched)
            module_report["status"] = "fallback"
            module_report["message"] = f"{name}.py has no supported enrichment function; fallback enrichment applied."
            report["modules"].append(module_report)
            continue

        try:
            enriched = call_enricher(name, fn, enriched, context)

            for node in enriched:
                if not isinstance(node, dict):
                    continue

                normalize_enrichment(node)
                node["enrichment"][name] = {
                    "status": "ok",
                    "updated_at": utc_now(),
                }

            module_report["status"] = "ok"
            module_report["message"] = f"{name}.py enrichment completed."

        except Exception as err:
            module_report["status"] = "error"
            module_report["message"] = str(err)
            module_report["traceback"] = traceback.format_exc(limit=5)

            if strict:
                report["modules"].append(module_report)
                raise

            enriched = fallback_enrich(name, enriched)

        report["modules"].append(module_report)

    report["node_count"] = len(enriched)
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
        output["metadata"]["enrichment_modules"] = [
            item["name"]
            for item in report["modules"]
        ]
        output["metadata"]["enrichment_module_status"] = {
            item["name"]: item["status"]
            for item in report["modules"]
        }

    return output, report


def parse_modules(value: str | None) -> list[str] | None:
    if not value:
        return None

    output = [
        item.strip()
        for item in value.split(",")
        if item.strip()
    ]

    return output or None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run ZZX Bitnodes enrichment modules over crawler JSON output."
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

    parser.add_argument("--territory-dir", default=str(DEFAULT_TERRITORY_DIR))
    parser.add_argument("--county-dir", default=str(DEFAULT_COUNTY_DIR))
    parser.add_argument("--city-dir", default=str(DEFAULT_CITY_DIR))
    parser.add_argument("--zip-dir", default=str(DEFAULT_ZIP_DIR))
    parser.add_argument("--timezone-dir", default=str(DEFAULT_TIMEZONE_DIR))

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

    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    report_path = Path(args.report).resolve() if args.report else None

    payload = read_json(input_path, fallback={})

    geo_root = Path(args.geo_root).resolve()
    geoip_dir = Path(args.geoip_dir).resolve()
    territory_dir = Path(args.territory_dir).resolve()
    county_dir = Path(args.county_dir).resolve()
    city_dir = Path(args.city_dir).resolve()
    zip_dir = Path(args.zip_dir).resolve()
    timezone_dir = Path(args.timezone_dir).resolve()
    w3w_cache = Path(args.w3w_cache).resolve()
    geohash_cache = Path(args.geohash_cache).resolve()
    sanctions_policy = Path(args.sanctions_policy).resolve()

    context = {
        "app_root": str(APP_ROOT),
        "tools_dir": str(TOOLS_DIR),
        "source": args.source,
        "api_dir": args.api_dir,
        "state_dir": args.state_dir,
        "input": str(input_path),
        "output": str(output_path),
        "geo_root": str(geo_root),
        "geoip_dir": str(geoip_dir),
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

    write_json(output_path, output)

    if report_path:
        write_json(report_path, report)

    print(
        "enrichment complete: "
        f"{report['node_count']} nodes, "
        f"{len(report['modules'])} modules, "
        f"output={output_path}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
