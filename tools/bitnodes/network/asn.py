#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-asn-v1"

UNKNOWN_VALUES = {
    "",
    "unknown",
    "none",
    "null",
    "undefined",
    "n/a",
    "na",
    "-",
    "—",
}

ASN_RE = re.compile(r"(?:^|[^A-Z0-9])(AS\s*\d+|\d{1,10})(?:[^A-Z0-9]|$)", re.IGNORECASE)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    if compact:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)

    path.write_text(text + "\n", encoding="utf-8")


def clean(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return text


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return row.get(key)

    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None

        current = current.get(part)

    return current


def first(row: Mapping[str, Any], *keys: str) -> str:
    for key in keys:
        value = clean(deep_get(row, key))

        if value:
            return value

    return ""


def normalize_asn(value: Any) -> str:
    text = clean(value).upper()

    if not text:
        return ""

    if text.startswith("AS") and text[2:].strip().isdigit():
        return "AS" + text[2:].strip()

    if text.isdigit():
        return f"AS{text}"

    match = ASN_RE.search(text)

    if not match:
        return ""

    candidate = match.group(1).upper().replace(" ", "")

    if candidate.isdigit():
        return f"AS{candidate}"

    if candidate.startswith("AS") and candidate[2:].isdigit():
        return candidate

    return ""


def asn_number(asn: str) -> int | None:
    value = normalize_asn(asn)

    if not value.startswith("AS"):
        return None

    try:
        return int(value[2:])
    except ValueError:
        return None


def asn_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    asn_raw = first(
        row,
        "asn",
        "as",
        "as_number",
        "asnum",
        "autonomous_system",
        "autonomous_system_number",
        "isp.asn",
        "isp_data.asn",
        "geoip.asn",
        "geoip_data.asn",
        "asn_data.asn",
        "provider_data.asn",
    )

    organization = first(
        row,
        "as_org",
        "asn_org",
        "autonomous_system_organization",
        "organization",
        "org",
        "isp.organization",
        "isp_data.organization",
        "geoip.organization",
        "geoip.org",
        "asn_data.organization",
        "provider_data.organization",
    )

    provider = first(
        row,
        "provider",
        "isp.provider",
        "isp_data.provider",
        "geoip.provider",
        "geoip_data.provider",
        "provider_data.provider",
    )

    country = first(
        row,
        "country_code",
        "country",
        "geoip.country_code",
        "geoip.country",
        "geoip_data.country_code",
        "geoip_data.country",
    )

    registry = first(
        row,
        "registry",
        "rir",
        "asn_registry",
        "asn_data.registry",
        "geoip.registry",
    )

    route = first(
        row,
        "route",
        "prefix",
        "network_prefix",
        "asn_data.route",
        "geoip.route",
    )

    asn = normalize_asn(asn_raw)
    number = asn_number(asn)

    return {
        "schema": SCHEMA,
        "asn": asn,
        "asn_number": number,
        "asn_raw": asn_raw,
        "organization": organization,
        "provider": provider,
        "country": country.upper() if len(country) == 2 else country,
        "registry": registry.upper() if registry else "",
        "route": route,
        "has_asn": bool(asn),
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = asn_metadata(node)

    node["asn_data"] = meta

    if meta["asn"]:
        node["asn"] = meta["asn"]

    if meta["organization"]:
        node["organization"] = node.get("organization") or meta["organization"]
        node.setdefault("org", meta["organization"])

    if meta["provider"]:
        node["provider"] = node.get("provider") or meta["provider"]

    node["has_asn"] = meta["has_asn"]
    node["asn_number"] = meta["asn_number"]

    node.setdefault("enrichment", {})
    node["enrichment"]["asn"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    if isinstance(nodes, list):
        return [
            enrich_node(dict(node)) if isinstance(node, Mapping) else node
            for node in nodes
        ]

    if isinstance(nodes, Mapping):
        return {
            key: enrich_node(dict(value)) if isinstance(value, Mapping) else value
            for key, value in nodes.items()
        }

    return nodes


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    if isinstance(payload, list):
        return enrich_nodes(payload, context)

    if not isinstance(payload, MutableMapping):
        return payload

    if isinstance(payload.get("nodes"), (list, dict)):
        payload["nodes"] = enrich_nodes(payload["nodes"], context)

    if isinstance(payload.get("results"), list):
        payload["results"] = enrich_nodes(payload["results"], context)

    if isinstance(payload.get("data"), list):
        payload["data"] = enrich_nodes(payload["data"], context)

    payload.setdefault("metadata", {})

    if isinstance(payload["metadata"], MutableMapping):
        payload["metadata"]["asn_enriched_at"] = utc_now()

    return payload


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    if isinstance(payload, list):
        return [node for node in payload if isinstance(node, Mapping)]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [node for node in nodes if isinstance(node, Mapping)]

    if isinstance(nodes, Mapping):
        return [node for node in nodes.values() if isinstance(node, Mapping)]

    for key in ("results", "data"):
        value = payload.get(key)

        if isinstance(value, list):
            return [node for node in value if isinstance(node, Mapping)]

    return []


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    asn_counts: dict[str, int] = {}
    org_counts: dict[str, int] = {}
    provider_counts: dict[str, int] = {}
    registry_counts: dict[str, int] = {}
    no_asn = 0

    for node in nodes:
        meta = node.get("asn_data", {})

        if not isinstance(meta, Mapping):
            meta = {}

        asn = clean(meta.get("asn")) or clean(node.get("asn"))

        if not asn:
            no_asn += 1
            asn = "Unknown"

        organization = clean(meta.get("organization")) or clean(node.get("organization")) or "Unknown"
        provider = clean(meta.get("provider")) or clean(node.get("provider")) or "Unknown"
        registry = clean(meta.get("registry")) or "Unknown"

        asn_counts[asn] = asn_counts.get(asn, 0) + 1
        org_counts[organization] = org_counts.get(organization, 0) + 1
        provider_counts[provider] = provider_counts.get(provider, 0) + 1
        registry_counts[registry] = registry_counts.get(registry, 0) + 1

    def top(counter: dict[str, int], limit: int = 100) -> list[dict[str, Any]]:
        return [
            {"name": name, "count": count}
            for name, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
        ]

    return {
        "schema": "zzx-bitnodes-asn-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "asn_count": max(0, len(asn_counts) - (1 if "Unknown" in asn_counts else 0)),
        "nodes_without_asn": no_asn,
        "top": {
            "asns": top(asn_counts),
            "organizations": top(org_counts),
            "providers": top(provider_counts),
            "registries": top(registry_counts),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with ASN normalization and ASN metadata."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload)

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"asn enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
