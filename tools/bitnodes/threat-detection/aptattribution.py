#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-threat-infrastructure-v2"
SUMMARY_SCHEMA = "zzx-bitnodes-threat-infrastructure-summary-v2"

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
    "anonymous proxy",
    "anonymizer",
)

STRATEGIC_INFRA_HINTS = (
    "government",
    "military",
    "defense",
    "defence",
    "ministry",
    "department",
    "state-owned",
    "national telecom",
)

INTEL_FEED_KEYS = (
    "misp_matches",
    "abuseipdb_matches",
    "alienvault_matches",
    "otx_matches",
    "spamhaus_matches",
    "cisa_matches",
    "mandiant_matches",
    "crowdstrike_matches",
    "recordedfuture_matches",
    "threatfox_matches",
    "urlhaus_matches",
    "opencti_matches",
    "metadata.misp_matches",
    "metadata.abuseipdb_matches",
    "metadata.alienvault_matches",
    "metadata.otx_matches",
    "metadata.spamhaus_matches",
    "metadata.cisa_matches",
    "metadata.mandiant_matches",
    "metadata.crowdstrike_matches",
    "metadata.recordedfuture_matches",
    "metadata.threatfox_matches",
    "metadata.urlhaus_matches",
    "metadata.opencti_matches",
    "threat_intel.matches",
    "threat_intel.feeds",
    "intel.matches",
    "intel.feeds",
)

TRUSTED_APT_KEYS = (
    "apt",
    "apt_group",
    "apt_groups",
    "threat_actor",
    "threat_actors",
    "attribution.actor",
    "attribution.apt",
    "attribution.apt_group",
    "threat_intel.apt",
    "threat_intel.apt_group",
    "threat_intel.threat_actor",
    "intel.apt",
    "intel.apt_group",
    "intel.threat_actor",
    "metadata.apt",
    "metadata.apt_group",
    "metadata.threat_actor",
)

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

    text = json.dumps(
        payload,
        ensure_ascii=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
        sort_keys=not compact,
        default=str,
    )

    path.write_text(text + "\n", encoding="utf-8")


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


def values_from_any(value: Any) -> list[Any]:
    if value in ("", None):
        return []

    if isinstance(value, list):
        return value

    if isinstance(value, tuple):
        return list(value)

    if isinstance(value, Mapping):
        return [value]

    return [value]


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    return str(value or "").strip().lower() in {
        "true",
        "yes",
        "y",
        "ok",
        "up",
        "online",
        "reachable",
        "success",
        "match",
        "matched",
        "listed",
        "hit",
    }


def keyword_hits(text: str, keywords: tuple[str, ...] | list[str]) -> list[str]:
    hits: list[str] = []

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


def country_code(row: Mapping[str, Any]) -> str:
    value = clean(
        deep_get(row, "country_code")
        or deep_get(row, "country")
        or deep_get(row, "geoip.country_code")
        or deep_get(row, "geoip.country")
        or deep_get(row, "geoip_data.country_code")
        or deep_get(row, "country_data.country_code")
        or deep_get(row, "metadata.country_code")
        or deep_get(row, "metadata.country")
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
        "TOR": "TOR",
        "I2P": "I2P",
    }

    return aliases.get(value, value)


def extract_apt_names_from_text(text: str) -> list[str]:
    names: list[str] = []

    for match in APT_NAME_RE.finditer(text):
        value = re.sub(r"\s+", " ", match.group(1).strip())
        names.append(value.upper() if value.lower().startswith("apt") else value)

    return sorted(set(names), key=str.lower)


def explicit_apt_names(row: Mapping[str, Any]) -> list[str]:
    names: list[str] = []

    for key in TRUSTED_APT_KEYS:
        value = deep_get(row, key)

        for item in values_from_any(value):
            if isinstance(item, Mapping):
                for subkey in ("name", "actor", "apt", "apt_group", "threat_actor", "family"):
                    label = clean(item.get(subkey))
                    if label:
                        names.append(label)
            else:
                text = clean(item)
                if text:
                    names.extend(extract_apt_names_from_text(text) or [text])

    return sorted(set(names), key=str.lower)


def intel_feed_matches(row: Mapping[str, Any]) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []

    for key in INTEL_FEED_KEYS:
        value = deep_get(row, key)

        for item in values_from_any(value):
            if isinstance(item, Mapping):
                feed = clean(item.get("feed") or item.get("source") or key)
                indicator = clean(item.get("indicator") or item.get("ioc") or item.get("value") or item.get("address"))
                category = clean(item.get("category") or item.get("type") or item.get("classification"))
                confidence = clean(item.get("confidence") or item.get("score") or item.get("confidence_level"))
                severity = clean(item.get("severity") or item.get("risk") or item.get("level"))

                if feed or indicator or category:
                    matches.append(
                        {
                            "feed": feed or key,
                            "indicator": indicator,
                            "category": category,
                            "confidence": confidence,
                            "severity": severity,
                            "raw": item,
                        }
                    )
            elif boolish(item):
                matches.append(
                    {
                        "feed": key,
                        "indicator": "",
                        "category": "listed",
                        "confidence": "",
                        "severity": "",
                    }
                )
            elif clean(item):
                matches.append(
                    {
                        "feed": key,
                        "indicator": clean(item),
                        "category": "listed",
                        "confidence": "",
                        "severity": "",
                    }
                )

    unique: dict[str, dict[str, Any]] = {}

    for match in matches:
        identity = "|".join(
            [
                clean(match.get("feed")).lower(),
                clean(match.get("indicator")).lower(),
                clean(match.get("category")).lower(),
            ]
        )
        unique[identity] = match

    return list(unique.values())


def flag(row: Mapping[str, Any], *keys: str) -> bool:
    for key in keys:
        if boolish(deep_get(row, key)):
            return True

    return False


def infrastructure_signals(row: Mapping[str, Any]) -> dict[str, Any]:
    blob = text_blob(row)

    suspected_vpn = flag(row, "suspected_vpn", "is_vpn", "vpn.suspected_vpn", "vpn.is_vpn")
    suspected_proxy = flag(row, "suspected_proxy", "is_proxy", "proxy.suspected_proxy", "proxy.is_proxy")
    suspected_tor = flag(row, "suspected_tor", "is_tor", "tor.suspected_tor", "tor.is_tor")
    suspected_i2p = flag(row, "suspected_i2p", "is_i2p", "i2p.suspected_i2p", "i2p.is_i2p")
    suspected_datacenter = flag(row, "suspected_datacenter", "is_datacenter", "datacenter.suspected_datacenter", "datacenter.is_datacenter")
    suspected_government = flag(row, "suspected_government", "is_government", "government.suspected_government", "government.is_government")
    suspected_military = flag(row, "suspected_military", "is_military", "military.suspected_military", "military.is_military")

    policy_restricted = flag(row, "policy_restricted", "is_policy_restricted_node", "sanctions_data.is_policy_restricted")
    policy_watch = flag(row, "policy_watch", "is_policy_watch_node", "sanctions_data.is_policy_watch")
    sanctioned = flag(row, "is_sanctioned_node", "sanctions_data.is_sanctioned")

    infra_hits = keyword_hits(blob, HIGH_RISK_INFRA_HINTS)
    strategic_hits = keyword_hits(blob, STRATEGIC_INFRA_HINTS)

    return {
        "high_risk_infra_hits": infra_hits,
        "strategic_infra_hits": strategic_hits,
        "suspected_vpn": suspected_vpn,
        "suspected_proxy": suspected_proxy,
        "suspected_tor": suspected_tor,
        "suspected_i2p": suspected_i2p,
        "suspected_datacenter": suspected_datacenter,
        "suspected_government": suspected_government,
        "suspected_military": suspected_military,
        "policy_restricted": policy_restricted,
        "policy_watch": policy_watch,
        "sanctioned": sanctioned,
    }


def confidence_from_score(score: float, confirmed: bool) -> str:
    if confirmed:
        return "confirmed"

    if score >= 0.80:
        return "high"

    if score >= 0.55:
        return "medium"

    if score >= 0.30:
        return "low"

    return "none"


def threat_color(level: str) -> str:
    return {
        "confirmed": "#ff0000",
        "high": "#ff3b30",
        "medium": "#ff9500",
        "low": "#ffcc00",
        "none": "#c0d674",
    }.get(level, "#c0d674")


def threat_infrastructure_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    country = country_code(row)
    signals = infrastructure_signals(row)
    explicit_names = explicit_apt_names(row)
    intel_matches = intel_feed_matches(row)

    trusted_intel_feed_match = bool(intel_matches)
    explicit_actor_label = bool(explicit_names)

    score = 0.0
    reasons: list[str] = []

    if trusted_intel_feed_match:
        score += 0.70
        reasons.append("trusted threat-intelligence feed match present")

    if explicit_actor_label:
        score += 0.25
        reasons.append("explicit actor/APT label present in source intelligence metadata")

    privacy_count = sum(
        [
            signals["suspected_vpn"],
            signals["suspected_proxy"],
            signals["suspected_tor"],
            signals["suspected_i2p"],
        ]
    )

    if privacy_count:
        score += min(0.18, 0.05 * privacy_count)
        reasons.append("privacy/proxy/overlay infrastructure indicators present")

    if signals["suspected_datacenter"]:
        score += 0.06
        reasons.append("datacenter or hosting infrastructure indicator present")

    if signals["policy_restricted"]:
        score += 0.07
        reasons.append("policy-restricted jurisdiction or local policy flag present")

    if signals["policy_watch"]:
        score += 0.04
        reasons.append("policy-watch jurisdiction or local policy flag present")

    if signals["sanctioned"]:
        score += 0.08
        reasons.append("sanctioned jurisdiction flag present")

    if signals["high_risk_infra_hits"]:
        score += min(0.14, 0.05 + 0.02 * len(signals["high_risk_infra_hits"]))
        reasons.append("high-risk infrastructure keywords present")

    if signals["strategic_infra_hits"]:
        score += min(0.08, 0.03 + 0.01 * len(signals["strategic_infra_hits"]))
        reasons.append("strategic infrastructure keywords present")

    if signals["suspected_government"]:
        score += 0.03
        reasons.append("government-network indicator present")

    if signals["suspected_military"]:
        score += 0.04
        reasons.append("military/defense-network indicator present")

    score = max(0.0, min(1.0, score))

    confirmed = trusted_intel_feed_match and (explicit_actor_label or score >= 0.70)
    confidence = confidence_from_score(score, confirmed)
    is_threat_infrastructure = confirmed or score >= 0.30

    if confirmed:
        level = "confirmed"
    elif score >= 0.80:
        level = "high"
    elif score >= 0.55:
        level = "medium"
    elif score >= 0.30:
        level = "low"
    else:
        level = "none"

    if confirmed:
        classification_type = "confirmed_intelligence_correlation"
    elif explicit_actor_label:
        classification_type = "explicit_metadata_label_unconfirmed"
    elif is_threat_infrastructure:
        classification_type = "infrastructure_risk_correlation"
    else:
        classification_type = "none"

    return {
        "schema": SCHEMA,
        "is_threat_infrastructure": is_threat_infrastructure,
        "suspected_threat_infrastructure": is_threat_infrastructure,
        "confirmed_intelligence_match": confirmed,
        "trusted_intel_feed_match": trusted_intel_feed_match,
        "explicit_actor_label": explicit_actor_label,
        "threat_infrastructure_score": round(score, 4),
        "threat_infrastructure_confidence": confidence,
        "threat_level": level,
        "classification_type": classification_type,
        "country": country,
        "explicit_apt_names": explicit_names,
        "intel_matches": intel_matches,
        "evidence": {
            "reasons": reasons,
            **signals,
        },
        "map": {
            "is_threat_infrastructure": is_threat_infrastructure,
            "threat_level": level,
            "threat_color": threat_color(level),
            "threat_icon": "warning" if is_threat_infrastructure else "circle",
            "marker_ring": is_threat_infrastructure,
            "table_badge": "CONFIRMED" if confirmed else level.upper(),
            "table_badge_class": f"bn-badge bn-badge-threat-{level}",
        },
        "important_warning": (
            "This module does not infer nation-state APT attribution from geography, "
            "provider name, sanctions status, VPN/proxy/Tor/I2P usage, or datacenter usage alone. "
            "Actor names are only surfaced when explicitly present in trusted source metadata. "
            "All other scoring is defensive threat-infrastructure correlation."
        ),
        "updated_at": utc_now(),
    }


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = threat_infrastructure_metadata(node)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["threat_infrastructure"] = meta
    node["apt_attribution"] = meta

    metadata["threat_infrastructure"] = meta
    metadata["apt_attribution"] = meta

    node["is_threat_infrastructure"] = meta["is_threat_infrastructure"]
    node["suspected_threat_infrastructure"] = meta["suspected_threat_infrastructure"]
    node["confirmed_intelligence_match"] = meta["confirmed_intelligence_match"]
    node["trusted_intel_feed_match"] = meta["trusted_intel_feed_match"]
    node["threat_infrastructure_score"] = meta["threat_infrastructure_score"]
    node["threat_infrastructure_confidence"] = meta["threat_infrastructure_confidence"]
    node["threat_level"] = meta["threat_level"]
    node["threat_classification_type"] = meta["classification_type"]

    node["threat_color"] = meta["map"]["threat_color"]
    node["threat_icon"] = meta["map"]["threat_icon"]
    node["threat_table_badge"] = meta["map"]["table_badge"]
    node["threat_table_badge_class"] = meta["map"]["table_badge_class"]

    node["explicit_apt_names"] = meta["explicit_apt_names"]

    node["suspected_apt_related"] = meta["explicit_actor_label"] or meta["confirmed_intelligence_match"]
    node["apt_attribution_score"] = meta["threat_infrastructure_score"]
    node["apt_attribution_confidence"] = (
        "confirmed"
        if meta["confirmed_intelligence_match"]
        else "explicit" if meta["explicit_actor_label"] else "none"
    )
    node["apt_attribution_type"] = (
        "confirmed_intelligence_match"
        if meta["confirmed_intelligence_match"]
        else "explicit_metadata_label" if meta["explicit_actor_label"] else "none"
    )

    for key in (
        "is_threat_infrastructure",
        "suspected_threat_infrastructure",
        "confirmed_intelligence_match",
        "trusted_intel_feed_match",
        "threat_infrastructure_score",
        "threat_infrastructure_confidence",
        "threat_level",
        "threat_classification_type",
        "threat_color",
        "threat_icon",
        "threat_table_badge",
        "threat_table_badge_class",
        "explicit_apt_names",
        "suspected_apt_related",
        "apt_attribution_score",
        "apt_attribution_confidence",
        "apt_attribution_type",
    ):
        metadata[key] = node[key]

    enrichment["aptattribution"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "mode": "defensive-threat-infrastructure-correlation",
        "false_positive_control": "no country-to-APT inference",
    }

    enrichment["threat_infrastructure"] = enrichment["aptattribution"]

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
        output["metadata"]["aptattribution_enriched_at"] = utc_now()
        output["metadata"]["threat_infrastructure_enriched_at"] = output["metadata"]["aptattribution_enriched_at"]
        output["metadata"]["aptattribution_schema"] = SCHEMA
        output["metadata"]["threat_infrastructure_schema"] = SCHEMA
        output["metadata"]["false_positive_control"] = "no country-to-APT inference"

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context))


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    threat_nodes = 0
    confirmed_nodes = 0
    explicit_actor_nodes = 0

    confidence_counts: dict[str, int] = {}
    level_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}
    explicit_apt_counts: dict[str, int] = {}

    proxy_nodes = 0
    vpn_nodes = 0
    tor_nodes = 0
    i2p_nodes = 0
    datacenter_nodes = 0
    policy_watch_nodes = 0
    policy_restricted_nodes = 0
    sanctioned_nodes = 0
    government_nodes = 0
    military_nodes = 0

    for node in nodes:
        meta = node.get("threat_infrastructure") or node.get("apt_attribution") or {}

        if not isinstance(meta, Mapping):
            meta = {}

        evidence = meta.get("evidence", {})
        if not isinstance(evidence, Mapping):
            evidence = {}

        if meta.get("is_threat_infrastructure") or node.get("is_threat_infrastructure"):
            threat_nodes += 1

        if meta.get("confirmed_intelligence_match") or node.get("confirmed_intelligence_match"):
            confirmed_nodes += 1

        if meta.get("explicit_actor_label"):
            explicit_actor_nodes += 1

        confidence = clean(meta.get("threat_infrastructure_confidence")) or "none"
        level = clean(meta.get("threat_level")) or "none"
        country = clean(meta.get("country")) or "Unknown"

        confidence_counts[confidence] = confidence_counts.get(confidence, 0) + 1
        level_counts[level] = level_counts.get(level, 0) + 1
        country_counts[country] = country_counts.get(country, 0) + 1

        if evidence.get("suspected_proxy"):
            proxy_nodes += 1

        if evidence.get("suspected_vpn"):
            vpn_nodes += 1

        if evidence.get("suspected_tor"):
            tor_nodes += 1

        if evidence.get("suspected_i2p"):
            i2p_nodes += 1

        if evidence.get("suspected_datacenter"):
            datacenter_nodes += 1

        if evidence.get("policy_watch"):
            policy_watch_nodes += 1

        if evidence.get("policy_restricted"):
            policy_restricted_nodes += 1

        if evidence.get("sanctioned"):
            sanctioned_nodes += 1

        if evidence.get("suspected_government"):
            government_nodes += 1

        if evidence.get("suspected_military"):
            military_nodes += 1

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
        "schema": SUMMARY_SCHEMA,
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "suspected_threat_infrastructure_nodes": threat_nodes,
        "confirmed_intelligence_match_nodes": confirmed_nodes,
        "explicit_actor_label_nodes": explicit_actor_nodes,
        "proxy_nodes": proxy_nodes,
        "vpn_nodes": vpn_nodes,
        "tor_nodes": tor_nodes,
        "i2p_nodes": i2p_nodes,
        "datacenter_nodes": datacenter_nodes,
        "policy_watch_nodes": policy_watch_nodes,
        "policy_restricted_nodes": policy_restricted_nodes,
        "sanctioned_nodes": sanctioned_nodes,
        "government_nodes": government_nodes,
        "military_nodes": military_nodes,
        "confidence_counts": confidence_counts,
        "threat_level_counts": level_counts,
        "warning": (
            "Counts are defensive threat-infrastructure correlations. "
            "Nation-state actor attribution is only surfaced from explicit trusted metadata."
        ),
        "top": {
            "countries": top(country_counts),
            "explicit_apt_names": top(explicit_apt_counts),
        },
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Enrich Bitnodes records with defensive threat-infrastructure correlation. "
            "Does not infer APT attribution from geography or provider metadata."
        ),
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

    print(f"threat infrastructure enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
