#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-tag-attribution-v2"
SUMMARY_SCHEMA = "zzx-bitnodes-tag-attribution-summary-v2"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "n/a", "na", "-", "—"}

THREAT_ACTOR_ALIASES = {
    "lazarus": "Lazarus Group",
    "hidden cobra": "Lazarus Group",
    "guardians of peace": "Lazarus Group",
    "kimsuky": "Kimsuky",
    "andarial": "Andariel",
    "andariel": "Andariel",
    "apt37": "APT37",
    "apt38": "APT38",
    "sandworm": "Sandworm",
    "voodoo bear": "Sandworm",
    "apt28": "APT28",
    "fancy bear": "APT28",
    "sofacy": "APT28",
    "apt29": "APT29",
    "cozy bear": "APT29",
    "the dukes": "APT29",
    "turla": "Turla",
    "snake": "Turla",
    "gamaredon": "Gamaredon",
    "apt1": "APT1",
    "apt10": "APT10",
    "stone panda": "APT10",
    "apt15": "APT15",
    "apt17": "APT17",
    "apt27": "APT27",
    "emissary panda": "APT27",
    "apt31": "APT31",
    "zirconium": "APT31",
    "apt40": "APT40",
    "leviathan": "APT40",
    "mustang panda": "Mustang Panda",
    "bronze president": "Bronze President",
    "hafnium": "HAFNIUM",
    "apt33": "APT33",
    "apt34": "APT34",
    "oilrig": "OilRig",
    "apt35": "APT35",
    "charming kitten": "Charming Kitten",
    "muddywater": "MuddyWater",
    "ta505": "TA505",
    "fin7": "FIN7",
    "fin8": "FIN8",
    "wizard spider": "Wizard Spider",
    "evil corp": "Evil Corp",
    "clop": "Cl0p",
    "cl0p": "Cl0p",
    "lockbit": "LockBit",
    "alphv": "ALPHV/BlackCat",
    "blackcat": "ALPHV/BlackCat",
    "conti": "Conti",
}

RISK_INFRA_HINTS = (
    "botnet",
    "malware",
    "phishing",
    "spam",
    "c2",
    "command and control",
    "bulletproof",
    "fast flux",
    "sinkhole",
    "abuse",
    "ransomware",
    "stealer",
    "loader",
    "dropper",
    "exploit",
)

PRIVACY_INFRA_HINTS = (
    "vpn",
    "proxy",
    "proxies",
    "tor",
    "i2p",
    "socks",
    "socks5",
    "anonymizer",
    "anonymous",
    "relay",
    "gateway",
    "tunnel",
    "warp",
)

TACTICAL_HINTS = (
    "intrusion set",
    "operation",
    "campaign",
    "ioc",
    "ttp",
    "mitre",
    "attack",
    "cve",
)

TRUSTED_GROUP_KEYS = (
    "apt",
    "apt_group",
    "apt_groups",
    "threat_actor",
    "threat_actors",
    "threat_actor_group",
    "threat_actor_groups",
    "intrusion_set",
    "intrusion_sets",
    "campaign",
    "campaigns",
    "attribution.actor",
    "attribution.actors",
    "attribution.apt",
    "attribution.apt_group",
    "threat_intel.apt",
    "threat_intel.apt_group",
    "threat_intel.threat_actor",
    "threat_intel.threat_actor_group",
    "threat_intel.intrusion_set",
    "intel.apt",
    "intel.apt_group",
    "intel.threat_actor",
    "intel.threat_actor_group",
    "intel.intrusion_set",
    "metadata.apt",
    "metadata.apt_group",
    "metadata.threat_actor",
    "metadata.threat_actor_group",
    "metadata.intrusion_set",
    "apt_attribution.explicit_apt_names",
    "threat_infrastructure.explicit_apt_names",
)

TRUSTED_FEED_KEYS = (
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
    "threat_intel.matches",
    "intel.matches",
    "metadata.misp_matches",
    "metadata.abuseipdb_matches",
    "metadata.otx_matches",
    "metadata.opencti_matches",
)

GROUP_RE = re.compile(
    r"\b("
    r"APT\d{1,3}|TA\d{3,5}|FIN\d{1,3}|"
    r"Lazarus|Hidden Cobra|Kimsuky|Andarial|Andariel|"
    r"Sandworm|Voodoo Bear|Turla|Snake|Gamaredon|"
    r"Fancy Bear|Sofacy|Cozy Bear|The Dukes|"
    r"Mustang Panda|Bronze President|Hafnium|"
    r"Charming Kitten|MuddyWater|OilRig|"
    r"Wizard Spider|Evil Corp|LockBit|Cl0p|Clop|ALPHV|BlackCat|Conti"
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
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
            default=str,
        ) + "\n",
        encoding="utf-8",
    )


def clean(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    return "" if text.lower() in UNKNOWN_VALUES else text


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
        "1",
        "hit",
        "match",
        "matched",
        "listed",
    }


def keyword_hits(text: str, keywords: tuple[str, ...]) -> list[str]:
    return [
        keyword
        for keyword in sorted(set(keywords), key=len, reverse=True)
        if keyword.lower() in text
    ]


def canonical_group(name: str) -> str:
    raw = clean(name)

    if not raw:
        return ""

    lower = raw.lower()

    if lower in THREAT_ACTOR_ALIASES:
        return THREAT_ACTOR_ALIASES[lower]

    if lower.startswith("apt") and lower[3:].isdigit():
        return f"APT{lower[3:]}"

    if lower.startswith("ta") and lower[2:].isdigit():
        return f"TA{lower[2:]}"

    if lower.startswith("fin") and lower[3:].isdigit():
        return f"FIN{lower[3:]}"

    return raw


def extract_groups(text: str) -> list[str]:
    groups: list[str] = []

    for match in GROUP_RE.finditer(text):
        canonical = canonical_group(match.group(1))

        if canonical:
            groups.append(canonical)

    for alias, canonical in THREAT_ACTOR_ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", text.lower()):
            groups.append(canonical)

    return sorted(set(groups), key=str.lower)


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
        "metadata.tags",
        "metadata.threat_tags",
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
        "datacenter.datacenter_category",
        "threat_infrastructure.evidence.reasons",
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


def trusted_group_labels(row: Mapping[str, Any]) -> list[str]:
    groups: list[str] = []

    for key in TRUSTED_GROUP_KEYS:
        value = deep_get(row, key)

        for item in values_from_any(value):
            if isinstance(item, Mapping):
                for subkey in ("name", "actor", "group", "apt", "apt_group", "threat_actor", "intrusion_set"):
                    text = clean(item.get(subkey))
                    if text:
                        extracted = extract_groups(text)
                        groups.extend(extracted or [canonical_group(text)])
            else:
                text = clean(item)
                if text:
                    extracted = extract_groups(text)
                    groups.extend(extracted or [canonical_group(text)])

    return sorted(set(group for group in groups if group), key=str.lower)


def intel_feed_matches(row: Mapping[str, Any]) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []

    for key in TRUSTED_FEED_KEYS:
        value = deep_get(row, key)

        for item in values_from_any(value):
            if isinstance(item, Mapping):
                feed = clean(item.get("feed") or item.get("source") or key)
                indicator = clean(item.get("indicator") or item.get("ioc") or item.get("value") or item.get("address"))
                category = clean(item.get("category") or item.get("type") or item.get("classification"))
                actor = clean(item.get("actor") or item.get("threat_actor") or item.get("apt_group") or item.get("intrusion_set"))
                confidence = clean(item.get("confidence") or item.get("score") or item.get("confidence_level"))

                if feed or indicator or category or actor:
                    matches.append(
                        {
                            "feed": feed or key,
                            "indicator": indicator,
                            "category": category,
                            "actor": actor,
                            "confidence": confidence,
                            "raw": item,
                        }
                    )
            elif boolish(item):
                matches.append({"feed": key, "indicator": "", "category": "listed", "actor": "", "confidence": ""})
            elif clean(item):
                matches.append({"feed": key, "indicator": clean(item), "category": "listed", "actor": "", "confidence": ""})

    unique: dict[str, dict[str, Any]] = {}

    for match in matches:
        ident = "|".join(
            [
                clean(match.get("feed")).lower(),
                clean(match.get("indicator")).lower(),
                clean(match.get("category")).lower(),
                clean(match.get("actor")).lower(),
            ]
        )
        unique[ident] = match

    return list(unique.values())


def feed_actor_groups(matches: list[dict[str, Any]]) -> list[str]:
    groups: list[str] = []

    for match in matches:
        actor = clean(match.get("actor"))

        if actor:
            extracted = extract_groups(actor)
            groups.extend(extracted or [canonical_group(actor)])

    return sorted(set(group for group in groups if group), key=str.lower)


def flag(row: Mapping[str, Any], *keys: str) -> bool:
    return any(boolish(deep_get(row, key)) for key in keys)


def country_code(row: Mapping[str, Any]) -> str:
    value = clean(
        row.get("country_code")
        or row.get("country")
        or deep_get(row, "geoip.country_code")
        or deep_get(row, "geoip.country")
        or deep_get(row, "threat_infrastructure.country")
        or deep_get(row, "apt_attribution.country")
    ).upper()

    aliases = {
        "CHINA": "CN",
        "RUSSIA": "RU",
        "RUSSIAN FEDERATION": "RU",
        "IRAN": "IR",
        "NORTH KOREA": "KP",
        "KOREA, DEMOCRATIC PEOPLE'S REPUBLIC OF": "KP",
    }

    return value if len(value) == 2 else aliases.get(value, value)


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


def tag_attribution_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    blob = text_blob(row)
    country = country_code(row)

    trusted_groups = trusted_group_labels(row)
    intel_matches = intel_feed_matches(row)
    feed_groups = feed_actor_groups(intel_matches)

    explicit_groups = sorted(set([*trusted_groups, *feed_groups]), key=str.lower)

    risk_hits = keyword_hits(blob, RISK_INFRA_HINTS)
    privacy_hits = keyword_hits(blob, PRIVACY_INFRA_HINTS)
    tactical_hits = keyword_hits(blob, TACTICAL_HINTS)

    threat_meta = deep_get(row, "threat_infrastructure")
    threat_score = 0.0
    threat_confirmed = False
    threat_related = False

    if isinstance(threat_meta, Mapping):
        try:
            threat_score = float(threat_meta.get("threat_infrastructure_score") or 0.0)
        except (TypeError, ValueError):
            threat_score = 0.0

        threat_confirmed = boolish(threat_meta.get("confirmed_intelligence_match"))
        threat_related = boolish(threat_meta.get("is_threat_infrastructure"))

    suspected_vpn = flag(row, "suspected_vpn", "is_vpn", "vpn.suspected_vpn", "vpn.is_vpn")
    suspected_proxy = flag(row, "suspected_proxy", "is_proxy", "proxy.suspected_proxy", "proxy.is_proxy")
    suspected_tor = flag(row, "suspected_tor", "is_tor", "tor.suspected_tor", "tor.is_tor")
    suspected_i2p = flag(row, "suspected_i2p", "is_i2p", "i2p.suspected_i2p", "i2p.is_i2p")
    suspected_datacenter = flag(row, "suspected_datacenter", "is_datacenter", "datacenter.suspected_datacenter")

    score = 0.0
    reasons: list[str] = []

    if intel_matches:
        score += 0.55
        reasons.append("trusted threat-intelligence feed match present")

    if explicit_groups:
        score += 0.35
        reasons.append("explicit threat-actor/group label present in trusted metadata")

    if threat_confirmed:
        score += 0.25
        reasons.append("threat infrastructure module has confirmed intelligence match")
    elif threat_related:
        score += min(0.16, max(0.04, threat_score * 0.16))
        reasons.append("threat infrastructure module produced defensive correlation score")

    if risk_hits:
        score += min(0.14, 0.04 + 0.02 * len(risk_hits))
        reasons.append("risk infrastructure tags present")

    privacy_count = sum([suspected_vpn, suspected_proxy, suspected_tor, suspected_i2p])

    if privacy_count:
        score += min(0.10, 0.03 * privacy_count)
        reasons.append("privacy/proxy/overlay infrastructure indicators present")

    if suspected_datacenter:
        score += 0.03
        reasons.append("datacenter/hosting indicator present")

    if tactical_hits:
        score += min(0.08, 0.03 + 0.01 * len(tactical_hits))
        reasons.append("tactical/intelligence vocabulary tags present")

    score = max(0.0, min(1.0, score))

    confirmed = bool(intel_matches and explicit_groups)
    confidence = confidence_from_score(score, confirmed)

    if confirmed:
        attribution_type = "confirmed_intelligence_label"
    elif explicit_groups:
        attribution_type = "explicit_metadata_label_unconfirmed"
    elif score >= 0.30:
        attribution_type = "tag_correlation_only"
    else:
        attribution_type = "none"

    suspected = confirmed or bool(explicit_groups) or score >= 0.30

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

    return {
        "schema": SCHEMA,
        "suspected_threat_actor_group_related": suspected,
        "confirmed_threat_actor_group_match": confirmed,
        "trusted_intel_feed_match": bool(intel_matches),
        "explicit_group_label": bool(explicit_groups),
        "tag_attribution_score": round(score, 4),
        "tag_attribution_confidence": confidence,
        "tag_attribution_type": attribution_type,
        "threat_level": level,
        "country": country,
        "explicit_groups": explicit_groups,
        "candidate_groups": explicit_groups if explicit_groups else [],
        "country_linked_candidate_groups": [],
        "intel_matches": intel_matches,
        "evidence": {
            "reasons": reasons,
            "risk_infra_hits": risk_hits,
            "privacy_hits": privacy_hits,
            "tactical_hits": tactical_hits,
            "threat_infrastructure_score": threat_score,
            "threat_infrastructure_confirmed": threat_confirmed,
            "threat_infrastructure_related": threat_related,
            "suspected_vpn": suspected_vpn,
            "suspected_proxy": suspected_proxy,
            "suspected_tor": suspected_tor,
            "suspected_i2p": suspected_i2p,
            "suspected_datacenter": suspected_datacenter,
        },
        "map": {
            "is_threat_actor_group_related": suspected,
            "threat_level": level,
            "threat_color": threat_color(level),
            "threat_icon": "warning" if suspected else "circle",
            "marker_ring": suspected,
            "table_badge": "CONFIRMED" if confirmed else level.upper(),
            "table_badge_class": f"bn-badge bn-badge-threat-{level}",
        },
        "important_warning": (
            "This module does not infer actor groups from country, geography, ASN, provider, "
            "VPN/proxy/Tor/I2P usage, or datacenter status alone. Actor/group labels are only "
            "surfaced when explicitly present in trusted source metadata or intelligence-feed matches."
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
    meta = tag_attribution_metadata(node)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["tag_attribution"] = meta
    metadata["tag_attribution"] = meta

    node["suspected_threat_actor_group_related"] = meta["suspected_threat_actor_group_related"]
    node["confirmed_threat_actor_group_match"] = meta["confirmed_threat_actor_group_match"]
    node["tag_attribution_score"] = meta["tag_attribution_score"]
    node["tag_attribution_confidence"] = meta["tag_attribution_confidence"]
    node["tag_attribution_type"] = meta["tag_attribution_type"]
    node["threat_actor_groups"] = meta["candidate_groups"]

    node["tag_threat_level"] = meta["threat_level"]
    node["tag_threat_color"] = meta["map"]["threat_color"]
    node["tag_threat_icon"] = meta["map"]["threat_icon"]
    node["tag_table_badge"] = meta["map"]["table_badge"]
    node["tag_table_badge_class"] = meta["map"]["table_badge_class"]

    for key in (
        "suspected_threat_actor_group_related",
        "confirmed_threat_actor_group_match",
        "tag_attribution_score",
        "tag_attribution_confidence",
        "tag_attribution_type",
        "threat_actor_groups",
        "tag_threat_level",
        "tag_threat_color",
        "tag_threat_icon",
        "tag_table_badge",
        "tag_table_badge_class",
    ):
        metadata[key] = node[key]

    enrichment["tagattribution"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "mode": "explicit-label-and-intel-feed-correlation",
        "false_positive_control": "no country-to-actor inference",
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    if isinstance(nodes, list):
        return [enrich_node(dict(node)) if isinstance(node, Mapping) else node for node in nodes]

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
        output["metadata"]["tagattribution_enriched_at"] = utc_now()
        output["metadata"]["tagattribution_schema"] = SCHEMA
        output["metadata"]["false_positive_control"] = "no country-to-actor inference"

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context))


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    suspected = 0
    confirmed = 0
    explicit = 0

    confidence_counts: dict[str, int] = {}
    level_counts: dict[str, int] = {}
    group_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}

    for node in nodes:
        meta = node.get("tag_attribution", {})

        if not isinstance(meta, Mapping):
            meta = {}

        if meta.get("suspected_threat_actor_group_related") or node.get("suspected_threat_actor_group_related"):
            suspected += 1

        if meta.get("confirmed_threat_actor_group_match") or node.get("confirmed_threat_actor_group_match"):
            confirmed += 1

        if meta.get("explicit_group_label"):
            explicit += 1

        confidence = clean(meta.get("tag_attribution_confidence")) or "none"
        level = clean(meta.get("threat_level")) or "none"
        country = clean(meta.get("country")) or "Unknown"

        confidence_counts[confidence] = confidence_counts.get(confidence, 0) + 1
        level_counts[level] = level_counts.get(level, 0) + 1
        country_counts[country] = country_counts.get(country, 0) + 1

        groups = meta.get("candidate_groups", [])

        if isinstance(groups, list):
            for group in groups:
                label = clean(group)

                if label:
                    group_counts[label] = group_counts.get(label, 0) + 1

    def top(counter: dict[str, int], limit: int = 100) -> list[dict[str, Any]]:
        return [
            {"name": name, "count": count}
            for name, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
        ]

    return {
        "schema": SUMMARY_SCHEMA,
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "suspected_threat_actor_group_related_nodes": suspected,
        "confirmed_threat_actor_group_match_nodes": confirmed,
        "explicit_group_label_nodes": explicit,
        "confidence_counts": confidence_counts,
        "threat_level_counts": level_counts,
        "warning": (
            "Counts are defensive label/feed correlations. Actor groups are not inferred "
            "from geography, ASN, provider, proxy usage, or hosting status alone."
        ),
        "top": {
            "candidate_groups": top(group_counts),
            "countries": top(country_counts),
        },
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with low-false-positive threat actor group tag correlation.",
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

    print(f"tagattribution enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
