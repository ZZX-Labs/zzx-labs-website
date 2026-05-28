#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


VPN_KEYWORDS = (
    "vpn",
    "virtual private network",
    "wireguard",
    "openvpn",
    "ipsec",
    "ikev2",
    "l2tp",
    "pptp",
    "privacy",
    "anonymous",
    "anonymizer",
)

KNOWN_VPN_PROVIDERS = (
    "mullvad",
    "proton",
    "protonvpn",
    "nordvpn",
    "expressvpn",
    "surfshark",
    "private internet access",
    "pia",
    "cyberghost",
    "windscribe",
    "torguard",
    "ivpn",
    "airvpn",
    "perfect privacy",
    "hide.me",
    "vyprvpn",
    "purevpn",
    "hotspot shield",
    "hidemyass",
    "hma",
    "azirevpn",
    "mozilla vpn",
    "bitmask",
    "riseup",
)

DATACENTER_KEYWORDS = (
    "hosting",
    "cloud",
    "datacenter",
    "data center",
    "colo",
    "colocation",
    "server",
    "dedicated",
    "vps",
    "compute",
    "cloudfront",
)

KNOWN_HOSTING_PROVIDERS = (
    "amazon",
    "aws",
    "google",
    "google cloud",
    "gcp",
    "microsoft",
    "azure",
    "oracle",
    "oracle cloud",
    "digitalocean",
    "linode",
    "akamai",
    "vultr",
    "ovh",
    "ovhcloud",
    "hetzner",
    "leaseweb",
    "contabo",
    "scaleway",
    "rackspace",
    "cloudflare",
    "choopa",
    "equinix",
    "hivelocity",
    "servermania",
    "psychz",
    "quadranet",
    "netcup",
    "ionos",
    "namecheap",
    "hosthatch",
)

RESIDENTIAL_KEYWORDS = (
    "residential",
    "broadband",
    "cable",
    "dsl",
    "fiber",
    "fibre",
    "telecom",
    "telco",
    "communications",
    "comcast",
    "verizon",
    "spectrum",
    "charter",
    "cox",
    "at&t",
    "bt",
    "vodafone",
    "telefonica",
    "orange",
    "deutsche telekom",
)


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
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def text_blob(row: dict[str, Any]) -> str:
    return " ".join(
        str(row.get(key, ""))
        for key in (
            "address",
            "node",
            "addr",
            "host",
            "hostname",
            "reverse_dns",
            "provider",
            "organization",
            "org",
            "asn",
            "as_name",
            "isp",
            "hosting_type",
            "network_type",
            "connection_type",
            "tags",
        )
    ).lower()


def hits(text: str, keywords: tuple[str, ...]) -> list[str]:
    return [
        keyword
        for keyword in keywords
        if keyword in text
    ]


def vpn_metadata(row: dict[str, Any]) -> dict[str, Any]:
    text = text_blob(row)

    vpn_keyword_hits = hits(text, VPN_KEYWORDS)
    vpn_provider_hits = hits(text, KNOWN_VPN_PROVIDERS)
    datacenter_hits = hits(text, DATACENTER_KEYWORDS) + hits(text, KNOWN_HOSTING_PROVIDERS)
    residential_hits = hits(text, RESIDENTIAL_KEYWORDS)

    is_tor = bool(row.get("is_tor") or row.get("tor", {}).get("is_tor"))
    is_i2p = bool(row.get("is_i2p") or row.get("i2p", {}).get("is_i2p"))
    is_proxy = bool(row.get("is_proxy") or row.get("proxy", {}).get("is_proxy"))

    vpn_score = 0

    if vpn_keyword_hits:
        vpn_score += 35

    if vpn_provider_hits:
        vpn_score += 50

    if is_proxy:
        vpn_score += 10

    if is_tor or is_i2p:
        vpn_score += 5

    vpn_score = min(vpn_score, 100)

    is_vpn = bool(vpn_keyword_hits or vpn_provider_hits)

    if is_tor:
        category = "tor"
    elif is_i2p:
        category = "i2p"
    elif is_vpn:
        category = "vpn"
    elif is_proxy:
        category = "proxy"
    elif datacenter_hits:
        category = "datacenter"
    elif residential_hits:
        category = "residential"
    else:
        category = "unknown"

    if vpn_score >= 80:
        confidence = "high"
    elif vpn_score >= 45:
        confidence = "medium"
    elif vpn_score > 0:
        confidence = "low"
    else:
        confidence = "none"

    return {
        "is_vpn": is_vpn,
        "vpn_score": vpn_score,
        "vpn_confidence": confidence,
        "network_privacy_category": category,
        "vpn_keyword_hits": vpn_keyword_hits,
        "vpn_provider_hits": vpn_provider_hits,
        "datacenter_hits": datacenter_hits,
        "residential_hits": residential_hits,
        "reason": ", ".join(vpn_keyword_hits + vpn_provider_hits) if is_vpn else "",
    }


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    for node in nodes:
        meta = vpn_metadata(node)

        node["vpn"] = meta
        node["is_vpn"] = meta["is_vpn"]
        node["vpn_score"] = meta["vpn_score"]
        node["vpn_confidence"] = meta["vpn_confidence"]
        node["network_privacy_category"] = meta["network_privacy_category"]

        node.setdefault("enrichment", {})
        node["enrichment"]["vpn"] = {
            "status": "ok",
            "updated_at": utc_now(),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    categories: dict[str, int] = {}

    for node in nodes:
        category = node.get("network_privacy_category") or node.get("vpn", {}).get("network_privacy_category") or "unknown"
        categories[category] = categories.get(category, 0) + 1

    return {
        "schema": "zzx-bitnodes-vpn-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "categories": categories,
        "vpn_nodes": categories.get("vpn", 0),
        "proxy_nodes": categories.get("proxy", 0),
        "tor_nodes": categories.get("tor", 0),
        "i2p_nodes": categories.get("i2p", 0),
        "datacenter_nodes": categories.get("datacenter", 0),
        "residential_nodes": categories.get("residential", 0),
        "unknown_nodes": categories.get("unknown", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with VPN, hosting, proxy, and privacy-network heuristics."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    enriched = enrich_nodes(nodes)

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["vpn_enriched_at"] = utc_now()
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"vpn enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
