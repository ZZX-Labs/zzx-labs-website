#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import ipaddress
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-vpn-heuristic-v3"
SOURCE = "zzx_vpn_heuristic_v3"

BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", "bitcoin/bitnodes"))
BITNODES_DATA = Path(os.environ.get("BITNODES_DATA", str(BITNODES_ROOT / "data")))
VPN_DATA_DIR = Path(os.environ.get("BITNODES_VPN_DATA", str(BITNODES_DATA / "vpn")))

VPN_KEYWORDS = (
    "vpn", "virtual private network", "wireguard", "openvpn", "ipsec", "ikev2",
    "l2tp", "pptp", "privacy vpn", "anonymous vpn", "anonymizer",
    "privacy network", "secure tunnel", "encrypted tunnel",
)

KNOWN_VPN_PROVIDERS = (
    "mullvad", "proton", "protonvpn", "nordvpn", "expressvpn", "surfshark",
    "private internet access", "pia", "cyberghost", "windscribe", "torguard",
    "ivpn", "airvpn", "perfect privacy", "hide.me", "vyprvpn", "purevpn",
    "hotspot shield", "hidemyass", "hma", "azirevpn", "mozilla vpn",
    "bitmask", "riseup",
)

DATACENTER_KEYWORDS = (
    "hosting", "cloud", "datacenter", "data center", "colo", "colocation",
    "server", "dedicated", "vps", "compute", "bare metal", "instance",
)

KNOWN_HOSTING_PROVIDERS = (
    "amazon", "aws", "google cloud", "gcp", "microsoft azure", "azure",
    "oracle cloud", "digitalocean", "linode", "akamai", "vultr", "ovh",
    "ovhcloud", "hetzner", "leaseweb", "contabo", "scaleway", "rackspace",
    "cloudflare", "choopa", "equinix", "hivelocity", "servermania",
    "psychz", "quadranet", "netcup", "ionos", "namecheap", "hosthatch",
)

RESIDENTIAL_KEYWORDS = (
    "residential", "broadband", "cable", "dsl", "fiber", "fibre", "telecom",
    "telco", "communications", "comcast", "verizon", "spectrum", "charter",
    "cox", "at&t", "bt", "vodafone", "telefonica", "orange", "deutsche telekom",
)

MOBILE_KEYWORDS = (
    "mobile", "wireless", "cellular", "lte", "5g", "4g", "t-mobile",
    "tmobile", "vodafone", "telefonica", "orange",
)

TOR_KEYWORDS = (".onion", "tor exit", "tor relay", "tor node")
I2P_KEYWORDS = (".i2p", "i2p")


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


def write_json(path: Path, payload: Any, compact: bool = False, pretty: bool | None = None) -> None:
    if pretty is None:
        pretty = not compact

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
            sort_keys=pretty,
            default=str,
        )
        + "\n",
        encoding="utf-8",
    )


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


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)

    return current


def first_value(row: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)
        if value not in ("", None):
            return value
    return None


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
    hits = []

    for keyword in sorted(set(keywords), key=len, reverse=True):
        keyword_l = keyword.lower()

        if keyword_l.startswith("."):
            if keyword_l in text:
                hits.append(keyword)
            continue

        pattern = r"\b" + re.escape(keyword_l).replace(r"\ ", r"\s+") + r"\b"

        if re.search(pattern, text):
            hits.append(keyword)

    return hits


def clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def normalize_host(address: Any) -> str:
    text = str(address or "").strip().lower()

    if not text:
        return ""

    if text.startswith("[") and "]" in text:
        return text[1:text.index("]")]

    if ".onion:" in text or ".i2p:" in text:
        return text.rsplit(":", 1)[0].strip("[]")

    if text.endswith(".onion") or text.endswith(".i2p"):
        return text.strip("[]")

    if text.count(":") == 1:
        host, port = text.rsplit(":", 1)
        if port.isdigit():
            return host.strip("[]")

    if text.count(":") > 1:
        possible_host, possible_port = text.rsplit(":", 1)
        if possible_port.isdigit():
            try:
                ipaddress.ip_address(possible_host.strip("[]"))
                return possible_host.strip("[]")
            except ValueError:
                pass

    return text.strip("[]")


def parse_ip_from_address(address: Any) -> ipaddress._BaseAddress | None:
    host = normalize_host(address)

    if not host or host.endswith(".onion") or host.endswith(".i2p"):
        return None

    try:
        return ipaddress.ip_address(host)
    except ValueError:
        return None


def extract_address(row: Mapping[str, Any]) -> str:
    return str(
        first_value(
            row,
            "address", "canonical_address", "node", "addr", "ip", "host", "hostname", "id",
            "metadata.address", "metadata.canonical_address", "metadata.host",
        )
        or ""
    )


def extract_text_blob(row: Mapping[str, Any]) -> str:
    keys = (
        "address", "canonical_address", "node", "addr", "host", "hostname",
        "reverse_dns", "rdns", "provider", "provider_raw", "provider_normalized",
        "organization", "org", "asn", "as_name", "as_org", "isp",
        "hosting_type", "network_type", "connection_type", "tags",
        "provider_data.provider", "provider_data.provider_kind",
        "provider_data.network_classification", "provider_data.organization",
        "isp.provider", "isp.organization", "isp.network_classification",
        "isp_data.provider", "isp_data.organization", "isp_data.network_classification",
        "geoip.provider", "geoip.organization", "geoip.org", "geoip.isp",
        "network.provider", "network.organization",
        "whois.provider", "whois.organization",
        "asn_data.provider", "asn_data.organization", "asn_data.network_classification",
        "metadata.provider", "metadata.organization", "metadata.org", "metadata.asn",
        "metadata.provider_kind", "metadata.network_classification",
        "metadata.provider_data.provider", "metadata.provider_data.provider_kind",
        "metadata.isp.provider", "metadata.asn_data.provider",
    )

    return norm(" ".join(as_text(first_value(row, key)) for key in keys))


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

    is_tor = bool(
        boolish(first_value(row, "is_tor", "suspected_tor", "tor.is_tor", "metadata.is_tor"))
        or bool(tor_hits)
    )
    is_i2p = bool(
        boolish(first_value(row, "is_i2p", "suspected_i2p", "i2p.is_i2p", "metadata.is_i2p"))
        or bool(i2p_hits)
    )
    is_proxy = boolish(
        first_value(
            row,
            "is_proxy",
            "suspected_proxy",
            "proxy.is_proxy",
            "proxy.suspected_proxy",
            "metadata.is_proxy",
            "metadata.suspected_proxy",
        )
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

    if parsed_ip is not None and (parsed_ip.is_private or parsed_ip.is_loopback or parsed_ip.is_reserved):
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
        "host": normalize_host(address),
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


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = vpn_metadata(node)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["vpn"] = meta
    metadata["vpn"] = meta

    for key in ("suspected_vpn", "is_vpn", "vpn_score", "vpn_confidence", "network_privacy_category"):
        node[key] = meta[key]
        metadata[key] = meta[key]

    enrichment["vpn"] = {
        "schema": SCHEMA,
        "source": SOURCE,
        "status": "ok",
        "updated_at": meta["updated_at"],
        "vpn_score": meta["vpn_score"],
        "vpn_confidence": meta["vpn_confidence"],
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
        output["metadata"]["vpn_enriched_at"] = utc_now()
        output["metadata"]["vpn_schema"] = SCHEMA

    output.setdefault("enrichment", {})
    if isinstance(output["enrichment"], MutableMapping):
        output["enrichment"]["vpn"] = {
            "schema": SCHEMA,
            "source": SOURCE,
            "status": "ok",
            "generated_data_dir": str(VPN_DATA_DIR),
            "updated_at": utc_now(),
        }

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context))


def iter_payload_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    categories: dict[str, int] = {}
    confidence: dict[str, int] = {}
    suspected_count = 0

    for node in nodes:
        vpn = node.get("vpn", {})
        if not isinstance(vpn, Mapping):
            vpn = {}

        category = str(node.get("network_privacy_category") or vpn.get("network_privacy_category") or "unknown")
        conf = str(node.get("vpn_confidence") or vpn.get("vpn_confidence") or "none")

        categories[category] = categories.get(category, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1

        if boolish(node.get("suspected_vpn") or vpn.get("suspected_vpn")):
            suspected_count += 1

    return {
        "schema": "zzx-bitnodes-vpn-summary-v3",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "categories": dict(sorted(categories.items(), key=lambda item: (-item[1], item[0]))),
        "confidence": dict(sorted(confidence.items(), key=lambda item: (-item[1], item[0]))),
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


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with suspected VPN, hosting, proxy, and privacy-network heuristics.",
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
        write_json(Path(args.summary), summarize(iter_payload_nodes(enriched)), compact=args.compact)

    print(f"vpn enrichment complete: {len(iter_payload_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
