#!/usr/bin/env python3
from __future__ import annotations

import argparse
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

SCHEMA = "zzx-bitnodes-geohashid-v2"
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

    if not path.exists():
        return fallback

    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    text = json.dumps(
        payload,
        ensure_ascii=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
        sort_keys=not compact,
    )

    path.write_text(text + "\n", encoding="utf-8")


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


def row_lat_lon(row: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(
        row.get("latitude")
        or row.get("lat")
        or deep_get(row, "geoloc.latitude")
        or deep_get(row, "city_data.latitude")
        or deep_get(row, "postal_data.latitude")
        or deep_get(row, "w3w_data.center_latitude")
        or deep_get(row, "zzxgcs_data.center_latitude")
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
        or deep_get(row, "w3w_data.center_longitude")
        or deep_get(row, "zzxgcs_data.center_longitude")
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


def overlay_coordinates(row: Mapping[str, Any], lat: float | None, lon: float | None) -> tuple[float | None, float | None]:
    network = clean(row.get("network") or deep_get(row, "metadata.network")).lower()

    if boolish(row.get("is_tor")) or boolish(deep_get(row, "tor.is_tor")) or network == "tor":
        return 0.0, -32.0

    if boolish(row.get("is_i2p")) or boolish(deep_get(row, "i2p.is_i2p")) or network == "i2p":
        return 0.0, 32.0

    return lat, lon


def encode_geohash(latitude: float, longitude: float, precision: int = 12) -> str:
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


def geohashid_for(latitude: float, longitude: float, *, precision: int = 12, prefix: str = "gh") -> dict[str, Any]:
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
        "source": "local-geohash",
        "confidence": "deterministic",
        "cache_hit": False,
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
            "schema": "zzx-bitnodes-geohashid-cache-v2",
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
    ):
        value = clean(deep_get(row, key))

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
                "cache_hit": False,
                "looked_up_at": utc_now(),
            }
        except ValueError:
            pass

    lat, lon = row_lat_lon(row)
    lat, lon = overlay_coordinates(row, lat, lon)

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
            "warning": "No latitude/longitude available for geohashid lookup.",
            "looked_up_at": utc_now(),
        }

    cache = load_cache(cache_path)
    entries = cache_entries(cache)
    key = cache_key(lat, lon, precision, prefix)

    if key in entries and isinstance(entries[key], Mapping):
        cached = dict(entries[key])
        cached.setdefault("schema", SCHEMA)
        cached["cache_hit"] = True
        return cached

    result = geohashid_for(lat, lon, precision=precision, prefix=prefix)
    entries[key] = result
    save_cache(cache_path, entries, compact=compact_cache)

    return result


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

    node["geohashid_data"] = meta
    node["geohash"] = meta.get("geohash", "")
    node["geohashid"] = meta.get("geohashid", "")

    node.setdefault("enrichment", {})
    node["enrichment"]["geohashid_lookup"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "cache_path": str(cache_path),
        "source": meta.get("source", ""),
        "confidence": meta.get("confidence", ""),
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


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    context = context or {}

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
        payload["metadata"]["geohashid_enriched_at"] = utc_now()
        payload["metadata"]["geohashid_cache"] = str(context.get("geohash_cache") or DEFAULT_CACHE_PATH)
        payload["metadata"]["geohash_precision"] = int(context.get("geohash_precision") or context.get("precision") or 12)
        payload["metadata"]["geohash_prefix"] = str(context.get("geohash_prefix") or context.get("prefix") or "gh")

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
    sources: dict[str, int] = {}
    confidence: dict[str, int] = {}
    prefixes: dict[str, int] = {}
    resolved = 0

    for node in nodes:
        data = node.get("geohashid_data", {})

        if not isinstance(data, Mapping):
            data = {}

        if clean(data.get("geohash")) or clean(node.get("geohash")):
            resolved += 1

        source = clean(data.get("source")) or "unknown"
        conf = clean(data.get("confidence")) or "unknown"
        prefix = clean(data.get("prefix")) or "unknown"

        sources[source] = sources.get(source, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1
        prefixes[prefix] = prefixes.get(prefix, 0) + 1

    return {
        "schema": "zzx-bitnodes-geohashid-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "resolved_geohash_nodes": resolved,
        "missing_geohash_nodes": max(0, len(nodes) - resolved),
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))),
        "confidence": dict(sorted(confidence.items(), key=lambda item: (-item[1], item[0]))),
        "prefixes": dict(sorted(prefixes.items(), key=lambda item: (-item[1], item[0]))),
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
