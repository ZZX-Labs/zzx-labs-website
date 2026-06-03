#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GEO_ROOT = APP_ROOT / "tools" / "bitnodes" / "data" / "geo"
DEFAULT_GEOHASH_DIR = DEFAULT_GEO_ROOT / "geohash"
DEFAULT_CACHE_PATH = DEFAULT_GEOHASH_DIR / "geohash-cache.json"

BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"

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

    if not path.exists():
        return fallback

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def nested_dict(row: dict[str, Any], key: str) -> dict[str, Any]:
    value = row.get(key)

    return value if isinstance(value, dict) else {}


def row_lat_lon(row: dict[str, Any]) -> tuple[float | None, float | None]:
    lat = number(
        row.get("latitude")
        or row.get("lat")
        or nested_dict(row, "geoloc").get("latitude")
        or nested_dict(row, "city_data").get("latitude")
        or nested_dict(row, "postal_data").get("latitude")
        or nested_dict(row, "w3w_data").get("center_latitude")
    )

    lon = number(
        row.get("longitude")
        or row.get("lon")
        or row.get("lng")
        or nested_dict(row, "geoloc").get("longitude")
        or nested_dict(row, "city_data").get("longitude")
        or nested_dict(row, "postal_data").get("longitude")
        or nested_dict(row, "w3w_data").get("center_longitude")
    )

    if lat is None or lon is None:
        geo = nested_dict(row, "geo")

        lat = number(geo.get("latitude") or geo.get("lat"))
        lon = number(geo.get("longitude") or geo.get("lon") or geo.get("lng"))

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def encode_geohash(
    latitude: float,
    longitude: float,
    precision: int = 12,
) -> str:
    precision = max(1, min(32, int(precision)))

    lat_range = [-90.0, 90.0]
    lon_range = [-180.0, 180.0]

    geohash = []
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
    precision = len(geohash)

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
) -> dict[str, Any]:
    geohash = encode_geohash(latitude, longitude, precision)
    decoded = decode_geohash(geohash)

    return {
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
        "source": "local-geohash",
        "confidence": "deterministic",
        "looked_up_at": utc_now(),
    }


def cache_key(
    lat: float,
    lon: float,
    precision: int,
    prefix: str,
) -> str:
    return f"{lat:.8f},{lon:.8f}:p{precision}:{prefix}"


def load_cache(cache_path: Path) -> dict[str, Any]:
    cache = read_json(cache_path, fallback={})

    if not isinstance(cache, dict):
        return {}

    return cache


def cache_entries(cache: dict[str, Any]) -> dict[str, Any]:
    entries = cache.get("entries")

    if isinstance(entries, dict):
        return entries

    return cache


def save_cache(cache_path: Path, entries: dict[str, Any]) -> None:
    payload = {
        "schema": "zzx-bitnodes-geohashid-cache-v1",
        "updated_at": utc_now(),
        "entries": entries,
    }

    write_json(cache_path, payload)


def resolve_geohashid(
    row: dict[str, Any],
    *,
    precision: int = 12,
    prefix: str = "gh",
    cache_path: Path = DEFAULT_CACHE_PATH,
) -> dict[str, Any]:
    existing = clean(
        row.get("geohash")
        or row.get("geohashid")
        or nested_dict(row, "geohashid_data").get("geohash")
        or nested_dict(row, "geo").get("geohash")
        or nested_dict(row, "geoloc").get("geohash")
    )

    if existing:
        existing_hash = existing.split(":", 1)[-1].lower()

        try:
            decoded = decode_geohash(existing_hash)

            return {
                "geohash": existing_hash,
                "geohashid": existing if ":" in existing else f"{prefix}:{existing_hash}",
                "prefix": existing.split(":", 1)[0] if ":" in existing else prefix,
                "precision": len(existing_hash),
                "center_latitude": decoded["latitude"],
                "center_longitude": decoded["longitude"],
                "input_latitude": None,
                "input_longitude": None,
                "lat_min": decoded["lat_min"],
                "lat_max": decoded["lat_max"],
                "lon_min": decoded["lon_min"],
                "lon_max": decoded["lon_max"],
                "lat_error": decoded["lat_error"],
                "lon_error": decoded["lon_error"],
                "neighbors": geohash_neighbors(existing_hash),
                "source": "explicit",
                "confidence": "explicit",
                "looked_up_at": utc_now(),
            }
        except ValueError:
            pass

    lat, lon = row_lat_lon(row)

    if row.get("is_tor") or nested_dict(row, "tor").get("is_tor"):
        lat = 0.0
        lon = -32.0

    if row.get("is_i2p") or nested_dict(row, "i2p").get("is_i2p"):
        lat = 0.0
        lon = 32.0

    if lat is None or lon is None:
        return {
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
            "warning": "No latitude/longitude available for geohashid lookup.",
            "looked_up_at": utc_now(),
        }

    cache = load_cache(cache_path)
    entries = cache_entries(cache)
    key = cache_key(lat, lon, precision, prefix)

    if key in entries:
        cached = dict(entries[key])
        cached["cache_hit"] = True
        return cached

    result = geohashid_for(
        lat,
        lon,
        precision=precision,
        prefix=prefix,
    )

    entries[key] = result
    save_cache(cache_path, entries)

    return result


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    context = context or {}

    precision = int(context.get("geohash_precision") or context.get("precision") or 12)
    prefix = str(context.get("geohash_prefix") or context.get("prefix") or "gh")
    cache_path = Path(
        context.get("geohash_cache")
        or context.get("geohash_cache_path")
        or DEFAULT_CACHE_PATH
    )

    for node in nodes:
        meta = resolve_geohashid(
            node,
            precision=precision,
            prefix=prefix,
            cache_path=cache_path,
        )

        node["geohashid_data"] = meta
        node["geohash"] = meta.get("geohash", "")
        node["geohashid"] = meta.get("geohashid", "")

        node.setdefault("enrichment", {})
        node["enrichment"]["geohashid_lookup"] = {
            "status": "ok",
            "updated_at": utc_now(),
            "cache_path": str(cache_path),
            "source": meta.get("source", ""),
            "confidence": meta.get("confidence", ""),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    sources: dict[str, int] = {}
    confidence: dict[str, int] = {}
    prefixes: dict[str, int] = {}

    resolved = 0

    for node in nodes:
        data = nested_dict(node, "geohashid_data")

        if clean(data.get("geohash")) or clean(node.get("geohash")):
            resolved += 1

        source = clean(data.get("source")) or "unknown"
        conf = clean(data.get("confidence")) or "unknown"
        prefix = clean(data.get("prefix")) or "unknown"

        sources[source] = sources.get(source, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1
        prefixes[prefix] = prefixes.get(prefix, 0) + 1

    return {
        "schema": "zzx-bitnodes-geohashid-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "resolved_geohash_nodes": resolved,
        "missing_geohash_nodes": max(0, len(nodes) - resolved),
        "sources": sources,
        "confidence": confidence,
        "prefixes": prefixes,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with deterministic local geohashid values from coordinates."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--cache", default=str(DEFAULT_CACHE_PATH))
    parser.add_argument("--precision", type=int, default=12)
    parser.add_argument("--prefix", default="gh")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    enriched = enrich_nodes(
        nodes,
        {
            "geohash_precision": args.precision,
            "geohash_prefix": args.prefix,
            "geohash_cache": args.cache,
        },
    )

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["geohashid_enriched_at"] = utc_now()
        payload["metadata"]["geohashid_cache"] = args.cache
        payload["metadata"]["geohash_precision"] = args.precision
        payload["metadata"]["geohash_prefix"] = args.prefix
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"geohashid lookup enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
