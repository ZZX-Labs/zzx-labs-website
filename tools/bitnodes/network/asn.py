#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-asn-v2"

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


def clean(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return text


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)

    return current


def first(row: Mapping[str, Any], *keys: str) -> str:
    for key in keys:
        value = clean(deep_get(row, key) if "." in key else row.get(key))

        if value:
            return value

    return ""


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
        "up",
        "online",
        "reachable",
        "success",
        "connected",
        "on",
    }


def normalize_asn(value: Any) -> str:
    text = clean(value).upper()

    if not text:
        return ""

    text = text.replace("ASN", "AS")

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


def asn_number(asn: Any) -> int | None:
    value = normalize_asn(asn)

    if not value.startswith("AS"):
        return None

    try:
        return int(value[2:])
    except ValueError:
        return None


def normalize_country(value: Any) -> str:
    text = clean(value)

    if len(text) == 2:
        return text.upper()

    return text


def infer_provider_kind(row: Mapping[str, Any], organization: str, provider: str) -> str:
    explicit = first(
        row,
        "provider_kind",
        "metadata.provider_kind",
        "provider_data.provider_kind",
        "asn_data.provider_kind",
    )

    if explicit:
        return explicit.lower()

    text = f"{organization} {provider}".lower()

    datacenter_tokens = (
        "amazon", "aws", "google", "microsoft", "azure", "cloudflare", "digitalocean",
        "linode", "akamai", "ovh", "hetzner", "vultr", "leaseweb", "contabo",
        "data center", "datacenter", "hosting", "colo", "colocation", "cloud",
    )

    vpn_tokens = (
        "vpn", "mullvad", "proton", "nordvpn", "expressvpn", "surfshark",
        "private internet access", "pia", "torguard",
    )

    government_tokens = (
        "government", "gov", "defense", "defence", "military", "army", "navy",
        "air force", "ministry", "department of", "dod", "nsa", "darpa",
    )

    if any(token in text for token in government_tokens):
        return "government"

    if any(token in text for token in vpn_tokens):
        return "vpn"

    if any(token in text for token in datacenter_tokens):
        return "datacenter"

    return "network"


def infer_organization_type(row: Mapping[str, Any], organization: str, provider: str) -> str:
    explicit = first(
        row,
        "organization_type",
        "metadata.organization_type",
        "organization_data.organization_type",
        "asn_data.organization_type",
    )

    if explicit:
        return explicit.lower()

    text = f"{organization} {provider}".lower()

    if any(token in text for token in ("university", "college", "research", "institute")):
        return "academic"

    if any(token in text for token in ("government", ".gov", "ministry", "department of")):
        return "government"

    if any(token in text for token in ("military", "defense", "defence", "army", "navy", "air force")):
        return "military"

    if any(token in text for token in ("hosting", "cloud", "datacenter", "data center", "colo")):
        return "infrastructure"

    if organization or provider:
        return "commercial"

    return ""


def infer_network_classification(row: Mapping[str, Any], organization: str, provider: str) -> str:
    explicit = first(
        row,
        "network_classification",
        "metadata.network_classification",
        "isp.network_classification",
        "asn_data.network_classification",
    )

    if explicit:
        return explicit.lower()

    provider_kind = infer_provider_kind(row, organization, provider)

    if provider_kind in {"datacenter", "vpn", "government"}:
        return provider_kind

    text = f"{organization} {provider}".lower()

    if any(token in text for token in ("broadband", "fiber", "cable", "telecom", "communications", "internet service")):
        return "residential_isp"

    if any(token in text for token in ("mobile", "wireless", "cellular", "lte", "5g")):
        return "mobile_isp"

    if organization or provider:
        return "transit_or_enterprise"

    return "unknown"


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
        "metadata.asn",
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
        "geoip_data.organization",
        "asn_data.organization",
        "provider_data.organization",
        "metadata.organization",
        "metadata.org",
    )

    provider = first(
        row,
        "provider",
        "isp",
        "isp.provider",
        "isp_data.provider",
        "geoip.provider",
        "geoip_data.provider",
        "provider_data.provider",
        "metadata.provider",
    )

    country = first(
        row,
        "country_code",
        "country",
        "geoip.country_code",
        "geoip.country",
        "geoip_data.country_code",
        "geoip_data.country",
        "asn_data.country",
        "metadata.country",
        "metadata.country_code",
    )

    registry = first(
        row,
        "registry",
        "rir",
        "asn_registry",
        "asn_data.registry",
        "geoip.registry",
        "metadata.registry",
    )

    route = first(
        row,
        "route",
        "prefix",
        "network_prefix",
        "asn_data.route",
        "geoip.route",
        "metadata.route",
    )

    asn_name = first(
        row,
        "asn_name",
        "autonomous_system_name",
        "asn_data.name",
        "geoip.asn_name",
        "metadata.asn_name",
    )

    asn = normalize_asn(asn_raw)
    number = asn_number(asn)

    provider_kind = infer_provider_kind(row, organization, provider)
    organization_type = infer_organization_type(row, organization, provider)
    network_classification = infer_network_classification(row, organization, provider)

    return {
        "schema": SCHEMA,
        "asn": asn,
        "asn_number": number,
        "asn_raw": asn_raw,
        "asn_name": asn_name,
        "organization": organization,
        "provider": provider,
        "country": normalize_country(country),
        "country_code": normalize_country(country),
        "registry": registry.upper() if registry else "",
        "route": route,
        "provider_kind": provider_kind,
        "organization_type": organization_type,
        "network_classification": network_classification,
        "has_asn": bool(asn),
        "suspected_datacenter": provider_kind == "datacenter" or network_classification == "datacenter",
        "suspected_government": provider_kind == "government" or organization_type == "government",
        "suspected_military": organization_type == "military",
        "updated_at": utc_now(),
    }


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = asn_metadata(node)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["asn_data"] = meta
    metadata["asn_data"] = meta

    for key in (
        "asn",
        "asn_number",
        "asn_name",
        "organization",
        "provider",
        "country",
        "country_code",
        "registry",
        "route",
        "provider_kind",
        "organization_type",
        "network_classification",
    ):
        value = meta.get(key)

        if value not in ("", None):
            node.setdefault(key, value)
            metadata.setdefault(key, value)

    node["has_asn"] = meta["has_asn"]
    node["asn_number"] = meta["asn_number"]

    metadata["has_asn"] = meta["has_asn"]
    metadata["asn_number"] = meta["asn_number"]

    for flag in ("suspected_datacenter", "suspected_government", "suspected_military"):
        existing = boolish(node.get(flag) or metadata.get(flag))
        node[flag] = existing or bool(meta.get(flag))
        metadata[flag] = node[flag]

    enrichment["asn"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "has_asn": meta["has_asn"],
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


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [dict(node) for node in payload if isinstance(node, Mapping)]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [dict(node) for node in nodes if isinstance(node, Mapping)]

    if isinstance(nodes, Mapping):
        output = []

        for address, value in nodes.items():
            if isinstance(value, Mapping):
                output.append({"address": str(address), **dict(value)})
            elif isinstance(value, list):
                padded = list(value) + [None] * max(0, 20 - len(value))
                metadata = padded[19] if isinstance(padded[19], Mapping) else {}
                output.append(
                    {
                        "address": str(address),
                        "protocol": padded[0],
                        "agent": padded[1],
                        "height": padded[4],
                        "hostname": padded[5],
                        "city": padded[6],
                        "country": padded[7],
                        "latitude": padded[8],
                        "longitude": padded[9],
                        "timezone": padded[10],
                        "asn": padded[11],
                        "organization": padded[12],
                        "provider": padded[13],
                        "metadata": dict(metadata),
                    }
                )

        return output

    for key in ("results", "data", "rows", "peers", "node_records", "reachable_nodes"):
        value = payload.get(key)

        if isinstance(value, list):
            return [dict(node) for node in value if isinstance(node, Mapping)]

        if isinstance(value, Mapping):
            return extract_nodes({"nodes": value})

    return []


def put_nodes(payload: Any, nodes: list[dict[str, Any]]) -> Any:
    if isinstance(payload, list):
        return nodes

    if not isinstance(payload, MutableMapping):
        return {"nodes": nodes}

    output = dict(payload)

    if isinstance(output.get("nodes"), Mapping):
        output["nodes"] = {
            str(node.get("canonical_address") or node.get("address") or index): node
            for index, node in enumerate(nodes)
        }
    else:
        output["nodes"] = nodes

    output.setdefault("metadata", {})

    if isinstance(output["metadata"], MutableMapping):
        output["metadata"]["asn_enriched_at"] = utc_now()
        output["metadata"]["asn_schema"] = SCHEMA

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    enriched_nodes = enrich_nodes(nodes, context)
    return put_nodes(payload, enriched_nodes)


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    asn_counts: dict[str, int] = {}
    org_counts: dict[str, int] = {}
    provider_counts: dict[str, int] = {}
    registry_counts: dict[str, int] = {}
    provider_kind_counts: dict[str, int] = {}
    organization_type_counts: dict[str, int] = {}
    classification_counts: dict[str, int] = {}
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
        provider_kind = clean(meta.get("provider_kind")) or clean(node.get("provider_kind")) or "Unknown"
        organization_type = clean(meta.get("organization_type")) or clean(node.get("organization_type")) or "Unknown"
        classification = clean(meta.get("network_classification")) or clean(node.get("network_classification")) or "Unknown"

        asn_counts[asn] = asn_counts.get(asn, 0) + 1
        org_counts[organization] = org_counts.get(organization, 0) + 1
        provider_counts[provider] = provider_counts.get(provider, 0) + 1
        registry_counts[registry] = registry_counts.get(registry, 0) + 1
        provider_kind_counts[provider_kind] = provider_kind_counts.get(provider_kind, 0) + 1
        organization_type_counts[organization_type] = organization_type_counts.get(organization_type, 0) + 1
        classification_counts[classification] = classification_counts.get(classification, 0) + 1

    def top(counter: dict[str, int], limit: int = 100) -> list[dict[str, Any]]:
        return [
            {"name": name, "count": count}
            for name, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
        ]

    return {
        "schema": "zzx-bitnodes-asn-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "asn_count": max(0, len(asn_counts) - (1 if "Unknown" in asn_counts else 0)),
        "nodes_without_asn": no_asn,
        "top": {
            "asns": top(asn_counts),
            "organizations": top(org_counts),
            "providers": top(provider_counts),
            "registries": top(registry_counts),
            "provider_kinds": top(provider_kind_counts),
            "organization_types": top(organization_type_counts),
            "network_classifications": top(classification_counts),
        },
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich Bitnodes records with ASN normalization and ASN metadata.", allow_abbrev=False)

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
