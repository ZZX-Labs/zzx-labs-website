#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-country-v3"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}

COUNTRY_NAMES = {
    "AD": "Andorra",
    "AE": "United Arab Emirates",
    "AF": "Afghanistan",
    "AG": "Antigua and Barbuda",
    "AI": "Anguilla",
    "AL": "Albania",
    "AM": "Armenia",
    "AO": "Angola",
    "AQ": "Antarctica",
    "AR": "Argentina",
    "AS": "American Samoa",
    "AT": "Austria",
    "AU": "Australia",
    "AW": "Aruba",
    "AX": "Åland Islands",
    "AZ": "Azerbaijan",
    "BA": "Bosnia and Herzegovina",
    "BB": "Barbados",
    "BD": "Bangladesh",
    "BE": "Belgium",
    "BF": "Burkina Faso",
    "BG": "Bulgaria",
    "BH": "Bahrain",
    "BI": "Burundi",
    "BJ": "Benin",
    "BL": "Saint Barthélemy",
    "BM": "Bermuda",
    "BN": "Brunei",
    "BO": "Bolivia",
    "BQ": "Caribbean Netherlands",
    "BR": "Brazil",
    "BS": "Bahamas",
    "BT": "Bhutan",
    "BV": "Bouvet Island",
    "BW": "Botswana",
    "BY": "Belarus",
    "BZ": "Belize",
    "CA": "Canada",
    "CC": "Cocos Islands",
    "CD": "Democratic Republic of the Congo",
    "CF": "Central African Republic",
    "CG": "Republic of the Congo",
    "CH": "Switzerland",
    "CI": "Côte d’Ivoire",
    "CK": "Cook Islands",
    "CL": "Chile",
    "CM": "Cameroon",
    "CN": "China",
    "CO": "Colombia",
    "CR": "Costa Rica",
    "CU": "Cuba",
    "CV": "Cabo Verde",
    "CW": "Curaçao",
    "CX": "Christmas Island",
    "CY": "Cyprus",
    "CZ": "Czechia",
    "DE": "Germany",
    "DJ": "Djibouti",
    "DK": "Denmark",
    "DM": "Dominica",
    "DO": "Dominican Republic",
    "DZ": "Algeria",
    "EC": "Ecuador",
    "EE": "Estonia",
    "EG": "Egypt",
    "EH": "Western Sahara",
    "ER": "Eritrea",
    "ES": "Spain",
    "ET": "Ethiopia",
    "FI": "Finland",
    "FJ": "Fiji",
    "FK": "Falkland Islands",
    "FM": "Micronesia",
    "FO": "Faroe Islands",
    "FR": "France",
    "GA": "Gabon",
    "GB": "United Kingdom",
    "GD": "Grenada",
    "GE": "Georgia",
    "GF": "French Guiana",
    "GG": "Guernsey",
    "GH": "Ghana",
    "GI": "Gibraltar",
    "GL": "Greenland",
    "GM": "Gambia",
    "GN": "Guinea",
    "GP": "Guadeloupe",
    "GQ": "Equatorial Guinea",
    "GR": "Greece",
    "GS": "South Georgia and the South Sandwich Islands",
    "GT": "Guatemala",
    "GU": "Guam",
    "GW": "Guinea-Bissau",
    "GY": "Guyana",
    "HK": "Hong Kong",
    "HM": "Heard Island and McDonald Islands",
    "HN": "Honduras",
    "HR": "Croatia",
    "HT": "Haiti",
    "HU": "Hungary",
    "ID": "Indonesia",
    "IE": "Ireland",
    "IL": "Israel",
    "IM": "Isle of Man",
    "IN": "India",
    "IO": "British Indian Ocean Territory",
    "IQ": "Iraq",
    "IR": "Iran",
    "IS": "Iceland",
    "IT": "Italy",
    "JE": "Jersey",
    "JM": "Jamaica",
    "JO": "Jordan",
    "JP": "Japan",
    "KE": "Kenya",
    "KG": "Kyrgyzstan",
    "KH": "Cambodia",
    "KI": "Kiribati",
    "KM": "Comoros",
    "KN": "Saint Kitts and Nevis",
    "KP": "North Korea",
    "KR": "South Korea",
    "KW": "Kuwait",
    "KY": "Cayman Islands",
    "KZ": "Kazakhstan",
    "LA": "Laos",
    "LB": "Lebanon",
    "LC": "Saint Lucia",
    "LI": "Liechtenstein",
    "LK": "Sri Lanka",
    "LR": "Liberia",
    "LS": "Lesotho",
    "LT": "Lithuania",
    "LU": "Luxembourg",
    "LV": "Latvia",
    "LY": "Libya",
    "MA": "Morocco",
    "MC": "Monaco",
    "MD": "Moldova",
    "ME": "Montenegro",
    "MF": "Saint Martin",
    "MG": "Madagascar",
    "MH": "Marshall Islands",
    "MK": "North Macedonia",
    "ML": "Mali",
    "MM": "Myanmar",
    "MN": "Mongolia",
    "MO": "Macao",
    "MP": "Northern Mariana Islands",
    "MQ": "Martinique",
    "MR": "Mauritania",
    "MS": "Montserrat",
    "MT": "Malta",
    "MU": "Mauritius",
    "MV": "Maldives",
    "MW": "Malawi",
    "MX": "Mexico",
    "MY": "Malaysia",
    "MZ": "Mozambique",
    "NA": "Namibia",
    "NC": "New Caledonia",
    "NE": "Niger",
    "NF": "Norfolk Island",
    "NG": "Nigeria",
    "NI": "Nicaragua",
    "NL": "Netherlands",
    "NO": "Norway",
    "NP": "Nepal",
    "NR": "Nauru",
    "NU": "Niue",
    "NZ": "New Zealand",
    "OM": "Oman",
    "PA": "Panama",
    "PE": "Peru",
    "PF": "French Polynesia",
    "PG": "Papua New Guinea",
    "PH": "Philippines",
    "PK": "Pakistan",
    "PL": "Poland",
    "PM": "Saint Pierre and Miquelon",
    "PN": "Pitcairn",
    "PR": "Puerto Rico",
    "PS": "Palestine",
    "PT": "Portugal",
    "PW": "Palau",
    "PY": "Paraguay",
    "QA": "Qatar",
    "RE": "Réunion",
    "RO": "Romania",
    "RS": "Serbia",
    "RU": "Russia",
    "RW": "Rwanda",
    "SA": "Saudi Arabia",
    "SB": "Solomon Islands",
    "SC": "Seychelles",
    "SD": "Sudan",
    "SE": "Sweden",
    "SG": "Singapore",
    "SH": "Saint Helena, Ascension and Tristan da Cunha",
    "SI": "Slovenia",
    "SJ": "Svalbard and Jan Mayen",
    "SK": "Slovakia",
    "SL": "Sierra Leone",
    "SM": "San Marino",
    "SN": "Senegal",
    "SO": "Somalia",
    "SR": "Suriname",
    "SS": "South Sudan",
    "ST": "São Tomé and Príncipe",
    "SV": "El Salvador",
    "SX": "Sint Maarten",
    "SY": "Syria",
    "SZ": "Eswatini",
    "TC": "Turks and Caicos Islands",
    "TD": "Chad",
    "TF": "French Southern Territories",
    "TG": "Togo",
    "TH": "Thailand",
    "TJ": "Tajikistan",
    "TK": "Tokelau",
    "TL": "Timor-Leste",
    "TM": "Turkmenistan",
    "TN": "Tunisia",
    "TO": "Tonga",
    "TR": "Türkiye",
    "TT": "Trinidad and Tobago",
    "TV": "Tuvalu",
    "TW": "Taiwan",
    "TZ": "Tanzania",
    "UA": "Ukraine",
    "UG": "Uganda",
    "UM": "United States Minor Outlying Islands",
    "US": "United States",
    "UY": "Uruguay",
    "UZ": "Uzbekistan",
    "VA": "Vatican City",
    "VC": "Saint Vincent and the Grenadines",
    "VE": "Venezuela",
    "VG": "British Virgin Islands",
    "VI": "U.S. Virgin Islands",
    "VN": "Vietnam",
    "VU": "Vanuatu",
    "WF": "Wallis and Futuna",
    "WS": "Samoa",
    "XK": "Kosovo",
    "YE": "Yemen",
    "YT": "Mayotte",
    "ZA": "South Africa",
    "ZM": "Zambia",
    "ZW": "Zimbabwe",
    "TOR": "Tor",
    "I2P": "I2P",
}

COUNTRY_NAME_TO_CODE = {value.upper(): key for key, value in COUNTRY_NAMES.items() if key not in {"TOR", "I2P"}}
COUNTRY_NAME_TO_CODE.update(
    {
        "UNITED STATES OF AMERICA": "US",
        "USA": "US",
        "U.S.A.": "US",
        "U.S.": "US",
        "AMERICA": "US",
        "UK": "GB",
        "GREAT BRITAIN": "GB",
        "BRITAIN": "GB",
        "ENGLAND": "GB",
        "SCOTLAND": "GB",
        "WALES": "GB",
        "NORTHERN IRELAND": "GB",
        "RUSSIA": "RU",
        "RUSSIAN FEDERATION": "RU",
        "KOREA, REPUBLIC OF": "KR",
        "REPUBLIC OF KOREA": "KR",
        "KOREA, DEMOCRATIC PEOPLE'S REPUBLIC OF": "KP",
        "DEMOCRATIC PEOPLE'S REPUBLIC OF KOREA": "KP",
        "NORTH KOREA": "KP",
        "SOUTH KOREA": "KR",
        "IRAN, ISLAMIC REPUBLIC OF": "IR",
        "SYRIAN ARAB REPUBLIC": "SY",
        "VENEZUELA, BOLIVARIAN REPUBLIC OF": "VE",
        "BOLIVIA, PLURINATIONAL STATE OF": "BO",
        "TANZANIA, UNITED REPUBLIC OF": "TZ",
        "VIET NAM": "VN",
        "LAO PEOPLE'S DEMOCRATIC REPUBLIC": "LA",
        "MOLDOVA, REPUBLIC OF": "MD",
        "PALESTINE, STATE OF": "PS",
        "MACAU": "MO",
        "MACAO": "MO",
        "CZECH REPUBLIC": "CZ",
        "TURKEY": "TR",
        "TÜRKIYE": "TR",
        "CAPE VERDE": "CV",
        "CABO VERDE": "CV",
        "COTE D'IVOIRE": "CI",
        "CÔTE D’IVOIRE": "CI",
        "CÔTE D'IVOIRE": "CI",
        "IVORY COAST": "CI",
        "DEMOCRATIC REPUBLIC OF CONGO": "CD",
        "DEMOCRATIC REPUBLIC OF THE CONGO": "CD",
        "CONGO, DEMOCRATIC REPUBLIC OF THE": "CD",
        "REPUBLIC OF THE CONGO": "CG",
        "CONGO": "CG",
        "UAE": "AE",
        "UNITED ARAB EMIRATES": "AE",
        "TOR": "TOR",
        "ONION": "TOR",
        "ONION ROUTING": "TOR",
        "I2P": "I2P",
        "GARLIC ROUTING": "I2P",
    }
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


def normalize_code(value: Any) -> str:
    text = clean(value).upper()

    if len(text) == 2:
        return text

    if text in {"TOR", "I2P"}:
        return text

    return COUNTRY_NAME_TO_CODE.get(text, "")


def country_code(row: Mapping[str, Any]) -> str:
    keys = (
        "country_code",
        "cc",
        "iso_country",
        "iso_country_code",
        "country",
        "country_name",
        "country_full",
        "country_full_name",
        "geo.country_code",
        "geo.country",
        "geo.country_name",
        "geo.iso_code",
        "geoip.country_code",
        "geoip.country",
        "geoip.country_name",
        "geoip_data.country_code",
        "geoip_data.country",
        "geoip_data.country_name",
        "country_data.country_code",
        "country_data.country_name",
        "location.country_code",
        "location.country",
        "location.country_name",
        "geoloc.country_code",
        "geoloc.country",
        "geoloc.country_name",
        "metadata.country_code",
        "metadata.country",
        "metadata.country_name",
        "metadata.geoip.country_code",
        "metadata.geoloc.country_code",
        "metadata.country_data.country_code",
    )

    for key in keys:
        code = normalize_code(deep_get(row, key) if "." in key else row.get(key))
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


def country_name_from_row(row: Mapping[str, Any], code: str) -> str:
    keys = (
        "country_name",
        "country_full",
        "country_full_name",
        "geo.country_name",
        "geo.country_full",
        "geo.name",
        "geoip.country_name",
        "geoip.country",
        "geoip_data.country_name",
        "geoip_data.country",
        "country_data.country_name",
        "location.country_name",
        "location.country",
        "geoloc.country_name",
        "geoloc.country",
        "metadata.country_name",
        "metadata.country",
        "metadata.geoip.country_name",
        "metadata.geoloc.country_name",
        "metadata.country_data.country_name",
    )

    for key in keys:
        value = clean(deep_get(row, key) if "." in key else row.get(key))

        if value and len(value) != 2:
            return value

    value = clean(row.get("country"))

    if value and len(value) != 2:
        return value

    return COUNTRY_NAMES.get(code, "Unknown")


def country_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    code = country_code(row)
    name = country_name_from_row(row, code)

    source = "explicit" if code and code not in {"TOR", "I2P"} else "fallback"

    if code == "TOR":
        name = "Tor"
        source = "overlay"

    if code == "I2P":
        name = "I2P"
        source = "overlay"

    if not code and name.upper() in COUNTRY_NAME_TO_CODE:
        code = COUNTRY_NAME_TO_CODE[name.upper()]
        source = "name-map"

    if not code:
        code = "Unknown"
        source = "unknown"

    if name == "Unknown" and code in COUNTRY_NAMES:
        name = COUNTRY_NAMES[code]

    return {
        "schema": SCHEMA,
        "country_code": code,
        "country": code if code not in {"Unknown", "TOR", "I2P"} else name,
        "country_name": name,
        "country_source": source,
        "is_overlay_country": code in {"TOR", "I2P"},
        "is_unknown_country": code == "Unknown",
        "updated_at": utc_now(),
    }


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = country_metadata(node)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["country_data"] = meta
    metadata["country_data"] = meta

    node["country_code"] = meta["country_code"]
    node["country_name"] = meta["country_name"]
    node["country"] = meta["country"]

    metadata["country_code"] = meta["country_code"]
    metadata["country_name"] = meta["country_name"]
    metadata["country"] = meta["country"]

    enrichment["country"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": meta["updated_at"],
        "country_code": meta["country_code"],
        "country_name": meta["country_name"],
        "country_source": meta["country_source"],
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
        output["metadata"]["country_enriched_at"] = utc_now()
        output["metadata"]["country_schema"] = SCHEMA

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
    names: dict[str, str] = {}
    source_counts: dict[str, int] = {}

    for node in nodes:
        data = node.get("country_data", {})

        if not isinstance(data, Mapping):
            data = {}

        code = clean(data.get("country_code")) or clean(node.get("country_code")) or "Unknown"
        name = clean(data.get("country_name")) or COUNTRY_NAMES.get(code, code)
        source = clean(data.get("country_source")) or clean(node.get("country_source")) or "unknown"

        counts[code] = counts.get(code, 0) + 1
        names[code] = name
        source_counts[source] = source_counts.get(source, 0) + 1

    top_country = max(counts.items(), key=lambda item: item[1], default=("Unknown", 0))

    return {
        "schema": "zzx-bitnodes-country-summary-v3",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "country_count": len(counts),
        "countries": {
            code: {
                "country_code": code,
                "country_name": names.get(code, COUNTRY_NAMES.get(code, code)),
                "count": count,
            }
            for code, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        },
        "country_sources": dict(sorted(source_counts.items(), key=lambda item: (-item[1], item[0]))),
        "top_country": {
            "country_code": top_country[0],
            "country_name": names.get(top_country[0], COUNTRY_NAMES.get(top_country[0], top_country[0])),
            "count": top_country[1],
        },
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with country metadata.",
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

    print(f"country enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
