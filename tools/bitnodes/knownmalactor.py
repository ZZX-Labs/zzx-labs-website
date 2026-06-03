#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-known-malicious-actor-v1"

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

APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"
BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))
BITNODES_DATA = Path(os.environ.get("BITNODES_DATA", str(BITNODES_ROOT / "data")))

DEFAULT_WATCHLIST = TOOLS_DIR / "data" / "threatintel" / "known-malicious-actors.json"

MALICIOUS_HINTS = (
    "malware",
    "botnet",
    "c2",
    "command and control",
    "phishing",
    "ransomware",
    "stealer",
    "loader",
    "dropper",
    "exploit",
    "scanner",
    "bruteforce",
    "brute force",
    "credential stuffing",
    "spam",
    "abuse",
    "bulletproof",
    "fast flux",
    "sinkhole",
    "blacklist",
    "blocklist",
    "ioc",
    "indicator of compromise",
)

SEVERE_HINTS = (
    "ransomware",
    "botnet",
    "c2",
    "command and control",
    "malware",
    "apt",
    "threat actor",
)

PRIVACY_INFRA_HINTS = (
    "vpn",
    "proxy",
    "tor",
    "i2p",
    "socks",
    "anonymizer",
    "anonymous",
    "relay",
    "gateway",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


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


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    return str(value or "").strip().lower() in {"true", "yes", "y", "ok", "1", "blocked", "listed"}


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalize_host(address: Any) -> str:
    value = str(address or "").strip().lower()

    if not value:
        return ""

    if value.startswith("[") and "]" in value:
        return value[1:value.index("]")]

    if ".onion:" in value or ".i2p:" in value:
        return value.rsplit(":", 1)[0].strip("[]")

    if value.endswith(".onion") or value.endswith(".i2p"):
        return value.strip("[]")

    if value.count(":") == 1 and "." in value:
        host, port = value.rsplit(":", 1)
        if port.isdigit():
            return host.strip("[]")

    if value.count(":") > 1:
        possible_host, possible_port = value.rsplit(":", 1)
        if possible_port.isdigit():
            try:
                ipaddress.ip_address(possible_host.strip("[]"))
                return possible_host.strip("[]")
            except ValueError:
                pass

    return value.strip("[]")


def normalize_asn(value: Any) -> str:
    text = clean(value).upper()

    if not text:
        return ""

    if text.startswith("AS") and text[2:].strip().isdigit():
        return "AS" + text[2:].strip()

    if text.isdigit():
        return f"AS{text}"

    match = re.search(r"\bAS\s*(\d{1,10})\b", text, re.IGNORECASE)

    if match:
        return f"AS{match.group(1)}"

    return ""


def node_address(row: Mapping[str, Any]) -> str:
    return str(
        row.get("address")
        or row.get("node")
        or row.get("addr")
        or row.get("host")
        or row.get("hostname")
        or row.get("ip")
        or row.get("id")
        or ""
    )


def text_blob(row: Mapping[str, Any]) -> str:
    keys = (
        "address",
        "host",
        "hostname",
        "reverse_dns",
        "rdns",
        "provider",
        "organization",
        "org",
        "asn",
        "country",
        "country_code",
        "tags",
        "threat_tags",
        "abuse_tags",
        "metadata.tags",
        "metadata.threat_tags",
        "metadata.abuse_tags",
        "proxy.proxy_category",
        "vpn.network_privacy_category",
        "apt_attribution.attribution_type",
        "tag_attribution.attribution_type",
        "apt_attribution.explicit_apt_names",
        "tag_attribution.explicit_groups",
        "datacenter.datacenter_category",
    )

    chunks: list[str] = []

    for key in keys:
        value = deep_get(row, key)

        if isinstance(value, list):
            chunks.extend(clean(item) for item in value)
        elif isinstance(value, Mapping):
            chunks.extend(clean(item) for item in value.values())
        else:
            chunks.append(clean(value))

    return " ".join(chunk for chunk in chunks if chunk).lower()


def keyword_hits(text: str, keywords: tuple[str, ...]) -> list[str]:
    hits = []

    for keyword in sorted(set(keywords), key=len, reverse=True):
        if keyword.lower() in text:
            hits.append(keyword)

    return hits


def load_watchlist(path: Path) -> dict[str, Any]:
    raw = read_json(path, fallback={})

    if not isinstance(raw, Mapping):
        return {
            "hosts": {},
            "host_hashes": {},
            "asns": {},
            "providers": {},
            "organizations": {},
            "countries": {},
        }

    return {
        "hosts": raw.get("hosts", {}) if isinstance(raw.get("hosts"), Mapping) else {},
        "host_hashes": raw.get("host_hashes", {}) if isinstance(raw.get("host_hashes"), Mapping) else {},
        "asns": raw.get("asns", {}) if isinstance(raw.get("asns"), Mapping) else {},
        "providers": raw.get("providers", {}) if isinstance(raw.get("providers"), Mapping) else {},
        "organizations": raw.get("organizations", {}) if isinstance(raw.get("organizations"), Mapping) else {},
        "countries": raw.get("countries", {}) if isinstance(raw.get("countries"), Mapping) else {},
    }


def lookup_watchlist(row: Mapping[str, Any], watchlist: Mapping[str, Any]) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []

    host = normalize_host(node_address(row))
    host_hash = sha256_text(host) if host else ""
    asn = normalize_asn(row.get("asn") or deep_get(row, "asn_data.asn") or deep_get(row, "isp.asn"))
    provider = clean(row.get("provider") or deep_get(row, "provider_data.provider") or deep_get(row, "isp.provider")).lower()
    organization = clean(row.get("organization") or row.get("org") or deep_get(row, "organization_data.organization")).lower()
    country = clean(row.get("country_code") or row.get("country") or deep_get(row, "geoip.country_code")).upper()

    checks = (
        ("host", host, watchlist.get("hosts", {})),
        ("host_hash", host_hash, watchlist.get("host_hashes", {})),
        ("asn", asn, watchlist.get("asns", {})),
        ("provider", provider, watchlist.get("providers", {})),
        ("organization", organization, watchlist.get("organizations", {})),
        ("country", country, watchlist.get("countries", {})),
    )

    for kind, value, table in checks:
        if not value or not isinstance(table, Mapping):
            continue

        item = table.get(value) or table.get(value.upper()) or table.get(value.lower())

        if isinstance(item, Mapping):
            matches.append({
                "match_type": kind,
                "value": value,
                "label": clean(item.get("label")) or value,
                "severity": clean(item.get("severity")) or "unknown",
                "confidence": clean(item.get("confidence")) or "unknown",
                "source": clean(item.get("source")) or "local_watchlist",
                "reason": clean(item.get("reason")) or "",
            })
        elif item:
            matches.append({
                "match_type": kind,
                "value": value,
                "label": str(item),
                "severity": "unknown",
                "confidence": "unknown",
                "source": "local_watchlist",
                "reason": "",
            })

    return matches


def malactor_metadata(row: Mapping[str, Any], watchlist: Mapping[str, Any] | None = None) -> dict[str, Any]:
    watchlist = watchlist or {}

    blob = text_blob(row)
    watchlist_matches = lookup_watchlist(row, watchlist)

    malicious_hits = keyword_hits(blob, MALICIOUS_HINTS)
    severe_hits = keyword_hits(blob, SEVERE_HINTS)
    privacy_hits = keyword_hits(blob, PRIVACY_INFRA_HINTS)

    suspected_apt = boolish(row.get("suspected_apt_related") or deep_get(row, "apt_attribution.suspected_apt_related"))
    suspected_tag = boolish(row.get("suspected_threat_actor_group_related") or deep_get(row, "tag_attribution.suspected_threat_actor_group_related"))
    policy_restricted = boolish(row.get("policy_restricted") or row.get("is_policy_restricted_node") or deep_get(row, "sanctions_data.is_policy_restricted"))
    suspected_proxy = boolish(row.get("suspected_proxy") or row.get("is_proxy") or deep_get(row, "proxy.suspected_proxy"))
    suspected_vpn = boolish(row.get("suspected_vpn") or row.get("is_vpn") or deep_get(row, "vpn.suspected_vpn"))

    score = 0.0
    reasons: list[str] = []

    if watchlist_matches:
        score += min(0.80, 0.45 + 0.08 * len(watchlist_matches))
        reasons.append("matched local known-malicious watchlist")

    if severe_hits:
        score += min(0.35, 0.18 + 0.04 * len(severe_hits))
        reasons.append("severe malicious infrastructure keywords present")

    if malicious_hits:
        score += min(0.25, 0.08 + 0.02 * len(malicious_hits))
        reasons.append("malicious infrastructure keywords present")

    if suspected_apt:
        score += 0.10
        reasons.append("APT infrastructure heuristic present")

    if suspected_tag:
        score += 0.10
        reasons.append("threat actor group heuristic present")

    if policy_restricted:
        score += 0.08
        reasons.append("policy-restricted node metadata present")

    if suspected_proxy or suspected_vpn:
        score += 0.05
        reasons.append("proxy/VPN infrastructure indicator present")

    if privacy_hits:
        score += min(0.10, 0.03 * len(privacy_hits))
        reasons.append("privacy infrastructure keywords present")

    score = max(0.0, min(1.0, score))

    if score >= 0.85:
        confidence = "high"
    elif score >= 0.60:
        confidence = "medium"
    elif score >= 0.35:
        confidence = "low"
    else:
        confidence = "none"

    suspected = score >= 0.35

    if watchlist_matches:
        category = "watchlist_match"
    elif severe_hits:
        category = "malicious_infra_keyword"
    elif suspected_apt or suspected_tag:
        category = "threat_actor_correlation"
    elif suspected:
        category = "suspicious_infrastructure"
    else:
        category = "not_suspected"

    return {
        "schema": SCHEMA,
        "suspected_known_malicious_actor": suspected,
        "known_malactor_score": round(score, 4),
        "known_malactor_confidence": confidence,
        "known_malactor_category": category,
        "important_warning": (
            "This is defensive enrichment. Watchlist matches depend on local reference data; "
            "heuristic matches are not definitive attribution."
        ),
        "watchlist_matches": watchlist_matches,
        "evidence": {
            "reasons": reasons,
            "malicious_hits": malicious_hits,
            "severe_hits": severe_hits,
            "privacy_hits": privacy_hits,
            "suspected_apt": suspected_apt,
            "suspected_threat_actor_group": suspected_tag,
            "policy_restricted": policy_restricted,
            "suspected_proxy": suspected_proxy,
            "suspected_vpn": suspected_vpn,
        },
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any], watchlist: Mapping[str, Any] | None = None) -> MutableMapping[str, Any]:
    meta = malactor_metadata(node, watchlist=watchlist)

    node["known_malactor"] = meta
    node["suspected_known_malicious_actor"] = meta["suspected_known_malicious_actor"]
    node["known_malactor_score"] = meta["known_malactor_score"]
    node["known_malactor_confidence"] = meta["known_malactor_confidence"]
    node["known_malactor_category"] = meta["known_malactor_category"]

    node.setdefault("enrichment", {})
    node["enrichment"]["knownmalactor"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    context = context or {}
    watchlist_path = Path(context.get("knownmalactor_watchlist", DEFAULT_WATCHLIST))
    watchlist = load_watchlist(watchlist_path)

    if isinstance(nodes, list):
        return [
            enrich_node(dict(node), watchlist=watchlist) if isinstance(node, Mapping) else node
            for node in nodes
        ]

    if isinstance(nodes, Mapping):
        return {
            key: enrich_node(dict(value), watchlist=watchlist) if isinstance(value, Mapping) else value
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
        payload["metadata"]["knownmalactor_enriched_at"] = utc_now()

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
    suspected = 0
    confidence_counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}

    for node in nodes:
        meta = node.get("known_malactor", {})
        if not isinstance(meta, Mapping):
            meta = {}

        if meta.get("suspected_known_malicious_actor") or node.get("suspected_known_malicious_actor"):
            suspected += 1

        confidence = clean(meta.get("known_malactor_confidence")) or "none"
        category = clean(meta.get("known_malactor_category")) or "not_suspected"

        confidence_counts[confidence] = confidence_counts.get(confidence, 0) + 1
        category_counts[category] = category_counts.get(category, 0) + 1

    return {
        "schema": "zzx-bitnodes-known-malicious-actor-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "suspected_known_malicious_actor_nodes": suspected,
        "confidence_counts": confidence_counts,
        "category_counts": category_counts,
        "warning": "Heuristic and watchlist-based defensive classification, not definitive attribution.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with defensive known-malicious actor/watchlist metadata."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--watchlist", default=str(DEFAULT_WATCHLIST))
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    context = {"knownmalactor_watchlist": args.watchlist}
    enriched = enrich_payload(payload, context=context)

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"knownmalactor enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
