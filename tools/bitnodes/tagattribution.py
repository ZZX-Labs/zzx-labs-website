#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-threat-actor-group-attribution-v1"

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

THREAT_ACTOR_ALIASES = {
    "lazarus": "Lazarus Group",
    "hidden cobra": "Lazarus Group",
    "guardians of peace": "Lazarus Group",
    "kimsuky": "Kimsuky",
    "andarial": "Andariel",
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

COUNTRY_TO_GROUPS = {
    "CN": ["APT1", "APT10", "APT27", "APT31", "APT40", "Mustang Panda", "HAFNIUM"],
    "RU": ["APT28", "APT29", "Sandworm", "Turla", "Gamaredon"],
    "IR": ["APT33", "APT34", "APT35", "Charming Kitten", "MuddyWater", "OilRig"],
    "KP": ["Lazarus Group", "Kimsuky", "Andariel", "APT37", "APT38"],
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
    "apt",
    "threat actor",
    "intrusion set",
    "operation",
    "campaign",
    "ioc",
    "ttp",
    "mitre",
    "attack",
    "cve",
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


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    return str(value or "").strip().lower() in {"true", "yes", "y", "ok", "1"}


def keyword_hits(text: str, keywords: tuple[str, ...]) -> list[str]:
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
        "threat_actor_group",
        "intrusion_set",
        "campaign",
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
        "government.government_confidence",
        "military.military_category",
        "datacenter.datacenter_category",
        "apt_attribution.explicit_apt_names",
        "apt_attribution.possible_country_linked_families",
        "apt_attribution.evidence.reasons",
    )

    chunks = []

    for key in keys:
        value = deep_get(row, key)

        if isinstance(value, list):
            chunks.extend(clean(item) for item in value)
        elif isinstance(value, Mapping):
            chunks.extend(clean(item) for item in value.values())
        else:
            chunks.append(clean(value))

    return " ".join(chunk for chunk in chunks if chunk).lower()


def country_code(row: Mapping[str, Any]) -> str:
    value = clean(
        row.get("country_code")
        or row.get("country")
        or deep_get(row, "geoip.country_code")
        or deep_get(row, "geoip.country")
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

    if len(value) == 2:
        return value

    return aliases.get(value, value)


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
    groups = []

    for match in GROUP_RE.finditer(text):
        canonical = canonical_group(match.group(1))

        if canonical:
            groups.append(canonical)

    for alias, canonical in THREAT_ACTOR_ALIASES.items():
        if alias in text.lower():
            groups.append(canonical)

    return sorted(set(groups), key=str.lower)


def tag_attribution_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    blob = text_blob(row)
    country = country_code(row)

    explicit_groups = extract_groups(blob)
    country_candidates = COUNTRY_TO_GROUPS.get(country, [])

    risk_hits = keyword_hits(blob, RISK_INFRA_HINTS)
    privacy_hits = keyword_hits(blob, PRIVACY_INFRA_HINTS)
    tactical_hits = keyword_hits(blob, TACTICAL_HINTS)

    apt_meta = deep_get(row, "apt_attribution")
    apt_confidence = ""
    apt_score = 0.0

    if isinstance(apt_meta, Mapping):
        apt_confidence = clean(apt_meta.get("apt_attribution_confidence"))
        try:
            apt_score = float(apt_meta.get("apt_attribution_score") or 0.0)
        except (TypeError, ValueError):
            apt_score = 0.0

    suspected_apt = boolish(row.get("suspected_apt_related") or deep_get(row, "apt_attribution.suspected_apt_related"))

    suspected_vpn = boolish(row.get("suspected_vpn") or row.get("is_vpn") or deep_get(row, "vpn.suspected_vpn"))
    suspected_proxy = boolish(row.get("suspected_proxy") or row.get("is_proxy") or deep_get(row, "proxy.suspected_proxy"))
    suspected_tor = boolish(row.get("suspected_tor") or row.get("is_tor") or deep_get(row, "tor.suspected_tor"))
    suspected_i2p = boolish(row.get("suspected_i2p") or row.get("is_i2p") or deep_get(row, "i2p.suspected_i2p"))
    suspected_datacenter = boolish(row.get("suspected_datacenter") or row.get("is_datacenter") or deep_get(row, "datacenter.suspected_datacenter"))

    score = 0.0
    reasons = []

    if explicit_groups:
        score += 0.65
        reasons.append("explicit threat-actor group label present in metadata")

    if suspected_apt:
        score += min(0.25, max(0.08, apt_score * 0.25))
        reasons.append("APT attribution module produced suspicion score")

    if country_candidates:
        score += 0.08
        reasons.append("country-linked candidate groups exist for geolocation")

    if risk_hits:
        score += min(0.22, 0.08 + 0.03 * len(risk_hits))
        reasons.append("high-risk infrastructure tags present")

    privacy_count = sum([suspected_vpn, suspected_proxy, suspected_tor, suspected_i2p])

    if privacy_count:
        score += min(0.18, 0.05 * privacy_count)
        reasons.append("privacy/proxy/overlay infrastructure indicators present")

    if suspected_datacenter:
        score += 0.06
        reasons.append("datacenter/hosting infrastructure indicator present")

    if tactical_hits:
        score += min(0.14, 0.04 + 0.02 * len(tactical_hits))
        reasons.append("threat-intelligence tactical tags present")

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

    if explicit_groups:
        attribution_type = "explicit_metadata_label"
        candidate_groups = explicit_groups
    elif suspected:
        attribution_type = "country_and_infrastructure_correlation"
        candidate_groups = country_candidates
    else:
        attribution_type = "none"
        candidate_groups = []

    return {
        "schema": SCHEMA,
        "suspected_threat_actor_group_related": suspected,
        "tag_attribution_score": round(score, 4),
        "tag_attribution_confidence": confidence,
        "attribution_type": attribution_type,
        "important_warning": (
            "Threat actor group attribution is heuristic unless explicit labels "
            "come from trusted threat-intelligence source data. Bitcoin node "
            "infrastructure alone does not prove operator identity."
        ),
        "country": country,
        "explicit_groups": explicit_groups,
        "candidate_groups": candidate_groups,
        "country_linked_candidate_groups": country_candidates,
        "apt_attribution_confidence": apt_confidence,
        "evidence": {
            "reasons": reasons,
            "risk_infra_hits": risk_hits,
            "privacy_hits": privacy_hits,
            "tactical_hits": tactical_hits,
            "suspected_apt": suspected_apt,
            "suspected_vpn": suspected_vpn,
            "suspected_proxy": suspected_proxy,
            "suspected_tor": suspected_tor,
            "suspected_i2p": suspected_i2p,
            "suspected_datacenter": suspected_datacenter,
        },
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = tag_attribution_metadata(node)

    node["tag_attribution"] = meta
    node["suspected_threat_actor_group_related"] = meta["suspected_threat_actor_group_related"]
    node["tag_attribution_score"] = meta["tag_attribution_score"]
    node["tag_attribution_confidence"] = meta["tag_attribution_confidence"]
    node["tag_attribution_type"] = meta["attribution_type"]

    node.setdefault("enrichment", {})
    node["enrichment"]["tagattribution"] = {
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
        payload["metadata"]["tagattribution_enriched_at"] = utc_now()

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
    group_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}

    for node in nodes:
        meta = node.get("tag_attribution", {})

        if not isinstance(meta, Mapping):
            meta = {}

        if meta.get("suspected_threat_actor_group_related") or node.get("suspected_threat_actor_group_related"):
            suspected += 1

        confidence = clean(meta.get("tag_attribution_confidence")) or "none"
        country = clean(meta.get("country")) or "Unknown"

        confidence_counts[confidence] = confidence_counts.get(confidence, 0) + 1
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
        "schema": "zzx-bitnodes-threat-actor-group-attribution-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "suspected_threat_actor_group_related_nodes": suspected,
        "confidence_counts": confidence_counts,
        "warning": "Counts are heuristic correlations, not definitive operator attribution.",
        "top": {
            "candidate_groups": top(group_counts),
            "countries": top(country_counts),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with heuristic threat actor group attribution metadata."
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
