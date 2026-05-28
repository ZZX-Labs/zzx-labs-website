#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GEO_ROOT = APP_ROOT / "tools" / "bitnodes" / "data" / "geo"
DEFAULT_TERRITORY_DIR = DEFAULT_GEO_ROOT / "territories"


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


def raw_territory_code(row: dict[str, Any]) -> str:
    code = first(
        row,
        (
            "territory_code",
            "state_code",
            "subdivision_code",
            "province_code",
            "region_code",
            "admin1_code",
            "admin_code",
            "admin1",
        ),
    )

    if code:
        return normalize_code(code)

    geo = nested_dict(row, "geo")

    code = first(
        geo,
        (
            "territory_code",
            "state_code",
            "subdivision_code",
            "province_code",
            "region_code",
            "admin1_code",
            "admin_code",
            "admin1",
        ),
    )

    return normalize_code(code)


def raw_territory_name(row: dict[str, Any]) -> str:
    name = first(
        row,
        (
            "territory",
            "territory_name",
            "state",
            "state_name",
            "subdivision",
            "subdivision_name",
            "province",
            "province_name",
            "admin1_name",
            "admin1",
        ),
    )

    if name:
        return name

    geo = nested_dict(row, "geo")

    return first(
        geo,
        (
            "territory",
            "territory_name",
            "state",
            "state_name",
            "subdivision",
            "subdivision_name",
            "province",
            "province_name",
            "admin1_name",
            "admin1",
        ),
    )


def load_territory_index(country: str, territory_dir: Path) -> dict[str, Any]:
    if not country:
        return {}

    candidates = [
        territory_dir / f"{country.upper()}.json",
        territory_dir / f"{country.lower()}.json",
    ]

    for path in candidates:
        data = read_json(path, fallback={})

        if isinstance(data, dict) and data:
            return data

    return {}


def build_lookup(index: dict[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    by_code: dict[str, str] = {}
    by_name: dict[str, str] = {}

    subdivisions = index.get("subdivisions", {})

    if isinstance(subdivisions, dict):
        for code, name in subdivisions.items():
            n_code = normalize_code(code)
            n_name = clean(name)

            if n_code and n_name:
                by_code[n_code] = n_name
                by_name[normalize_key(n_name)] = n_code

    if isinstance(subdivisions, list):
        for item in subdivisions:
            if not isinstance(item, dict):
                continue

            code = normalize_code(
                item.get("code")
                or item.get("subdivision_code")
                or item.get("admin1_code")
                or item.get("id")
            )

            name = clean(
                item.get("name")
                or item.get("subdivision_name")
                or item.get("admin1_name")
                or item.get("label")
            )

            if code and name:
                by_code[code] = name
                by_name[normalize_key(name)] = code

            aliases = item.get("aliases", [])

            if isinstance(aliases, list) and code:
                for alias in aliases:
                    alias_key = normalize_key(alias)

                    if alias_key:
                        by_name[alias_key] = code

    aliases = index.get("aliases", {})

    if isinstance(aliases, dict):
        for alias, code in aliases.items():
            alias_key = normalize_key(alias)
            n_code = normalize_code(code)

            if alias_key and n_code:
                by_name[alias_key] = n_code

    return by_code, by_name


def resolve_territory(
    row: dict[str, Any],
    territory_dir: Path,
) -> dict[str, Any]:
    country = country_code(row)
    code = raw_territory_code(row)
    name = raw_territory_name(row)

    if row.get("is_tor") or nested_dict(row, "tor").get("is_tor"):
        return {
            "territory": "Onion Routing",
            "territory_code": "TOR",
            "country_code": "TOR",
            "subdivision_label": "overlay-network",
            "territory_source": "tor-overlay",
            "territory_confidence": "high",
        }

    if row.get("is_i2p") or nested_dict(row, "i2p").get("is_i2p"):
        return {
            "territory": "Garlic Routing",
            "territory_code": "I2P",
            "country_code": "I2P",
            "subdivision_label": "overlay-network",
            "territory_source": "i2p-overlay",
            "territory_confidence": "high",
        }

    index = load_territory_index(country, territory_dir)
    by_code, by_name = build_lookup(index)

    subdivision_label = (
        clean(index.get("subdivision_label"))
        or clean(index.get("subdivision_type"))
        or "territory"
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
        "territory": resolved_name or "Unknown",
        "territory_code": resolved_code or "Unknown",
        "country_code": country or "Unknown",
        "country_name": clean(index.get("country_name")) or "Unknown",
        "subdivision_label": subdivision_label,
        "territory_source": source,
        "territory_confidence": confidence,
    }


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    context = context or {}

    territory_dir = Path(
        context.get("territory_dir")
        or context.get("territories_dir")
        or context.get("geo_territory_dir")
        or DEFAULT_TERRITORY_DIR
    )

    for node in nodes:
        meta = resolve_territory(node, territory_dir)

        node["territory_data"] = meta
        node["territory"] = meta["territory"]
        node["territory_code"] = meta["territory_code"]
        node["admin1"] = meta["territory"]
        node["admin1_code"] = meta["territory_code"]

        node.setdefault("enrichment", {})
        node["enrichment"]["territory"] = {
            "status": "ok",
            "updated_at": utc_now(),
            "territory_dir": str(territory_dir),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    countries: dict[str, int] = {}
    sources: dict[str, int] = {}

    for node in nodes:
        territory_data = nested_dict(node, "territory_data")

        territory = (
            clean(node.get("territory"))
            or clean(territory_data.get("territory"))
            or "Unknown"
        )

        country = (
            clean(node.get("country_code"))
            or clean(territory_data.get("country_code"))
            or "Unknown"
        )

        source = clean(territory_data.get("territory_source")) or "unknown"

        counts[territory] = counts.get(territory, 0) + 1
        countries[country] = countries.get(country, 0) + 1
        sources[source] = sources.get(source, 0) + 1

    top_territory = max(
        counts.items(),
        key=lambda item: item[1],
        default=("Unknown", 0),
    )

    return {
        "schema": "zzx-bitnodes-territory-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "territory_count": len(counts),
        "country_count": len(countries),
        "territories": counts,
        "countries": countries,
        "sources": sources,
        "top_territory": {
            "territory": top_territory[0],
            "count": top_territory[1],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with globally indexed state/province/territory/admin1 metadata."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument(
        "--territory-dir",
        default=str(DEFAULT_TERRITORY_DIR),
        help="Directory containing per-country territory JSON indexes.",
    )

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    enriched = enrich_nodes(
        nodes,
        {
            "territory_dir": args.territory_dir,
        },
    )

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["territory_enriched_at"] = utc_now()
        payload["metadata"]["territory_dir"] = args.territory_dir
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"territory enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
