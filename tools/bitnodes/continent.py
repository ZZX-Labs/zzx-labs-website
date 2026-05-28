#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CONTINENT_ALIASES = {
    "af": "Africa",
    "africa": "Africa",
    "an": "Antarctica",
    "antarctica": "Antarctica",
    "as": "Asia",
    "asia": "Asia",
    "eu": "Europe",
    "europe": "Europe",
    "na": "North America",
    "north america": "North America",
    "northern america": "North America",
    "oc": "Oceania",
    "oceania": "Oceania",
    "australia": "Oceania",
    "australia and new zealand": "Oceania",
    "sa": "South America",
    "south america": "South America",
    "tor": "Overlay Network",
    "onion routing": "Overlay Network",
    "i2p": "Overlay Network",
    "garlic routing": "Overlay Network",
}


COUNTRY_TO_CONTINENT = {
    "US": "North America",
    "CA": "North America",
    "MX": "North America",
    "BZ": "North America",
    "CR": "North America",
    "SV": "North America",
    "GT": "North America",
    "HN": "North America",
    "NI": "North America",
    "PA": "North America",
    "BS": "North America",
    "BB": "North America",
    "CU": "North America",
    "DO": "North America",
    "HT": "North America",
    "JM": "North America",
    "TT": "North America",

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

    "GB": "Europe",
    "IE": "Europe",
    "IS": "Europe",
    "NO": "Europe",
    "SE": "Europe",
    "FI": "Europe",
    "DK": "Europe",
    "EE": "Europe",
    "LV": "Europe",
    "LT": "Europe",
    "DE": "Europe",
    "FR": "Europe",
    "NL": "Europe",
    "BE": "Europe",
    "LU": "Europe",
    "CH": "Europe",
    "AT": "Europe",
    "LI": "Europe",
    "MC": "Europe",
    "ES": "Europe",
    "PT": "Europe",
    "IT": "Europe",
    "GR": "Europe",
    "MT": "Europe",
    "CY": "Europe",
    "SI": "Europe",
    "HR": "Europe",
    "BA": "Europe",
    "RS": "Europe",
    "ME": "Europe",
    "MK": "Europe",
    "AL": "Europe",
    "AD": "Europe",
    "SM": "Europe",
    "VA": "Europe",
    "PL": "Europe",
    "CZ": "Europe",
    "SK": "Europe",
    "HU": "Europe",
    "RO": "Europe",
    "BG": "Europe",
    "MD": "Europe",
    "UA": "Europe",
    "BY": "Europe",
    "RU": "Europe",

    "TR": "Asia",
    "GE": "Asia",
    "AM": "Asia",
    "AZ": "Asia",
    "IR": "Asia",
    "IQ": "Asia",
    "SY": "Asia",
    "LB": "Asia",
    "IL": "Asia",
    "JO": "Asia",
    "SA": "Asia",
    "YE": "Asia",
    "OM": "Asia",
    "AE": "Asia",
    "QA": "Asia",
    "BH": "Asia",
    "KW": "Asia",
    "KZ": "Asia",
    "UZ": "Asia",
    "TM": "Asia",
    "KG": "Asia",
    "TJ": "Asia",
    "IN": "Asia",
    "PK": "Asia",
    "BD": "Asia",
    "LK": "Asia",
    "NP": "Asia",
    "BT": "Asia",
    "MV": "Asia",
    "AF": "Asia",
    "CN": "Asia",
    "HK": "Asia",
    "MO": "Asia",
    "TW": "Asia",
    "JP": "Asia",
    "KR": "Asia",
    "KP": "Asia",
    "MN": "Asia",
    "MM": "Asia",
    "TH": "Asia",
    "LA": "Asia",
    "KH": "Asia",
    "VN": "Asia",
    "MY": "Asia",
    "SG": "Asia",
    "ID": "Asia",
    "PH": "Asia",
    "BN": "Asia",
    "TL": "Asia",

    "AU": "Oceania",
    "NZ": "Oceania",
    "FJ": "Oceania",
    "PG": "Oceania",
    "SB": "Oceania",
    "VU": "Oceania",
    "WS": "Oceania",
    "TO": "Oceania",
    "KI": "Oceania",
    "FM": "Oceania",
    "MH": "Oceania",
    "PW": "Oceania",

    "MA": "Africa",
    "DZ": "Africa",
    "TN": "Africa",
    "LY": "Africa",
    "EG": "Africa",
    "SD": "Africa",
    "SS": "Africa",
    "ZA": "Africa",
    "NA": "Africa",
    "BW": "Africa",
    "LS": "Africa",
    "SZ": "Africa",
    "NG": "Africa",
    "GH": "Africa",
    "SN": "Africa",
    "CI": "Africa",
    "ML": "Africa",
    "NE": "Africa",
    "BF": "Africa",
    "GM": "Africa",
    "GN": "Africa",
    "GW": "Africa",
    "LR": "Africa",
    "SL": "Africa",
    "TG": "Africa",
    "BJ": "Africa",
    "CV": "Africa",
    "KE": "Africa",
    "ET": "Africa",
    "TZ": "Africa",
    "UG": "Africa",
    "RW": "Africa",
    "BI": "Africa",
    "SO": "Africa",
    "DJ": "Africa",
    "ER": "Africa",
    "MZ": "Africa",
    "MG": "Africa",
    "MU": "Africa",
    "SC": "Africa",
    "ZM": "Africa",
    "ZW": "Africa",
    "MW": "Africa",
    "AO": "Africa",
    "CM": "Africa",
    "CF": "Africa",
    "TD": "Africa",
    "CG": "Africa",
    "CD": "Africa",
    "GQ": "Africa",
    "GA": "Africa",
}


REGION_TO_CONTINENT = {
    "Northern America": "North America",
    "Central America": "North America",
    "Caribbean": "North America",
    "South America": "South America",
    "Western Europe": "Europe",
    "Eastern Europe": "Europe",
    "Northern Europe": "Europe",
    "Southern Europe": "Europe",
    "Western Asia": "Asia",
    "Central Asia": "Asia",
    "South Asia": "Asia",
    "Eastern Asia": "Asia",
    "South-Eastern Asia": "Asia",
    "Northern Africa": "Africa",
    "Western Africa": "Africa",
    "Eastern Africa": "Africa",
    "Middle Africa": "Africa",
    "Southern Africa": "Africa",
    "Australia and New Zealand": "Oceania",
    "Melanesia": "Oceania",
    "Micronesia": "Oceania",
    "Polynesia": "Oceania",
    "Onion Routing": "Overlay Network",
    "Garlic Routing": "Overlay Network",
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


def normalize_continent(value: Any) -> str:
    text = clean(value)

    if not text:
        return ""

    key = text.lower().replace("_", " ").replace("-", " ")

    return CONTINENT_ALIASES.get(key, text)


def continent_metadata(row: dict[str, Any]) -> dict[str, Any]:
    raw_continent = ""

    for key in (
        "continent",
        "continent_name",
        "geo_continent",
        "world_continent",
    ):
        raw_continent = clean(row.get(key))

        if raw_continent:
            break

    geo = row.get("geo") if isinstance(row.get("geo"), dict) else {}

    if not raw_continent:
        for key in (
            "continent",
            "continent_name",
            "continent_code",
        ):
            raw_continent = clean(geo.get(key))

            if raw_continent:
                break

    normalized = normalize_continent(raw_continent)

    region = clean(row.get("region")) or clean(row.get("region_data", {}).get("region"))
    code = country_code(row)

    source = "explicit" if raw_continent else "fallback"

    if not normalized and region in REGION_TO_CONTINENT:
        normalized = REGION_TO_CONTINENT[region]
        source = "region-map"

    if not normalized and code in COUNTRY_TO_CONTINENT:
        normalized = COUNTRY_TO_CONTINENT[code]
        source = "country-map"

    if not normalized and (row.get("is_tor") or row.get("tor", {}).get("is_tor")):
        normalized = "Overlay Network"
        source = "tor"

    if not normalized and (row.get("is_i2p") or row.get("i2p", {}).get("is_i2p")):
        normalized = "Overlay Network"
        source = "i2p"

    return {
        "continent": normalized or "Unknown",
        "continent_source": source,
        "region": region,
        "country_code": code,
    }


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    for node in nodes:
        meta = continent_metadata(node)

        node["continent_data"] = meta
        node["continent"] = meta["continent"]

        node.setdefault("enrichment", {})
        node["enrichment"]["continent"] = {
            "status": "ok",
            "updated_at": utc_now(),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}

    for node in nodes:
        continent = (
            clean(node.get("continent")) or
            clean(node.get("continent_data", {}).get("continent")) or
            "Unknown"
        )

        counts[continent] = counts.get(continent, 0) + 1

    top_continent = max(
        counts.items(),
        key=lambda item: item[1],
        default=("Unknown", 0),
    )

    return {
        "schema": "zzx-bitnodes-continent-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "continent_count": len(counts),
        "continents": counts,
        "top_continent": {
            "continent": top_continent[0],
            "count": top_continent[1],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with continent metadata."
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
        payload["metadata"]["continent_enriched_at"] = utc_now()
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"continent enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
