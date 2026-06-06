#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-organization-v2"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "n/a", "na", "-", "—"}

GOVERNMENT_HINTS = (
    "government", "federal", "state of", "county of", "city of", "municipality",
    "department", "ministry", "public sector", ".gov", "bureau", "agency",
)

MILITARY_HINTS = (
    "military", "defense", "defence", "army", "navy", "air force", "marine corps",
    "space force", "dod", "mod", "nato", "cyber command",
)

UNIVERSITY_HINTS = (
    "university", "college", "institute", "polytechnic", "school", "campus",
    "academy", "research center", "laboratory", "lab",
)

NONPROFIT_HINTS = (
    "foundation", "nonprofit", "non-profit", "charity", "ngo", "association",
    "society", "institute", "trust",
)

HOSTING_HINTS = (
    "hosting", "cloud", "datacenter", "data center", "colo", "colocation",
    "server", "servers", "vps", "compute", "infrastructure", "bare metal",
)

TELECOM_HINTS = (
    "telecom", "communications", "wireless", "mobile", "cellular", "broadband",
    "fiber", "fibre", "isp", "internet service", "cable", "dsl",
)


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


def slugify(value: Any) -> str:
    text = clean(value).lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


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
        "true", "yes", "y", "ok", "up", "online", "reachable", "success",
        "connected", "on",
    }


def keyword_hits(text: str, keywords: tuple[str, ...]) -> list[str]:
    return [keyword for keyword in sorted(set(keywords), key=len, reverse=True) if keyword.lower() in text]


def organization_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    organization = first(
        row,
        "organization",
        "org",
        "metadata.organization",
        "metadata.org",
        "organization_data.organization",
        "provider_data.organization",
        "asn_data.organization",
        "isp.organization",
        "isp_data.organization",
        "geoip.organization",
        "geoip.org",
        "geoip_data.organization",
        "as_org",
        "asn_org",
    )

    provider = first(
        row,
        "provider",
        "metadata.provider",
        "provider_data.provider",
        "isp.provider",
        "isp_data.provider",
        "geoip.provider",
        "geoip_data.provider",
        "asn_data.provider",
    )

    asn = first(
        row,
        "asn",
        "metadata.asn",
        "asn_data.asn",
        "provider_data.asn",
        "isp.asn",
        "geoip.asn",
    )

    country = first(
        row,
        "country_code",
        "country",
        "metadata.country_code",
        "metadata.country",
        "geoip.country_code",
        "geoip.country",
        "asn_data.country",
    )

    provider_kind = first(
        row,
        "provider_kind",
        "metadata.provider_kind",
        "provider_data.provider_kind",
        "asn_data.provider_kind",
    ).lower()

    network_classification = first(
        row,
        "network_classification",
        "metadata.network_classification",
        "provider_data.network_classification",
        "asn_data.network_classification",
        "isp.network_classification",
    ).lower()

    existing_type = first(
        row,
        "organization_type",
        "metadata.organization_type",
        "organization_data.organization_type",
        "provider_data.organization_type",
        "asn_data.organization_type",
    ).lower()

    text = f"{organization} {provider} {provider_kind} {network_classification} {existing_type}".lower()

    government_hits = keyword_hits(text, GOVERNMENT_HINTS)
    military_hits = keyword_hits(text, MILITARY_HINTS)
    university_hits = keyword_hits(text, UNIVERSITY_HINTS)
    nonprofit_hits = keyword_hits(text, NONPROFIT_HINTS)
    hosting_hits = keyword_hits(text, HOSTING_HINTS)
    telecom_hits = keyword_hits(text, TELECOM_HINTS)

    if existing_type:
        org_type = existing_type
    elif military_hits:
        org_type = "military"
    elif government_hits:
        org_type = "government"
    elif university_hits:
        org_type = "academic"
    elif nonprofit_hits:
        org_type = "nonprofit"
    elif hosting_hits or provider_kind in {"datacenter", "hosting", "cloud"}:
        org_type = "infrastructure"
    elif telecom_hits or provider_kind in {"residential", "mobile", "network"}:
        org_type = "isp"
    elif organization or provider:
        org_type = "commercial"
    else:
        org_type = "unknown"

    return {
        "schema": SCHEMA,
        "organization": organization,
        "organization_normalized": organization,
        "organization_slug": slugify(organization),
        "provider": provider,
        "asn": asn,
        "country": country.upper() if len(country) == 2 else country,
        "country_code": country.upper() if len(country) == 2 else country,
        "organization_type": org_type,
        "provider_kind": provider_kind,
        "network_classification": network_classification,
        "is_government": org_type == "government" or bool(government_hits),
        "is_military": org_type == "military" or bool(military_hits),
        "is_academic": org_type == "academic" or bool(university_hits),
        "is_nonprofit": org_type == "nonprofit" or bool(nonprofit_hits),
        "is_hosting": org_type == "infrastructure" or bool(hosting_hits),
        "is_telecom": org_type == "isp" or bool(telecom_hits),
        "classification_hits": {
            "government": government_hits,
            "military": military_hits,
            "academic": university_hits,
            "nonprofit": nonprofit_hits,
            "hosting": hosting_hits,
            "telecom": telecom_hits,
        },
        "updated_at": utc_now(),
    }


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = organization_metadata(node)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["organization_data"] = meta
    metadata["organization_data"] = meta

    for key in (
        "organization",
        "organization_normalized",
        "organization_slug",
        "provider",
        "asn",
        "country",
        "country_code",
        "organization_type",
    ):
        value = meta.get(key)
        if value not in ("", None):
            node.setdefault(key, value)
            metadata.setdefault(key, value)

    if meta["organization"]:
        node.setdefault("org", meta["organization"])
        metadata.setdefault("org", meta["organization"])

    flags = {
        "is_government_organization": meta["is_government"],
        "is_military_organization": meta["is_military"],
        "is_academic_organization": meta["is_academic"],
        "is_nonprofit_organization": meta["is_nonprofit"],
        "is_hosting_organization": meta["is_hosting"],
        "is_telecom_organization": meta["is_telecom"],
        "suspected_government": meta["is_government"],
        "suspected_military": meta["is_military"],
    }

    for key, value in flags.items():
        node[key] = bool(node.get(key) or metadata.get(key) or value)
        metadata[key] = node[key]

    enrichment["organization"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": meta["updated_at"],
        "organization_type": meta["organization_type"],
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    if isinstance(nodes, list):
        return [enrich_node(dict(node)) if isinstance(node, Mapping) else node for node in nodes]

    if isinstance(nodes, Mapping):
        return {key: enrich_node(dict(value)) if isinstance(value, Mapping) else value for key, value in nodes.items()}

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
        output["metadata"]["organization_enriched_at"] = utc_now()
        output["metadata"]["organization_schema"] = SCHEMA

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context))


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    orgs: dict[str, int] = {}
    types: dict[str, int] = {}
    countries: dict[str, int] = {}

    for node in nodes:
        meta = node.get("organization_data", {})
        if not isinstance(meta, Mapping):
            meta = {}

        org = clean(meta.get("organization")) or clean(node.get("organization")) or "Unknown"
        typ = clean(meta.get("organization_type")) or clean(node.get("organization_type")) or "unknown"
        country = clean(meta.get("country")) or clean(node.get("country_code")) or clean(node.get("country")) or "Unknown"

        orgs[org] = orgs.get(org, 0) + 1
        types[typ] = types.get(typ, 0) + 1
        countries[country] = countries.get(country, 0) + 1

    def top(counter: dict[str, int], limit: int = 100) -> list[dict[str, Any]]:
        return [
            {"name": name, "count": count}
            for name, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
        ]

    return {
        "schema": "zzx-bitnodes-organization-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "unique_organizations": max(0, len(orgs) - (1 if "Unknown" in orgs else 0)),
        "organization_types": dict(sorted(types.items(), key=lambda item: (-item[1], item[0]))),
        "top": {
            "organizations": top(orgs),
            "countries": top(countries),
        },
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with organization classification metadata.",
        allow_abbrev=False,
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

    print(f"organization enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
