#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-isp-v2"

UNKNOWN_VALUES = {
    "",
    "unknown",
    "none",
    "null",
    "undefined",
    "—",
    "-",
    "n/a",
    "na",
}

RESIDENTIAL_HINTS = (
    "telecom",
    "communications",
    "broadband",
    "cable",
    "fiber",
    "fibre",
    "dsl",
    "wireless",
    "residential",
    "home",
    "internet service",
    "isp",
)

MOBILE_HINTS = (
    "mobile",
    "cellular",
    "lte",
    "5g",
    "4g",
    "gsm",
    "umts",
    "t-mobile",
    "verizon wireless",
    "vodafone",
    "telefonica",
    "orange",
)

HOSTING_HINTS = (
    "hosting",
    "cloud",
    "datacenter",
    "data center",
    "colo",
    "colocation",
    "server",
    "servers",
    "vps",
    "dedicated",
    "compute",
    "bare metal",
    "instance",
    "infrastructure",
)

MAJOR_HOSTS = (
    "amazon",
    "aws",
    "google cloud",
    "google",
    "microsoft",
    "azure",
    "oracle",
    "digitalocean",
    "linode",
    "akamai",
    "ovh",
    "ovhcloud",
    "hetzner",
    "leaseweb",
    "vultr",
    "contabo",
    "scaleway",
    "cloudflare",
    "choopa",
    "equinix",
    "rackspace",
    "hivelocity",
    "psychz",
    "quadranet",
    "netcup",
    "ionos",
)

GOVERNMENT_HINTS = (
    "government",
    "gov",
    "federal",
    "state of",
    "county of",
    "city of",
    "municipality",
    "ministry",
    "department of",
    "public sector",
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
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return re.sub(r"\s+", " ", text)


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return row.get(key)

    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None

        current = current.get(part)

    return current


def first(row: Mapping[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = deep_get(row, key)
        text = clean(value)

        if text:
            return text

    return ""


def lower_blob(row: Mapping[str, Any]) -> str:
    values = []

    for key in (
        "provider",
        "organization",
        "org",
        "isp",
        "asn",
        "as_name",
        "asn_name",
        "as_org",
        "hostname",
        "reverse_dns",
        "rdns",
        "hosting_type",
        "network_type",
        "connection_type",
        "geoip.provider",
        "geoip.organization",
        "geoip.org",
        "geoip.isp",
        "geoip.asn",
        "geoip.as_org",
        "geoip.hostname",
        "isp_data.provider",
        "isp_data.organization",
        "isp_data.org",
        "isp_data.isp",
        "isp_data.asn",
        "isp_data.as_org",
        "asn_data.provider",
        "asn_data.organization",
        "asn_data.org",
        "asn_data.asn",
    ):
        values.append(clean(deep_get(row, key)))

    return " ".join(value for value in values if value).lower()


def extract_asn(value: Any) -> str:
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


def keyword_hits(text: str, keywords: tuple[str, ...]) -> list[str]:
    hits = []

    for keyword in sorted(set(keywords), key=len, reverse=True):
        if keyword.lower() in text:
            hits.append(keyword)

    return hits


def classify_provider(text: str) -> dict[str, Any]:
    major_hits = keyword_hits(text, MAJOR_HOSTS)
    hosting_hits = keyword_hits(text, HOSTING_HINTS)
    residential_hits = keyword_hits(text, RESIDENTIAL_HINTS)
    mobile_hits = keyword_hits(text, MOBILE_HINTS)
    government_hits = keyword_hits(text, GOVERNMENT_HINTS)
    military_hits = keyword_hits(text, MILITARY_HINTS)

    if military_hits:
        classification = "military"
    elif government_hits:
        classification = "government"
    elif major_hits:
        classification = "major-hosting"
    elif hosting_hits:
        classification = "hosting"
    elif mobile_hits:
        classification = "mobile"
    elif residential_hits:
        classification = "residential"
    else:
        classification = "unknown"

    return {
        "network_classification": classification,
        "is_hosting": classification in {"hosting", "major-hosting"},
        "is_major_hosting": classification == "major-hosting",
        "is_residential": classification == "residential",
        "is_mobile": classification == "mobile",
        "is_government": classification == "government",
        "is_military": classification == "military",
        "classification_hits": {
            "major_hosts": major_hits,
            "hosting": hosting_hits,
            "residential": residential_hits,
            "mobile": mobile_hits,
            "government": government_hits,
            "military": military_hits,
        },
    }


def node_address(node: Mapping[str, Any]) -> str:
    return str(
        node.get("address")
        or node.get("node")
        or node.get("addr")
        or node.get("host")
        or node.get("hostname")
        or node.get("ip")
        or node.get("id")
        or ""
    )


def isp_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    provider = first(
        row,
        (
            "provider",
            "isp.provider",
            "isp_data.provider",
            "geoip.provider",
            "organization",
            "org",
            "isp",
            "as_name",
            "as_org",
            "asn_data.organization",
            "geoip.organization",
            "geoip.org",
        ),
    )

    organization = first(
        row,
        (
            "organization",
            "org",
            "as_org",
            "isp.organization",
            "isp_data.organization",
            "geoip.organization",
            "geoip.org",
            "asn_data.organization",
        ),
    )

    asn_raw = first(
        row,
        (
            "asn",
            "as_number",
            "asnum",
            "as",
            "isp.asn",
            "isp_data.asn",
            "geoip.asn",
            "asn_data.asn",
            "autonomous_system_number",
        ),
    )

    hostname = first(
        row,
        (
            "hostname",
            "reverse_dns",
            "rdns",
            "host",
            "geoip.hostname",
            "isp_data.hostname",
        ),
    )

    blob = lower_blob(row)
    classification = classify_provider(blob)
    asn = extract_asn(asn_raw)

    return {
        "schema": SCHEMA,
        "provider": provider,
        "organization": organization,
        "asn": asn,
        "asn_raw": asn_raw,
        "hostname": hostname,
        "network_classification": classification["network_classification"],
        "is_hosting": classification["is_hosting"],
        "is_major_hosting": classification["is_major_hosting"],
        "is_residential": classification["is_residential"],
        "is_mobile": classification["is_mobile"],
        "is_government": classification["is_government"],
        "is_military": classification["is_military"],
        "classification_hits": classification["classification_hits"],
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = isp_metadata(node)

    node["isp"] = meta

    if meta["provider"]:
        node["provider"] = meta["provider"]

    if meta["organization"]:
        node["organization"] = meta["organization"]
        node.setdefault("org", meta["organization"])

    if meta["asn"]:
        node["asn"] = meta["asn"]

    if meta["hostname"]:
        node["hostname"] = meta["hostname"]

    node["network_classification"] = meta["network_classification"]
    node["is_hosting"] = meta["is_hosting"]
    node["is_major_hosting"] = meta["is_major_hosting"]
    node["is_residential"] = meta["is_residential"]
    node["is_mobile"] = meta["is_mobile"]
    node["is_government"] = meta["is_government"]
    node["is_military"] = meta["is_military"]

    node.setdefault("enrichment", {})
    node["enrichment"]["isp"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
    }

    return node


def enrich_nodes(
    nodes: Any,
    context: dict[str, Any] | None = None,
) -> Any:
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


def enrich_payload(
    payload: Any,
    context: dict[str, Any] | None = None,
) -> Any:
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
        payload["metadata"]["isp_enriched_at"] = utc_now()

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
    provider_counts: dict[str, int] = {}
    org_counts: dict[str, int] = {}
    asn_counts: dict[str, int] = {}
    classification_counts: dict[str, int] = {}

    for node in nodes:
        isp = node.get("isp", {})

        if not isinstance(isp, Mapping):
            isp = {}

        provider = clean(isp.get("provider")) or clean(node.get("provider")) or "Unknown"
        org = clean(isp.get("organization")) or clean(node.get("organization")) or "Unknown"
        asn = clean(isp.get("asn")) or clean(node.get("asn")) or "Unknown"
        classification = clean(isp.get("network_classification")) or clean(node.get("network_classification")) or "unknown"

        provider_counts[provider] = provider_counts.get(provider, 0) + 1
        org_counts[org] = org_counts.get(org, 0) + 1
        asn_counts[asn] = asn_counts.get(asn, 0) + 1
        classification_counts[classification] = classification_counts.get(classification, 0) + 1

    def top(counter: dict[str, int], limit: int = 50) -> list[dict[str, Any]]:
        return [
            {"name": name, "count": count}
            for name, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
        ]

    return {
        "schema": "zzx-bitnodes-isp-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "providers": len(provider_counts),
        "organizations": len(org_counts),
        "asns": len(asn_counts),
        "classification_counts": classification_counts,
        "top": {
            "providers": top(provider_counts),
            "organizations": top(org_counts),
            "asns": top(asn_counts),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with ISP/provider/organization/ASN metadata."
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

    print(f"isp enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
