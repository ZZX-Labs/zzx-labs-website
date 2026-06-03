#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-organization-v1"

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

GOVERNMENT_HINTS = (
    "government",
    "federal",
    "state of",
    "county of",
    "city of",
    "municipality",
    "department",
    "ministry",
    "public sector",
    ".gov",
)

MILITARY_HINTS = (
    "military",
    "defense",
    "defence",
    "army",
    "navy",
    "air force",
    "marine corps",
    "space force",
    "dod",
    "mod",
    "nato",
)

UNIVERSITY_HINTS = (
    "university",
    "college",
    "institute",
    "polytechnic",
    "school",
    "campus",
    "academy",
    "research center",
)

NONPROFIT_HINTS = (
    "foundation",
    "nonprofit",
    "charity",
    "ngo",
    "association",
    "society",
    "institute",
    "trust",
)

HOSTING_HINTS = (
    "hosting",
    "cloud",
    "datacenter",
    "data center",
    "colo",
    "colocation",
    "server",
    "vps",
    "compute",
)

TELECOM_HINTS = (
    "telecom",
    "communications",
    "wireless",
    "mobile",
    "cellular",
    "broadband",
    "fiber",
    "fibre",
    "isp",
)


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


def keyword_hits(text: str, keywords: tuple[str, ...]) -> list[str]:
    hits = []

    for keyword in sorted(set(keywords), key=len, reverse=True):
        if keyword.lower() in text:
            hits.append(keyword)

    return hits


def organization_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    organization = first(
        row,
        "organization",
        "org",
        "isp.organization",
        "isp_data.organization",
        "provider_data.organization",
        "asn_data.organization",
        "geoip.organization",
        "geoip.org",
        "as_org",
        "asn_org",
    )

    provider = first(
        row,
        "provider",
        "provider_data.provider",
        "isp.provider",
        "geoip.provider",
    )

    asn = first(
        row,
        "asn",
        "asn_data.asn",
        "provider_data.asn",
    )

    text = f"{organization} {provider}".lower()

    government_hits = keyword_hits(text, GOVERNMENT_HINTS)
    military_hits = keyword_hits(text, MILITARY_HINTS)
    university_hits = keyword_hits(text, UNIVERSITY_HINTS)
    nonprofit_hits = keyword_hits(text, NONPROFIT_HINTS)
    hosting_hits = keyword_hits(text, HOSTING_HINTS)
    telecom_hits = keyword_hits(text, TELECOM_HINTS)

    if military_hits:
        org_type = "military"
    elif government_hits:
        org_type = "government"
    elif university_hits:
        org_type = "academic"
    elif nonprofit_hits:
        org_type = "nonprofit"
    elif hosting_hits:
        org_type = "hosting"
    elif telecom_hits:
        org_type = "telecom"
    else:
        org_type = "commercial"

    return {
        "schema": SCHEMA,
        "organization": organization,
        "provider": provider,
        "asn": asn,
        "organization_type": org_type,
        "is_government": bool(government_hits),
        "is_military": bool(military_hits),
        "is_academic": bool(university_hits),
        "is_nonprofit": bool(nonprofit_hits),
        "is_hosting": bool(hosting_hits),
        "is_telecom": bool(telecom_hits),
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


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = organization_metadata(node)

    node["organization_data"] = meta

    if meta["organization"]:
        node["organization"] = meta["organization"]
        node["org"] = meta["organization"]

    node["organization_type"] = meta["organization_type"]
    node["is_government_organization"] = meta["is_government"]
    node["is_military_organization"] = meta["is_military"]
    node["is_academic_organization"] = meta["is_academic"]
    node["is_nonprofit_organization"] = meta["is_nonprofit"]
    node["is_hosting_organization"] = meta["is_hosting"]
    node["is_telecom_organization"] = meta["is_telecom"]

    node.setdefault("enrichment", {})
    node["enrichment"]["organization"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
    }

    return node


def enrich_nodes(nodes: Any) -> Any:
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


def enrich_payload(payload: Any) -> Any:
    if isinstance(payload, list):
        return enrich_nodes(payload)

    if not isinstance(payload, MutableMapping):
        return payload

    if isinstance(payload.get("nodes"), (list, dict)):
        payload["nodes"] = enrich_nodes(payload["nodes"])

    if isinstance(payload.get("results"), list):
        payload["results"] = enrich_nodes(payload["results"])

    if isinstance(payload.get("data"), list):
        payload["data"] = enrich_nodes(payload["data"])

    payload.setdefault("metadata", {})
    payload["metadata"]["organization_enriched_at"] = utc_now()

    return payload


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, Mapping)]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [x for x in nodes if isinstance(x, Mapping)]

    if isinstance(nodes, Mapping):
        return [x for x in nodes.values() if isinstance(x, Mapping)]

    return []


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    orgs: dict[str, int] = {}
    types: dict[str, int] = {}

    for node in nodes:
        meta = node.get("organization_data", {})

        if not isinstance(meta, Mapping):
            continue

        org = clean(meta.get("organization")) or "Unknown"
        typ = clean(meta.get("organization_type")) or "unknown"

        orgs[org] = orgs.get(org, 0) + 1
        types[typ] = types.get(typ, 0) + 1

    return {
        "schema": "zzx-bitnodes-organization-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "unique_organizations": len(orgs),
        "organization_types": types,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with organization classification metadata."
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
        write_json(
            Path(args.summary),
            summarize(iter_nodes(enriched)),
            compact=args.compact,
        )

    print(f"organization enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
