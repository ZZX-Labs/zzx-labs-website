#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-apt-attribution-v1"

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

APT_COUNTRY_HINTS = {
    "CN": ["apt1", "apt10", "apt15", "apt17", "apt27", "apt31", "apt40", "mustang panda", "bronze president", "hafnium"],
    "RU": ["apt28", "apt29", "sandworm", "turla", "fancy bear", "cozy bear", "gamaredon"],
    "IR": ["apt33", "apt34", "apt35", "charming kitten", "muddywater", "oilrig"],
    "KP": ["lazarus", "apt37", "apt38", "kimsuky", "andarial"],
}

HIGH_RISK_INFRA_HINTS = (
    "bulletproof",
    "abuse",
    "malware",
    "botnet",
    "c2",
    "command and control",
    "phishing",
    "spam",
    "sinkhole",
    "fast flux",
    "residential proxy",
    "rotating proxy",
    "vpn",
    "proxy",
    "tor",
    "i2p",
    "anonymous",
    "anonymizer",
)

STRATEGIC_PROVIDER_HINTS = (
    "government",
    "military",
    "defense",
    "defence",
    "ministry",
    "department",
    "telecom",
    "state-owned",
    "national",
)

POLICY_WATCH_COUNTRIES = {
    "CN",
    "RU",
    "IR",
    "KP",
    "BY",
    "SY",
    "CU",
}

POLICY_RESTRICTED_COUNTRIES = {
    "IR",
    "KP",
    "SY",
    "CU",
}

APT_NAME_RE = re.compile(
    r"\b("
    r"APT\d{1,3}|"
    r"Lazarus|Kimsuky|Andarial|"
    r"Sandworm|Turla|Gamaredon|"
    r"Fancy Bear|Cozy Bear|"
    r"Mustang Panda|Hafnium|"
    r"Charming Kitten|MuddyWater|OilRig"
    r")\b",
    re.IGNORECASE,
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


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    text = str(value or "").strip().lower()

    return text in {"true", "yes", "y", "ok", "up", "online", "reachable", "success"}


def keyword_hits(text: str, keywords: tuple[str, ...] | list[str]) -> list[str]:
    hits = []

    for keyword in sorted(set(keywords), key=len, reverse=True):
        if keyword.lower() in text:
            hits.append(keyword)

    return hits


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
        "region",
        "city",
        "tags",
        "threat_tags",
        "apt",
        "apt_group",
        "threat_actor",
        "provider_data.provider",
        "provider_data.organization",
        "organization_data.organization",
        "asn_data.organization",
        "isp.provider",
        "isp.organization",
        "geoip.provider",
        "geoip.organization",
        "proxy.proxy_category",
        "vpn.network_privacy_category",
        "government.government_confidence",
        "military.military_category",
        "datacenter.datacenter_category",
        "sanctions_data.reason",
        "metadata.tags",
        "metadata.threat_tags",
    )

    return " ".join(
        clean(deep_get(row, key))
        for key in keys
        if clean(deep_get(row, key))
    ).lower()


def extract_existing_apt_names(text: str) -> list[str]:
    names = []

    for match in APT_NAME_RE.finditer(text):
        value = re.sub(r"\s+", " ", match.group(1).strip())
        names.append(value.upper() if value.lower().startswith("apt") else value)

    return sorted(set(names), key=str.lower)


def country_code(row: Mapping[str, Any]) -> str:
    value = first(
        row,
        "country_code",
        "country",
        "geoip.country_code",
        "geoip.country",
        "geoip_data.country_code",
        "country_data.country_code",
    ).upper()

    if len(value) == 2:
        return value

    aliases = {
        "CHINA": "CN",
        "RUSSIA": "RU",
        "RUSSIAN FEDERATION": "RU",
        "IRAN": "IR",
        "NORTH KOREA": "KP",
        "KOREA, DEMOCRATIC PEOPLE'S REPUBLIC OF": "KP",
        "BELARUS": "BY",
        "SYRIA": "SY",
        "CUBA": "CU",
    }

    return aliases.get(value, value)


def apt_country_candidates(country: str) -> list[str]:
    return APT_COUNTRY_HINTS.get(country.upper(), [])


def apt_attribution_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    blob = text_blob(row)
    country = country_code(row)

    existing_names = extract_existing_apt_names(blob)
    infra_hits = keyword_hits(blob, HIGH_RISK_INFRA_HINTS)
    strategic_hits = keyword_hits(blob, STRATEGIC_PROVIDER_HINTS)
    country_candidates = apt_country_candidates(country)

    suspected_vpn = boolish(
        row.get("suspected_vpn")
        or row.get("is_vpn")
        or deep_get(row, "vpn.suspected_vpn")
        or deep_get(row, "vpn.is_vpn")
    )

    suspected_proxy = boolish(
        row.get("suspected_proxy")
        or row.get("is_proxy")
        or deep_get(row, "proxy.suspected_proxy")
        or deep_get(row, "proxy.is_proxy")
    )

    suspected_tor = boolish(
        row.get("suspected_tor")
        or row.get("is_tor")
        or deep_get(row, "tor.suspected_tor")
        or deep_get(row, "tor.is_tor")
    )

    suspected_i2p = boolish(
        row.get("suspected_i2p")
        or row.get("is_i2p")
        or deep_get(row, "i2p.suspected_i2p")
        or deep_get(row, "i2p.is_i2p")
    )

    suspected_datacenter = boolish(
        row.get("suspected_datacenter")
        or row.get("is_datacenter")
        or deep_get(row, "datacenter.suspected_datacenter")
    )

    suspected_government = boolish(
        row.get("suspected_government")
        or row.get("is_government")
        or deep_get(row, "government.suspected_government")
    )

    suspected_military = boolish(
        row.get("suspected_military")
        or row.get("is_military")
        or deep_get(row, "military.suspected_military")
    )

    policy_restricted = boolish(
        row.get("policy_restricted")
        or row.get("is_policy_restricted_node")
        or deep_get(row, "sanctions_data.is_policy_restricted")
    )

    policy_watch = boolish(
        row.get("policy_watch")
        or row.get("is_policy_watch_node")
        or country in POLICY_WATCH_COUNTRIES
    )

    score = 0.0
    reasons = []

    if existing_names:
        score += 0.55
        reasons.append("explicit APT/threat-actor label present in metadata")

    if country in POLICY_RESTRICTED_COUNTRIES:
        score += 0.20
        reasons.append("host geolocation is policy-restricted jurisdiction")
    elif country in POLICY_WATCH_COUNTRIES:
        score += 0.12
        reasons.append("host geolocation is policy-watch jurisdiction")

    if policy_restricted:
        score += 0.18
        reasons.append("policy restricted flag present")

    if policy_watch:
        score += 0.08
        reasons.append("policy watch flag present")

    privacy_count = sum([suspected_vpn, suspected_proxy, suspected_tor, suspected_i2p])

    if privacy_count:
        score += min(0.22, 0.08 * privacy_count)
        reasons.append("privacy/proxy/overlay infrastructure indicators present")

    if suspected_datacenter:
        score += 0.08
        reasons.append("datacenter/hosting infrastructure indicator present")

    if infra_hits:
        score += min(0.22, 0.08 + 0.03 * len(infra_hits))
        reasons.append("high-risk infrastructure keywords present")

    if strategic_hits:
        score += min(0.16, 0.06 + 0.02 * len(strategic_hits))
        reasons.append("strategic/government/provider keywords present")

    if suspected_government:
        score += 0.06
        reasons.append("government-network suspicion present")

    if suspected_military:
        score += 0.08
        reasons.append("military/defense-network suspicion present")

    score = max(0.0, min(1.0, score))

    if score >= 0.80:
        confidence = "high"
    elif score >= 0.55:
        confidence = "medium"
    elif score >= 0.30:
        confidence = "low"
    else:
        confidence = "none"

    suspected = score >= 0.30

    if existing_names:
        attribution_type = "explicit_metadata_label"
    elif suspected:
        attribution_type = "infrastructure_correlation_only"
    else:
        attribution_type = "none"

    return {
        "schema": SCHEMA,
        "suspected_apt_related": suspected,
        "apt_attribution_score": round(score, 4),
        "apt_attribution_confidence": confidence,
        "attribution_type": attribution_type,
        "important_warning": (
            "This is not definitive attribution. It is heuristic infrastructure "
            "correlation only unless explicit labels are present in trusted source data."
        ),
        "country": country,
        "possible_country_linked_families": country_candidates,
        "explicit_apt_names": existing_names,
        "evidence": {
            "reasons": reasons,
            "high_risk_infra_hits": infra_hits,
            "strategic_provider_hits": strategic_hits,
            "suspected_vpn": suspected_vpn,
            "suspected_proxy": suspected_proxy,
            "suspected_tor": suspected_tor,
            "suspected_i2p": suspected_i2p,
            "suspected_datacenter": suspected_datacenter,
            "suspected_government": suspected_government,
            "suspected_military": suspected_military,
            "policy_restricted": policy_restricted,
            "policy_watch": policy_watch,
        },
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = apt_attribution_metadata(node)

    node["apt_attribution"] = meta
    node["suspected_apt_related"] = meta["suspected_apt_related"]
    node["apt_attribution_score"] = meta["apt_attribution_score"]
    node["apt_attribution_confidence"] = meta["apt_attribution_confidence"]
    node["apt_attribution_type"] = meta["attribution_type"]

    node.setdefault("enrichment", {})
    node["enrichment"]["aptattribution"] = {
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
        payload["metadata"]["aptattribution_enriched_at"] = utc_now()

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
    country_counts: dict[str, int] = {}
    explicit_apt_counts: dict[str, int] = {}

    for node in nodes:
        meta = node.get("apt_attribution", {})

        if not isinstance(meta, Mapping):
            meta = {}

        if meta.get("suspected_apt_related") or node.get("suspected_apt_related"):
            suspected += 1

        confidence = clean(meta.get("apt_attribution_confidence")) or "none"
        country = clean(meta.get("country")) or "Unknown"

        confidence_counts[confidence] = confidence_counts.get(confidence, 0) + 1
        country_counts[country] = country_counts.get(country, 0) + 1

        names = meta.get("explicit_apt_names", [])
        if isinstance(names, list):
            for name in names:
                label = clean(name)
                if label:
                    explicit_apt_counts[label] = explicit_apt_counts.get(label, 0) + 1

    def top(counter: dict[str, int], limit: int = 100) -> list[dict[str, Any]]:
        return [
            {"name": name, "count": count}
            for name, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
        ]

    return {
        "schema": "zzx-bitnodes-apt-attribution-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "suspected_apt_related_nodes": suspected,
        "confidence_counts": confidence_counts,
        "warning": "Counts are heuristic infrastructure correlations, not definitive attribution.",
        "top": {
            "countries": top(country_counts),
            "explicit_apt_names": top(explicit_apt_counts),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with heuristic APT infrastructure attribution metadata."
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

    print(f"aptattribution enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
