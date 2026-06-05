#!/usr/bin/env python3
"""
ZZX-Labs Bitnodes Proxy Heuristics
----------------------------------

Purpose:
    Enrich Bitcoin node records with suspected proxy metadata.

Policy:
    This module does NOT claim certainty. It assigns a heuristic proxy score,
    confidence level, category, and evidence list.

Input:
    A node record dictionary.

Output:
    The same node record dictionary with:

        proxy: {
            suspected_proxy: bool,
            proxy_score: float,
            proxy_confidence: str,
            proxy_category: str,
            evidence: list[str],
            source: "zzx_proxy_heuristic_v1"
        }

Compatibility:
    Designed to be imported by enrich.py, aggregate.py, maps.py, or crawler
    pipelines without requiring third-party APIs.

Notes:
    VPN and proxy detection are related but not identical. VPN should stay in
    vpn.py. This module focuses on web proxy, reverse proxy, hosting proxy,
    CDN/WARP-like, anonymizer, tunnel, relay, gateway, and suspicious provider
    patterns.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional, Tuple


SCHEMA = "zzx-bitnodes-proxy-heuristic-v1"
SOURCE = "zzx_proxy_heuristic_v1"


BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", "bitcoin/bitnodes"))
BITNODES_DATA = Path(os.environ.get("BITNODES_DATA", str(BITNODES_ROOT / "data")))
PROXY_DATA_DIR = Path(os.environ.get("BITNODES_PROXY_DATA", str(BITNODES_DATA / "proxy")))


PROXY_PROVIDER_KEYWORDS = {
    "proxy",
    "proxies",
    "proxied",
    "reverse proxy",
    "forward proxy",
    "http proxy",
    "socks",
    "socks5",
    "anonymizer",
    "anonymous",
    "anonymouse",
    "webproxy",
    "web proxy",
    "hide ip",
    "hide-ip",
    "vpn proxy",
    "tunnel",
    "tunneling",
    "relay",
    "gateway",
    "exit node",
    "egress",
    "nat gateway",
    "carrier grade nat",
    "cgnat",
    "cg-nat",
    "scraper",
    "scraping",
    "crawler proxy",
    "residential proxy",
    "mobile proxy",
    "rotating proxy",
    "datacenter proxy",
    "bulletproof",
    "privacy service",
    "privacy network",
    "shield",
    "warp",
}


CDN_OR_REVERSE_PROXY_KEYWORDS = {
    "cloudflare",
    "cloudflare warp",
    "fastly",
    "akamai",
    "edgecast",
    "imperva",
    "incapsula",
    "sucuri",
    "stackpath",
    "bunnycdn",
    "cachefly",
    "cdn77",
    "cloudfront",
    "amazon cloudfront",
    "google cloud cdn",
    "azure front door",
    "netlify",
    "vercel",
    "nginx proxy",
    "haproxy",
    "traefik",
}


HOSTING_PROXY_CONTEXT_KEYWORDS = {
    "vps",
    "cloud",
    "hosting",
    "host",
    "server",
    "servers",
    "colo",
    "colocation",
    "datacenter",
    "data center",
    "dedicated",
    "bare metal",
    "virtual private",
    "compute",
    "instance",
}


RESIDENTIAL_PROXY_KEYWORDS = {
    "residential proxy",
    "residential proxies",
    "mobile proxy",
    "mobile proxies",
    "rotating residential",
    "peer-to-peer proxy",
    "p2p proxy",
}


KNOWN_PROXY_ASNS = {
    # Intentionally conservative and small. Do not over-label entire ASNs.
    # Add only when your own data proves repeated proxy behavior.
}


PRIVATE_OR_SPECIAL_NETWORKS = {
    "private",
    "loopback",
    "link_local",
    "multicast",
    "reserved",
    "unspecified",
}


def as_text(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, (list, tuple, set)):
        return " ".join(as_text(item) for item in value)

    if isinstance(value, Mapping):
        return " ".join(as_text(item) for item in value.values())

    return str(value)


def norm(value: Any) -> str:
    return re.sub(r"\s+", " ", as_text(value).strip().lower())


def clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def parse_ip(address: str) -> Optional[ipaddress._BaseAddress]:
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


def extract_address(node: Mapping[str, Any]) -> str:
    return str(
        node.get("address")
        or node.get("addr")
        or node.get("node")
        or node.get("ip")
        or node.get("host")
        or node.get("hostname")
        or node.get("id")
        or ""
    )


def extract_asn(node: Mapping[str, Any]) -> str:
    value = node.get("asn") or node.get("as_number") or node.get("autonomous_system_number")

    if value is None:
        geoip = node.get("geoip") or node.get("geo") or {}
        if isinstance(geoip, Mapping):
            value = geoip.get("asn") or geoip.get("as_number")

    text = str(value or "").upper().strip()

    if text and not text.startswith("AS") and text.isdigit():
        text = f"AS{text}"

    return text


def provider_text(node: Mapping[str, Any]) -> str:
    fields = [
        node.get("provider"),
        node.get("isp"),
        node.get("organization"),
        node.get("org"),
        node.get("as_org"),
        node.get("asn_org"),
        node.get("host"),
        node.get("hostname"),
        node.get("reverse_dns"),
        node.get("rdns"),
    ]

    for key in ("geoip", "geo", "network", "whois", "asn_data", "isp_data"):
        value = node.get(key)
        if isinstance(value, Mapping):
            fields.extend([
                value.get("provider"),
                value.get("isp"),
                value.get("organization"),
                value.get("org"),
                value.get("as_org"),
                value.get("asn_org"),
                value.get("reverse_dns"),
                value.get("hostname"),
            ])

    return norm(" ".join(as_text(field) for field in fields))


def keyword_hits(text: str, keywords: Iterable[str]) -> List[str]:
    hits = []

    for keyword in sorted(set(keywords), key=len, reverse=True):
        pattern = r"\b" + re.escape(keyword.lower()).replace(r"\ ", r"\s+") + r"\b"

        if re.search(pattern, text):
            hits.append(keyword)

    return hits


def classify_confidence(score: float) -> str:
    if score >= 0.85:
        return "high"
    if score >= 0.60:
        return "medium"
    if score >= 0.35:
        return "low"
    return "none"


def classify_category(score: float, evidence: List[str]) -> str:
    joined = " ".join(evidence).lower()

    if score < 0.35:
        return "not_suspected"

    if "residential proxy" in joined or "mobile proxy" in joined:
        return "suspected_residential_proxy"

    if "cdn" in joined or "reverse proxy" in joined or "cloudflare" in joined:
        return "suspected_reverse_proxy_or_cdn"

    if "socks" in joined or "http proxy" in joined or "web proxy" in joined:
        return "suspected_forward_proxy"

    if "relay" in joined or "gateway" in joined or "tunnel" in joined:
        return "suspected_proxy_gateway_or_relay"

    if "hosting" in joined or "datacenter" in joined or "cloud" in joined:
        return "possible_datacenter_proxy"

    return "suspected_proxy"


def inspect_ip_address(node: Mapping[str, Any]) -> Tuple[float, List[str]]:
    score = 0.0
    evidence: List[str] = []

    address = extract_address(node)
    parsed = parse_ip(address)

    if parsed is None:
        if ".onion" in address.lower() or ".i2p" in address.lower():
            return 0.0, []
        return 0.04, ["address could not be parsed as standard IP"]

    special_flags = []

    if parsed.is_private:
        special_flags.append("private")
    if parsed.is_loopback:
        special_flags.append("loopback")
    if parsed.is_link_local:
        special_flags.append("link_local")
    if parsed.is_multicast:
        special_flags.append("multicast")
    if parsed.is_reserved:
        special_flags.append("reserved")
    if parsed.is_unspecified:
        special_flags.append("unspecified")

    if special_flags:
        score += 0.18
        evidence.append(f"special IP range: {','.join(special_flags)}")

    return score, evidence


def inspect_provider(node: Mapping[str, Any]) -> Tuple[float, List[str]]:
    text = provider_text(node)
    score = 0.0
    evidence: List[str] = []

    if not text:
        return score, evidence

    proxy_hits = keyword_hits(text, PROXY_PROVIDER_KEYWORDS)

    if proxy_hits:
        score += min(0.65, 0.18 + 0.08 * len(proxy_hits))
        evidence.append(f"proxy provider keywords: {', '.join(proxy_hits[:8])}")

    cdn_hits = keyword_hits(text, CDN_OR_REVERSE_PROXY_KEYWORDS)

    if cdn_hits:
        score += min(0.45, 0.15 + 0.06 * len(cdn_hits))
        evidence.append(f"cdn/reverse-proxy keywords: {', '.join(cdn_hits[:8])}")

    residential_hits = keyword_hits(text, RESIDENTIAL_PROXY_KEYWORDS)

    if residential_hits:
        score += min(0.55, 0.22 + 0.08 * len(residential_hits))
        evidence.append(f"residential/mobile proxy keywords: {', '.join(residential_hits[:8])}")

    hosting_hits = keyword_hits(text, HOSTING_PROXY_CONTEXT_KEYWORDS)

    if hosting_hits and (proxy_hits or cdn_hits):
        score += 0.14
        evidence.append(f"hosting context combined with proxy/CDN terms: {', '.join(hosting_hits[:6])}")
    elif hosting_hits:
        score += 0.05
        evidence.append(f"hosting/datacenter context: {', '.join(hosting_hits[:6])}")

    return score, evidence


def inspect_reverse_dns(node: Mapping[str, Any]) -> Tuple[float, List[str]]:
    fields = [
        node.get("hostname"),
        node.get("host"),
        node.get("reverse_dns"),
        node.get("rdns"),
        node.get("ptr"),
    ]

    text = norm(" ".join(as_text(field) for field in fields))

    if not text:
        return 0.0, []

    keywords = {
        "proxy",
        "socks",
        "socks5",
        "http-proxy",
        "http.proxy",
        "webproxy",
        "relay",
        "gateway",
        "nat",
        "tunnel",
        "cdn",
        "edge",
        "warp",
        "anon",
        "anonymous",
    }

    hits = keyword_hits(text.replace("-", " ").replace(".", " "), keywords)

    if not hits:
        return 0.0, []

    return min(0.42, 0.14 + 0.07 * len(hits)), [f"reverse DNS proxy indicators: {', '.join(hits[:8])}"]


def inspect_asn(node: Mapping[str, Any]) -> Tuple[float, List[str]]:
    asn = extract_asn(node)

    if not asn:
        return 0.0, []

    if asn in KNOWN_PROXY_ASNS:
        return 0.35, [f"ASN appears in local proxy watchlist: {asn}"]

    return 0.0, []


def inspect_existing_flags(node: Mapping[str, Any]) -> Tuple[float, List[str]]:
    score = 0.0
    evidence: List[str] = []

    existing_proxy = node.get("proxy")

    if isinstance(existing_proxy, Mapping):
        if existing_proxy.get("suspected_proxy") is True or existing_proxy.get("is_proxy") is True:
            score += 0.45
            evidence.append("existing proxy metadata already marked suspicious")

        existing_score = existing_proxy.get("proxy_score")

        try:
            existing_score_f = float(existing_score)
            if existing_score_f > 0:
                score += min(0.30, existing_score_f * 0.30)
                evidence.append(f"existing proxy score: {existing_score_f:.2f}")
        except (TypeError, ValueError):
            pass

    for key in ("suspected_proxy", "is_proxy", "proxy_detected"):
        if node.get(key) is True:
            score += 0.40
            evidence.append(f"existing boolean flag set: {key}")

    return score, evidence


def compute_proxy_score(node: Mapping[str, Any]) -> Dict[str, Any]:
    score = 0.0
    evidence: List[str] = []

    for inspector in (
        inspect_existing_flags,
        inspect_ip_address,
        inspect_provider,
        inspect_reverse_dns,
        inspect_asn,
    ):
        delta, items = inspector(node)
        score += delta
        evidence.extend(items)

    score = clamp(score)
    confidence = classify_confidence(score)
    suspected = score >= 0.35
    category = classify_category(score, evidence)

    return {
        "schema": SCHEMA,
        "source": SOURCE,
        "suspected_proxy": suspected,
        "is_proxy": suspected,
        "proxy_score": round(score, 4),
        "proxy_confidence": confidence,
        "proxy_category": category,
        "evidence": evidence,
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    result = compute_proxy_score(node)

    node["proxy"] = result
    node["suspected_proxy"] = result["suspected_proxy"]
    node["proxy_score"] = result["proxy_score"]
    node["proxy_confidence"] = result["proxy_confidence"]
    node["proxy_category"] = result["proxy_category"]

    return node


def enrich_nodes(nodes: Any) -> Any:
    if isinstance(nodes, list):
        return [enrich_node(dict(node)) if isinstance(node, Mapping) else node for node in nodes]

    if isinstance(nodes, dict):
        return {
            key: enrich_node(dict(value)) if isinstance(value, Mapping) else value
            for key, value in nodes.items()
        }

    return nodes


def enrich_payload(payload: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    if isinstance(payload.get("nodes"), list):
        payload["nodes"] = enrich_nodes(payload["nodes"])
    elif isinstance(payload.get("nodes"), dict):
        payload["nodes"] = enrich_nodes(payload["nodes"])

    if isinstance(payload.get("results"), list):
        payload["results"] = enrich_nodes(payload["results"])

    if isinstance(payload.get("data"), list):
        payload["data"] = enrich_nodes(payload["data"])

    payload.setdefault("enrichment", {})
    payload["enrichment"]["proxy"] = {
        "schema": SCHEMA,
        "source": SOURCE,
        "generated_data_dir": str(PROXY_DATA_DIR),
    }

    return payload


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    if pretty:
        text = json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False)
    else:
        text = json.dumps(data, separators=(",", ":"), sort_keys=True, ensure_ascii=False)

    path.write_text(text + "\n", encoding="utf-8")


def cli(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes node records with ZZX proxy heuristics."
    )

    parser.add_argument(
        "--input",
        required=True,
        help="Input JSON payload containing nodes/results/data.",
    )

    parser.add_argument(
        "--output",
        required=True,
        help="Output JSON payload with proxy enrichment.",
    )

    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Write pretty indented JSON.",
    )

    args = parser.parse_args(argv)

    input_path = Path(args.input)
    output_path = Path(args.output)

    payload = load_json(input_path)

    if isinstance(payload, MutableMapping):
        payload = enrich_payload(payload)
    elif isinstance(payload, list):
        payload = enrich_nodes(payload)
    else:
        raise SystemExit("Input JSON must be an object or list.")

    write_json(output_path, payload, pretty=args.pretty)

    return 0


def main() -> int:
    return cli()


if __name__ == "__main__":
    raise SystemExit(main())
