#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-continent-v3"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}

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
    "overlay": "Overlay Network",
    "overlay network": "Overlay Network",
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
    "MACAO": "MO",
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

COUNTRY_TO_CONTINENT = {
    "US": "North America", "CA": "North America", "MX": "North America",
    "BZ": "North America", "CR": "North America", "SV": "North America",
    "GT": "North America", "HN": "North America", "NI": "North America",
    "PA": "North America", "BS": "North America", "BB": "North America",
    "CU": "North America", "DO": "North America", "HT": "North America",
    "JM": "North America", "TT": "North America",

    "AR": "South America", "BO": "South America", "BR": "South America",
    "CL": "South America", "CO": "South America", "EC": "South America",
    "FK": "South America", "GF": "South America", "GY": "South America",
    "PY": "South America", "PE": "South America", "SR": "South America",
    "UY": "South America", "VE": "South America",

    "GB": "Europe", "IE": "Europe", "IS": "Europe", "NO": "Europe",
    "SE": "Europe", "FI": "Europe", "DK": "Europe", "EE": "Europe",
    "LV": "Europe", "LT": "Europe", "DE": "Europe", "FR": "Europe",
    "NL": "Europe", "BE": "Europe", "LU": "Europe", "CH": "Europe",
    "AT": "Europe", "LI": "Europe", "MC": "Europe", "ES": "Europe",
    "PT": "Europe", "IT": "Europe", "GR": "Europe", "MT": "Europe",
    "CY": "Europe", "SI": "Europe", "HR": "Europe", "BA": "Europe",
    "RS": "Europe", "ME": "Europe", "MK": "Europe", "AL": "Europe",
    "AD": "Europe", "SM": "Europe", "VA": "Europe", "PL": "Europe",
    "CZ": "Europe", "SK": "Europe", "HU": "Europe", "RO": "Europe",
    "BG": "Europe", "MD": "Europe", "UA": "Europe", "BY": "Europe",
    "RU": "Europe",

    "TR": "Asia", "GE": "Asia", "AM": "Asia", "AZ": "Asia",
    "IR": "Asia", "IQ": "Asia", "SY": "Asia", "LB": "Asia",
    "IL": "Asia", "JO": "Asia", "SA": "Asia", "YE": "Asia",
    "OM": "Asia", "AE": "Asia", "QA": "Asia", "BH": "Asia",
    "KW": "Asia", "KZ": "Asia", "UZ": "Asia", "TM": "Asia",
    "KG": "Asia", "TJ": "Asia", "IN": "Asia", "PK": "Asia",
    "BD": "Asia", "LK": "Asia", "NP": "Asia", "BT": "Asia",
    "MV": "Asia", "AF": "Asia", "CN": "Asia", "HK": "Asia",
    "MO": "Asia", "TW": "Asia", "JP": "Asia", "KR": "Asia",
    "KP": "Asia", "MN": "Asia", "MM": "Asia", "TH": "Asia",
    "LA": "Asia", "KH": "Asia", "VN": "Asia", "MY": "Asia",
    "SG": "Asia", "ID": "Asia", "PH": "Asia", "BN": "Asia",
    "TL": "Asia",

    "AU": "Oceania", "NZ": "Oceania", "FJ": "Oceania",
    "PG": "Oceania", "SB": "Oceania", "VU": "Oceania",
    "WS": "Oceania", "TO": "Oceania", "KI": "Oceania",
    "FM": "Oceania", "MH": "Oceania", "PW": "Oceania",

    "MA": "Africa", "DZ": "Africa", "TN": "Africa", "LY": "Africa",
    "EG": "Africa", "SD": "Africa", "SS": "Africa", "ZA": "Africa",
    "NA": "Africa", "BW": "Africa", "LS": "Africa", "SZ": "Africa",
    "NG": "Africa", "GH": "Africa", "SN": "Africa", "CI": "Africa",
    "ML": "Africa", "NE": "Africa", "BF": "Africa", "GM": "Africa",
    "GN": "Africa", "GW": "Africa", "LR": "Africa", "SL": "Africa",
    "TG": "Africa", "BJ": "Africa", "CV": "Africa", "KE": "Africa",
    "ET": "Africa", "TZ": "Africa", "UG": "Africa", "RW": "Africa",
    "BI": "Africa", "SO": "Africa", "DJ": "Africa", "ER": "Africa",
    "MZ": "Africa", "MG": "Africa", "MU": "Africa", "SC": "Africa",
    "ZM": "Africa", "ZW": "Africa", "MW": "Africa", "AO": "Africa",
    "CM": "Africa", "CF": "Africa", "TD": "Africa", "CG": "Africa",
    "CD": "Africa", "GQ": "Africa", "GA": "Africa",

    "TOR": "Overlay Network",
    "I2P": "Overlay Network",
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


def first_value(row: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)
        if value not in ("", None):
            return value
    return None


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    return str(value or "").strip().lower() in {"true", "yes", "y", "ok", "1", "on"}


def normalize_country_code(value: Any) -> str:
    text = clean(value).upper()

    if len(text) == 2:
        return text

    if text in {"TOR", "I2P"}:
        return text

    return COUNTRY_NAME_TO_CODE.get(text, "")


def country_code(row: Mapping[str, Any]) -> str:
    keys = (
        "country_code", "country", "cc", "iso_country", "iso_country_code",
        "geo.country_code", "geo.country", "geo.iso_code",
        "geoip.country_code", "geoip.country", "geoip.country_name",
        "geoip_data.country_code", "geoip_data.country", "geoip_data.country_name",
        "country_data.country_code", "country_data.cc", "country_data.iso_country",
        "country_data.iso_country_code", "location.country_code", "location.country",
        "geoloc.country_code", "geoloc.country", "metadata.country_code",
        "metadata.country", "metadata.geoip.country_code", "metadata.geoloc.country_code",
    )

    for key in keys:
        code = normalize_country_code(deep_get(row, key) if "." in key else row.get(key))
        if code:
            return code

    if (
        boolish(row.get("is_tor"))
        or boolish(row.get("suspected_tor"))
        or boolish(deep_get(row, "tor.is_tor"))
        or boolish(deep_get(row, "metadata.is_tor"))
        or boolish(deep_get(row, "metadata.tor.is_tor"))
    ):
        return "TOR"

    if (
        boolish(row.get("is_i2p"))
        or boolish(row.get("suspected_i2p"))
        or boolish(deep_get(row, "i2p.is_i2p"))
        or boolish(deep_get(row, "metadata.is_i2p"))
        or boolish(deep_get(row, "metadata.i2p.is_i2p"))
    ):
        return "I2P"

    network = clean(first_value(row, "network", "metadata.network")).lower()

    if network == "tor":
        return "TOR"

    if network == "i2p":
        return "I2P"

    return ""


def normalize_continent(value: Any) -> str:
    text = clean(value)

    if not text:
        return ""

    key = text.lower().replace("_", " ").replace("-", " ")
    key = re.sub(r"\s+", " ", key).strip()

    return CONTINENT_ALIASES.get(key, text)


def normalize_region(value: Any) -> str:
    text = clean(value)

    if not text:
        return ""

    key = text.lower().replace("_", " ").replace("-", " ")
    key = re.sub(r"\s+", " ", key).strip()

    return {
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
        "onion routing": "Onion Routing",
        "i2p": "Garlic Routing",
        "garlic routing": "Garlic Routing",
    }.get(key, text)


def explicit_continent(row: Mapping[str, Any]) -> str:
    keys = (
        "continent",
        "continent_name",
        "continent_code",
        "geo_continent",
        "world_continent",
        "geo.continent",
        "geo.continent_name",
        "geo.continent_code",
        "geoip.continent",
        "geoip.continent_name",
        "geoip.continent_code",
        "geoip_data.continent",
        "geoip_data.continent_name",
        "geoip_data.continent_code",
        "location.continent",
        "location.continent_name",
        "geoloc.continent",
        "metadata.continent",
        "metadata.continent_name",
        "metadata.geoip.continent",
        "metadata.geoloc.continent",
    )

    for key in keys:
        continent = normalize_continent(deep_get(row, key) if "." in key else row.get(key))

        if continent:
            return continent

    return ""


def explicit_region(row: Mapping[str, Any]) -> str:
    keys = (
        "region",
        "region_data.region",
        "region_normalized",
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
        "geoloc.region",
        "metadata.region",
        "metadata.subregion",
        "metadata.geoip.region",
        "metadata.geoloc.region",
    )

    for key in keys:
        region = normalize_region(deep_get(row, key) if "." in key else row.get(key))

        if region:
            return region

    return ""


def continent_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    raw_continent = explicit_continent(row)
    normalized = normalize_continent(raw_continent)

    region = explicit_region(row)
    code = country_code(row)

    source = "explicit" if raw_continent else "fallback"

    if not normalized and region in REGION_TO_CONTINENT:
        normalized = REGION_TO_CONTINENT[region]
        source = "region-map"

    if not normalized and code in COUNTRY_TO_CONTINENT:
        normalized = COUNTRY_TO_CONTINENT[code]
        source = "country-map"

    if not normalized and code in {"TOR", "I2P"}:
        normalized = "Overlay Network"
        source = "overlay"

    if not normalized:
        normalized = "Unknown"
        source = "unknown"

    return {
        "schema": SCHEMA,
        "continent": normalized,
        "continent_normalized": normalized,
        "continent_source": source,
        "region": region,
        "country_code": code,
        "is_overlay_continent": normalized == "Overlay Network",
        "is_unknown_continent": normalized == "Unknown",
        "updated_at": utc_now(),
    }


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = continent_metadata(node)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["continent_data"] = meta
    metadata["continent_data"] = meta

    node["continent"] = meta["continent"]
    node["continent_normalized"] = meta["continent_normalized"]
    node["continent_source"] = meta["continent_source"]

    metadata["continent"] = meta["continent"]
    metadata["continent_normalized"] = meta["continent_normalized"]
    metadata["continent_source"] = meta["continent_source"]

    enrichment["continent"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": meta["updated_at"],
        "continent": meta["continent"],
        "continent_source": meta["continent_source"],
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
        output["metadata"]["continent_enriched_at"] = utc_now()
        output["metadata"]["continent_schema"] = SCHEMA

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context))


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    source_counts: dict[str, int] = {}

    for node in nodes:
        data = node.get("continent_data", {})

        if not isinstance(data, Mapping):
            data = {}

        continent = clean(data.get("continent")) or clean(node.get("continent")) or "Unknown"
        source = clean(data.get("continent_source")) or clean(node.get("continent_source")) or "unknown"

        counts[continent] = counts.get(continent, 0) + 1
        source_counts[source] = source_counts.get(source, 0) + 1

    top_continent = max(counts.items(), key=lambda item: item[1], default=("Unknown", 0))

    return {
        "schema": "zzx-bitnodes-continent-summary-v3",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "continent_count": len(counts),
        "continents": dict(sorted(counts.items(), key=lambda item: (-item[1], item[0]))),
        "continent_sources": dict(sorted(source_counts.items(), key=lambda item: (-item[1], item[0]))),
        "top_continent": {
            "continent": top_continent[0],
            "count": top_continent[1],
        },
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with continent metadata.",
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

    print(f"continent enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
