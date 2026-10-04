#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


APP_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GEO_ROOT = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo"
DEFAULT_TERRITORY_DIR = DEFAULT_GEO_ROOT / "territories"

SCHEMA = "zzx-bitnodes-territory-v4"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}


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
        ) + "\n",
        encoding="utf-8",
    )


def clean(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    return "" if text.lower() in UNKNOWN_VALUES else text


def normalize_key(value: Any) -> str:
    return clean(value).lower().replace("_", " ").replace("-", " ").strip()


def normalize_code(value: Any) -> str:
    text = clean(value).upper()
    if "-" in text:
        text = text.rsplit("-", 1)[-1]
    return text.strip()


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    current: Any = row
    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def first(row: Mapping[str, Any], keys: tuple[str, ...]) -> str:
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
    return str(value or "").strip().lower() in {"true", "yes", "y", "ok", "1", "on"}


def country_code(row: Mapping[str, Any]) -> str:
    keys = (
        "country_code", "country", "cc", "iso_country", "iso_country_code",
        "country_data.country_code", "geo.country_code", "geo.country",
        "geo.iso_code", "geo.iso_country", "geo.iso_country_code",
        "geoip.country_code", "geoip.country", "geoip_data.country_code",
        "geoip_data.country", "location.country_code", "location.country",
        "geoloc.country_code", "geoloc.country", "metadata.country_code",
        "metadata.country", "metadata.geoip.country_code", "metadata.geoloc.country_code",
    )

    for key in keys:
        value = normalize_code(deep_get(row, key) if "." in key else row.get(key))
        if len(value) == 2:
            return value

    if boolish(row.get("is_tor")) or boolish(row.get("suspected_tor")) or boolish(deep_get(row, "tor.is_tor")) or clean(row.get("network") or deep_get(row, "metadata.network")).lower() == "tor":
        return "TOR"

    if boolish(row.get("is_i2p")) or boolish(row.get("suspected_i2p")) or boolish(deep_get(row, "i2p.is_i2p")) or clean(row.get("network") or deep_get(row, "metadata.network")).lower() == "i2p":
        return "I2P"

    return ""


def raw_territory_code(row: Mapping[str, Any]) -> str:
    return normalize_code(first(row, (
        "territory_code", "state_code", "subdivision_code", "province_code",
        "region_code", "admin1_code", "admin_code", "admin1",
        "geo.territory_code", "geo.state_code", "geo.subdivision_code",
        "geo.province_code", "geo.region_code", "geo.admin1_code",
        "geo.admin_code", "geo.admin1", "geoip.territory_code",
        "geoip.state_code", "geoip.subdivision_code", "geoip.province_code",
        "geoip.region_code", "geoip_data.territory_code", "geoip_data.state_code",
        "location.territory_code", "location.state_code", "location.subdivision_code",
        "geoloc.territory_code", "metadata.territory_code", "metadata.state_code",
        "metadata.subdivision_code",
    )))


def raw_territory_name(row: Mapping[str, Any]) -> str:
    return first(row, (
        "territory", "territory_name", "state", "state_name", "subdivision",
        "subdivision_name", "province", "province_name", "admin1_name", "admin1",
        "geo.territory", "geo.territory_name", "geo.state", "geo.state_name",
        "geo.subdivision", "geo.subdivision_name", "geo.province", "geo.province_name",
        "geo.admin1_name", "geo.admin1", "geoip.territory", "geoip.territory_name",
        "geoip.state", "geoip.state_name", "geoip.subdivision", "geoip.subdivision_name",
        "geoip_data.territory", "geoip_data.state", "location.territory",
        "location.state", "location.subdivision", "geoloc.territory",
        "metadata.territory", "metadata.state", "metadata.subdivision",
    ))


def load_territory_index(country: str, territory_dir: Path) -> dict[str, Any]:
    if not country:
        return {}

    for path in (territory_dir / f"{country.upper()}.json", territory_dir / f"{country.lower()}.json"):
        data = read_json(path, fallback={})
        if isinstance(data, dict) and data:
            return data

    return {}


def build_lookup(index: Mapping[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    by_code: dict[str, str] = {}
    by_name: dict[str, str] = {}

    subdivisions = index.get("subdivisions", {})

    if isinstance(subdivisions, Mapping):
        for code, name in subdivisions.items():
            n_code = normalize_code(code)
            n_name = clean(name)
            if n_code and n_name:
                by_code[n_code] = n_name
                by_name[normalize_key(n_name)] = n_code

    if isinstance(subdivisions, list):
        for item in subdivisions:
            if not isinstance(item, Mapping):
                continue

            code = normalize_code(item.get("code") or item.get("subdivision_code") or item.get("admin1_code") or item.get("id"))
            name = clean(item.get("name") or item.get("subdivision_name") or item.get("admin1_name") or item.get("label"))

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
    if isinstance(aliases, Mapping):
        for alias, code in aliases.items():
            alias_key = normalize_key(alias)
            n_code = normalize_code(code)
            if alias_key and n_code:
                by_name[alias_key] = n_code

    return by_code, by_name


def resolve_territory(row: Mapping[str, Any], territory_dir: Path) -> dict[str, Any]:
    country = country_code(row)
    code = raw_territory_code(row)
    name = raw_territory_name(row)

    if country == "TOR":
        return {
            "schema": SCHEMA, "territory": "Onion Routing", "territory_code": "TOR",
            "country_code": "TOR", "country_name": "Tor",
            "subdivision_label": "overlay-network", "territory_source": "tor-overlay",
            "territory_confidence": "high", "is_overlay_territory": True,
            "is_unknown_territory": False, "updated_at": utc_now(),
        }

    if country == "I2P":
        return {
            "schema": SCHEMA, "territory": "Garlic Routing", "territory_code": "I2P",
            "country_code": "I2P", "country_name": "I2P",
            "subdivision_label": "overlay-network", "territory_source": "i2p-overlay",
            "territory_confidence": "high", "is_overlay_territory": True,
            "is_unknown_territory": False, "updated_at": utc_now(),
        }

    index = load_territory_index(country, territory_dir)
    by_code, by_name = build_lookup(index)

    subdivision_label = clean(index.get("subdivision_label")) or clean(index.get("subdivision_type")) or "territory"
    country_name = clean(index.get("country_name")) or country or "Unknown"

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

    if not resolved_name:
        resolved_name = "Unknown"

    if not resolved_code:
        resolved_code = "Unknown"

    return {
        "schema": SCHEMA,
        "territory": resolved_name,
        "territory_name": resolved_name,
        "territory_code": resolved_code,
        "admin1": resolved_name,
        "admin1_code": resolved_code,
        "country_code": country or "Unknown",
        "country_name": country_name,
        "subdivision_label": subdivision_label,
        "territory_source": source,
        "territory_confidence": confidence,
        "is_overlay_territory": False,
        "is_unknown_territory": resolved_name == "Unknown",
        "updated_at": utc_now(),
    }


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)
    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block
    return block


def enrich_node(node: MutableMapping[str, Any], territory_dir: Path) -> MutableMapping[str, Any]:
    meta = resolve_territory(node, territory_dir)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["territory_data"] = meta
    metadata["territory_data"] = meta

    for key in ("territory", "territory_name", "territory_code", "admin1", "admin1_code"):
        node[key] = meta[key]
        metadata[key] = meta[key]

    enrichment["territory"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": meta["updated_at"],
        "territory_dir": str(territory_dir),
        "territory_source": meta["territory_source"],
        "territory_confidence": meta["territory_confidence"],
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    context = context or {}
    territory_dir = Path(
        context.get("territory_dir")
        or context.get("territories_dir")
        or context.get("geo_territory_dir")
        or DEFAULT_TERRITORY_DIR
    )

    if isinstance(nodes, list):
        return [enrich_node(dict(node), territory_dir) if isinstance(node, Mapping) else node for node in nodes]

    if isinstance(nodes, Mapping):
        return {key: enrich_node(dict(value), territory_dir) if isinstance(value, Mapping) else value for key, value in nodes.items()}

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
                output.append({
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
                })
        return output

    for key in ("results", "data", "rows", "peers", "node_records", "reachable_nodes"):
        value = payload.get(key)
        if isinstance(value, list):
            return [dict(node) for node in value if isinstance(node, Mapping)]
        if isinstance(value, Mapping):
            return extract_nodes({"nodes": value})

    return []


def put_nodes(payload: Any, nodes: list[dict[str, Any]], context: dict[str, Any] | None = None) -> Any:
    context = context or {}

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
        output["metadata"]["territory_enriched_at"] = utc_now()
        output["metadata"]["territory_schema"] = SCHEMA
        output["metadata"]["territory_dir"] = str(
            context.get("territory_dir") if context else DEFAULT_TERRITORY_DIR
        )

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)
    if not nodes:
        return payload
    return put_nodes(payload, enrich_nodes(nodes, context), context)


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    countries: dict[str, int] = {}
    sources: dict[str, int] = {}
    confidence: dict[str, int] = {}

    for node in nodes:
        data = node.get("territory_data", {})
        if not isinstance(data, Mapping):
            data = {}

        territory = clean(node.get("territory")) or clean(data.get("territory")) or "Unknown"
        country = clean(node.get("country_code")) or clean(data.get("country_code")) or "Unknown"
        source = clean(data.get("territory_source")) or "unknown"
        conf = clean(data.get("territory_confidence")) or "none"

        counts[territory] = counts.get(territory, 0) + 1
        countries[country] = countries.get(country, 0) + 1
        sources[source] = sources.get(source, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1

    top_territory = max(counts.items(), key=lambda item: item[1], default=("Unknown", 0))

    return {
        "schema": "zzx-bitnodes-territory-summary-v4",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "territory_count": len(counts),
        "country_count": len(countries),
        "territories": dict(sorted(counts.items(), key=lambda item: (-item[1], item[0]))),
        "countries": dict(sorted(countries.items(), key=lambda item: (-item[1], item[0]))),
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))),
        "confidence": dict(sorted(confidence.items(), key=lambda item: (-item[1], item[0]))),
        "top_territory": {
            "territory": top_territory[0],
            "count": top_territory[1],
        },
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with globally indexed state/province/territory/admin1 metadata.",
        allow_abbrev=False,
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--territory-dir", default=str(DEFAULT_TERRITORY_DIR))
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload, {"territory_dir": args.territory_dir})

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"territory enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
