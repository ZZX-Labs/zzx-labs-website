#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GEO_ROOT = APP_ROOT / "tools" / "bitnodes" / "data" / "geo"
DEFAULT_COUNTY_DIR = DEFAULT_GEO_ROOT / "counties"

UNKNOWN_VALUES = {
    "",
    "unknown",
    "none",
    "null",
    "undefined",
    "—",
    "-",
    "n/a",
    "na",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return re.sub(r"\s+", " ", text)


def normalize_key(value: Any) -> str:
    return clean(value).lower().replace("_", " ").replace("-", " ").strip()


def normalize_code(value: Any) -> str:
    text = clean(value).upper()

    if not text:
        return ""

    if "-" in text:
        text = text.rsplit("-", 1)[-1]

    return text.strip()


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if not math.isfinite(n):
        return fallback

    return n


def first(mapping: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = clean(mapping.get(key))

        if value:
            return value

    return ""


def nested_dict(row: dict[str, Any], key: str) -> dict[str, Any]:
    value = row.get(key)

    return value if isinstance(value, dict) else {}


def country_code(row: dict[str, Any]) -> str:
    for key in (
        "country_code",
        "cc",
        "iso_country",
        "iso_country_code",
    ):
        value = normalize_code(row.get(key))

        if len(value) == 2:
            return value

    country_data = nested_dict(row, "country_data")

    for key in (
        "country_code",
        "cc",
        "iso_country",
        "iso_country_code",
    ):
        value = normalize_code(country_data.get(key))

        if len(value) == 2:
            return value

    geo = nested_dict(row, "geo")

    for key in (
        "country_code",
        "country",
        "iso_code",
        "iso_country",
        "iso_country_code",
    ):
        value = normalize_code(geo.get(key))

        if len(value) == 2:
            return value

    value = normalize_code(row.get("country"))

    if len(value) == 2:
        return value

    return ""


def admin1_code(row: dict[str, Any]) -> str:
    for key in (
        "admin1_code",
        "territory_code",
        "state_code",
        "subdivision_code",
        "province_code",
        "region_code",
    ):
        value = normalize_code(row.get(key))

        if value:
            return value

    territory_data = nested_dict(row, "territory_data")

    for key in (
        "admin1_code",
        "territory_code",
        "state_code",
        "subdivision_code",
        "province_code",
        "region_code",
    ):
        value = normalize_code(territory_data.get(key))

        if value:
            return value

    geo = nested_dict(row, "geo")

    for key in (
        "admin1_code",
        "territory_code",
        "state_code",
        "subdivision_code",
        "province_code",
        "region_code",
    ):
        value = normalize_code(geo.get(key))

        if value:
            return value

    return ""


def raw_county_code(row: dict[str, Any]) -> str:
    code = first(
        row,
        (
            "county_code",
            "district_code",
            "admin2_code",
            "admin2",
            "municipality_code",
            "parish_code",
        ),
    )

    if code:
        return normalize_code(code)

    geo = nested_dict(row, "geo")

    code = first(
        geo,
        (
            "county_code",
            "district_code",
            "admin2_code",
            "admin2",
            "municipality_code",
            "parish_code",
        ),
    )

    return normalize_code(code)


def raw_county_name(row: dict[str, Any]) -> str:
    name = first(
        row,
        (
            "county",
            "county_name",
            "district",
            "district_name",
            "admin2_name",
            "admin2",
            "municipality",
            "municipality_name",
            "parish",
            "parish_name",
        ),
    )

    if name:
        return name

    geo = nested_dict(row, "geo")

    return first(
        geo,
        (
            "county",
            "county_name",
            "district",
            "district_name",
            "admin2_name",
            "admin2",
            "municipality",
            "municipality_name",
            "parish",
            "parish_name",
        ),
    )


def load_county_index(country: str, county_dir: Path) -> dict[str, Any]:
    if not country:
        return {}

    candidates = [
        county_dir / f"{country.upper()}.json",
        county_dir / f"{country.lower()}.json",
    ]

    for path in candidates:
        data = read_json(path, fallback={})

        if isinstance(data, dict) and data:
            return data

    return {}


def build_lookup(
    index: dict[str, Any],
    admin1: str,
) -> tuple[dict[str, str], dict[str, str]]:
    by_code: dict[str, str] = {}
    by_name: dict[str, str] = {}

    admin1_block = {}

    admin1_data = index.get("admin1", {})

    if isinstance(admin1_data, dict):
        admin1_block = admin1_data.get(admin1, {}) or admin1_data.get("Unknown", {})

    counties = admin1_block.get("counties", {}) if isinstance(admin1_block, dict) else {}

    if isinstance(counties, dict):
        for code, name in counties.items():
            n_code = normalize_code(code)
            n_name = clean(name)

            if n_code and n_name:
                by_code[n_code] = n_name
                by_name[normalize_key(n_name)] = n_code

    aliases = admin1_block.get("aliases", {}) if isinstance(admin1_block, dict) else {}

    if isinstance(aliases, dict):
        for alias, code in aliases.items():
            alias_key = normalize_key(alias)
            n_code = normalize_code(code)

            if alias_key and n_code:
                by_name[alias_key] = n_code

    return by_code, by_name


def resolve_county(
    row: dict[str, Any],
    county_dir: Path,
) -> dict[str, Any]:
    if row.get("is_tor") or nested_dict(row, "tor").get("is_tor"):
        return {
            "county": "Onion Routing",
            "county_code": "TOR",
            "admin1_code": "TOR",
            "country_code": "TOR",
            "county_label": "overlay-network",
            "county_source": "tor-overlay",
            "county_confidence": "high",
        }

    if row.get("is_i2p") or nested_dict(row, "i2p").get("is_i2p"):
        return {
            "county": "Garlic Routing",
            "county_code": "I2P",
            "admin1_code": "I2P",
            "country_code": "I2P",
            "county_label": "overlay-network",
            "county_source": "i2p-overlay",
            "county_confidence": "high",
        }

    country = country_code(row)
    admin1 = admin1_code(row)
    code = raw_county_code(row)
    name = raw_county_name(row)

    index = load_county_index(country, county_dir)
    by_code, by_name = build_lookup(index, admin1)

    label = (
        clean(index.get("subdivision_label"))
        or clean(index.get("admin2_label"))
        or "county"
    )

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
        "county": resolved_name or "Unknown",
        "county_code": resolved_code or "Unknown",
        "admin1_code": admin1 or "Unknown",
        "country_code": country or "Unknown",
        "county_label": label,
        "county_source": source,
        "county_confidence": confidence,
    }


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    context = context or {}

    county_dir = Path(
        context.get("county_dir")
        or context.get("counties_dir")
        or context.get("geo_county_dir")
        or DEFAULT_COUNTY_DIR
    )

    for node in nodes:
        meta = resolve_county(node, county_dir)

        node["county_data"] = meta
        node["county"] = meta["county"]
        node["county_code"] = meta["county_code"]
        node["admin2"] = meta["county"]
        node["admin2_code"] = meta["county_code"]

        node.setdefault("enrichment", {})
        node["enrichment"]["county"] = {
            "status": "ok",
            "updated_at": utc_now(),
            "county_dir": str(county_dir),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    countries: dict[str, int] = {}
    sources: dict[str, int] = {}

    for node in nodes:
        county_data = nested_dict(node, "county_data")

        county = (
            clean(node.get("county"))
            or clean(county_data.get("county"))
            or "Unknown"
        )

        country = (
            clean(node.get("country_code"))
            or clean(county_data.get("country_code"))
            or "Unknown"
        )

        source = clean(county_data.get("county_source")) or "unknown"

        counts[county] = counts.get(county, 0) + 1
        countries[country] = countries.get(country, 0) + 1
        sources[source] = sources.get(source, 0) + 1

    top_county = max(
        counts.items(),
        key=lambda item: item[1],
        default=("Unknown", 0),
    )

    return {
        "schema": "zzx-bitnodes-county-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "county_count": len(counts),
        "country_count": len(countries),
        "counties": counts,
        "countries": countries,
        "sources": sources,
        "top_county": {
            "county": top_county[0],
            "count": top_county[1],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with globally indexed county/district/admin2 metadata."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument(
        "--county-dir",
        default=str(DEFAULT_COUNTY_DIR),
        help="Directory containing per-country county/admin2 JSON indexes.",
    )

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    enriched = enrich_nodes(
        nodes,
        {
            "county_dir": args.county_dir,
        },
    )

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["county_enriched_at"] = utc_now()
        payload["metadata"]["county_dir"] = args.county_dir
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"county enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
