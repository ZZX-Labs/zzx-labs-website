#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-region-v2"

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
    "onion": "Onion Routing",
    "onion routing": "Onion Routing",
    "i2p": "Garlic Routing",
    "garlic": "Garlic Routing",
    "garlic routing": "Garlic Routing",
}


COUNTRY_NAME_TO_CODE = {
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    "USA": "US",
    "CANADA": "CA",
    "MEXICO": "MX",
    "UNITED KINGDOM": "GB",
    "GREAT BRITAIN": "GB",
    "BRITAIN": "GB",
    "ENGLAND": "GB",
    "GERMANY": "DE",
    "FRANCE": "FR",
    "NETHERLANDS": "NL",
    "BELGIUM": "BE",
    "SWITZERLAND": "CH",
    "AUSTRIA": "AT",
    "SPAIN": "ES",
    "PORTUGAL": "PT",
    "ITALY": "IT",
    "GREECE": "GR",
    "POLAND": "PL",
    "CZECHIA": "CZ",
    "CZECH REPUBLIC": "CZ",
    "SLOVAKIA": "SK",
    "HUNGARY": "HU",
    "ROMANIA": "RO",
    "BULGARIA": "BG",
    "UKRAINE": "UA",
    "BELARUS": "BY",
    "RUSSIA": "RU",
    "RUSSIAN FEDERATION": "RU",
    "TURKEY": "TR",
    "TÜRKIYE": "TR",
    "INDIA": "IN",
    "PAKISTAN": "PK",
    "BANGLADESH": "BD",
    "SRI LANKA": "LK",
    "NEPAL": "NP",
    "CHINA": "CN",
    "HONG KONG": "HK",
    "MACAU": "MO",
    "TAIWAN": "TW",
    "JAPAN": "JP",
    "SOUTH KOREA": "KR",
    "KOREA, REPUBLIC OF": "KR",
    "NORTH KOREA": "KP",
    "KOREA, DEMOCRATIC PEOPLE'S REPUBLIC OF": "KP",
    "AUSTRALIA": "AU",
    "NEW ZEALAND": "NZ",
    "BRAZIL": "BR",
    "ARGENTINA": "AR",
    "CHILE": "CL",
    "COLOMBIA": "CO",
    "PERU": "PE",
    "VENEZUELA": "VE",
    "SOUTH AFRICA": "ZA",
    "NIGERIA": "NG",
    "KENYA": "KE",
    "EGYPT": "EG",
    "MOROCCO": "MA",
    "IRAN": "IR",
    "IRAQ": "IQ",
    "SYRIA": "SY",
    "ISRAEL": "IL",
    "SAUDI ARABIA": "SA",
    "UNITED ARAB EMIRATES": "AE",
    "UAE": "AE",
    "OMAN": "OM",
    "QATAR": "QA",
    "BAHRAIN": "BH",
    "KUWAIT": "KW",
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

    "TOR": "Onion Routing",
    "I2P": "Garlic Routing",
}


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
    text = str(value or "").strip()

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


def normalize_country_code(value: Any) -> str:
    text = clean(value).upper()

    if len(text) == 2:
        return text

    if text in {"TOR", "I2P"}:
        return text

    return COUNTRY_NAME_TO_CODE.get(text, "")


def country_code(row: Mapping[str, Any]) -> str:
    keys = (
        "country_code",
        "country",
        "cc",
        "iso_country",
        "iso_country_code",
        "geo.country_code",
        "geo.country",
        "geo.iso_code",
        "geoip.country_code",
        "geoip.country",
        "geoip.country_name",
        "geoip_data.country_code",
        "geoip_data.country",
        "geoip_data.country_name",
        "country_data.country_code",
        "country_data.cc",
        "country_data.iso_country",
        "country_data.iso_country_code",
        "location.country_code",
        "location.country",
        "metadata.country_code",
        "metadata.country",
    )

    for key in keys:
        code = normalize_country_code(deep_get(row, key))

        if code:
            return code

    if (
        boolish(row.get("is_tor"))
        or boolish(row.get("tor"))
        or boolish(deep_get(row, "tor.is_tor"))
        or boolish(deep_get(row, "metadata.is_tor"))
        or boolish(deep_get(row, "metadata.tor"))
    ):
        return "TOR"

    if (
        boolish(row.get("is_i2p"))
        or boolish(row.get("i2p"))
        or boolish(deep_get(row, "i2p.is_i2p"))
        or boolish(deep_get(row, "metadata.is_i2p"))
        or boolish(deep_get(row, "metadata.i2p"))
    ):
        return "I2P"

    network = clean(row.get("network") or deep_get(row, "metadata.network")).lower()

    if network == "tor":
        return "TOR"

    if network == "i2p":
        return "I2P"

    return ""


def normalize_region(value: Any) -> str:
    text = clean(value)

    if not text:
        return ""

    key = text.lower().replace("_", " ").replace("-", " ")

    while "  " in key:
        key = key.replace("  ", " ")

    return REGION_ALIASES.get(key, text)


def explicit_region(row: Mapping[str, Any]) -> str:
    keys = (
        "region",
        "subregion",
        "world_region",
        "geo_region",
        "continent_region",
        "geo.region",
        "geo.subregion",
        "geo.world_region",
        "geoip.region",
        "geoip.subregion",
        "geoip.world_region",
        "geoip_data.region",
        "geoip_data.subregion",
        "location.region",
        "metadata.region",
        "metadata.subregion",
    )

    for key in keys:
        region = normalize_region(deep_get(row, key))

        if region:
            return region

    return ""


def region_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    raw_region = explicit_region(row)
    normalized = normalize_region(raw_region)
    code = country_code(row)

    source = "explicit" if raw_region else "fallback"

    if not normalized and code in COUNTRY_TO_REGION:
        normalized = COUNTRY_TO_REGION[code]
        source = "country-map"

    if not normalized and code == "TOR":
        normalized = "Onion Routing"
        source = "overlay"

    if not normalized and code == "I2P":
        normalized = "Garlic Routing"
        source = "overlay"

    if not normalized:
        normalized = "Unknown"

    return {
        "schema": SCHEMA,
        "region": normalized,
        "region_source": source,
        "country_code": code,
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = region_metadata(node)

    node["region_data"] = meta
    node["region"] = meta["region"]

    node.setdefault("enrichment", {})
    node["enrichment"]["region"] = {
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
        payload["metadata"]["region_enriched_at"] = utc_now()

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
    source_counts: dict[str, int] = {}

    for node in nodes:
        data = node.get("region_data", {})

        if not isinstance(data, Mapping):
            data = {}

        region = clean(data.get("region")) or clean(node.get("region")) or "Unknown"
        source = clean(data.get("region_source")) or "unknown"

        counts[region] = counts.get(region, 0) + 1
        source_counts[source] = source_counts.get(source, 0) + 1

    top_region = max(
        counts.items(),
        key=lambda item: item[1],
        default=("Unknown", 0),
    )

    return {
        "schema": "zzx-bitnodes-region-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "region_count": len(counts),
        "regions": dict(sorted(counts.items(), key=lambda item: (-item[1], item[0]))),
        "region_sources": dict(sorted(source_counts.items(), key=lambda item: (-item[1], item[0]))),
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
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload)

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"region enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
