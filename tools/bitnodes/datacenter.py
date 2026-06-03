#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-military-v1"

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

MILITARY_HINTS = (
    "military",
    "defense",
    "defence",
    "department of defense",
    "department of defence",
    "ministry of defense",
    "ministry of defence",
    "armed forces",
    "army",
    "navy",
    "air force",
    "marine corps",
    "marines",
    "coast guard",
    "space force",
    "national guard",
    "dod",
    "mod",
    "nato",
    "warfighting",
    "war fighting",
    "battlefield",
    "command",
    "cyber command",
    "uscybercom",
    "stratcom",
    "centcom",
    "eucom",
    "indopacom",
    "socom",
    "africom",
    "northcom",
    "southcom",
    "combatant command",
    ".mil",
    ".mil.",
    ".mil/",
)

DEFENSE_INDUSTRY_HINTS = (
    "lockheed",
    "lockheed martin",
    "raytheon",
    "rtx",
    "northrop",
    "northrop grumman",
    "boeing defense",
    "boeing defence",
    "general dynamics",
    "l3harris",
    "leidos",
    "bae systems",
    "thales",
    "saab",
    "rheinmetall",
    "anduril",
    "palantir",
    "kratos",
    "huntington ingalls",
    "hii",
)

EXCLUSION_HINTS = (
    "game",
    "gaming",
    "movie",
    "film",
    "sports",
    "military surplus",
    "civilian",
    "private hosting",
    "vpn",
    "proxy",
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


def keyword_hits(text: str, keywords: tuple[str, ...]) -> list[str]:
    hits = []

    for keyword in sorted(set(keywords), key=len, reverse=True):
        if keyword.lower() in text:
            hits.append(keyword)

    return hits


def text_blob(row: Mapping[str, Any]) -> str:
    keys = (
        "provider",
        "organization",
        "org",
        "hostname",
        "reverse_dns",
        "rdns",
        "provider_data.provider",
        "provider_data.organization",
        "provider_data.provider_kind",
        "organization_data.organization",
        "organization_data.organization_type",
        "isp.provider",
        "isp.organization",
        "asn_data.organization",
        "geoip.organization",
        "geoip.org",
        "government.organization",
        "government.provider",
        "country",
        "country_code",
        "region",
        "city",
    )

    return " ".join(clean(deep_get(row, key)) for key in keys if clean(deep_get(row, key))).lower()


def military_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    organization = first(
        row,
        "organization_data.organization",
        "organization",
        "org",
        "provider_data.organization",
        "isp.organization",
        "asn_data.organization",
        "geoip.organization",
        "geoip.org",
    )

    provider = first(
        row,
        "provider_data.provider",
        "provider",
        "isp.provider",
        "geoip.provider",
    )

    hostname = first(
        row,
        "hostname",
        "reverse_dns",
        "rdns",
        "host",
        "geoip.hostname",
    )

    country = first(
        row,
        "country_code",
        "country",
        "geoip.country_code",
        "geoip.country",
    )

    region = first(
        row,
        "region",
        "territory",
        "state",
        "province",
        "geoip.region",
    )

    city = first(
        row,
        "city",
        "geoip.city",
    )

    blob = text_blob(row)

    military_hits = keyword_hits(blob, MILITARY_HINTS)
    defense_industry_hits = keyword_hits(blob, DEFENSE_INDUSTRY_HINTS)
    exclusion_hits = keyword_hits(blob, EXCLUSION_HINTS)

    org_type = clean(deep_get(row, "organization_data.organization_type")).lower()
    provider_kind = clean(deep_get(row, "provider_data.provider_kind")).lower()

    inherited_military = bool(
        row.get("is_military")
        or row.get("is_military_provider")
        or row.get("is_military_organization")
        or org_type == "military"
        or provider_kind == "military"
    )

    inherited_government = bool(
        row.get("is_government")
        or row.get("is_government_provider")
        or row.get("is_government_organization")
        or clean(deep_get(row, "government.suspected_government")).lower() == "true"
        or bool(deep_get(row, "government.suspected_government"))
    )

    score = 0.0

    if inherited_military:
        score += 0.60

    if military_hits:
        score += min(0.50, 0.20 + 0.05 * len(military_hits))

    if defense_industry_hits:
        score += min(0.35, 0.15 + 0.04 * len(defense_industry_hits))

    if inherited_government and military_hits:
        score += 0.15

    if exclusion_hits and not inherited_military:
        score -= min(0.25, 0.05 * len(exclusion_hits))

    score = max(0.0, min(1.0, score))

    if score >= 0.80:
        confidence = "high"
    elif score >= 0.50:
        confidence = "medium"
    elif score >= 0.25:
        confidence = "low"
    else:
        confidence = "none"

    suspected = score >= 0.35

    if military_hits:
        category = "military"
    elif defense_industry_hits:
        category = "defense_industry"
    elif suspected:
        category = "suspected_military_related"
    else:
        category = "not_suspected"

    return {
        "schema": SCHEMA,
        "suspected_military": suspected,
        "is_military": suspected,
        "military_score": round(score, 4),
        "military_confidence": confidence,
        "military_category": category,
        "organization": organization,
        "provider": provider,
        "hostname": hostname,
        "country": country.upper() if len(country) == 2 else country,
        "region": region,
        "city": city,
        "evidence": {
            "military_hits": military_hits,
            "defense_industry_hits": defense_industry_hits,
            "exclusion_hits": exclusion_hits,
            "inherited_military": inherited_military,
            "inherited_government": inherited_government,
            "organization_type": org_type,
            "provider_kind": provider_kind,
        },
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = military_metadata(node)

    node["military"] = meta
    node["suspected_military"] = meta["suspected_military"]
    node["is_military"] = meta["is_military"]
    node["military_score"] = meta["military_score"]
    node["military_confidence"] = meta["military_confidence"]
    node["military_category"] = meta["military_category"]

    node.setdefault("enrichment", {})
    node["enrichment"]["military"] = {
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
        payload["metadata"]["military_enriched_at"] = utc_now()

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
    confidence_counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}
    suspected = 0

    for node in nodes:
        meta = node.get("military", {})

        if not isinstance(meta, Mapping):
            meta = {}

        if meta.get("suspected_military") or node.get("suspected_military"):
            suspected += 1

        confidence = clean(meta.get("military_confidence")) or "none"
        category = clean(meta.get("military_category")) or "not_suspected"
        country = clean(meta.get("country")) or clean(node.get("country_code")) or clean(node.get("country")) or "Unknown"

        confidence_counts[confidence] = confidence_counts.get(confidence, 0) + 1
        category_counts[category] = category_counts.get(category, 0) + 1
        country_counts[country] = country_counts.get(country, 0) + 1

    def top(counter: dict[str, int], limit: int = 100) -> list[dict[str, Any]]:
        return [
            {"name": name, "count": count}
            for name, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
        ]

    return {
        "schema": "zzx-bitnodes-military-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "suspected_military_nodes": suspected,
        "confidence_counts": confidence_counts,
        "category_counts": category_counts,
        "top": {
            "countries": top(country_counts),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with military and defense-network suspicion metadata."
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

    print(f"military enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
