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
from typing import Any, Iterable, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-proxy-heuristic-v2"
SOURCE = "zzx_proxy_heuristic_v2"

BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", "bitcoin/bitnodes"))
BITNODES_DATA = Path(os.environ.get("BITNODES_DATA", str(BITNODES_ROOT / "data")))
PROXY_DATA_DIR = Path(os.environ.get("BITNODES_PROXY_DATA", str(BITNODES_DATA / "proxy")))

PROXY_PROVIDER_KEYWORDS = {
    "proxy", "proxies", "proxied", "reverse proxy", "forward proxy",
    "http proxy", "socks", "socks5", "anonymizer", "anonymous",
    "webproxy", "web proxy", "hide ip", "hide-ip", "vpn proxy",
    "tunnel", "tunneling", "relay", "gateway", "exit node", "egress",
    "nat gateway", "carrier grade nat", "cgnat", "cg-nat", "scraper",
    "scraping", "crawler proxy", "residential proxy", "mobile proxy",
    "rotating proxy", "datacenter proxy", "bulletproof", "privacy service",
    "privacy network", "shield", "warp",
}

CDN_OR_REVERSE_PROXY_KEYWORDS = {
    "cloudflare", "cloudflare warp", "fastly", "akamai", "edgecast",
    "imperva", "incapsula", "sucuri", "stackpath", "bunnycdn", "cachefly",
    "cdn77", "cloudfront", "amazon cloudfront", "google cloud cdn",
    "azure front door", "netlify", "vercel", "nginx proxy", "haproxy",
    "traefik",
}

HOSTING_PROXY_CONTEXT_KEYWORDS = {
    "vps", "cloud", "hosting", "host", "server", "servers", "colo",
    "colocation", "datacenter", "data center", "dedicated", "bare metal",
    "virtual private", "compute", "instance",
}

RESIDENTIAL_PROXY_KEYWORDS = {
    "residential proxy", "residential proxies", "mobile proxy",
    "mobile proxies", "rotating residential", "peer-to-peer proxy",
    "p2p proxy",
}

KNOWN_PROXY_ASNS: set[str] = set()


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


def write_json(path: Path, data: Any, compact: bool = False, pretty: bool | None = None) -> None:
    if pretty is None:
        pretty = not compact

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            data,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
            sort_keys=pretty,
            ensure_ascii=False,
            default=str,
        )
        + "\n",
        encoding="utf-8",
    )


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


def parse_ip(address: Any) -> ipaddress._BaseAddress | None:
    host = normalize_host(address)

    if not host or host.endswith(".onion") or host.endswith(".i2p"):
        return None

    try:
        return ipaddress.ip_address(host)
    except ValueError:
        return None


def extract_address(node: Mapping[str, Any]) -> str:
    return str(
        first_value(
            node,
            "address", "canonical_address", "addr", "node", "ip", "host", "hostname", "id",
            "metadata.address", "metadata.canonical_address", "metadata.host",
        )
        or ""
    )


def extract_asn(node: Mapping[str, Any]) -> str:
    value = first_value(
        node,
        "asn", "as_number", "autonomous_system_number",
        "metadata.asn", "geoip.asn", "asn_data.asn", "provider_data.asn",
    )

    text = str(value or "").upper().strip()

    if text and not text.startswith("AS") and text.isdigit():
        text = f"AS{text}"

    return text


def provider_text(node: Mapping[str, Any]) -> str:
    keys = (
        "provider", "provider_raw", "provider_normalized", "isp", "organization",
        "org", "as_org", "asn_org", "host", "hostname", "reverse_dns", "rdns",
        "provider_kind", "network_classification",
        "metadata.provider", "metadata.organization", "metadata.org",
        "metadata.provider_kind", "metadata.network_classification",
        "provider_data.provider", "provider_data.provider_kind",
        "provider_data.network_classification", "provider_data.organization",
        "geoip.provider", "geoip.organization", "geoip.org",
        "network.provider", "network.organization",
        "whois.provider", "whois.organization",
        "asn_data.provider", "asn_data.organization",
        "isp_data.provider", "isp_data.organization",
    )

    return norm(" ".join(as_text(first_value(node, key)) for key in keys))


def keyword_hits(text: str, keywords: Iterable[str]) -> list[str]:
    hits: list[str] = []

    for keyword in sorted(set(keywords), key=len, reverse=True):
        key = keyword.lower()

        if key.startswith("."):
            if key in text:
                hits.append(keyword)
            continue

        pattern = r"\b" + re.escape(key).replace(r"\ ", r"\s+") + r"\b"

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


def classify_category(score: float, evidence: list[str]) -> str:
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


def inspect_ip_address(node: Mapping[str, Any]) -> tuple[float, list[str]]:
    score = 0.0
    evidence: list[str] = []
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


def inspect_provider(node: Mapping[str, Any]) -> tuple[float, list[str]]:
    text = provider_text(node)
    score = 0.0
    evidence: list[str] = []

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


def inspect_reverse_dns(node: Mapping[str, Any]) -> tuple[float, list[str]]:
    text = norm(
        " ".join(
            as_text(first_value(node, key))
            for key in ("hostname", "host", "reverse_dns", "rdns", "ptr", "metadata.hostname", "metadata.host")
        )
    )

    if not text:
        return 0.0, []

    keywords = {
        "proxy", "socks", "socks5", "http proxy", "webproxy", "relay",
        "gateway", "nat", "tunnel", "cdn", "edge", "warp", "anon",
        "anonymous",
    }

    hits = keyword_hits(text.replace("-", " ").replace(".", " "), keywords)

    if not hits:
        return 0.0, []

    return min(0.42, 0.14 + 0.07 * len(hits)), [f"reverse DNS proxy indicators: {', '.join(hits[:8])}"]


def inspect_asn(node: Mapping[str, Any]) -> tuple[float, list[str]]:
    asn = extract_asn(node)

    if not asn:
        return 0.0, []

    if asn in KNOWN_PROXY_ASNS:
        return 0.35, [f"ASN appears in local proxy watchlist: {asn}"]

    return 0.0, []


def inspect_existing_flags(node: Mapping[str, Any]) -> tuple[float, list[str]]:
    score = 0.0
    evidence: list[str] = []
    existing_proxy = node.get("proxy")

    if isinstance(existing_proxy, Mapping):
        if boolish(existing_proxy.get("suspected_proxy") or existing_proxy.get("is_proxy")):
            score += 0.45
            evidence.append("existing proxy metadata already marked suspicious")

        try:
            existing_score = float(existing_proxy.get("proxy_score"))
            if existing_score > 0:
                if existing_score > 1:
                    existing_score = existing_score / 100.0
                score += min(0.30, existing_score * 0.30)
                evidence.append(f"existing proxy score: {existing_score:.2f}")
        except (TypeError, ValueError):
            pass

    for key in ("suspected_proxy", "is_proxy", "proxy_detected", "metadata.suspected_proxy", "metadata.is_proxy"):
        if boolish(first_value(node, key)):
            score += 0.40
            evidence.append(f"existing boolean flag set: {key}")

    return score, evidence


def compute_proxy_score(node: Mapping[str, Any]) -> dict[str, Any]:
    score = 0.0
    evidence: list[str] = []

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
        "host": normalize_host(extract_address(node)),
        "suspected_proxy": suspected,
        "is_proxy": suspected,
        "proxy_score": round(score, 4),
        "proxy_confidence": confidence,
        "proxy_category": category,
        "evidence": evidence,
        "updated_at": utc_now(),
    }


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    result = compute_proxy_score(node)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["proxy"] = result
    metadata["proxy"] = result

    for key in ("suspected_proxy", "is_proxy", "proxy_score", "proxy_confidence", "proxy_category"):
        node[key] = result[key]
        metadata[key] = result[key]

    enrichment["proxy"] = {
        "schema": SCHEMA,
        "source": SOURCE,
        "status": "ok",
        "updated_at": result["updated_at"],
        "proxy_score": result["proxy_score"],
        "proxy_confidence": result["proxy_confidence"],
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
        output["metadata"]["proxy_enriched_at"] = utc_now()
        output["metadata"]["proxy_schema"] = SCHEMA

    output.setdefault("enrichment", {})
    if isinstance(output["enrichment"], MutableMapping):
        output["enrichment"]["proxy"] = {
            "schema": SCHEMA,
            "source": SOURCE,
            "status": "ok",
            "generated_data_dir": str(PROXY_DATA_DIR),
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
    suspected = 0

    for node in nodes:
        proxy = node.get("proxy", {})
        if not isinstance(proxy, Mapping):
            proxy = {}

        category = str(node.get("proxy_category") or proxy.get("proxy_category") or "not_suspected")
        conf = str(node.get("proxy_confidence") or proxy.get("proxy_confidence") or "none")

        categories[category] = categories.get(category, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1

        if boolish(node.get("suspected_proxy") or node.get("is_proxy") or proxy.get("suspected_proxy")):
            suspected += 1

    return {
        "schema": "zzx-bitnodes-proxy-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "suspected_proxy_nodes": suspected,
        "proxy_nodes": suspected,
        "categories": dict(sorted(categories.items(), key=lambda item: (-item[1], item[0]))),
        "confidence": dict(sorted(confidence.items(), key=lambda item: (-item[1], item[0]))),
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Enrich Bitnodes node records with ZZX proxy heuristics.", allow_abbrev=False)

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--pretty", action="store_true")

    args = parser.parse_args(argv)

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload)

    write_json(Path(args.output), enriched, compact=args.compact, pretty=args.pretty or not args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_payload_nodes(enriched)), compact=args.compact)

    print(f"proxy enrichment complete: {len(iter_payload_nodes(enriched))} nodes")
    return 0


def main() -> int:
    return cli()


if __name__ == "__main__":
    raise SystemExit(main())
