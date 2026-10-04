#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


APP_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GEO_ROOT = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo"
DEFAULT_ZIP_DIR = DEFAULT_GEO_ROOT / "postal"

SCHEMA = "zzx-bitnodes-zip-v3"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}

POSTAL_FIELD_KEYS = (
    "zip",
    "zip_code",
    "zipcode",
    "postal",
    "postal_code",
    "postcode",
    "post_code",
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

    text = json.dumps(
        payload,
        ensure_ascii=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
        sort_keys=not compact,
        default=str,
    )

    path.write_text(text + "\n", encoding="utf-8")


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return re.sub(r"\s+", " ", text)


def normalize_code(value: Any) -> str:
    return clean(value).upper()


def normalize_postal(value: Any) -> str:
    text = clean(value).upper()

    if not text:
        return ""

    return re.sub(r"[^A-Z0-9\- ]+", "", text).strip()


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if not math.isfinite(n):
        return fallback

    return n


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
    for key in (
        "country_code",
        "country",
        "cc",
        "iso_country",
        "iso_country_code",
        "country_data.country_code",
        "geo.country_code",
        "geo.country",
        "geo.iso_code",
        "geoip.country_code",
        "geoip.country",
        "geoip_data.country_code",
        "geoip_data.country",
        "location.country_code",
        "location.country",
        "geoloc.country_code",
        "geoloc.country",
        "metadata.country_code",
        "metadata.country",
        "metadata.geoip.country_code",
        "metadata.geoloc.country_code",
    ):
        value = normalize_code(deep_get(row, key) if "." in key else row.get(key))

        if len(value) == 2:
            return value

        if value in {"TOR", "I2P"}:
            return value

    network = clean(row.get("network") or deep_get(row, "metadata.network")).lower()

    if (
        boolish(row.get("is_tor"))
        or boolish(row.get("suspected_tor"))
        or boolish(deep_get(row, "tor.is_tor"))
        or boolish(deep_get(row, "metadata.is_tor"))
        or boolish(deep_get(row, "metadata.tor.is_tor"))
        or network == "tor"
    ):
        return "TOR"

    if (
        boolish(row.get("is_i2p"))
        or boolish(row.get("suspected_i2p"))
        or boolish(deep_get(row, "i2p.is_i2p"))
        or boolish(deep_get(row, "metadata.is_i2p"))
        or boolish(deep_get(row, "metadata.i2p.is_i2p"))
        or network == "i2p"
    ):
        return "I2P"

    return ""


def admin1_code(row: Mapping[str, Any]) -> str:
    return normalize_code(first(row, (
        "admin1_code",
        "territory_code",
        "state_code",
        "subdivision_code",
        "province_code",
        "region_code",
        "territory_data.admin1_code",
        "territory_data.territory_code",
        "geo.admin1_code",
        "geo.territory_code",
        "geo.state_code",
        "geo.subdivision_code",
        "geoip.admin1_code",
        "geoip.territory_code",
        "geoip.state_code",
        "geoip_data.admin1_code",
        "geoip_data.state_code",
        "location.admin1_code",
        "location.state_code",
        "geoloc.admin1_code",
        "metadata.admin1_code",
        "metadata.state_code",
        "metadata.territory_code",
    )))


def admin2_code(row: Mapping[str, Any]) -> str:
    return normalize_code(first(row, (
        "admin2_code",
        "county_code",
        "district_code",
        "municipality_code",
        "parish_code",
        "county_data.admin2_code",
        "county_data.county_code",
        "geo.admin2_code",
        "geo.county_code",
        "geo.district_code",
        "geoip.admin2_code",
        "geoip.county_code",
        "geoip.district_code",
        "geoip_data.admin2_code",
        "geoip_data.county_code",
        "location.admin2_code",
        "location.county_code",
        "geoloc.admin2_code",
        "metadata.admin2_code",
        "metadata.county_code",
    )))


def raw_postal_code(row: Mapping[str, Any]) -> str:
    nested_keys = tuple(
        f"{prefix}.{key}"
        for prefix in ("geo", "geoip", "geoip_data", "geoloc", "location", "metadata", "postal_data", "zip_data")
        for key in POSTAL_FIELD_KEYS
    )

    return normalize_postal(first(row, POSTAL_FIELD_KEYS + nested_keys))


def raw_place_name(row: Mapping[str, Any]) -> str:
    return first(row, (
        "city",
        "city_name",
        "town",
        "town_name",
        "village",
        "village_name",
        "locality",
        "place",
        "place_name",
        "city_data.city",
        "city_data.city_ascii",
        "city_data.name",
        "city_data.place_name",
        "postal_data.place_name",
        "zip_data.place_name",
        "geo.city",
        "geo.city_name",
        "geo.town",
        "geo.village",
        "geo.locality",
        "geo.place",
        "geo.place_name",
        "geoip.city",
        "geoip.city_name",
        "geoip_data.city",
        "location.city",
        "location.locality",
        "metadata.city",
        "metadata.locality",
    ))


def row_lat_lon(row: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(
        row.get("latitude")
        or row.get("lat")
        or deep_get(row, "geoloc.latitude")
        or deep_get(row, "city_data.latitude")
        or deep_get(row, "postal_data.latitude")
        or deep_get(row, "zip_data.latitude")
        or deep_get(row, "geo.latitude")
        or deep_get(row, "geo.lat")
        or deep_get(row, "geoip.latitude")
        or deep_get(row, "geoip.lat")
        or deep_get(row, "geoip_data.latitude")
        or deep_get(row, "location.latitude")
        or deep_get(row, "metadata.latitude")
    )

    lon = number(
        row.get("longitude")
        or row.get("lon")
        or row.get("lng")
        or deep_get(row, "geoloc.longitude")
        or deep_get(row, "city_data.longitude")
        or deep_get(row, "postal_data.longitude")
        or deep_get(row, "zip_data.longitude")
        or deep_get(row, "geo.longitude")
        or deep_get(row, "geo.lon")
        or deep_get(row, "geo.lng")
        or deep_get(row, "geoip.longitude")
        or deep_get(row, "geoip.lon")
        or deep_get(row, "geoip_data.longitude")
        or deep_get(row, "location.longitude")
        or deep_get(row, "metadata.longitude")
    )

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def load_postal_index(country: str, zip_dir: Path) -> dict[str, Any]:
    if not country:
        return {}

    candidates = [
        zip_dir / f"{country.upper()}.json",
        zip_dir / f"{country.lower()}.json",
        zip_dir / country.upper() / "postal.json",
        zip_dir / country.lower() / "postal.json",
        zip_dir / country.upper() / "zip.json",
        zip_dir / country.lower() / "zip.json",
    ]

    for path in candidates:
        data = read_json(path, fallback={})

        if isinstance(data, dict) and data:
            return data

    return {}


def postal_rows(index: Mapping[str, Any]) -> list[dict[str, Any]]:
    for key in ("postal_codes", "postcodes", "zip_codes", "zips", "rows", "data"):
        rows = index.get(key)

        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]

    return []


def build_postal_lookup(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}

    for row in rows:
        postal = normalize_postal(
            row.get("postal_code")
            or row.get("zip")
            or row.get("zipcode")
            or row.get("postcode")
            or row.get("code")
        )

        if postal and postal not in lookup:
            lookup[postal] = row

    return lookup


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0088

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(delta_lambda / 2) ** 2
    )

    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearest_postal(rows: list[dict[str, Any]], lat: float, lon: float) -> tuple[dict[str, Any] | None, float | None]:
    best: dict[str, Any] | None = None
    best_distance: float | None = None

    for row in rows:
        row_lat = number(row.get("latitude") or row.get("lat"))
        row_lon = number(row.get("longitude") or row.get("lon") or row.get("lng"))

        if row_lat is None or row_lon is None:
            continue

        distance = haversine_km(lat, lon, row_lat, row_lon)

        if best_distance is None or distance < best_distance:
            best = row
            best_distance = distance

    return best, best_distance


def postal_payload(
    row: Mapping[str, Any],
    *,
    source: str,
    confidence: str,
    distance_km: float | None = None,
) -> dict[str, Any]:
    postal = normalize_postal(
        row.get("postal_code")
        or row.get("zip")
        or row.get("zipcode")
        or row.get("postcode")
        or row.get("code")
    )

    return {
        "schema": SCHEMA,
        "postal_code": postal or "Unknown",
        "zip": postal or "Unknown",
        "zipcode": postal or "Unknown",
        "postcode": postal or "Unknown",
        "place_name": clean(row.get("place_name") or row.get("city") or row.get("name")),
        "country_code": normalize_code(row.get("country_code")) or "Unknown",
        "admin1_code": normalize_code(row.get("admin1_code")) or "Unknown",
        "admin2_code": normalize_code(row.get("admin2_code")) or "Unknown",
        "admin3_code": normalize_code(row.get("admin3_code")) or "Unknown",
        "latitude": number(row.get("latitude") or row.get("lat")),
        "longitude": number(row.get("longitude") or row.get("lon") or row.get("lng")),
        "accuracy": clean(row.get("accuracy")),
        "postal_source": source,
        "postal_confidence": confidence,
        "nearest_distance_km": distance_km,
        "is_overlay": False,
        "overlay_network": "",
        "updated_at": utc_now(),
    }


def overlay_payload(network: str) -> dict[str, Any]:
    is_tor = network == "tor"

    return {
        "schema": SCHEMA,
        "postal_code": "TOR" if is_tor else "I2P",
        "zip": "TOR" if is_tor else "I2P",
        "zipcode": "TOR" if is_tor else "I2P",
        "postcode": "TOR" if is_tor else "I2P",
        "place_name": "Everywhere / Nowhere" if is_tor else "Distributed Overlay",
        "country_code": "TOR" if is_tor else "I2P",
        "admin1_code": "TOR" if is_tor else "I2P",
        "admin2_code": "TOR" if is_tor else "I2P",
        "admin3_code": "",
        "latitude": 0.0,
        "longitude": -32.0 if is_tor else 32.0,
        "accuracy": "",
        "postal_source": "tor-overlay" if is_tor else "i2p-overlay",
        "postal_confidence": "high",
        "nearest_distance_km": 0.0,
        "is_overlay": True,
        "overlay_network": network,
        "updated_at": utc_now(),
    }


def resolve_postal(row: Mapping[str, Any], zip_dir: Path) -> dict[str, Any]:
    country = country_code(row)

    if country == "TOR":
        return overlay_payload("tor")

    if country == "I2P":
        return overlay_payload("i2p")

    admin1 = admin1_code(row)
    admin2 = admin2_code(row)
    postal = raw_postal_code(row)
    place = raw_place_name(row)
    lat, lon = row_lat_lon(row)

    index = load_postal_index(country, zip_dir)
    rows = postal_rows(index)
    lookup = build_postal_lookup(rows)

    if postal:
        if postal in lookup:
            return postal_payload(
                lookup[postal],
                source="local-json-postal",
                confidence="high",
            )

        return {
            "schema": SCHEMA,
            "postal_code": postal,
            "zip": postal,
            "zipcode": postal,
            "postcode": postal,
            "place_name": place,
            "country_code": country or "Unknown",
            "admin1_code": admin1 or "Unknown",
            "admin2_code": admin2 or "Unknown",
            "admin3_code": "",
            "latitude": lat,
            "longitude": lon,
            "accuracy": "",
            "postal_source": "explicit-postal",
            "postal_confidence": "medium",
            "nearest_distance_km": None,
            "is_overlay": False,
            "overlay_network": "",
            "updated_at": utc_now(),
        }

    if lat is not None and lon is not None and rows:
        nearest, distance = nearest_postal(rows, lat, lon)

        if nearest:
            confidence = "high" if distance is not None and distance <= 15 else "medium"

            return postal_payload(
                nearest,
                source="nearest-lat-lon",
                confidence=confidence,
                distance_km=distance,
            )

    return {
        "schema": SCHEMA,
        "postal_code": "Unknown",
        "zip": "Unknown",
        "zipcode": "Unknown",
        "postcode": "Unknown",
        "place_name": place,
        "country_code": country or "Unknown",
        "admin1_code": admin1 or "Unknown",
        "admin2_code": admin2 or "Unknown",
        "admin3_code": "",
        "latitude": lat,
        "longitude": lon,
        "accuracy": "",
        "postal_source": "fallback",
        "postal_confidence": "none",
        "nearest_distance_km": None,
        "is_overlay": False,
        "overlay_network": "",
        "updated_at": utc_now(),
    }


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any], zip_dir: Path) -> MutableMapping[str, Any]:
    meta = resolve_postal(node, zip_dir)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["postal_data"] = meta
    node["zip_data"] = meta
    metadata["postal_data"] = meta
    metadata["zip_data"] = meta

    node["postal_code"] = meta["postal_code"]
    node["zip"] = meta["zip"]
    node["zipcode"] = meta["zipcode"]
    node["postcode"] = meta["postcode"]

    metadata["postal_code"] = meta["postal_code"]
    metadata["zip"] = meta["zip"]
    metadata["zipcode"] = meta["zipcode"]
    metadata["postcode"] = meta["postcode"]

    for key in ("country_code", "admin1_code", "admin2_code"):
        value = meta.get(key)
        if value and value != "Unknown":
            node.setdefault(key, value)
            metadata.setdefault(key, value)

    if meta.get("is_overlay"):
        node["is_overlay"] = True
        node["overlay_network"] = meta.get("overlay_network", "")
        metadata["is_overlay"] = True
        metadata["overlay_network"] = meta.get("overlay_network", "")

    enrichment["zip"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "zip_dir": str(zip_dir),
        "postal_source": meta["postal_source"],
        "postal_confidence": meta["postal_confidence"],
    }

    enrichment["postal"] = enrichment["zip"]

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    context = context or {}
    zip_dir = Path(
        context.get("zip_dir")
        or context.get("postal_dir")
        or context.get("postcodes_dir")
        or context.get("geo_zip_dir")
        or DEFAULT_ZIP_DIR
    )

    if isinstance(nodes, list):
        return [
            enrich_node(dict(node), zip_dir) if isinstance(node, Mapping) else node
            for node in nodes
        ]

    if isinstance(nodes, Mapping):
        return {
            key: enrich_node(dict(value), zip_dir) if isinstance(value, Mapping) else value
            for key, value in nodes.items()
        }

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
        enriched_at = utc_now()
        zip_dir = str(
            context.get("zip_dir")
            or context.get("postal_dir")
            or context.get("postcodes_dir")
            or context.get("geo_zip_dir")
            or DEFAULT_ZIP_DIR
        )

        output["metadata"]["zip_enriched_at"] = enriched_at
        output["metadata"]["postal_enriched_at"] = enriched_at
        output["metadata"]["zip_schema"] = SCHEMA
        output["metadata"]["postal_schema"] = SCHEMA
        output["metadata"]["zip_dir"] = zip_dir
        output["metadata"]["postal_dir"] = zip_dir

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

    tor_count = 0
    i2p_count = 0
    overlay_count = 0

    for node in nodes:
        postal_data = node.get("postal_data", {})

        if not isinstance(postal_data, Mapping):
            postal_data = {}

        postal = (
            clean(node.get("postal_code"))
            or clean(node.get("zip"))
            or clean(postal_data.get("postal_code"))
            or "Unknown"
        )

        country = (
            clean(node.get("country_code"))
            or clean(postal_data.get("country_code"))
            or "Unknown"
        )

        source = clean(postal_data.get("postal_source")) or "unknown"
        conf = clean(postal_data.get("postal_confidence")) or "none"
        overlay_network = clean(postal_data.get("overlay_network")) or clean(node.get("overlay_network"))

        counts[postal] = counts.get(postal, 0) + 1
        countries[country] = countries.get(country, 0) + 1
        sources[source] = sources.get(source, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1

        if boolish(postal_data.get("is_overlay")) or boolish(node.get("is_overlay")):
            overlay_count += 1

        if overlay_network == "tor" or clean(node.get("network")).lower() == "tor" or country == "TOR":
            tor_count += 1

        if overlay_network == "i2p" or clean(node.get("network")).lower() == "i2p" or country == "I2P":
            i2p_count += 1

    top_postal = max(
        counts.items(),
        key=lambda item: item[1],
        default=("Unknown", 0),
    )

    return {
        "schema": "zzx-bitnodes-zip-summary-v3",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "postal_count": len(counts),
        "country_count": len(countries),
        "overlay_postal_nodes": overlay_count,
        "tor_postal_nodes": tor_count,
        "i2p_postal_nodes": i2p_count,
        "postal_codes": dict(sorted(counts.items(), key=lambda item: (-item[1], item[0]))),
        "countries": dict(sorted(countries.items(), key=lambda item: (-item[1], item[0]))),
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))),
        "confidence": dict(sorted(confidence.items(), key=lambda item: (-item[1], item[0]))),
        "top_postal_code": {
            "postal_code": top_postal[0],
            "count": top_postal[1],
        },
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with globally indexed postal/ZIP code metadata.",
        allow_abbrev=False,
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--zip-dir", default=str(DEFAULT_ZIP_DIR))
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload, {"zip_dir": args.zip_dir})

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"zip/postal enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
