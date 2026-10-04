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
DEFAULT_GEOHASH_DIR = DEFAULT_GEO_ROOT / "geohash"
DEFAULT_CACHE_PATH = DEFAULT_GEOHASH_DIR / "geohash-cache.json"

SCHEMA = "zzx-bitnodes-geohashid-v3"
CACHE_SCHEMA = "zzx-bitnodes-geohashid-cache-v3"
SUMMARY_SCHEMA = "zzx-bitnodes-geohashid-summary-v3"

BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return re.sub(r"\s+", " ", text)


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if not math.isfinite(n):
        return fallback

    return n


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


def row_lat_lon(row: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(
        first_value(
            row,
            "latitude",
            "lat",
            "geoloc.latitude",
            "city_data.latitude",
            "postal_data.latitude",
            "zip_data.latitude",
            "w3w_data.center_latitude",
            "zzxgcs_data.center_latitude",
            "geo.latitude",
            "geo.lat",
            "geoip.latitude",
            "geoip.lat",
            "geoip_data.latitude",
            "location.latitude",
            "metadata.latitude",
        )
    )

    lon = number(
        first_value(
            row,
            "longitude",
            "lon",
            "lng",
            "geoloc.longitude",
            "city_data.longitude",
            "postal_data.longitude",
            "zip_data.longitude",
            "w3w_data.center_longitude",
            "zzxgcs_data.center_longitude",
            "geo.longitude",
            "geo.lon",
            "geo.lng",
            "geoip.longitude",
            "geoip.lon",
            "geoip.lng",
            "geoip_data.longitude",
            "location.longitude",
            "metadata.longitude",
        )
    )

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def detect_overlay(row: Mapping[str, Any]) -> str:
    network = clean(first_value(row, "network", "metadata.network")).lower()

    if (
        boolish(row.get("is_tor"))
        or boolish(row.get("suspected_tor"))
        or boolish(deep_get(row, "tor.is_tor"))
        or boolish(deep_get(row, "metadata.is_tor"))
        or boolish(deep_get(row, "metadata.tor.is_tor"))
        or network == "tor"
    ):
        return "tor"

    if (
        boolish(row.get("is_i2p"))
        or boolish(row.get("suspected_i2p"))
        or boolish(deep_get(row, "i2p.is_i2p"))
        or boolish(deep_get(row, "metadata.is_i2p"))
        or boolish(deep_get(row, "metadata.i2p.is_i2p"))
        or network == "i2p"
    ):
        return "i2p"

    return ""


def overlay_coordinates(row: Mapping[str, Any], lat: float | None, lon: float | None) -> tuple[float | None, float | None, str]:
    overlay = detect_overlay(row)

    if overlay == "tor":
        return 0.0, -32.0, "tor"

    if overlay == "i2p":
        return 0.0, 32.0, "i2p"

    return lat, lon, ""


def encode_geohash(latitude: float, longitude: float, precision: int = 12) -> str:
    precision = max(1, min(32, int(precision)))

    lat_range = [-90.0, 90.0]
    lon_range = [-180.0, 180.0]

    geohash: list[str] = []
    bit = 0
    ch = 0
    even = True

    while len(geohash) < precision:
        if even:
            mid = (lon_range[0] + lon_range[1]) / 2.0

            if longitude >= mid:
                ch |= 1 << (4 - bit)
                lon_range[0] = mid
            else:
                lon_range[1] = mid
        else:
            mid = (lat_range[0] + lat_range[1]) / 2.0

            if latitude >= mid:
                ch |= 1 << (4 - bit)
                lat_range[0] = mid
            else:
                lat_range[1] = mid

        even = not even

        if bit < 4:
            bit += 1
        else:
            geohash.append(BASE32[ch])
            bit = 0
            ch = 0

    return "".join(geohash)


def decode_geohash(geohash: str) -> dict[str, Any]:
    text = clean(geohash).lower()

    if ":" in text:
        text = text.split(":", 1)[-1]

    lat_range = [-90.0, 90.0]
    lon_range = [-180.0, 180.0]
    even = True

    for char in text:
        if char not in BASE32:
            raise ValueError(f"invalid geohash character: {char}")

        value = BASE32.index(char)

        for mask in (16, 8, 4, 2, 1):
            if even:
                mid = (lon_range[0] + lon_range[1]) / 2.0

                if value & mask:
                    lon_range[0] = mid
                else:
                    lon_range[1] = mid
            else:
                mid = (lat_range[0] + lat_range[1]) / 2.0

                if value & mask:
                    lat_range[0] = mid
                else:
                    lat_range[1] = mid

            even = not even

    lat = (lat_range[0] + lat_range[1]) / 2.0
    lon = (lon_range[0] + lon_range[1]) / 2.0

    return {
        "geohash": text,
        "latitude": lat,
        "longitude": lon,
        "lat_min": lat_range[0],
        "lat_max": lat_range[1],
        "lon_min": lon_range[0],
        "lon_max": lon_range[1],
        "lat_error": (lat_range[1] - lat_range[0]) / 2.0,
        "lon_error": (lon_range[1] - lon_range[0]) / 2.0,
    }


def geohash_neighbors(geohash: str) -> dict[str, str]:
    decoded = decode_geohash(geohash)

    lat = decoded["latitude"]
    lon = decoded["longitude"]
    lat_step = decoded["lat_error"] * 2.0
    lon_step = decoded["lon_error"] * 2.0
    precision = len(decoded["geohash"])

    def enc(dlat: float, dlon: float) -> str:
        return encode_geohash(
            max(-90.0, min(90.0, lat + dlat)),
            ((lon + dlon + 180.0) % 360.0) - 180.0,
            precision,
        )

    return {
        "north": enc(lat_step, 0),
        "south": enc(-lat_step, 0),
        "east": enc(0, lon_step),
        "west": enc(0, -lon_step),
        "north_east": enc(lat_step, lon_step),
        "north_west": enc(lat_step, -lon_step),
        "south_east": enc(-lat_step, lon_step),
        "south_west": enc(-lat_step, -lon_step),
    }


def geohashid_for(
    latitude: float,
    longitude: float,
    *,
    precision: int = 12,
    prefix: str = "gh",
    is_overlay: bool = False,
    overlay_network: str = "",
) -> dict[str, Any]:
    geohash = encode_geohash(latitude, longitude, precision)
    decoded = decode_geohash(geohash)

    return {
        "schema": SCHEMA,
        "geohash": geohash,
        "geohashid": f"{prefix}:{geohash}",
        "prefix": prefix,
        "precision": precision,
        "center_latitude": decoded["latitude"],
        "center_longitude": decoded["longitude"],
        "input_latitude": latitude,
        "input_longitude": longitude,
        "lat_min": decoded["lat_min"],
        "lat_max": decoded["lat_max"],
        "lon_min": decoded["lon_min"],
        "lon_max": decoded["lon_max"],
        "lat_error": decoded["lat_error"],
        "lon_error": decoded["lon_error"],
        "neighbors": geohash_neighbors(geohash),
        "source": f"{overlay_network}-overlay-geohash" if overlay_network else "local-geohash",
        "confidence": "overlay-deterministic" if overlay_network else "deterministic",
        "cache_hit": False,
        "is_overlay": is_overlay,
        "overlay_network": overlay_network,
        "looked_up_at": utc_now(),
    }


def cache_key(lat: float, lon: float, precision: int, prefix: str) -> str:
    return f"{lat:.8f},{lon:.8f}:p{precision}:{prefix}"


def load_cache(cache_path: Path) -> dict[str, Any]:
    cache = read_json(cache_path, fallback={})
    return cache if isinstance(cache, dict) else {}


def cache_entries(cache: Mapping[str, Any]) -> dict[str, Any]:
    entries = cache.get("entries")
    return dict(entries) if isinstance(entries, Mapping) else dict(cache)


def save_cache(cache_path: Path, entries: dict[str, Any], compact: bool = False) -> None:
    write_json(
        cache_path,
        {
            "schema": CACHE_SCHEMA,
            "updated_at": utc_now(),
            "entries": entries,
        },
        compact=compact,
    )


def existing_geohash(row: Mapping[str, Any]) -> str:
    for key in (
        "geohash",
        "geohashid",
        "geohashid_data.geohash",
        "geohashid_data.geohashid",
        "geo.geohash",
        "geoloc.geohash",
        "metadata.geohash",
        "metadata.geohashid",
        "metadata.geohashid_data.geohash",
    ):
        value = clean(deep_get(row, key) if "." in key else row.get(key))

        if value:
            return value

    return ""


def resolve_geohashid(
    row: Mapping[str, Any],
    *,
    precision: int = 12,
    prefix: str = "gh",
    cache_path: Path = DEFAULT_CACHE_PATH,
    compact_cache: bool = False,
) -> dict[str, Any]:
    existing = existing_geohash(row)
    lat, lon = row_lat_lon(row)
    lat, lon, overlay_network = overlay_coordinates(row, lat, lon)

    if existing:
        existing_hash = existing.split(":", 1)[-1].lower()

        try:
            decoded = decode_geohash(existing_hash)

            return {
                "schema": SCHEMA,
                "geohash": existing_hash,
                "geohashid": existing if ":" in existing else f"{prefix}:{existing_hash}",
                "prefix": existing.split(":", 1)[0] if ":" in existing else prefix,
                "precision": len(existing_hash),
                "center_latitude": decoded["latitude"],
                "center_longitude": decoded["longitude"],
                "input_latitude": lat,
                "input_longitude": lon,
                "lat_min": decoded["lat_min"],
                "lat_max": decoded["lat_max"],
                "lon_min": decoded["lon_min"],
                "lon_max": decoded["lon_max"],
                "lat_error": decoded["lat_error"],
                "lon_error": decoded["lon_error"],
                "neighbors": geohash_neighbors(existing_hash),
                "source": "explicit",
                "confidence": "explicit",
                "cache_hit": False,
                "is_overlay": bool(overlay_network),
                "overlay_network": overlay_network,
                "looked_up_at": utc_now(),
            }
        except ValueError:
            pass

    if lat is None or lon is None:
        return {
            "schema": SCHEMA,
            "geohash": "",
            "geohashid": "",
            "prefix": prefix,
            "precision": precision,
            "center_latitude": None,
            "center_longitude": None,
            "input_latitude": None,
            "input_longitude": None,
            "lat_min": None,
            "lat_max": None,
            "lon_min": None,
            "lon_max": None,
            "lat_error": None,
            "lon_error": None,
            "neighbors": {},
            "source": "missing-coordinates",
            "confidence": "none",
            "cache_hit": False,
            "is_overlay": bool(overlay_network),
            "overlay_network": overlay_network,
            "warning": "No latitude/longitude available for geohashid lookup.",
            "looked_up_at": utc_now(),
        }

    cache = load_cache(cache_path)
    entries = cache_entries(cache)
    key = cache_key(lat, lon, precision, prefix)

    if key in entries and isinstance(entries[key], Mapping):
        cached = dict(entries[key])
        cached.setdefault("schema", SCHEMA)
        cached.setdefault("is_overlay", bool(overlay_network))
        cached.setdefault("overlay_network", overlay_network)
        cached["cache_hit"] = True
        return cached

    result = geohashid_for(
        lat,
        lon,
        precision=precision,
        prefix=prefix,
        is_overlay=bool(overlay_network),
        overlay_network=overlay_network,
    )

    entries[key] = result
    save_cache(cache_path, entries, compact=compact_cache)

    return result


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any], context: Mapping[str, Any]) -> MutableMapping[str, Any]:
    precision = int(context.get("geohash_precision") or context.get("precision") or 12)
    prefix = str(context.get("geohash_prefix") or context.get("prefix") or "gh")
    cache_path = Path(context.get("geohash_cache") or context.get("geohash_cache_path") or DEFAULT_CACHE_PATH)
    compact_cache = bool(context.get("compact", False))

    meta = resolve_geohashid(
        node,
        precision=precision,
        prefix=prefix,
        cache_path=cache_path,
        compact_cache=compact_cache,
    )

    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["geohashid_data"] = meta
    metadata["geohashid_data"] = meta

    node["geohash"] = meta.get("geohash", "")
    node["geohashid"] = meta.get("geohashid", "")

    metadata["geohash"] = node["geohash"]
    metadata["geohashid"] = node["geohashid"]

    if meta.get("is_overlay"):
        node["is_overlay"] = True
        node["overlay_network"] = meta.get("overlay_network", "")
        metadata["is_overlay"] = True
        metadata["overlay_network"] = meta.get("overlay_network", "")

    enrichment["geohashid_lookup"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "cache_path": str(cache_path),
        "source": meta.get("source", ""),
        "confidence": meta.get("confidence", ""),
        "cache_hit": bool(meta.get("cache_hit")),
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    context = context or {}

    if isinstance(nodes, list):
        return [
            enrich_node(dict(node), context) if isinstance(node, Mapping) else node
            for node in nodes
        ]

    if isinstance(nodes, Mapping):
        return {
            key: enrich_node(dict(value), context) if isinstance(value, Mapping) else value
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
        output["metadata"]["geohashid_enriched_at"] = utc_now()
        output["metadata"]["geohashid_schema"] = SCHEMA
        output["metadata"]["geohashid_cache"] = str(context.get("geohash_cache") or DEFAULT_CACHE_PATH)
        output["metadata"]["geohash_precision"] = int(context.get("geohash_precision") or context.get("precision") or 12)
        output["metadata"]["geohash_prefix"] = str(context.get("geohash_prefix") or context.get("prefix") or "gh")

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context), context)


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    sources: dict[str, int] = {}
    confidence: dict[str, int] = {}
    prefixes: dict[str, int] = {}

    resolved = 0
    cache_hits = 0
    overlay = 0
    tor = 0
    i2p = 0

    for node in nodes:
        data = node.get("geohashid_data", {})

        if not isinstance(data, Mapping):
            data = {}

        if clean(data.get("geohash")) or clean(node.get("geohash")):
            resolved += 1

        if boolish(data.get("cache_hit")):
            cache_hits += 1

        source = clean(data.get("source")) or "unknown"
        conf = clean(data.get("confidence")) or "unknown"
        prefix = clean(data.get("prefix")) or "unknown"
        overlay_network = clean(data.get("overlay_network")) or clean(node.get("overlay_network"))

        sources[source] = sources.get(source, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1
        prefixes[prefix] = prefixes.get(prefix, 0) + 1

        if boolish(data.get("is_overlay")) or boolish(node.get("is_overlay")):
            overlay += 1

        if overlay_network == "tor" or clean(node.get("network")).lower() == "tor":
            tor += 1

        if overlay_network == "i2p" or clean(node.get("network")).lower() == "i2p":
            i2p += 1

    return {
        "schema": SUMMARY_SCHEMA,
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "resolved_geohash_nodes": resolved,
        "missing_geohash_nodes": max(0, len(nodes) - resolved),
        "cache_hit_nodes": cache_hits,
        "overlay_geohash_nodes": overlay,
        "tor_geohash_nodes": tor,
        "i2p_geohash_nodes": i2p,
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))),
        "confidence": dict(sorted(confidence.items(), key=lambda item: (-item[1], item[0]))),
        "prefixes": dict(sorted(prefixes.items(), key=lambda item: (-item[1], item[0]))),
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with deterministic local geohashid values from coordinates.",
        allow_abbrev=False,
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--cache", default=str(DEFAULT_CACHE_PATH))
    parser.add_argument("--precision", type=int, default=12)
    parser.add_argument("--prefix", default="gh")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})

    enriched = enrich_payload(
        payload,
        {
            "geohash_precision": args.precision,
            "geohash_prefix": args.prefix,
            "geohash_cache": args.cache,
            "compact": args.compact,
        },
    )

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"geohashid lookup enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
