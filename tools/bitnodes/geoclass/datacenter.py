#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-datacenter-v2"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "n/a", "na", "-", "—"}

DATACENTER_HINTS = (
    "datacenter", "data center", "colo", "colocation", "carrier hotel",
    "internet exchange", "ixp", "hosting", "cloud", "compute", "bare metal",
    "dedicated server", "dedicated servers", "vps", "virtual private server",
    "server", "servers", "infrastructure", "instance", "rack", "rackspace",
)

MAJOR_DATACENTER_PROVIDERS = (
    "amazon", "aws", "google cloud", "google llc", "microsoft", "azure",
    "oracle cloud", "oracle", "digitalocean", "linode", "akamai", "ovh",
    "ovhcloud", "hetzner", "leaseweb", "vultr", "contabo", "scaleway",
    "cloudflare", "equinix", "rackspace", "hivelocity", "psychz",
    "quadranet", "netcup", "ionos", "choopa", "m247", "cogent", "heficed",
    "servermania",
)

RESIDENTIAL_HINTS = (
    "residential", "broadband", "cable", "dsl", "fiber", "fibre", "telecom",
    "communications", "mobile", "cellular", "wireless", "lte", "5g", "4g",
)

CDN_EDGE_HINTS = ("cdn", "edge", "cache", "cloudfront", "fastly", "akamai", "cloudflare")

VPN_PROXY_HINTS = ("vpn", "proxy", "proxies", "socks", "anonymizer", "relay", "gateway", "tunnel", "warp")


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
        "true", "yes", "y", "ok", "up", "online", "reachable", "success",
        "connected", "on",
    }


def keyword_hits(text: str, keywords: tuple[str, ...]) -> list[str]:
    return [keyword for keyword in sorted(set(keywords), key=len, reverse=True) if keyword.lower() in text]


def text_blob(row: Mapping[str, Any]) -> str:
    keys = (
        "provider", "organization", "org", "hostname", "reverse_dns", "rdns",
        "network_classification", "provider_kind", "organization_type",
        "hosting_type", "network_type", "connection_type",
        "provider_data.provider", "provider_data.organization",
        "provider_data.provider_kind", "provider_data.network_classification",
        "organization_data.organization", "organization_data.organization_type",
        "isp.provider", "isp.organization", "isp.network_classification",
        "asn_data.organization", "asn_data.provider", "asn_data.network_classification",
        "geoip.organization", "geoip.org", "geoip.provider",
        "metadata.provider", "metadata.organization", "metadata.provider_kind",
        "metadata.network_classification", "metadata.provider_data.provider",
        "metadata.provider_data.provider_kind",
    )

    return " ".join(clean(deep_get(row, key) if "." in key else row.get(key)) for key in keys).lower()


def datacenter_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    provider = first(row, "provider_data.provider", "provider", "isp.provider", "geoip.provider", "metadata.provider")
    organization = first(
        row,
        "organization_data.organization", "organization", "org", "provider_data.organization",
        "isp.organization", "asn_data.organization", "geoip.organization", "geoip.org",
        "metadata.organization",
    )
    asn = first(row, "asn", "asn_data.asn", "provider_data.asn", "isp.asn", "geoip.asn", "metadata.asn")
    hostname = first(row, "hostname", "reverse_dns", "rdns", "host", "geoip.hostname", "metadata.host")
    country = first(row, "country_code", "country", "geoip.country_code", "geoip.country", "metadata.country_code")
    city = first(row, "city", "geoip.city", "metadata.city")

    blob = text_blob(row)

    datacenter_hits = keyword_hits(blob, DATACENTER_HINTS)
    major_provider_hits = keyword_hits(blob, MAJOR_DATACENTER_PROVIDERS)
    residential_hits = keyword_hits(blob, RESIDENTIAL_HINTS)
    cdn_edge_hits = keyword_hits(blob, CDN_EDGE_HINTS)
    vpn_proxy_hits = keyword_hits(blob, VPN_PROXY_HINTS)

    provider_kind = clean(first(row, "provider_kind", "provider_data.provider_kind", "metadata.provider_kind")).lower()
    network_classification = clean(first(row, "network_classification", "provider_data.network_classification", "metadata.network_classification")).lower()
    organization_type = clean(first(row, "organization_type", "organization_data.organization_type", "metadata.organization_type")).lower()

    inherited_hosting = bool(
        boolish(row.get("is_hosting"))
        or boolish(row.get("is_hosting_provider"))
        or boolish(row.get("is_hosting_organization"))
        or boolish(row.get("is_datacenter_provider"))
        or boolish(row.get("suspected_datacenter"))
        or provider_kind in {"hosting", "datacenter", "cloud"}
        or network_classification in {"hosting", "major-hosting", "datacenter", "cloud", "cdn"}
        or organization_type in {"hosting", "infrastructure"}
    )

    inherited_residential = bool(
        boolish(row.get("is_residential"))
        or boolish(row.get("is_residential_provider"))
        or provider_kind == "residential"
        or network_classification in {"residential", "residential_isp"}
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
        "provider_kind": provider_kind,
        "network_classification": network_classification,
        "organization_type": organization_type,
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


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = datacenter_metadata(node)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["datacenter"] = meta
    metadata["datacenter"] = meta

    for key in (
        "suspected_datacenter", "is_datacenter", "datacenter_score",
        "datacenter_confidence", "datacenter_category",
    ):
        node[key] = meta[key]
        metadata[key] = meta[key]

    if meta["suspected_datacenter"]:
        node.setdefault("provider_kind", "datacenter")
        node.setdefault("network_classification", "datacenter")
        metadata.setdefault("provider_kind", "datacenter")
        metadata.setdefault("network_classification", "datacenter")

    enrichment["datacenter"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": meta["updated_at"],
        "suspected_datacenter": meta["suspected_datacenter"],
        "datacenter_score": meta["datacenter_score"],
        "datacenter_confidence": meta["datacenter_confidence"],
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
        output["metadata"]["datacenter_enriched_at"] = utc_now()
        output["metadata"]["datacenter_schema"] = SCHEMA

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context))


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


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

        if boolish(meta.get("suspected_datacenter") or node.get("suspected_datacenter")):
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
        "schema": "zzx-bitnodes-datacenter-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "suspected_datacenter_nodes": suspected,
        "confidence_counts": dict(sorted(confidence_counts.items(), key=lambda item: (-item[1], item[0]))),
        "category_counts": dict(sorted(category_counts.items(), key=lambda item: (-item[1], item[0]))),
        "top": {
            "providers": top(provider_counts),
            "countries": top(country_counts),
        },
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with datacenter/cloud/hosting suspicion metadata.",
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

    print(f"datacenter enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
