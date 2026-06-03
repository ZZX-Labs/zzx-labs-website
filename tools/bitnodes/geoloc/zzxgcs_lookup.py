#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


APP_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GEO_ROOT = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo"
DEFAULT_ZZXGCS_DIR = DEFAULT_GEO_ROOT / "zzxgcs"
DEFAULT_CACHE_PATH = DEFAULT_ZZXGCS_DIR / "zzxgcs-cache.json"

SCHEMA = "zzx-bitnodes-zzxgcs-v1"

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


def clamp_lat(lat: float) -> float:
    return max(-90.0, min(90.0, lat))


def wrap_lon(lon: float) -> float:
    while lon < -180.0:
        lon += 360.0
    while lon > 180.0:
        lon -= 360.0
    return lon


def cache_key(lat: float, lon: float, precision: int, volume: str, version: str, language: str) -> str:
    return f"{lat:.8f},{lon:.8f}:p{precision}:{volume}:{version}:{language}"


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
            "schema": "zzx-gcs-cache-v1",
            "updated_at": utc_now(),
            "entries": entries,
        },
        compact=compact,
    )


def word_from_digest(digest: bytes, offset: int, prefix: str, modulo: int = 40000) -> str:
    value = int.from_bytes(digest[offset:offset + 4], "big") % modulo
    return f"{prefix}{value:05d}"


def grid_9m(lat: float, lon: float) -> dict[str, Any]:
    meters_per_degree_lat = 111_320.0
    meters_per_degree_lon = max(1.0, 111_320.0 * math.cos(math.radians(lat)))

    lat_step = 3.0 / meters_per_degree_lat
    lon_step = 3.0 / meters_per_degree_lon

    lat_index = math.floor((lat + 90.0) / lat_step)
    lon_index = math.floor((lon + 180.0) / lon_step)

    cell_south = lat_index * lat_step - 90.0
    cell_west = lon_index * lon_step - 180.0
    cell_north = clamp_lat(cell_south + lat_step)
    cell_east = wrap_lon(cell_west + lon_step)

    center_lat = (cell_south + cell_north) / 2.0
    center_lon = wrap_lon((cell_west + cell_east) / 2.0)

    return {
        "lat_index": int(lat_index),
        "lon_index": int(lon_index),
        "lat_step": lat_step,
        "lon_step": lon_step,
        "south": cell_south,
        "west": cell_west,
        "north": cell_north,
        "east": cell_east,
        "center_latitude": center_lat,
        "center_longitude": center_lon,
    }


def subsector_16(lat: float, lon: float, cell: Mapping[str, Any]) -> dict[str, Any]:
    south = float(cell["south"])
    west = float(cell["west"])
    lat_step = float(cell["lat_step"])
    lon_step = float(cell["lon_step"])

    rel_lat = (lat - south) / lat_step if lat_step else 0
    rel_lon = (lon - west) / lon_step if lon_step else 0

    row = max(0, min(3, int(math.floor(rel_lat * 4))))
    col = max(0, min(3, int(math.floor(rel_lon * 4))))

    index = row * 4 + col

    return {
        "subsector_index": index,
        "subsector_row": row,
        "subsector_col": col,
        "subsector_label": f"{row + 1}{col + 1}",
    }


def zzxgcs_from_lat_lon(
    lat: float,
    lon: float,
    *,
    precision: int = 4,
    volume: str = "zzxgcs-v1",
    version: str = "1.0.0",
    language: str = "en",
) -> dict[str, Any]:
    lat = clamp_lat(lat)
    lon = wrap_lon(lon)

    cell = grid_9m(lat, lon)
    sector = subsector_16(lat, lon, cell)

    basis = (
        f"{volume}|{version}|{language}|"
        f"{cell['lat_index']}|{cell['lon_index']}|"
        f"{sector['subsector_index']}"
    ).encode("utf-8")

    digest = hashlib.sha3_512(basis).digest()

    words = [
        word_from_digest(digest, 0, "a"),
        word_from_digest(digest, 4, "b"),
        word_from_digest(digest, 8, "c"),
    ]

    if precision >= 4:
        words.append(f"p{sector['subsector_index']:02d}")

    if precision >= 5:
        words.append(word_from_digest(digest, 12, "land"))

    if precision >= 6:
        words.append(word_from_digest(digest, 16, "hint"))

    if precision >= 7:
        words.append(word_from_digest(digest, 20, "path"))

    if precision >= 8:
        words.append(word_from_digest(digest, 24, "mark"))

    address = "zzx://" + ".".join(words[:max(3, min(8, precision))])

    return {
        "schema": SCHEMA,
        "zzxgcs": address,
        "words": words[:max(3, min(8, precision))],
        "language": language,
        "volume": volume,
        "version": version,
        "precision_words": max(3, min(8, precision)),
        "grid_meters": 3,
        "cell_area_square_meters": 9,
        "cell": cell,
        "subsector": sector,
        "center_latitude": cell["center_latitude"],
        "center_longitude": cell["center_longitude"],
        "source": "zzx-gcs-local-deterministic",
        "confidence": "deterministic-high",
        "warning": "Uses local synthetic ZZX-GCS word tokens unless replaced with official ZZX word-list volumes.",
        "looked_up_at": utc_now(),
    }


def resolve_zzxgcs(
    row: Mapping[str, Any],
    *,
    cache_path: Path = DEFAULT_CACHE_PATH,
    precision: int = 4,
    volume: str = "zzxgcs-v1",
    version: str = "1.0.0",
    language: str = "en",
    compact_cache: bool = False,
) -> dict[str, Any]:
    existing = clean(
        row.get("zzxgcs")
        or deep_get(row, "zzxgcs_data.zzxgcs")
        or deep_get(row, "geo.zzxgcs")
        or deep_get(row, "geoloc.zzxgcs")
        or deep_get(row, "metadata.zzxgcs")
    )

    lat, lon = row_lat_lon(row)
    lat, lon = overlay_coordinates(row, lat, lon)

    if existing:
        return {
            "schema": SCHEMA,
            "zzxgcs": existing,
            "words": existing.replace("zzx://", "").split("."),
            "language": language,
            "volume": volume,
            "version": version,
            "precision_words": len(existing.replace("zzx://", "").split(".")),
            "center_latitude": lat,
            "center_longitude": lon,
            "source": "explicit",
            "confidence": "explicit",
            "looked_up_at": utc_now(),
        }

    if lat is None or lon is None:
        return {
            "schema": SCHEMA,
            "zzxgcs": "",
            "words": [],
            "language": language,
            "volume": volume,
            "version": version,
            "precision_words": precision,
            "center_latitude": None,
            "center_longitude": None,
            "source": "missing-coordinates",
            "confidence": "none",
            "warning": "No latitude/longitude available for ZZX-GCS lookup.",
            "looked_up_at": utc_now(),
        }

    cache = load_cache(cache_path)
    entries = cache_entries(cache)
    key = cache_key(lat, lon, precision, volume, version, language)

    if key in entries and isinstance(entries[key], Mapping):
        cached = dict(entries[key])
        cached.setdefault("schema", SCHEMA)
        cached["cache_hit"] = True
        return cached

    result = zzxgcs_from_lat_lon(
        lat,
        lon,
        precision=precision,
        volume=volume,
        version=version,
        language=language,
    )

    result["cache_hit"] = False
    entries[key] = result
    save_cache(cache_path, entries, compact=compact_cache)

    return result


def enrich_node(node: MutableMapping[str, Any], context: Mapping[str, Any]) -> MutableMapping[str, Any]:
    cache_path = Path(context.get("zzxgcs_cache") or context.get("zzxgcs_cache_path") or DEFAULT_CACHE_PATH)
    precision = int(context.get("zzxgcs_precision") or context.get("precision") or 4)
    volume = str(context.get("zzxgcs_volume") or context.get("volume") or "zzxgcs-v1")
    version = str(context.get("zzxgcs_version") or context.get("version") or "1.0.0")
    language = str(context.get("zzxgcs_language") or context.get("language") or "en")
    compact_cache = bool(context.get("compact", False))

    meta = resolve_zzxgcs(
        node,
        cache_path=cache_path,
        precision=precision,
        volume=volume,
        version=version,
        language=language,
        compact_cache=compact_cache,
    )

    node["zzxgcs_data"] = meta
    node["zzxgcs"] = meta.get("zzxgcs", "")

    node.setdefault("enrichment", {})
    node["enrichment"]["zzxgcs_lookup"] = {
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
        payload["metadata"]["zzxgcs_enriched_at"] = utc_now()
        payload["metadata"]["zzxgcs_cache"] = str(context.get("zzxgcs_cache") or DEFAULT_CACHE_PATH)
        payload["metadata"]["zzxgcs_volume"] = str(context.get("zzxgcs_volume") or "zzxgcs-v1")
        payload["metadata"]["zzxgcs_version"] = str(context.get("zzxgcs_version") or "1.0.0")

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
    resolved = 0

    for node in nodes:
        data = node.get("zzxgcs_data", {})
        if not isinstance(data, Mapping):
            data = {}

        if clean(data.get("zzxgcs")) or clean(node.get("zzxgcs")):
            resolved += 1

        source = clean(data.get("source")) or "unknown"
        conf = clean(data.get("confidence")) or "unknown"

        sources[source] = sources.get(source, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1

    return {
        "schema": "zzx-bitnodes-zzxgcs-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "resolved_zzxgcs_nodes": resolved,
        "missing_zzxgcs_nodes": max(0, len(nodes) - resolved),
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))),
        "confidence": dict(sorted(confidence.items(), key=lambda item: (-item[1], item[0]))),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich Bitnodes records with ZZX-GCS grid-coordinate addresses.")

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--cache", default=str(DEFAULT_CACHE_PATH))
    parser.add_argument("--precision", type=int, default=4)
    parser.add_argument("--volume", default="zzxgcs-v1")
    parser.add_argument("--version", default="1.0.0")
    parser.add_argument("--language", default="en")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})

    enriched = enrich_payload(
        payload,
        {
            "zzxgcs_cache": args.cache,
            "zzxgcs_precision": args.precision,
            "zzxgcs_volume": args.volume,
            "zzxgcs_version": args.version,
            "zzxgcs_language": args.language,
            "compact": args.compact,
        },
    )

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"zzx-gcs lookup enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
