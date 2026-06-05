#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-provider-v1"

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
    "akamai": "Akamai",
    "linode": "Linode",
    "ovh": "OVHcloud",
    "ovhcloud": "OVHcloud",
    "hetzner": "Hetzner",
    "leaseweb": "Leaseweb",
    "vultr": "Vultr",
    "contabo": "Contabo",
    "scaleway": "Scaleway",
    "cloudflare": "Cloudflare",
    "oracle cloud": "Oracle Cloud",
    "oracle corporation": "Oracle",
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


HOSTING_PROVIDERS = {
    "Amazon Web Services",
    "Google Cloud",
    "Microsoft Azure",
    "DigitalOcean",
    "Akamai",
    "Linode",
    "OVHcloud",
    "Hetzner",
    "Leaseweb",
    "Vultr",
    "Contabo",
    "Scaleway",
    "Cloudflare",
    "Oracle Cloud",
    "Oracle",
    "Equinix",
    "Rackspace",
    "Hivelocity",
    "Psychz Networks",
    "QuadraNet",
    "netcup",
    "IONOS",
}


RESIDENTIAL_PROVIDERS = {
    "Comcast",
    "Verizon",
    "Charter Spectrum",
    "Cox",
    "AT&T",
    "T-Mobile",
    "Vodafone",
    "Telefonica",
    "Orange",
    "Deutsche Telekom",
}


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
    "infrastructure",
    "instance",
)

RESIDENTIAL_HINTS = (
    "broadband",
    "cable",
    "fiber",
    "fibre",
    "dsl",
    "telecom",
    "communications",
    "residential",
    "internet service",
)

MOBILE_HINTS = (
    "mobile",
    "cellular",
    "wireless",
    "lte",
    "5g",
    "4g",
)

CDN_HINTS = (
    "cdn",
    "cloudflare",
    "fastly",
    "akamai",
    "edgecast",
    "cloudfront",
    "cache",
    "edge",
)

PROXY_HINTS = (
    "proxy",
    "proxies",
    "socks",
    "socks5",
    "anonymizer",
    "relay",
    "gateway",
    "tunnel",
    "warp",
)

VPN_HINTS = (
    "vpn",
    "mullvad",
    "protonvpn",
    "nordvpn",
    "expressvpn",
    "surfshark",
    "private internet access",
    "pia",
    "airvpn",
    "ivpn",
)

GOV_HINTS = (
    "government",
    "federal",
    "ministry",
    "department",
    "municipality",
    "county of",
    "city of",
    "state of",
)

MIL_HINTS = (
    "military",
    "defense",
    "defence",
    "army",
    "navy",
    "air force",
    "marine",
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


def lower_blob(row: Mapping[str, Any]) -> str:
    keys = (
        "provider",
        "organization",
        "org",
        "isp",
        "asn",
        "as_name",
        "as_org",
        "hostname",
        "reverse_dns",
        "rdns",
        "network_classification",
        "hosting_type",
        "network_type",
        "connection_type",
        "isp.provider",
        "isp.organization",
        "isp.asn",
        "geoip.provider",
        "geoip.organization",
        "geoip.org",
        "geoip.isp",
        "isp_data.provider",
        "isp_data.organization",
        "asn_data.provider",
        "asn_data.organization",
    )

    return " ".join(clean(deep_get(row, key)) for key in keys).lower()


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


def canonical_provider_name(text: str) -> str:
    raw = clean(text)

    if not raw:
        return ""

    lower = raw.lower()

    for key, value in PROVIDER_ALIASES.items():
        if key in lower:
            return value

    return raw


def keyword_hits(text: str, keywords: tuple[str, ...]) -> list[str]:
    hits = []

    for keyword in sorted(set(keywords), key=len, reverse=True):
        if keyword.lower() in text:
            hits.append(keyword)

    return hits


def provider_kind(provider: str, blob: str) -> dict[str, Any]:
    provider = canonical_provider_name(provider)

    hosting_hits = keyword_hits(blob, HOSTING_HINTS)
    residential_hits = keyword_hits(blob, RESIDENTIAL_HINTS)
    mobile_hits = keyword_hits(blob, MOBILE_HINTS)
    cdn_hits = keyword_hits(blob, CDN_HINTS)
    proxy_hits = keyword_hits(blob, PROXY_HINTS)
    vpn_hits = keyword_hits(blob, VPN_HINTS)
    gov_hits = keyword_hits(blob, GOV_HINTS)
    mil_hits = keyword_hits(blob, MIL_HINTS)

    if mil_hits:
        kind = "military"
    elif gov_hits:
        kind = "government"
    elif provider in HOSTING_PROVIDERS:
        kind = "hosting"
    elif provider in RESIDENTIAL_PROVIDERS:
        kind = "residential"
    elif cdn_hits:
        kind = "cdn"
    elif vpn_hits:
        kind = "vpn"
    elif proxy_hits:
        kind = "proxy"
    elif hosting_hits:
        kind = "hosting"
    elif mobile_hits:
        kind = "mobile"
    elif residential_hits:
        kind = "residential"
    else:
        kind = "unknown"

    return {
        "provider_kind": kind,
        "is_hosting_provider": kind == "hosting",
        "is_residential_provider": kind == "residential",
        "is_mobile_provider": kind == "mobile",
        "is_cdn_provider": kind == "cdn",
        "is_vpn_provider": kind == "vpn",
        "is_proxy_provider": kind == "proxy",
        "is_government_provider": kind == "government",
        "is_military_provider": kind == "military",
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
        "isp.provider",
        "isp_data.provider",
        "geoip.provider",
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
        "isp.organization",
        "isp_data.organization",
        "geoip.organization",
        "geoip.org",
        "asn_data.organization",
    )

    asn_raw = first(
        row,
        "asn",
        "isp.asn",
        "isp_data.asn",
        "geoip.asn",
        "asn_data.asn",
        "as_number",
        "autonomous_system_number",
    )

    hostname = first(
        row,
        "hostname",
        "reverse_dns",
        "rdns",
        "host",
        "geoip.hostname",
        "isp_data.hostname",
    )

    provider = canonical_provider_name(provider_raw or organization)
    blob = lower_blob(row)
    kind = provider_kind(provider, blob)
    asn = extract_asn(asn_raw)

    return {
        "schema": SCHEMA,
        "provider": provider,
        "provider_raw": provider_raw,
        "organization": organization,
        "asn": asn,
        "asn_raw": asn_raw,
        "hostname": hostname,
        **kind,
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = provider_metadata(node)

    node["provider_data"] = meta

    if meta["provider"]:
        node["provider"] = meta["provider"]

    if meta["organization"]:
        node["organization"] = meta["organization"]
        node.setdefault("org", meta["organization"])

    if meta["asn"]:
        node["asn"] = meta["asn"]

    node["provider_kind"] = meta["provider_kind"]
    node["is_hosting_provider"] = meta["is_hosting_provider"]
    node["is_residential_provider"] = meta["is_residential_provider"]
    node["is_mobile_provider"] = meta["is_mobile_provider"]
    node["is_cdn_provider"] = meta["is_cdn_provider"]
    node["is_vpn_provider"] = meta["is_vpn_provider"]
    node["is_proxy_provider"] = meta["is_proxy_provider"]
    node["is_government_provider"] = meta["is_government_provider"]
    node["is_military_provider"] = meta["is_military_provider"]

    node.setdefault("enrichment", {})
    node["enrichment"]["provider"] = {
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
        payload["metadata"]["provider_enriched_at"] = utc_now()

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
    kind_counts: dict[str, int] = {}
    asn_counts: dict[str, int] = {}

    for node in nodes:
        meta = node.get("provider_data", {})

        if not isinstance(meta, Mapping):
            meta = {}

        provider = clean(meta.get("provider")) or clean(node.get("provider")) or "Unknown"
        kind = clean(meta.get("provider_kind")) or clean(node.get("provider_kind")) or "unknown"
        asn = clean(meta.get("asn")) or clean(node.get("asn")) or "Unknown"

        provider_counts[provider] = provider_counts.get(provider, 0) + 1
        kind_counts[kind] = kind_counts.get(kind, 0) + 1
        asn_counts[asn] = asn_counts.get(asn, 0) + 1

    def top(counter: dict[str, int], limit: int = 100) -> list[dict[str, Any]]:
        return [
            {"name": name, "count": count}
            for name, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
        ]

    return {
        "schema": "zzx-bitnodes-provider-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "providers": len(provider_counts),
        "asns": len(asn_counts),
        "provider_kind_counts": kind_counts,
        "top": {
            "providers": top(provider_counts),
            "asns": top(asn_counts),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with normalized provider classification."
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

    print(f"provider enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
