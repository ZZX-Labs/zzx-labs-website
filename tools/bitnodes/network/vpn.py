#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-vpn-heuristic-v2"
SOURCE = "zzx_vpn_heuristic_v2"

BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", "bitcoin/bitnodes"))
BITNODES_DATA = Path(os.environ.get("BITNODES_DATA", str(BITNODES_ROOT / "data")))
VPN_DATA_DIR = Path(os.environ.get("BITNODES_VPN_DATA", str(BITNODES_DATA / "vpn")))


VPN_KEYWORDS = (
    "vpn",
    "virtual private network",
    "wireguard",
    "openvpn",
    "ipsec",
    "ikev2",
    "l2tp",
    "pptp",
    "privacy vpn",
    "anonymous vpn",
    "anonymizer",
    "privacy network",
    "secure tunnel",
    "encrypted tunnel",
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
    "bare metal",
    "instance",
)

KNOWN_HOSTING_PROVIDERS = (
    "amazon",
    "aws",
    "google cloud",
    "gcp",
    "microsoft azure",
    "azure",
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

MOBILE_KEYWORDS = (
    "mobile",
    "wireless",
    "cellular",
    "lte",
    "5g",
    "4g",
    "t-mobile",
    "tmobile",
    "vodafone",
    "telefonica",
    "orange",
)

TOR_KEYWORDS = (
    ".onion",
    "tor exit",
    "tor relay",
    "tor node",
)

I2P_KEYWORDS = (
    ".i2p",
    "i2p",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any, pretty: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    if pretty:
        text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    else:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

    path.write_text(text + "\n", encoding="utf-8")


def as_text(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, Mapping):
        return " ".join(as_text(item) for item in value.values())

    if isinstance(value, (list, tuple, set)):
        return " ".join(as_text(item) for item in value)

    return str(value)


def norm(value: Any) -> str:
    return re.sub(r"\s+", " ", as_text(value).strip().lower())


def keyword_hits(text: str, keywords: tuple[str, ...]) -> list[str]:
    hits: list[str] = []

    for keyword in sorted(set(keywords), key=len, reverse=True):
        pattern = r"\b" + re.escape(keyword.lower()).replace(r"\ ", r"\s+") + r"\b"

        if keyword.startswith("."):
            if keyword in text:
                hits.append(keyword)
        elif re.search(pattern, text):
            hits.append(keyword)

    return hits


def clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def parse_ip_from_address(address: str) -> ipaddress._BaseAddress | None:
    text = str(address or "").strip()

    if not text:
        return None

    if text.startswith("[") and "]" in text:
        text = text[1:text.index("]")]
    elif ":" in text and text.count(":") == 1:
        text = text.rsplit(":", 1)[0]

    try:
        return ipaddress.ip_address(text)
    except ValueError:
        return None


def extract_address(row: Mapping[str, Any]) -> str:
    return str(
        row.get("address")
        or row.get("node")
        or row.get("addr")
        or row.get("ip")
        or row.get("host")
        or row.get("hostname")
        or row.get("id")
        or ""
    )


def extract_text_blob(row: Mapping[str, Any]) -> str:
    fields = [
        row.get("address"),
        row.get("node"),
        row.get("addr"),
        row.get("host"),
        row.get("hostname"),
        row.get("reverse_dns"),
        row.get("rdns"),
        row.get("provider"),
        row.get("organization"),
        row.get("org"),
        row.get("asn"),
        row.get("as_name"),
        row.get("as_org"),
        row.get("isp"),
        row.get("hosting_type"),
        row.get("network_type"),
        row.get("connection_type"),
        row.get("tags"),
    ]

    for key in ("geoip", "geo", "network", "whois", "asn_data", "isp_data"):
        value = row.get(key)

        if isinstance(value, Mapping):
            fields.extend([
                value.get("provider"),
                value.get("organization"),
                value.get("org"),
                value.get("asn"),
                value.get("as_name"),
                value.get("as_org"),
                value.get("isp"),
                value.get("network_type"),
                value.get("hosting_type"),
                value.get("connection_type"),
                value.get("reverse_dns"),
                value.get("hostname"),
            ])

    return norm(" ".join(as_text(field) for field in fields))


def existing_bool(row: Mapping[str, Any], key: str) -> bool:
    if row.get(key) is True:
        return True

    nested = row.get(key.replace("is_", ""))

    if isinstance(nested, Mapping):
        return bool(nested.get(key) is True or nested.get(key.replace("is_", "suspected_")) is True)

    return False


def vpn_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    text = extract_text_blob(row)
    address = extract_address(row)
    parsed_ip = parse_ip_from_address(address)

    evidence: list[str] = []
    score = 0.0

    vpn_keyword_hits = keyword_hits(text, VPN_KEYWORDS)
    vpn_provider_hits = keyword_hits(text, KNOWN_VPN_PROVIDERS)
    datacenter_hits = keyword_hits(text, DATACENTER_KEYWORDS) + keyword_hits(text, KNOWN_HOSTING_PROVIDERS)
    residential_hits = keyword_hits(text, RESIDENTIAL_KEYWORDS)
    mobile_hits = keyword_hits(text, MOBILE_KEYWORDS)
    tor_hits = keyword_hits(text, TOR_KEYWORDS)
    i2p_hits = keyword_hits(text, I2P_KEYWORDS)

    is_tor = bool(row.get("is_tor") or row.get("tor", {}).get("is_tor") or row.get("tor", {}).get("suspected_tor") or tor_hits)
    is_i2p = bool(row.get("is_i2p") or row.get("i2p", {}).get("is_i2p") or row.get("i2p", {}).get("suspected_i2p") or i2p_hits)
    is_proxy = bool(
        row.get("is_proxy")
        or row.get("suspected_proxy")
        or row.get("proxy", {}).get("is_proxy")
        or row.get("proxy", {}).get("suspected_proxy")
    )

    if vpn_keyword_hits:
        score += min(35.0, 18.0 + 4.0 * len(vpn_keyword_hits))
        evidence.append(f"vpn keywords: {', '.join(vpn_keyword_hits[:8])}")

    if vpn_provider_hits:
        score += min(55.0, 32.0 + 6.0 * len(vpn_provider_hits))
        evidence.append(f"known vpn provider keywords: {', '.join(vpn_provider_hits[:8])}")

    if is_proxy:
        score += 8.0
        evidence.append("proxy metadata present")

    if is_tor:
        score += 4.0
        evidence.append("tor overlay metadata present")

    if is_i2p:
        score += 4.0
        evidence.append("i2p overlay metadata present")

    if datacenter_hits:
        score += min(18.0, 5.0 + 2.0 * len(datacenter_hits))
        evidence.append(f"datacenter/hosting context: {', '.join(datacenter_hits[:8])}")

    if residential_hits:
        score -= 8.0
        evidence.append(f"residential ISP context: {', '.join(residential_hits[:8])}")

    if mobile_hits:
        score -= 4.0
        evidence.append(f"mobile ISP context: {', '.join(mobile_hits[:8])}")

    if parsed_ip is not None:
        if parsed_ip.is_private or parsed_ip.is_loopback or parsed_ip.is_reserved:
            score += 5.0
            evidence.append("special-purpose IP range")

    score = clamp(score)

    suspected_vpn = score >= 35.0 or bool(vpn_provider_hits)
    is_vpn = suspected_vpn

    if is_tor:
        category = "tor"
    elif is_i2p:
        category = "i2p"
    elif suspected_vpn:
        category = "suspected_vpn"
    elif is_proxy:
        category = "suspected_proxy"
    elif datacenter_hits:
        category = "datacenter"
    elif residential_hits:
        category = "residential"
    elif mobile_hits:
        category = "mobile"
    else:
        category = "unknown"

    if score >= 80:
        confidence = "high"
    elif score >= 45:
        confidence = "medium"
    elif score >= 20:
        confidence = "low"
    else:
        confidence = "none"

    return {
        "schema": SCHEMA,
        "source": SOURCE,
        "suspected_vpn": suspected_vpn,
        "is_vpn": is_vpn,
        "vpn_score": round(score, 4),
        "vpn_confidence": confidence,
        "network_privacy_category": category,
        "vpn_keyword_hits": vpn_keyword_hits,
        "vpn_provider_hits": vpn_provider_hits,
        "datacenter_hits": datacenter_hits,
        "residential_hits": residential_hits,
        "mobile_hits": mobile_hits,
        "evidence": evidence,
        "reason": "; ".join(evidence),
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = vpn_metadata(node)

    node["vpn"] = meta
    node["suspected_vpn"] = meta["suspected_vpn"]
    node["is_vpn"] = meta["is_vpn"]
    node["vpn_score"] = meta["vpn_score"]
    node["vpn_confidence"] = meta["vpn_confidence"]
    node["network_privacy_category"] = meta["network_privacy_category"]

    node.setdefault("enrichment", {})
    node["enrichment"]["vpn"] = {
        "schema": SCHEMA,
        "source": SOURCE,
        "status": "ok",
        "updated_at": meta["updated_at"],
    }

    return node


def enrich_nodes(nodes: Any) -> Any:
    if isinstance(nodes, list):
        return [
            enrich_node(dict(node)) if isinstance(node, Mapping) else node
            for node in nodes
        ]

    if isinstance(nodes, dict):
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
    payload["metadata"]["vpn_enriched_at"] = utc_now()

    payload.setdefault("enrichment", {})
    payload["enrichment"]["vpn"] = {
        "schema": SCHEMA,
        "source": SOURCE,
        "status": "ok",
        "generated_data_dir": str(VPN_DATA_DIR),
        "updated_at": utc_now(),
    }

    return payload


def iter_payload_nodes(payload: Any) -> list[Mapping[str, Any]]:
    if isinstance(payload, list):
        return [node for node in payload if isinstance(node, Mapping)]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [node for node in nodes if isinstance(node, Mapping)]

    if isinstance(nodes, dict):
        return [node for node in nodes.values() if isinstance(node, Mapping)]

    for key in ("results", "data"):
        value = payload.get(key)

        if isinstance(value, list):
            return [node for node in value if isinstance(node, Mapping)]

    return []


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    categories: dict[str, int] = {}
    confidence: dict[str, int] = {}
    suspected_count = 0

    for node in nodes:
        vpn = node.get("vpn", {})

        if not isinstance(vpn, Mapping):
            vpn = {}

        category = str(
            node.get("network_privacy_category")
            or vpn.get("network_privacy_category")
            or "unknown"
        )

        conf = str(
            node.get("vpn_confidence")
            or vpn.get("vpn_confidence")
            or "none"
        )

        categories[category] = categories.get(category, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1

        if bool(node.get("suspected_vpn") or vpn.get("suspected_vpn")):
            suspected_count += 1

    return {
        "schema": "zzx-bitnodes-vpn-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "categories": categories,
        "confidence": confidence,
        "suspected_vpn_nodes": suspected_count,
        "vpn_nodes": suspected_count,
        "proxy_nodes": categories.get("suspected_proxy", 0) + categories.get("proxy", 0),
        "tor_nodes": categories.get("tor", 0),
        "i2p_nodes": categories.get("i2p", 0),
        "datacenter_nodes": categories.get("datacenter", 0),
        "residential_nodes": categories.get("residential", 0),
        "mobile_nodes": categories.get("mobile", 0),
        "unknown_nodes": categories.get("unknown", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with suspected VPN, hosting, proxy, and privacy-network heuristics."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload)

    write_json(Path(args.output), enriched, pretty=not args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_payload_nodes(enriched)), pretty=True)

    print(f"vpn enrichment complete: {len(iter_payload_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
