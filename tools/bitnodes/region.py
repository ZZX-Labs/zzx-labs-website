#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REGION_ALIASES = {
    "north america": "Northern America",
    "northern america": "Northern America",
    "latin america": "Latin America",
    "south america": "South America",
    "central america": "Central America",
    "caribbean": "Caribbean",
    "western europe": "Western Europe",
    "eastern europe": "Eastern Europe",
    "northern europe": "Northern Europe",
    "southern europe": "Southern Europe",
    "western asia": "Western Asia",
    "central asia": "Central Asia",
    "south asia": "South Asia",
    "southern asia": "South Asia",
    "east asia": "Eastern Asia",
    "eastern asia": "Eastern Asia",
    "southeast asia": "South-Eastern Asia",
    "south eastern asia": "South-Eastern Asia",
    "south-eastern asia": "South-Eastern Asia",
    "northern africa": "Northern Africa",
    "north africa": "Northern Africa",
    "western africa": "Western Africa",
    "west africa": "Western Africa",
    "eastern africa": "Eastern Africa",
    "east africa": "Eastern Africa",
    "middle africa": "Middle Africa",
    "central africa": "Middle Africa",
    "southern africa": "Southern Africa",
    "australia and new zealand": "Australia and New Zealand",
    "melanesia": "Melanesia",
    "micronesia": "Micronesia",
    "polynesia": "Polynesia",
    "tor": "Onion Routing",
    "i2p": "Garlic Routing",
}


COUNTRY_TO_REGION = {
    "US": "Northern America",
    "CA": "Northern America",
    "MX": "Central America",
    "BZ": "Central America",
    "CR": "Central America",
    "SV": "Central America",
    "GT": "Central America",
    "HN": "Central America",
    "NI": "Central America",
    "PA": "Central America",

    "AR": "South America",
    "BO": "South America",
    "BR": "South America",
    "CL": "South America",
    "CO": "South America",
    "EC": "South America",
    "FK": "South America",
    "GF": "South America",
    "GY": "South America",
    "PY": "South America",
    "PE": "South America",
    "SR": "South America",
    "UY": "South America",
    "VE": "South America",

    "GB": "Northern Europe",
    "IE": "Northern Europe",
    "IS": "Northern Europe",
    "NO": "Northern Europe",
    "SE": "Northern Europe",
    "FI": "Northern Europe",
    "DK": "Northern Europe",
    "EE": "Northern Europe",
    "LV": "Northern Europe",
    "LT": "Northern Europe",

    "DE": "Western Europe",
    "FR": "Western Europe",
    "NL": "Western Europe",
    "BE": "Western Europe",
    "LU": "Western Europe",
    "CH": "Western Europe",
    "AT": "Western Europe",
    "LI": "Western Europe",
    "MC": "Western Europe",

    "ES": "Southern Europe",
    "PT": "Southern Europe",
    "IT": "Southern Europe",
    "GR": "Southern Europe",
    "MT": "Southern Europe",
    "CY": "Southern Europe",
    "SI": "Southern Europe",
    "HR": "Southern Europe",
    "BA": "Southern Europe",
    "RS": "Southern Europe",
    "ME": "Southern Europe",
    "MK": "Southern Europe",
    "AL": "Southern Europe",
    "AD": "Southern Europe",
    "SM": "Southern Europe",
    "VA": "Southern Europe",

    "PL": "Eastern Europe",
    "CZ": "Eastern Europe",
    "SK": "Eastern Europe",
    "HU": "Eastern Europe",
    "RO": "Eastern Europe",
    "BG": "Eastern Europe",
    "MD": "Eastern Europe",
    "UA": "Eastern Europe",
    "BY": "Eastern Europe",
    "RU": "Eastern Europe",

    "TR": "Western Asia",
    "GE": "Western Asia",
    "AM": "Western Asia",
    "AZ": "Western Asia",
    "IR": "Western Asia",
    "IQ": "Western Asia",
    "SY": "Western Asia",
    "LB": "Western Asia",
    "IL": "Western Asia",
    "JO": "Western Asia",
    "SA": "Western Asia",
    "YE": "Western Asia",
    "OM": "Western Asia",
    "AE": "Western Asia",
    "QA": "Western Asia",
    "BH": "Western Asia",
    "KW": "Western Asia",

    "IN": "South Asia",
    "PK": "South Asia",
    "BD": "South Asia",
    "LK": "South Asia",
    "NP": "South Asia",
    "BT": "South Asia",
    "MV": "South Asia",
    "AF": "South Asia",

    "CN": "Eastern Asia",
    "HK": "Eastern Asia",
    "MO": "Eastern Asia",
    "TW": "Eastern Asia",
    "JP": "Eastern Asia",
    "KR": "Eastern Asia",
    "KP": "Eastern Asia",
    "MN": "Eastern Asia",

    "MM": "South-Eastern Asia",
    "TH": "South-Eastern Asia",
    "LA": "South-Eastern Asia",
    "KH": "South-Eastern Asia",
    "VN": "South-Eastern Asia",
    "MY": "South-Eastern Asia",
    "SG": "South-Eastern Asia",
    "ID": "South-Eastern Asia",
    "PH": "South-Eastern Asia",
    "BN": "South-Eastern Asia",
    "TL": "South-Eastern Asia",

    "AU": "Australia and New Zealand",
    "NZ": "Australia and New Zealand",

    "MA": "Northern Africa",
    "DZ": "Northern Africa",
    "TN": "Northern Africa",
    "LY": "Northern Africa",
    "EG": "Northern Africa",
    "SD": "Northern Africa",

    "ZA": "Southern Africa",
    "NA": "Southern Africa",
    "BW": "Southern Africa",
    "LS": "Southern Africa",
    "SZ": "Southern Africa",

    "NG": "Western Africa",
    "GH": "Western Africa",
    "SN": "Western Africa",
    "CI": "Western Africa",
    "ML": "Western Africa",
    "NE": "Western Africa",
    "BF": "Western Africa",
    "GM": "Western Africa",
    "GN": "Western Africa",
    "GW": "Western Africa",
    "LR": "Western Africa",
    "SL": "Western Africa",
    "TG": "Western Africa",
    "BJ": "Western Africa",
    "CV": "Western Africa",

    "KE": "Eastern Africa",
    "ET": "Eastern Africa",
    "TZ": "Eastern Africa",
    "UG": "Eastern Africa",
    "RW": "Eastern Africa",
    "BI": "Eastern Africa",
    "SO": "Eastern Africa",
    "DJ": "Eastern Africa",
    "ER": "Eastern Africa",
    "SS": "Eastern Africa",
    "MZ": "Eastern Africa",
    "MG": "Eastern Africa",
    "MU": "Eastern Africa",
    "SC": "Eastern Africa",
    "ZM": "Eastern Africa",
    "ZW": "Eastern Africa",
    "MW": "Eastern Africa",
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

    if text.lower() in {
        "",
        "unknown",
        "none",
        "null",
        "undefined",
        "—",
    }:
        return ""

    return text


def country_code(row: dict[str, Any]) -> str:
    for key in (
        "country_code",
        "country",
        "cc",
        "iso_country",
        "iso_country_code",
    ):
        value = clean(row.get(key)).upper()

        if len(value) == 2:
            return value

    geo = row.get("geo") if isinstance(row.get("geo"), dict) else {}

    for key in (
        "country_code",
        "country",
        "iso_code",
    ):
        value = clean(geo.get(key)).upper()

        if len(value) == 2:
            return value

    return ""


def normalize_region(value: Any) -> str:
    text = clean(value)

    if not text:
        return ""

    key = text.lower().replace("_", " ").replace("-", " ")

    return REGION_ALIASES.get(key, text)


def region_metadata(row: dict[str, Any]) -> dict[str, Any]:
    raw_region = ""

    for key in (
        "region",
        "subregion",
        "world_region",
        "geo_region",
        "continent_region",
    ):
        raw_region = clean(row.get(key))

        if raw_region:
            break

    geo = row.get("geo") if isinstance(row.get("geo"), dict) else {}

    if not raw_region:
        for key in (
            "region",
            "subregion",
            "world_region",
        ):
            raw_region = clean(geo.get(key))

            if raw_region:
                break

    normalized = normalize_region(raw_region)

    code = country_code(row)

    if not normalized and code in COUNTRY_TO_REGION:
        normalized = COUNTRY_TO_REGION[code]

    if not normalized and (row.get("is_tor") or row.get("tor", {}).get("is_tor")):
        normalized = "Onion Routing"

    if not normalized and (row.get("is_i2p") or row.get("i2p", {}).get("is_i2p")):
        normalized = "Garlic Routing"

    return {
        "region": normalized or "Unknown",
        "region_source": "explicit" if raw_region else "country-map" if code in COUNTRY_TO_REGION else "fallback",
        "country_code": code,
    }


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    for node in nodes:
        meta = region_metadata(node)

        node["region_data"] = meta
        node["region"] = meta["region"]

        node.setdefault("enrichment", {})
        node["enrichment"]["region"] = {
            "status": "ok",
            "updated_at": utc_now(),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}

    for node in nodes:
        region = clean(node.get("region")) or clean(node.get("region_data", {}).get("region")) or "Unknown"
        counts[region] = counts.get(region, 0) + 1

    top_region = max(
        counts.items(),
        key=lambda item: item[1],
        default=("Unknown", 0),
    )

    return {
        "schema": "zzx-bitnodes-region-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "region_count": len(counts),
        "regions": counts,
        "top_region": {
            "region": top_region[0],
            "count": top_region[1],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with global region metadata."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    enriched = enrich_nodes(nodes)

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["region_enriched_at"] = utc_now()
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"region enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
