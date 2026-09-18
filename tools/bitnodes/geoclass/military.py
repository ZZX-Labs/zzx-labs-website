#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-military-v2"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "n/a", "na", "-", "—"}

MILITARY_HINTS = (
    "military", "defense", "defence", "department of defense", "department of defence",
    "ministry of defense", "ministry of defence", "armed forces", "army", "navy",
    "air force", "marine corps", "marines", "coast guard", "space force",
    "national guard", "dod", "mod", "nato", "warfighting", "war fighting",
    "battlefield", "command", "cyber command", "uscybercom", "stratcom",
    "centcom", "eucom", "indopacom", "socom", "africom", "northcom",
    "southcom", "combatant command", ".mil", ".mil.", ".mil/",
)

DEFENSE_INDUSTRY_HINTS = (
    "lockheed", "lockheed martin", "raytheon", "rtx", "northrop",
    "northrop grumman", "boeing defense", "boeing defence", "general dynamics",
    "l3harris", "leidos", "bae systems", "thales", "saab", "rheinmetall",
    "anduril", "palantir", "kratos", "huntington ingalls", "hii",
)

EXCLUSION_HINTS = (
    "game", "gaming", "movie", "film", "sports", "military surplus",
    "civilian", "private hosting", "vpn", "proxy",
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
        )
        + "\n",
        encoding="utf-8",
    )


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


def first(row: Mapping[str, Any], *keys: str) -> str:
    for key in keys:
        value = clean(deep_get(row, key) if "." in key else row.get(key))
        if value:
            return value
    return ""


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
    return [keyword for keyword in sorted(set(keywords), key=len, reverse=True) if keyword.lower() in text]


def text_blob(row: Mapping[str, Any]) -> str:
    keys = (
        "provider", "organization", "org", "hostname", "reverse_dns", "rdns",
        "provider_kind", "organization_type", "network_classification",
        "provider_data.provider", "provider_data.organization",
        "provider_data.provider_kind", "provider_data.organization_type",
        "organization_data.organization", "organization_data.organization_type",
        "isp.provider", "isp.organization", "asn_data.organization",
        "geoip.organization", "geoip.org", "government.organization",
        "government.provider", "metadata.provider", "metadata.organization",
        "metadata.organization_type", "metadata.provider_kind",
        "country", "country_code", "region", "city",
    )

    return " ".join(clean(deep_get(row, key) if "." in key else row.get(key)) for key in keys).lower()


def military_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    organization = first(
        row,
        "organization_data.organization", "organization", "org",
        "provider_data.organization", "isp.organization", "asn_data.organization",
        "geoip.organization", "geoip.org", "metadata.organization",
    )

    provider = first(
        row,
        "provider_data.provider", "provider", "isp.provider", "geoip.provider",
        "metadata.provider",
    )

    hostname = first(row, "hostname", "reverse_dns", "rdns", "host", "geoip.hostname", "metadata.host")

    country = first(
        row,
        "country_code", "country", "geoip.country_code", "geoip.country",
        "metadata.country_code", "metadata.country",
    )

    region = first(row, "region", "territory", "state", "province", "geoip.region", "metadata.region")
    city = first(row, "city", "geoip.city", "metadata.city")

    blob = text_blob(row)

    military_hits = keyword_hits(blob, MILITARY_HINTS)
    defense_industry_hits = keyword_hits(blob, DEFENSE_INDUSTRY_HINTS)
    exclusion_hits = keyword_hits(blob, EXCLUSION_HINTS)

    org_type = clean(first(row, "organization_data.organization_type", "organization_type", "metadata.organization_type")).lower()
    provider_kind = clean(first(row, "provider_data.provider_kind", "provider_kind", "metadata.provider_kind")).lower()

    inherited_military = bool(
        boolish(row.get("is_military"))
        or boolish(row.get("is_military_provider"))
        or boolish(row.get("is_military_organization"))
        or boolish(row.get("suspected_military"))
        or org_type == "military"
        or provider_kind == "military"
    )

    inherited_government = bool(
        boolish(row.get("is_government"))
        or boolish(row.get("is_government_provider"))
        or boolish(row.get("is_government_organization"))
        or boolish(row.get("suspected_government"))
        or boolish(deep_get(row, "government.suspected_government"))
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
        "country_code": country.upper() if len(country) == 2 else country,
        "region": region,
        "city": city,
        "organization_type": org_type,
        "provider_kind": provider_kind,
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


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = military_metadata(node)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["military"] = meta
    metadata["military"] = meta

    for key in ("suspected_military", "is_military", "military_score", "military_confidence", "military_category"):
        node[key] = meta[key]
        metadata[key] = meta[key]

    if meta["suspected_military"]:
        node.setdefault("organization_type", "military")
        metadata.setdefault("organization_type", "military")

    enrichment["military"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": meta["updated_at"],
        "suspected_military": meta["suspected_military"],
        "military_score": meta["military_score"],
        "military_confidence": meta["military_confidence"],
        "military_category": meta["military_category"],
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
        output["metadata"]["military_enriched_at"] = utc_now()
        output["metadata"]["military_schema"] = SCHEMA

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context))


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    confidence_counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}
    suspected = 0

    for node in nodes:
        meta = node.get("military", {})
        if not isinstance(meta, Mapping):
            meta = {}

        if boolish(meta.get("suspected_military") or node.get("suspected_military")):
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
        "schema": "zzx-bitnodes-military-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "suspected_military_nodes": suspected,
        "confidence_counts": dict(sorted(confidence_counts.items(), key=lambda item: (-item[1], item[0]))),
        "category_counts": dict(sorted(category_counts.items(), key=lambda item: (-item[1], item[0]))),
        "top": {
            "countries": top(country_counts),
        },
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with military and defense-network suspicion metadata.",
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

    print(f"military enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
