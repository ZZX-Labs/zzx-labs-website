#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


APP_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GEO_ROOT = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo"
DEFAULT_W3W_DIR = DEFAULT_GEO_ROOT / "w3w"
DEFAULT_CACHE_PATH = DEFAULT_W3W_DIR / "w3w-cache.json"

W3W_API_URL = "https://api.what3words.com/v3/convert-to-3wa"
W3W_RE = re.compile(r"^(?:/{0,3})?([a-zA-ZÀ-ÿ0-9\-]+)\.([a-zA-ZÀ-ÿ0-9\-]+)\.([a-zA-ZÀ-ÿ0-9\-]+)$")

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


def normalize_w3w(value: Any) -> str:
    text = clean(value)

    if not text:
        return ""

    if text.startswith("///"):
        text = text[3:]

    match = W3W_RE.match(text)

    if not match:
        return ""

    return f"///{match.group(1).lower()}.{match.group(2).lower()}.{match.group(3).lower()}"


def existing_w3w(row: Mapping[str, Any]) -> str:
    for key in (
        "w3w",
        "what3words",
        "w3w_data.w3w",
        "w3w_data.words",
        "geo.w3w",
        "geo.what3words",
        "geoloc.w3w",
        "metadata.w3w",
        "metadata.what3words",
    ):
        value = normalize_w3w(deep_get(row, key))
        if value:
            return value
    return ""


def cache_key(lat: float, lon: float, language: str) -> str:
    return f"{lat:.6f},{lon:.6f}:{language.lower()}"


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
            "schema": "zzx-bitnodes-w3w-cache-v2",
            "updated_at": utc_now(),
            "entries": entries,
        },
        compact=compact,
    )


def lookup_w3w_api(lat: float, lon: float, *, api_key: str, language: str = "en", timeout: int = 12) -> dict[str, Any]:
    query = urllib.parse.urlencode({"coordinates": f"{lat},{lon}", "language": language, "key": api_key})
    url = f"{W3W_API_URL}?{query}"

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ZZX-Labs-Bitnodes-W3W-Lookup/2.0",
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))

    words = normalize_w3w(payload.get("words"))

    if not words:
        raise RuntimeError(f"what3words API returned no valid words: {payload}")

    coordinates = payload.get("coordinates") if isinstance(payload.get("coordinates"), Mapping) else {}
    square = payload.get("square") if isinstance(payload.get("square"), Mapping) else {}

    return {
        "schema": "zzx-bitnodes-w3w-v2",
        "w3w": words,
        "words": words,
        "language": payload.get("language") or language,
        "nearest_place": payload.get("nearestPlace") or "",
        "country": payload.get("country") or "",
        "center_latitude": number(coordinates.get("lat"), lat),
        "center_longitude": number(coordinates.get("lng"), lon),
        "square": square,
        "source": "what3words-api",
        "confidence": "api-high",
        "cache_hit": False,
        "looked_up_at": utc_now(),
    }


def fallback_w3w(lat: float, lon: float, *, language: str = "en") -> dict[str, Any]:
    lat_bucket = int(round((lat + 90.0) * 10000))
    lon_bucket = int(round((lon + 180.0) * 10000))
    grid = abs((lat_bucket * 31 + lon_bucket * 17) % 999999)

    words = f"///lat{abs(lat_bucket):06d}.lon{abs(lon_bucket):06d}.grid{grid:06d}"

    return {
        "schema": "zzx-bitnodes-w3w-v2",
        "w3w": words,
        "words": words,
        "language": language,
        "nearest_place": "",
        "country": "",
        "center_latitude": lat,
        "center_longitude": lon,
        "square": {},
        "source": "zzx-fallback-grid",
        "confidence": "synthetic-low",
        "cache_hit": False,
        "warning": "This is not an official what3words address. Official what3words conversion requires a valid API key.",
        "looked_up_at": utc_now(),
    }


def overlay_coordinates(row: Mapping[str, Any], lat: float | None, lon: float | None) -> tuple[float | None, float | None]:
    network = clean(row.get("network") or deep_get(row, "metadata.network")).lower()

    if boolish(row.get("is_tor")) or boolish(deep_get(row, "tor.is_tor")) or network == "tor":
        return 0.0, -32.0

    if boolish(row.get("is_i2p")) or boolish(deep_get(row, "i2p.is_i2p")) or network == "i2p":
        return 0.0, 32.0

    return lat, lon


def resolve_w3w(
    row: Mapping[str, Any],
    *,
    api_key: str = "",
    language: str = "en",
    cache_path: Path = DEFAULT_CACHE_PATH,
    allow_api: bool = True,
    allow_fallback: bool = True,
    sleep_seconds: float = 0.0,
    compact_cache: bool = False,
) -> dict[str, Any]:
    lat, lon = row_lat_lon(row)
    lat, lon = overlay_coordinates(row, lat, lon)

    existing = existing_w3w(row)

    if existing:
        return {
            "schema": "zzx-bitnodes-w3w-v2",
            "w3w": existing,
            "words": existing,
            "language": language,
            "nearest_place": "",
            "country": "",
            "center_latitude": lat,
            "center_longitude": lon,
            "square": {},
            "source": "explicit",
            "confidence": "explicit",
            "cache_hit": False,
            "looked_up_at": utc_now(),
        }

    if lat is None or lon is None:
        return {
            "schema": "zzx-bitnodes-w3w-v2",
            "w3w": "",
            "words": "",
            "language": language,
            "nearest_place": "",
            "country": "",
            "center_latitude": None,
            "center_longitude": None,
            "square": {},
            "source": "missing-coordinates",
            "confidence": "none",
            "cache_hit": False,
            "warning": "No latitude/longitude available for what3words lookup.",
            "looked_up_at": utc_now(),
        }

    cache = load_cache(cache_path)
    entries = cache_entries(cache)
    key = cache_key(lat, lon, language)

    if key in entries and isinstance(entries[key], Mapping):
        cached = dict(entries[key])
        cached.setdefault("schema", "zzx-bitnodes-w3w-v2")
        cached.setdefault("source", "cache")
        cached["cache_hit"] = True
        return cached

    if allow_api and api_key:
        try:
            if sleep_seconds > 0:
                time.sleep(sleep_seconds)
            result = lookup_w3w_api(lat, lon, api_key=api_key, language=language)
        except Exception as err:
            if not allow_fallback:
                raise
            result = fallback_w3w(lat, lon, language=language)
            result["api_error"] = str(err)
    else:
        if not allow_fallback:
            return {
                "schema": "zzx-bitnodes-w3w-v2",
                "w3w": "",
                "words": "",
                "language": language,
                "nearest_place": "",
                "country": "",
                "center_latitude": lat,
                "center_longitude": lon,
                "square": {},
                "source": "disabled",
                "confidence": "none",
                "cache_hit": False,
                "warning": "what3words API disabled or missing key.",
                "looked_up_at": utc_now(),
            }

        result = fallback_w3w(lat, lon, language=language)

    entries[key] = result
    save_cache(cache_path, entries, compact=compact_cache)

    return result


def enrich_node(node: MutableMapping[str, Any], context: Mapping[str, Any]) -> MutableMapping[str, Any]:
    api_key = (
        context.get("w3w_api_key")
        or context.get("what3words_api_key")
        or os.environ.get("W3W_API_KEY")
        or os.environ.get("WHAT3WORDS_API_KEY")
        or ""
    )

    language = str(context.get("w3w_language") or context.get("language") or "en")
    cache_path = Path(context.get("w3w_cache") or context.get("w3w_cache_path") or DEFAULT_CACHE_PATH)
    allow_api = bool(context.get("w3w_allow_api", True))
    allow_fallback = bool(context.get("w3w_allow_fallback", True))
    sleep_seconds = float(context.get("w3w_sleep_seconds", 0.0) or 0.0)
    compact_cache = bool(context.get("compact", False))

    meta = resolve_w3w(
        node,
        api_key=str(api_key),
        language=language,
        cache_path=cache_path,
        allow_api=allow_api,
        allow_fallback=allow_fallback,
        sleep_seconds=sleep_seconds,
        compact_cache=compact_cache,
    )

    node["w3w_data"] = meta
    node["w3w"] = meta.get("w3w", "")
    node["what3words"] = meta.get("words", "")

    node.setdefault("enrichment", {})
    node["enrichment"]["w3w_lookup"] = {
        "schema": "zzx-bitnodes-w3w-v2",
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
        payload["metadata"]["w3w_enriched_at"] = utc_now()
        payload["metadata"]["w3w_cache"] = str(context.get("w3w_cache") or DEFAULT_CACHE_PATH)
        payload["metadata"]["w3w_language"] = str(context.get("w3w_language") or context.get("language") or "en")
        payload["metadata"]["w3w_api_enabled"] = bool(
            (context.get("w3w_api_key") or os.environ.get("W3W_API_KEY") or os.environ.get("WHAT3WORDS_API_KEY"))
            and context.get("w3w_allow_api", True)
        )

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
        data = node.get("w3w_data", {})
        if not isinstance(data, Mapping):
            data = {}

        if clean(data.get("w3w")) or clean(node.get("w3w")):
            resolved += 1

        source = clean(data.get("source")) or "unknown"
        conf = clean(data.get("confidence")) or "unknown"

        sources[source] = sources.get(source, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1

    return {
        "schema": "zzx-bitnodes-w3w-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "resolved_w3w_nodes": resolved,
        "missing_w3w_nodes": max(0, len(nodes) - resolved),
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))),
        "confidence": dict(sorted(confidence.items(), key=lambda item: (-item[1], item[0]))),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich Bitnodes records with what3words-style addresses from coordinates.")

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--cache", default=str(DEFAULT_CACHE_PATH))
    parser.add_argument("--api-key", default="")
    parser.add_argument("--language", default="en")
    parser.add_argument("--no-api", action="store_true")
    parser.add_argument("--no-fallback", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.0)
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    api_key = args.api_key or os.environ.get("W3W_API_KEY") or os.environ.get("WHAT3WORDS_API_KEY") or ""

    enriched = enrich_payload(
        payload,
        {
            "w3w_api_key": api_key,
            "w3w_language": args.language,
            "w3w_cache": args.cache,
            "w3w_allow_api": not args.no_api,
            "w3w_allow_fallback": not args.no_fallback,
            "w3w_sleep_seconds": args.sleep,
            "compact": args.compact,
        },
    )

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"w3w lookup enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
