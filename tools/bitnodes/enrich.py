#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

ENRICHMENT_ORDER = [
    "ip_db",
    "ipv4",
    "ipv6",
    "tor",
    "i2p",
    "proxy",
    "vpn",
    "geoloc",
    "continent",
    "region",
    "country",
    "territory",
    "county",
    "city",
    "zip",
    "isp",
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

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        handle.write("\n")


def normalize_node_record(node: Any) -> dict[str, Any]:
    if isinstance(node, dict):
        record = dict(node)
    else:
        record = {
            "address": str(node),
        }

    address = (
        record.get("address")
        or record.get("node")
        or record.get("addr")
        or record.get("host")
        or ""
    )

    record["address"] = str(address)

    if "enrichment" not in record or not isinstance(record["enrichment"], dict):
        record["enrichment"] = {}

    return record


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [normalize_node_record(item) for item in payload]

    if not isinstance(payload, dict):
        return []

    for key in (
        "nodes",
        "results",
        "rows",
        "data",
        "reachable",
        "unreachable",
        "node_records",
    ):
        value = payload.get(key)

        if isinstance(value, list):
            return [normalize_node_record(item) for item in value]

    bitnodes_nodes = payload.get("nodes")

    if isinstance(bitnodes_nodes, dict):
        output: list[dict[str, Any]] = []

        for address, data in bitnodes_nodes.items():
            if isinstance(data, list):
                record = {
                    "address": address,
                    "status": data[0] if len(data) > 0 else None,
                    "protocol": data[1] if len(data) > 1 else None,
                    "agent": data[2] if len(data) > 2 else None,
                    "height": data[3] if len(data) > 3 else None,
                    "services": data[4] if len(data) > 4 else None,
                    "timestamp": data[5] if len(data) > 5 else None,
                }
            elif isinstance(data, dict):
                record = {
                    "address": address,
                    **data,
                }
            else:
                record = {
                    "address": address,
                    "value": data,
                }

            output.append(normalize_node_record(record))

        return output

    return []


def put_nodes(payload: Any, nodes: list[dict[str, Any]]) -> Any:
    if isinstance(payload, list):
        return nodes

    if not isinstance(payload, dict):
        return {
            "nodes": nodes,
        }

    output = dict(payload)

    for key in (
        "nodes",
        "results",
        "rows",
        "data",
        "reachable",
        "unreachable",
        "node_records",
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

    spec = importlib.util.spec_from_file_location(
        f"zzx_bitnodes_enrichment_{module_name}",
        path,
    )

    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

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

    last_error: Exception | None = None

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
            last_error = err
            continue

    if last_error:
        raise RuntimeError(f"{name} signature mismatch: {last_error}") from last_error

    return nodes


def fallback_enrich(name: str, nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for node in nodes:
        address = str(node.get("address", ""))

        if name == "ipv4":
            node["is_ipv4"] = address.count(".") == 3 and ":" not in address

        elif name == "ipv6":
            node["is_ipv6"] = ":" in address and ".onion" not in address.lower()

        elif name == "tor":
            node["is_tor"] = ".onion" in address.lower()

        elif name == "i2p":
            node["is_i2p"] = ".i2p" in address.lower()

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
        "schema": "zzx-bitnodes-enrichment-report-v1",
        "generated_at": utc_now(),
        "node_count": len(nodes),
        "modules": [],
    }

    enriched = [normalize_node_record(node) for node in nodes]

    for name in selected_modules:
        module_report = {
            "name": name,
            "status": "skipped",
            "message": "",
            "updated_at": utc_now(),
        }

        module = load_module(name)

        if module is None:
            enriched = fallback_enrich(name, enriched)

            module_report["status"] = "fallback"
            module_report["message"] = f"{name}.py not found or not loadable; fallback enrichment applied where possible."
            report["modules"].append(module_report)
            continue

        fn = find_enricher(module)

        if fn is None:
            enriched = fallback_enrich(name, enriched)

            module_report["status"] = "fallback"
            module_report["message"] = f"{name}.py has no enrich/process/run function; fallback enrichment applied where possible."
            report["modules"].append(module_report)
            continue

        try:
            enriched = call_enricher(name, fn, enriched, context)

            for node in enriched:
                node.setdefault("enrichment", {})
                node["enrichment"][name] = {
                    "status": "ok",
                    "updated_at": utc_now(),
                }

            module_report["status"] = "ok"
            module_report["message"] = f"{name}.py enrichment completed."

        except Exception as err:
            module_report["status"] = "error"
            module_report["message"] = str(err)

            if strict:
                report["modules"].append(module_report)
                raise

            enriched = fallback_enrich(name, enriched)

        report["modules"].append(module_report)

    report["node_count"] = len(enriched)

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
        output["metadata"]["enriched_at"] = report["generated_at"]
        output["metadata"]["enrichment_modules"] = [
            item["name"]
            for item in report["modules"]
        ]

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

    parser.add_argument(
        "--input",
        required=True,
        help="Input JSON file containing node records.",
    )

    parser.add_argument(
        "--output",
        required=True,
        help="Output JSON file for enriched node records.",
    )

    parser.add_argument(
        "--report",
        default="",
        help="Optional enrichment report JSON output path.",
    )

    parser.add_argument(
        "--modules",
        default="",
        help="Comma-separated enrichment modules to run. Defaults to the full enrichment chain.",
    )

    parser.add_argument(
        "--source",
        default="zzxbitnodes",
        help="Source label, such as zzxbitnodes or originalbitnodes.",
    )

    parser.add_argument(
        "--api-dir",
        default="",
        help="Optional API output directory context.",
    )

    parser.add_argument(
        "--state-dir",
        default="",
        help="Optional crawler state directory context.",
    )

    parser.add_argument(
        "--geoip-dir",
        default="",
        help="Optional GeoIP directory context.",
    )

    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail immediately if an enrichment module errors.",
    )

    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    report_path = Path(args.report).resolve() if args.report else None

    payload = read_json(input_path, fallback={})

    context = {
        "app_root": str(APP_ROOT),
        "tools_dir": str(TOOLS_DIR),
        "source": args.source,
        "api_dir": args.api_dir,
        "state_dir": args.state_dir,
        "geoip_dir": args.geoip_dir,
        "input": str(input_path),
        "output": str(output_path),
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
