#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-provider-v2"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "n/a", "na", "-", "—"}

PROVIDER_ALIASES = {
    "amazon web services": "Amazon Web Services",
    "amazon aws": "Amazon Web Services",
    "aws": "Amazon Web Services",
    "google cloud": "Google Cloud",
    "google llc": "Google",
    "microsoft azure": "Microsoft Azure",
    "azure": "Microsoft Azure",
    "digital ocean": "DigitalOcean",
    "digitalocean": "DigitalOcean",
    "akamai technologies": "Akamai",
    "linode": "Linode",
    "ovhcloud": "OVHcloud",
    "ovh": "OVHcloud",
    "hetzner": "Hetzner",
    "leaseweb": "Leaseweb",
    "vultr": "Vultr",
    "contabo": "Contabo",
    "scaleway": "Scaleway",
    "cloudflare": "Cloudflare",
    "oracle cloud": "Oracle Cloud",
    "equinix": "Equinix",
    "rackspace": "Rackspace",
    "hivelocity": "Hivelocity",
    "psychz": "Psychz Networks",
    "quadranet": "QuadraNet",
    "netcup": "netcup",
    "ionos": "IONOS",
    "comcast": "Comcast",
    "verizon": "Verizon",
    "charter": "Charter Spectrum",
    "spectrum": "Charter Spectrum",
    "cox": "Cox",
    "at&t": "AT&T",
    "att": "AT&T",
    "t-mobile": "T-Mobile",
    "tmobile": "T-Mobile",
    "vodafone": "Vodafone",
    "telefonica": "Telefonica",
    "orange": "Orange",
    "deutsche telekom": "Deutsche Telekom",
}

HOSTING_HINTS = (
    "hosting", "cloud", "datacenter", "data center", "colo", "colocation", "server",
    "servers", "vps", "dedicated", "compute", "bare metal", "infrastructure", "instance",
)

RESIDENTIAL_HINTS = (
    "broadband", "cable", "fiber", "fibre", "dsl", "telecom", "communications",
    "residential", "internet service", "isp",
)

MOBILE_HINTS = ("mobile", "cellular", "wireless", "lte", "5g", "4g", "gsm", "umts")

CDN_HINTS = ("cdn", "cloudflare", "fastly", "akamai", "edgecast", "cloudfront", "cache", "edge")

PROXY_HINTS = ("proxy", "proxies", "socks", "socks5", "anonymizer", "relay", "gateway", "tunnel", "warp")

VPN_HINTS = (
    "vpn", "mullvad", "protonvpn", "proton vpn", "nordvpn", "expressvpn", "surfshark",
    "private internet access", "pia", "airvpn", "ivpn", "torguard",
)

GOV_HINTS = (
    "government", "federal", "ministry", "department", "municipality", "county of",
    "city of", "state of", ".gov",
)

MIL_HINTS = (
    "military", "defense", "defence", "army", "navy", "air force", "marine",
    "dod", "mod", "nato", "space force",
)

HOSTING_PROVIDERS = {
    "Amazon Web Services", "Google Cloud", "Microsoft Azure", "DigitalOcean", "Akamai",
    "Linode", "OVHcloud", "Hetzner", "Leaseweb", "Vultr", "Contabo", "Scaleway",
    "Cloudflare", "Oracle Cloud", "Equinix", "Rackspace", "Hivelocity",
    "Psychz Networks", "QuadraNet", "netcup", "IONOS",
}

RESIDENTIAL_PROVIDERS = {
    "Comcast", "Verizon", "Charter Spectrum", "Cox", "AT&T", "T-Mobile",
    "Vodafone", "Telefonica", "Orange", "Deutsche Telekom",
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


def lower_blob(row: Mapping[str, Any]) -> str:
    keys = (
        "provider", "provider_raw", "provider_normalized", "organization", "org", "isp",
        "asn", "as_name", "as_org", "asn_name", "hostname", "reverse_dns", "rdns",
        "network_classification", "provider_kind", "hosting_type", "network_type",
        "connection_type",
        "metadata.provider", "metadata.organization", "metadata.org", "metadata.isp",
        "metadata.provider_kind", "metadata.network_classification",
        "provider_data.provider", "provider_data.organization", "provider_data.provider_kind",
        "provider_data.network_classification",
        "isp.provider", "isp.organization", "isp.asn", "isp.network_classification",
        "isp_data.provider", "isp_data.organization", "isp_data.network_classification",
        "geoip.provider", "geoip.organization", "geoip.org", "geoip.isp",
        "geoip_data.provider", "geoip_data.organization",
        "asn_data.provider", "asn_data.organization", "asn_data.network_classification",
    )

    return " ".join(clean(deep_get(row, key) if "." in key else row.get(key)) for key in keys).lower()


def extract_asn(value: Any) -> str:
    text = clean(value).upper().replace("ASN", "AS")

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


def canonical_provider_name(value: Any) -> str:
    raw = clean(value)

    if not raw:
        return ""

    lower = raw.lower()

    for key, canonical in sorted(PROVIDER_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
        if key in lower:
            return canonical

    return raw


def keyword_hits(text: str, keywords: tuple[str, ...]) -> list[str]:
    return [keyword for keyword in sorted(set(keywords), key=len, reverse=True) if keyword.lower() in text]


def classify_provider(provider: str, organization: str, blob: str) -> dict[str, Any]:
    provider = canonical_provider_name(provider)
    text = f"{provider} {organization} {blob}".lower()

    hosting_hits = keyword_hits(text, HOSTING_HINTS)
    residential_hits = keyword_hits(text, RESIDENTIAL_HINTS)
    mobile_hits = keyword_hits(text, MOBILE_HINTS)
    cdn_hits = keyword_hits(text, CDN_HINTS)
    proxy_hits = keyword_hits(text, PROXY_HINTS)
    vpn_hits = keyword_hits(text, VPN_HINTS)
    gov_hits = keyword_hits(text, GOV_HINTS)
    mil_hits = keyword_hits(text, MIL_HINTS)

    if mil_hits:
        kind = "military"
    elif gov_hits:
        kind = "government"
    elif provider in HOSTING_PROVIDERS:
        kind = "datacenter"
    elif provider in RESIDENTIAL_PROVIDERS:
        kind = "residential"
    elif cdn_hits:
        kind = "cdn"
    elif vpn_hits:
        kind = "vpn"
    elif proxy_hits:
        kind = "proxy"
    elif hosting_hits:
        kind = "datacenter"
    elif mobile_hits:
        kind = "mobile"
    elif residential_hits:
        kind = "residential"
    elif provider or organization:
        kind = "network"
    else:
        kind = "unknown"

    if kind == "datacenter":
        network_classification = "datacenter"
        organization_type = "infrastructure"
    elif kind == "government":
        network_classification = "government"
        organization_type = "government"
    elif kind == "military":
        network_classification = "military"
        organization_type = "military"
    elif kind == "vpn":
        network_classification = "vpn"
        organization_type = "privacy_network"
    elif kind == "proxy":
        network_classification = "proxy"
        organization_type = "privacy_network"
    elif kind == "cdn":
        network_classification = "cdn"
        organization_type = "infrastructure"
    elif kind == "mobile":
        network_classification = "mobile_isp"
        organization_type = "isp"
    elif kind == "residential":
        network_classification = "residential_isp"
        organization_type = "isp"
    elif kind == "network":
        network_classification = "transit_or_enterprise"
        organization_type = "network"
    else:
        network_classification = "unknown"
        organization_type = ""

    return {
        "provider_kind": kind,
        "organization_type": organization_type,
        "network_classification": network_classification,
        "is_network_provider": kind not in {"unknown"},
        "is_datacenter_provider": kind == "datacenter",
        "is_hosting_provider": kind == "datacenter",
        "is_residential_provider": kind == "residential",
        "is_mobile_provider": kind == "mobile",
        "is_cdn_provider": kind == "cdn",
        "is_vpn_provider": kind == "vpn",
        "is_proxy_provider": kind == "proxy",
        "is_government_provider": kind == "government",
        "is_military_provider": kind == "military",
        "suspected_datacenter": kind == "datacenter",
        "suspected_government": kind == "government",
        "suspected_military": kind == "military",
        "hits": {
            "hosting": hosting_hits,
            "residential": residential_hits,
            "mobile": mobile_hits,
            "cdn": cdn_hits,
            "proxy": proxy_hits,
            "vpn": vpn_hits,
            "government": gov_hits,
            "military": mil_hits,
        },
    }


def provider_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    provider_raw = first(
        row,
        "provider",
        "metadata.provider",
        "provider_data.provider",
        "provider_data.provider_raw",
        "isp.provider",
        "isp_data.provider",
        "geoip.provider",
        "geoip_data.provider",
        "asn_data.provider",
        "organization",
        "org",
        "isp",
        "as_org",
        "geoip.organization",
        "isp.organization",
    )

    organization = first(
        row,
        "organization",
        "org",
        "metadata.organization",
        "metadata.org",
        "provider_data.organization",
        "isp.organization",
        "isp_data.organization",
        "geoip.organization",
        "geoip.org",
        "geoip_data.organization",
        "asn_data.organization",
    )

    asn_raw = first(
        row,
        "asn",
        "metadata.asn",
        "provider_data.asn",
        "isp.asn",
        "isp_data.asn",
        "geoip.asn",
        "geoip_data.asn",
        "asn_data.asn",
        "as_number",
        "autonomous_system_number",
    )

    hostname = first(
        row,
        "hostname",
        "host",
        "reverse_dns",
        "rdns",
        "metadata.hostname",
        "metadata.host",
        "geoip.hostname",
        "isp_data.hostname",
    )

    provider = canonical_provider_name(provider_raw or organization)
    organization = clean(organization)
    blob = lower_blob(row)
    classification = classify_provider(provider, organization, blob)
    asn = extract_asn(asn_raw)

    provider_normalized = provider or organization
    provider_slug = slugify(provider_normalized)

    return {
        "schema": SCHEMA,
        "provider": provider_normalized,
        "provider_raw": provider_raw,
        "provider_normalized": provider_normalized,
        "provider_slug": provider_slug,
        "organization": organization,
        "asn": asn,
        "asn_raw": asn_raw,
        "hostname": hostname,
        **classification,
        "updated_at": utc_now(),
    }


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = provider_metadata(node)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["provider_data"] = meta
    metadata["provider_data"] = meta

    for key in (
        "provider",
        "provider_raw",
        "provider_normalized",
        "provider_slug",
        "organization",
        "asn",
        "hostname",
        "provider_kind",
        "organization_type",
        "network_classification",
    ):
        value = meta.get(key)

        if value not in ("", None):
            node.setdefault(key, value)
            metadata.setdefault(key, value)

    for flag in (
        "is_network_provider",
        "is_datacenter_provider",
        "is_hosting_provider",
        "is_residential_provider",
        "is_mobile_provider",
        "is_cdn_provider",
        "is_vpn_provider",
        "is_proxy_provider",
        "is_government_provider",
        "is_military_provider",
        "suspected_datacenter",
        "suspected_government",
        "suspected_military",
    ):
        node[flag] = bool(node.get(flag) or metadata.get(flag) or meta.get(flag))
        metadata[flag] = node[flag]

    if node.get("is_vpn_provider"):
        node["is_vpn"] = True
        metadata["is_vpn"] = True

    if node.get("is_proxy_provider"):
        node["is_proxy"] = True
        metadata["is_proxy"] = True

    enrichment["provider"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "provider": meta.get("provider"),
        "provider_kind": meta.get("provider_kind"),
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
        output["metadata"]["provider_enriched_at"] = utc_now()
        output["metadata"]["provider_schema"] = SCHEMA

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context))


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    provider_counts: dict[str, int] = {}
    kind_counts: dict[str, int] = {}
    asn_counts: dict[str, int] = {}
    classification_counts: dict[str, int] = {}

    for node in nodes:
        meta = node.get("provider_data", {})
        if not isinstance(meta, Mapping):
            meta = {}

        provider = clean(meta.get("provider")) or clean(node.get("provider")) or "Unknown"
        kind = clean(meta.get("provider_kind")) or clean(node.get("provider_kind")) or "unknown"
        asn = clean(meta.get("asn")) or clean(node.get("asn")) or "Unknown"
        classification = clean(meta.get("network_classification")) or clean(node.get("network_classification")) or "unknown"

        provider_counts[provider] = provider_counts.get(provider, 0) + 1
        kind_counts[kind] = kind_counts.get(kind, 0) + 1
        asn_counts[asn] = asn_counts.get(asn, 0) + 1
        classification_counts[classification] = classification_counts.get(classification, 0) + 1

    def top(counter: dict[str, int], limit: int = 100) -> list[dict[str, Any]]:
        return [
            {"name": name, "count": count}
            for name, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
        ]

    return {
        "schema": "zzx-bitnodes-provider-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "providers": max(0, len(provider_counts) - (1 if "Unknown" in provider_counts else 0)),
        "asns": max(0, len(asn_counts) - (1 if "Unknown" in asn_counts else 0)),
        "provider_kind_counts": dict(sorted(kind_counts.items(), key=lambda item: (-item[1], item[0]))),
        "network_classification_counts": dict(sorted(classification_counts.items(), key=lambda item: (-item[1], item[0]))),
        "top": {
            "providers": top(provider_counts),
            "provider_kinds": top(kind_counts),
            "network_classifications": top(classification_counts),
            "asns": top(asn_counts),
        },
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich Bitnodes records with canonical network-provider classification.", allow_abbrev=False)

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

    print(f"provider enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
