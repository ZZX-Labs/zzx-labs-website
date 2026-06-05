#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-datacenter-v1"

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

DATACENTER_HINTS = (
    "datacenter",
    "data center",
    "colo",
    "colocation",
    "carrier hotel",
    "internet exchange",
    "ixp",
    "hosting",
    "cloud",
    "compute",
    "bare metal",
    "dedicated server",
    "dedicated servers",
    "vps",
    "virtual private server",
    "server",
    "servers",
    "infrastructure",
    "instance",
    "rack",
    "rackspace",
)

MAJOR_DATACENTER_PROVIDERS = (
    "amazon",
    "aws",
    "google cloud",
    "google llc",
    "microsoft",
    "azure",
    "oracle cloud",
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
    "equinix",
    "rackspace",
    "hivelocity",
    "psychz",
    "quadranet",
    "netcup",
    "ionos",
    "choopa",
    "m247",
    "cogent",
    "heficed",
    "servermania",
)

RESIDENTIAL_HINTS = (
    "residential",
    "broadband",
    "cable",
    "dsl",
    "fiber",
    "fibre",
    "telecom",
    "communications",
    "mobile",
    "cellular",
    "wireless",
    "lte",
    "5g",
    "4g",
)

CDN_EDGE_HINTS = (
    "cdn",
    "edge",
    "cache",
    "cloudfront",
    "fastly",
    "akamai",
    "cloudflare",
)

VPN_PROXY_HINTS = (
    "vpn",
    "proxy",
    "proxies",
    "socks",
    "anonymizer",
    "relay",
    "gateway",
    "tunnel",
    "warp",
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


def text_blob(row: Mapping[str, Any]) -> str:
    keys = (
        "provider",
        "organization",
        "org",
        "hostname",
        "reverse_dns",
        "rdns",
        "network_classification",
        "provider_kind",
        "hosting_type",
        "network_type",
        "connection_type",
        "provider_data.provider",
        "provider_data.organization",
        "provider_data.provider_kind",
        "organization_data.organization",
        "organization_data.organization_type",
        "isp.provider",
        "isp.organization",
        "isp.network_classification",
        "asn_data.organization",
        "geoip.organization",
        "geoip.org",
        "geoip.provider",
    )

    return " ".join(
        clean(deep_get(row, key))
        for key in keys
        if clean(deep_get(row, key))
    ).lower()


def datacenter_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    provider = first(
        row,
        "provider_data.provider",
        "provider",
        "isp.provider",
        "geoip.provider",
    )

    organization = first(
        row,
        "organization_data.organization",
        "organization",
        "org",
        "provider_data.organization",
        "isp.organization",
        "asn_data.organization",
        "geoip.organization",
        "geoip.org",
    )

    asn = first(
        row,
        "asn",
        "asn_data.asn",
        "provider_data.asn",
        "isp.asn",
        "geoip.asn",
    )

    hostname = first(
        row,
        "hostname",
        "reverse_dns",
        "rdns",
        "host",
        "geoip.hostname",
    )

    country = first(
        row,
        "country_code",
        "country",
        "geoip.country_code",
        "geoip.country",
    )

    city = first(
        row, "city", "geoip.city"
    )

    blob = text_blob(row)

    datacenter_hits = keyword_hits(blob, DATACENTER_HINTS)
    major_provider_hits = keyword_hits(blob, MAJOR_DATACENTER_PROVIDERS)
    residential_hits = keyword_hits(blob, RESIDENTIAL_HINTS)
    cdn_edge_hits = keyword_hits(blob, CDN_EDGE_HINTS)
    vpn_proxy_hits = keyword_hits(blob, VPN_PROXY_HINTS)

    inherited_hosting = bool(
        row.get("is_hosting")
        or row.get("is_hosting_provider")
        or row.get("is_hosting_organization")
        or clean(deep_get(row, "provider_data.provider_kind")).lower() == "hosting"
        or clean(deep_get(row, "isp.network_classification")).lower() in {"hosting", "major-hosting"}
        or clean(deep_get(row, "organization_data.organization_type")).lower() == "hosting"
    )

    inherited_residential = bool(
        row.get("is_residential")
        or row.get("is_residential_provider")
        or clean(deep_get(row, "isp.network_classification")).lower() == "residential"
    )

    score = 0.0

    if inherited_hosting:
        score += 0.45

    if datacenter_hits:
        score += min(0.45, 0.18 + 0.04 * len(datacenter_hits))

    if major_provider_hits:
        score += min(0.45, 0.20 + 0.05 * len(major_provider_hits))

    if cdn_edge_hits:
        score += min(0.20, 0.08 + 0.03 * len(cdn_edge_hits))

    if vpn_proxy_hits:
        score += min(0.15, 0.05 + 0.02 * len(vpn_proxy_hits))

    if inherited_residential and not major_provider_hits:
        score -= 0.25

    if residential_hits and not major_provider_hits:
        score -= min(0.25, 0.06 * len(residential_hits))

    score = max(0.0, min(1.0, score))

    if score >= 0.80:
        confidence = "high"
    elif score >= 0.50:
        confidence = "medium"
    elif score >= 0.25:
        confidence = "low"
    else:
        confidence = "none"

    suspected = score >= 0.35

    if major_provider_hits:
        category = "major_cloud_or_datacenter"
    elif cdn_edge_hits and suspected:
        category = "cdn_or_edge_datacenter"
    elif vpn_proxy_hits and suspected:
        category = "privacy_proxy_datacenter"
    elif suspected:
        category = "datacenter_or_hosting"
    else:
        category = "not_suspected"

    return {
        "schema": SCHEMA,
        "suspected_datacenter": suspected,
        "is_datacenter": suspected,
        "datacenter_score": round(score, 4),
        "datacenter_confidence": confidence,
        "datacenter_category": category,
        "provider": provider,
        "organization": organization,
        "asn": asn,
        "hostname": hostname,
        "country": country.upper() if len(country) == 2 else country,
        "city": city,
        "evidence": {
            "datacenter_hits": datacenter_hits,
            "major_provider_hits": major_provider_hits,
            "cdn_edge_hits": cdn_edge_hits,
            "vpn_proxy_hits": vpn_proxy_hits,
            "residential_hits": residential_hits,
            "inherited_hosting": inherited_hosting,
            "inherited_residential": inherited_residential,
        },
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = datacenter_metadata(node)

    node["datacenter"] = meta
    node["suspected_datacenter"] = meta["suspected_datacenter"]
    node["is_datacenter"] = meta["is_datacenter"]
    node["datacenter_score"] = meta["datacenter_score"]
    node["datacenter_confidence"] = meta["datacenter_confidence"]
    node["datacenter_category"] = meta["datacenter_category"]

    node.setdefault("enrichment", {})
    node["enrichment"]["datacenter"] = {
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
        payload["metadata"]["datacenter_enriched_at"] = utc_now()

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
    confidence_counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}
    provider_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}
    suspected = 0

    for node in nodes:
        meta = node.get("datacenter", {})

        if not isinstance(meta, Mapping):
            meta = {}

        if meta.get("suspected_datacenter") or node.get("suspected_datacenter"):
            suspected += 1

        confidence = clean(meta.get("datacenter_confidence")) or "none"
        category = clean(meta.get("datacenter_category")) or "not_suspected"
        provider = clean(meta.get("provider")) or clean(node.get("provider")) or "Unknown"
        country = clean(meta.get("country")) or clean(node.get("country_code")) or clean(node.get("country")) or "Unknown"

        confidence_counts[confidence] = confidence_counts.get(confidence, 0) + 1
        category_counts[category] = category_counts.get(category, 0) + 1
        provider_counts[provider] = provider_counts.get(provider, 0) + 1
        country_counts[country] = country_counts.get(country, 0) + 1

    def top(counter: dict[str, int], limit: int = 100) -> list[dict[str, Any]]:
        return [
            {"name": name, "count": count}
            for name, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
        ]

    return {
        "schema": "zzx-bitnodes-datacenter-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "suspected_datacenter_nodes": suspected,
        "confidence_counts": confidence_counts,
        "category_counts": category_counts,
        "top": {
            "providers": top(provider_counts),
            "countries": top(country_counts),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with datacenter/cloud/hosting suspicion metadata."
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

    print(f"datacenter enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
