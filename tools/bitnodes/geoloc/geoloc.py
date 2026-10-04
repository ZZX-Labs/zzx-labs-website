#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-geoloc-v3"

UNKNOWN_VALUES = {
    "",
    "unknown",
    "none",
    "null",
    "undefined",
    "n/a",
    "na",
    "-",
    "—",
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
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return " ".join(text.split())


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if math.isnan(n) or math.isinf(n):
        return fallback

    return n


def valid_lat(value: Any) -> float | None:
    n = number(value)

    if n is not None and -90 <= n <= 90:
        return n

    return None


def valid_lon(value: Any) -> float | None:
    n = number(value)

    if n is not None and -180 <= n <= 180:
        return n

    return None


def valid_lat_lon(lat: Any, lon: Any) -> bool:
    return valid_lat(lat) is not None and valid_lon(lon) is not None


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return row.get(key)

    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None

        current = current.get(part)

    return current


def pick_first(row: Mapping[str, Any], keys: tuple[str, ...] | list[str]) -> Any:
    for key in keys:
        value = deep_get(row, key)

        if clean(value):
            return value

    return None


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def coordinate_candidates(row: Mapping[str, Any]) -> list[tuple[Any, Any, str]]:
    candidates: list[tuple[Any, Any, str]] = []

    direct_lat = pick_first(row, ("latitude", "lat", "geo_lat", "dbip_latitude"))
    direct_lon = pick_first(row, ("longitude", "lon", "lng", "geo_lon", "dbip_longitude"))
    candidates.append((direct_lat, direct_lon, "direct"))

    for prefix in (
        "zzxgms",
        "zzxgcs",
        "geo",
        "geoip",
        "geoip_data",
        "geoloc",
        "location",
        "coordinates",
        "metadata",
        "metadata.zzxgms",
        "metadata.zzxgcs",
        "metadata.geo",
        "metadata.geoip",
        "metadata.geoloc",
        "ip.geoip",
    ):
        lat = pick_first(row, (f"{prefix}.latitude", f"{prefix}.lat", f"{prefix}.geo_lat"))
        lon = pick_first(row, (f"{prefix}.longitude", f"{prefix}.lon", f"{prefix}.lng", f"{prefix}.geo_lon"))
        candidates.append((lat, lon, prefix))

    return candidates


def first_coordinate(row: Mapping[str, Any]) -> tuple[float | None, float | None, str]:
    for lat, lon, source in coordinate_candidates(row):
        if valid_lat_lon(lat, lon):
            return valid_lat(lat), valid_lon(lon), source

    return None, None, ""


def geoloc_metadata(row: Mapping[str, Any]) -> dict[str, Any]:
    chosen_lat, chosen_lon, chosen_source = first_coordinate(row)
    has_coordinates = chosen_lat is not None and chosen_lon is not None

    precision = pick_first(
        row,
        (
            "geo_precision",
            "accuracy_radius",
            "accuracy_km",
            "location_accuracy",
            "geoip.accuracy_radius",
            "geoip.accuracy_km",
            "geoip_data.accuracy_radius",
            "location.accuracy_radius",
            "metadata.accuracy_radius",
            "metadata.geoip.accuracy_radius",
        ),
    )

    continent = pick_first(
        row,
        (
            "continent",
            "geoip.continent",
            "geoip_data.continent",
            "location.continent",
            "metadata.continent",
            "metadata.geoip.continent",
        ),
    )

    country = pick_first(
        row,
        (
            "country_code",
            "country",
            "geoip.country_code",
            "geoip.country",
            "geoip_data.country_code",
            "geoip_data.country",
            "location.country_code",
            "location.country",
            "metadata.country_code",
            "metadata.country",
        ),
    )

    country_name = pick_first(
        row,
        (
            "country_name",
            "geoip.country_name",
            "geoip_data.country_name",
            "location.country_name",
            "metadata.country_name",
            "metadata.geoip.country_name",
        ),
    )

    region = pick_first(
        row,
        (
            "region",
            "state",
            "province",
            "geoip.region",
            "geoip.state",
            "geoip.province",
            "geoip_data.region",
            "location.region",
            "metadata.region",
        ),
    )

    territory = pick_first(
        row,
        (
            "territory",
            "admin1",
            "state",
            "province",
            "geoip.territory",
            "geoip.admin1",
            "geoip_data.territory",
            "location.territory",
            "metadata.territory",
        ),
    )

    county = pick_first(
        row,
        (
            "county",
            "admin2",
            "district",
            "geoip.county",
            "geoip.admin2",
            "geoip_data.county",
            "location.county",
            "metadata.county",
        ),
    )

    city = pick_first(
        row,
        (
            "city",
            "geoip.city",
            "geoip_data.city",
            "location.city",
            "metadata.city",
        ),
    )

    zip_code = pick_first(
        row,
        (
            "zip",
            "zip_code",
            "postal",
            "postal_code",
            "postcode",
            "geoip.zip",
            "geoip.postal_code",
            "geoip_data.zip",
            "geoip_data.postal_code",
            "location.zip",
            "location.postal_code",
            "metadata.zip",
            "metadata.postal_code",
        ),
    )

    timezone_name = pick_first(
        row,
        (
            "timezone",
            "tz",
            "geoip.timezone",
            "geoip_data.timezone",
            "location.timezone",
            "metadata.timezone",
        ),
    )

    geohash = pick_first(
        row,
        (
            "geohash",
            "geo.geohash",
            "geoip.geohash",
            "geoip_data.geohash",
            "location.geohash",
            "metadata.geohash",
        ),
    )

    geohashid = pick_first(
        row,
        (
            "geohashid",
            "geo.geohashid",
            "geoip.geohashid",
            "geoip_data.geohashid",
            "location.geohashid",
            "metadata.geohashid",
        ),
    )

    w3w = pick_first(
        row,
        (
            "w3w",
            "what3words",
            "geo.w3w",
            "geoip.w3w",
            "geoip_data.w3w",
            "location.w3w",
            "metadata.w3w",
            "metadata.what3words",
        ),
    )

    asn_location = pick_first(
        row,
        (
            "asn_location",
            "as_location",
            "geoip.asn_location",
            "geoip_data.asn_location",
            "metadata.asn_location",
        ),
    )

    source = pick_first(row, ("geo_source", "geolocation_source", "source", "metadata.geo_source")) or chosen_source or "crawler"

    country_out = clean(country)
    if len(country_out) == 2:
        country_out = country_out.upper()

    return {
        "schema": SCHEMA,
        "has_coordinates": has_coordinates,
        "map_ready": has_coordinates,
        "latitude": chosen_lat if has_coordinates else None,
        "longitude": chosen_lon if has_coordinates else None,
        "lat": chosen_lat if has_coordinates else None,
        "lon": chosen_lon if has_coordinates else None,
        "lng": chosen_lon if has_coordinates else None,
        "coordinate_pair": (
            f"{chosen_lat:.6f},{chosen_lon:.6f}"
            if has_coordinates and chosen_lat is not None and chosen_lon is not None
            else ""
        ),
        "coordinate_source": chosen_source or "",
        "precision": precision,
        "continent": clean(continent),
        "country": country_out,
        "country_code": country_out,
        "country_name": clean(country_name),
        "region": clean(region),
        "territory": clean(territory),
        "county": clean(county),
        "city": clean(city),
        "zip": clean(zip_code),
        "zip_code": clean(zip_code),
        "postal_code": clean(zip_code),
        "timezone": clean(timezone_name),
        "geohash": clean(geohash),
        "geohashid": clean(geohashid) or clean(geohash),
        "w3w": clean(w3w),
        "what3words": clean(w3w),
        "asn_location": clean(asn_location),
        "source": clean(source) or "crawler",
        "updated_at": utc_now(),
    }


def mirror_geoloc_blocks(node: MutableMapping[str, Any], meta: dict[str, Any]) -> None:
    metadata = ensure_block(node, "metadata")
    geo = ensure_block(node, "geo")
    location = ensure_block(node, "location")

    node["geoloc"] = meta

    for block in (metadata, geo, location):
        block["geoloc"] = meta

        for key, value in meta.items():
            if value not in ("", None):
                block.setdefault(key, value)


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    meta = geoloc_metadata(node)

    mirror_geoloc_blocks(node, meta)

    node["has_geoloc"] = meta["has_coordinates"]
    node["map_ready"] = meta["map_ready"]
    node["coordinate_source"] = meta["coordinate_source"]

    if meta["has_coordinates"]:
        node.setdefault("latitude", meta["latitude"])
        node.setdefault("longitude", meta["longitude"])
        node.setdefault("lat", meta["latitude"])
        node.setdefault("lon", meta["longitude"])
        node.setdefault("lng", meta["longitude"])

    for key in (
        "continent",
        "country",
        "country_code",
        "country_name",
        "region",
        "territory",
        "county",
        "city",
        "zip",
        "zip_code",
        "postal_code",
        "timezone",
        "geohash",
        "geohashid",
        "w3w",
        "what3words",
        "asn_location",
    ):
        value = meta.get(key)
        if value not in ("", None):
            node.setdefault(key, value)

    enrichment = ensure_block(node, "enrichment")
    enrichment["geoloc"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "has_coordinates": meta["has_coordinates"],
        "coordinate_source": meta["coordinate_source"],
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
                        "county": padded[14],
                        "zip": padded[15],
                        "w3w": padded[16],
                        "geohash": padded[17],
                        "asn_location": padded[18],
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
        output["metadata"]["geoloc_enriched_at"] = utc_now()
        output["metadata"]["geoloc_schema"] = SCHEMA

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    enriched_nodes = enrich_nodes(nodes, context)
    return put_nodes(payload, enriched_nodes)


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    geocoded = []
    country_counts: dict[str, int] = {}
    continent_counts: dict[str, int] = {}
    city_counts: dict[str, int] = {}
    source_counts: dict[str, int] = {}

    for node in nodes:
        geo = node.get("geoloc", {})
        has_coords = bool(node.get("has_geoloc"))

        if isinstance(geo, Mapping):
            has_coords = has_coords or bool(geo.get("has_coordinates"))

        if has_coords:
            geocoded.append(node)

        country = clean(geo.get("country") if isinstance(geo, Mapping) else "") or clean(node.get("country_code")) or clean(node.get("country")) or "Unknown"
        continent = clean(geo.get("continent") if isinstance(geo, Mapping) else "") or clean(node.get("continent")) or "Unknown"
        city = clean(geo.get("city") if isinstance(geo, Mapping) else "") or clean(node.get("city")) or "Unknown"
        source = clean(geo.get("coordinate_source") if isinstance(geo, Mapping) else "") or clean(node.get("coordinate_source")) or "Unknown"

        country_counts[country] = country_counts.get(country, 0) + 1
        continent_counts[continent] = continent_counts.get(continent, 0) + 1
        city_counts[city] = city_counts.get(city, 0) + 1
        source_counts[source] = source_counts.get(source, 0) + 1

    def sorted_counts(counter: dict[str, int]) -> dict[str, int]:
        return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))

    return {
        "schema": "zzx-bitnodes-geoloc-summary-v3",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "geocoded_nodes": len(geocoded),
        "missing_geoloc_nodes": max(0, len(nodes) - len(geocoded)),
        "country_counts": sorted_counts(country_counts),
        "continent_counts": sorted_counts(continent_counts),
        "city_counts": sorted_counts(city_counts),
        "coordinate_source_counts": sorted_counts(source_counts),
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize Bitnodes geolocation coordinate fields.", allow_abbrev=False)

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

    print(f"geoloc enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
