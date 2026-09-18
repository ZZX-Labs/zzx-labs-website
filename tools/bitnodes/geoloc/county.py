#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


APP_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GEO_ROOT = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo"
DEFAULT_COUNTY_DIR = DEFAULT_GEO_ROOT / "counties"

SCHEMA = "zzx-bitnodes-county-v2"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}


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
    text = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":") if compact else None,
        indent=None if compact else 2,
        sort_keys=not compact,
    )
    path.write_text(text + "\n", encoding="utf-8")


def clean(value: Any) -> str:
    text = str(value or "").strip()
    if text.lower() in UNKNOWN_VALUES:
        return ""
    return re.sub(r"\s+", " ", text)


def normalize_key(value: Any) -> str:
    return clean(value).lower().replace("_", " ").replace("-", " ").strip()


def normalize_code(value: Any) -> str:
    text = clean(value).upper()
    if "-" in text:
        text = text.rsplit("-", 1)[-1]
    return text.strip()


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return row.get(key)

    current: Any = row
    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def first(row: Mapping[str, Any], keys: tuple[str, ...]) -> str:
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
    return str(value or "").strip().lower() in {"true", "yes", "y", "ok", "1"}


def country_code(row: Mapping[str, Any]) -> str:
    for key in (
        "country_code", "country", "cc", "iso_country", "iso_country_code",
        "country_data.country_code",
        "geo.country_code", "geo.country", "geo.iso_code",
        "geoip.country_code", "geoip.country",
        "geoip_data.country_code", "geoip_data.country",
        "location.country_code", "location.country",
        "metadata.country_code", "metadata.country",
    ):
        value = normalize_code(deep_get(row, key))
        if len(value) == 2:
            return value

    network = clean(row.get("network") or deep_get(row, "metadata.network")).lower()

    if boolish(row.get("is_tor")) or boolish(deep_get(row, "tor.is_tor")) or network == "tor":
        return "TOR"

    if boolish(row.get("is_i2p")) or boolish(deep_get(row, "i2p.is_i2p")) or network == "i2p":
        return "I2P"

    return ""


def admin1_code(row: Mapping[str, Any]) -> str:
    return normalize_code(first(row, (
        "admin1_code", "territory_code", "state_code", "subdivision_code", "province_code", "region_code",
        "territory_data.admin1_code", "territory_data.territory_code",
        "geo.admin1_code", "geo.territory_code", "geo.state_code", "geo.subdivision_code",
        "geoip.admin1_code", "geoip.territory_code", "geoip.state_code", "geoip.subdivision_code",
        "geoip_data.admin1_code", "geoip_data.state_code",
        "location.admin1_code", "location.state_code",
        "metadata.admin1_code", "metadata.state_code",
    )))


def raw_county_code(row: Mapping[str, Any]) -> str:
    return normalize_code(first(row, (
        "county_code", "district_code", "admin2_code", "admin2", "municipality_code", "parish_code",
        "geo.county_code", "geo.district_code", "geo.admin2_code", "geo.admin2",
        "geoip.county_code", "geoip.district_code", "geoip.admin2_code",
        "geoip_data.county_code", "geoip_data.district_code", "geoip_data.admin2_code",
        "location.county_code", "location.district_code", "location.admin2_code",
        "metadata.county_code", "metadata.district_code", "metadata.admin2_code",
    )))


def raw_county_name(row: Mapping[str, Any]) -> str:
    return first(row, (
        "county", "county_name", "district", "district_name", "admin2_name", "admin2",
        "municipality", "municipality_name", "parish", "parish_name",
        "geo.county", "geo.county_name", "geo.district", "geo.district_name", "geo.admin2_name", "geo.admin2",
        "geoip.county", "geoip.county_name", "geoip.district", "geoip.district_name", "geoip.admin2_name",
        "geoip_data.county", "geoip_data.district", "geoip_data.admin2_name",
        "location.county", "location.district", "location.admin2_name",
        "metadata.county", "metadata.district", "metadata.admin2_name",
    ))


def load_county_index(country: str, county_dir: Path) -> dict[str, Any]:
    if not country:
        return {}

    for path in (county_dir / f"{country.upper()}.json", county_dir / f"{country.lower()}.json"):
        data = read_json(path, fallback={})
        if isinstance(data, dict) and data:
            return data

    return {}


def build_lookup(index: Mapping[str, Any], admin1: str) -> tuple[dict[str, str], dict[str, str]]:
    by_code: dict[str, str] = {}
    by_name: dict[str, str] = {}

    admin1_block: Mapping[str, Any] = {}
    admin1_data = index.get("admin1", {})

    if isinstance(admin1_data, Mapping):
        maybe = admin1_data.get(admin1) or admin1_data.get("Unknown") or {}
        if isinstance(maybe, Mapping):
            admin1_block = maybe

    counties = admin1_block.get("counties", {}) if isinstance(admin1_block, Mapping) else {}

    if isinstance(counties, Mapping):
        for code, name in counties.items():
            n_code = normalize_code(code)
            n_name = clean(name)
            if n_code and n_name:
                by_code[n_code] = n_name
                by_name[normalize_key(n_name)] = n_code

    if isinstance(counties, list):
        for item in counties:
            if not isinstance(item, Mapping):
                continue

            code = normalize_code(item.get("code") or item.get("county_code") or item.get("admin2_code") or item.get("id"))
            name = clean(item.get("name") or item.get("county_name") or item.get("admin2_name") or item.get("label"))

            if code and name:
                by_code[code] = name
                by_name[normalize_key(name)] = code

            aliases = item.get("aliases", [])
            if isinstance(aliases, list) and code:
                for alias in aliases:
                    alias_key = normalize_key(alias)
                    if alias_key:
                        by_name[alias_key] = code

    aliases = admin1_block.get("aliases", {}) if isinstance(admin1_block, Mapping) else {}
    if isinstance(aliases, Mapping):
        for alias, code in aliases.items():
            alias_key = normalize_key(alias)
            n_code = normalize_code(code)
            if alias_key and n_code:
                by_name[alias_key] = n_code

    return by_code, by_name


def resolve_county(row: Mapping[str, Any], county_dir: Path) -> dict[str, Any]:
    country = country_code(row)

    if country == "TOR":
        return {
            "schema": SCHEMA,
            "county": "Onion Routing",
            "county_code": "TOR",
            "admin1_code": "TOR",
            "country_code": "TOR",
            "county_label": "overlay-network",
            "county_source": "tor-overlay",
            "county_confidence": "high",
            "updated_at": utc_now(),
        }

    if country == "I2P":
        return {
            "schema": SCHEMA,
            "county": "Garlic Routing",
            "county_code": "I2P",
            "admin1_code": "I2P",
            "country_code": "I2P",
            "county_label": "overlay-network",
            "county_source": "i2p-overlay",
            "county_confidence": "high",
            "updated_at": utc_now(),
        }

    admin1 = admin1_code(row)
    code = raw_county_code(row)
    name = raw_county_name(row)

    index = load_county_index(country, county_dir)
    by_code, by_name = build_lookup(index, admin1)

    label = clean(index.get("subdivision_label")) or clean(index.get("admin2_label")) or "county"

    source = "fallback"
    confidence = "none"
    resolved_code = code
    resolved_name = name

    if code and code in by_code:
        resolved_name = by_code[code]
        source = "local-json-code"
        confidence = "high"
    elif name:
        name_key = normalize_key(name)
        if name_key in by_name:
            resolved_code = by_name[name_key]
            resolved_name = by_code.get(resolved_code, name)
            source = "local-json-name"
            confidence = "high"
        else:
            source = "explicit-name"
            confidence = "medium"
    elif code:
        source = "explicit-code"
        confidence = "medium"

    if not resolved_code and resolved_name:
        resolved_code = resolved_name

    return {
        "schema": SCHEMA,
        "county": resolved_name or "Unknown",
        "county_code": resolved_code or "Unknown",
        "admin1_code": admin1 or "Unknown",
        "country_code": country or "Unknown",
        "county_label": label,
        "county_source": source,
        "county_confidence": confidence,
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any], county_dir: Path) -> MutableMapping[str, Any]:
    meta = resolve_county(node, county_dir)

    node["county_data"] = meta
    node["county"] = meta["county"]
    node["county_code"] = meta["county_code"]
    node["admin2"] = meta["county"]
    node["admin2_code"] = meta["county_code"]

    node.setdefault("enrichment", {})
    node["enrichment"]["county"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "county_dir": str(county_dir),
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    context = context or {}
    county_dir = Path(context.get("county_dir") or context.get("counties_dir") or context.get("geo_county_dir") or DEFAULT_COUNTY_DIR)

    if isinstance(nodes, list):
        return [enrich_node(dict(node), county_dir) if isinstance(node, Mapping) else node for node in nodes]

    if isinstance(nodes, Mapping):
        return {key: enrich_node(dict(value), county_dir) if isinstance(value, Mapping) else value for key, value in nodes.items()}

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
        payload["metadata"]["county_enriched_at"] = utc_now()
        payload["metadata"]["county_dir"] = str(context.get("county_dir") if context else DEFAULT_COUNTY_DIR)

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
    counts: dict[str, int] = {}
    countries: dict[str, int] = {}
    sources: dict[str, int] = {}

    for node in nodes:
        county_data = node.get("county_data", {})
        if not isinstance(county_data, Mapping):
            county_data = {}

        county = clean(node.get("county")) or clean(county_data.get("county")) or "Unknown"
        country = clean(node.get("country_code")) or clean(county_data.get("country_code")) or "Unknown"
        source = clean(county_data.get("county_source")) or "unknown"

        counts[county] = counts.get(county, 0) + 1
        countries[country] = countries.get(country, 0) + 1
        sources[source] = sources.get(source, 0) + 1

    top_county = max(counts.items(), key=lambda item: item[1], default=("Unknown", 0))

    return {
        "schema": "zzx-bitnodes-county-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "county_count": len(counts),
        "country_count": len(countries),
        "counties": dict(sorted(counts.items(), key=lambda item: (-item[1], item[0]))),
        "countries": dict(sorted(countries.items(), key=lambda item: (-item[1], item[0]))),
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))),
        "top_county": {"county": top_county[0], "count": top_county[1]},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich Bitnodes records with globally indexed county/district/admin2 metadata.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--county-dir", default=str(DEFAULT_COUNTY_DIR))
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload, {"county_dir": args.county_dir})

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"county enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
