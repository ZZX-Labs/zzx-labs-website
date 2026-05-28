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
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GEO_ROOT = APP_ROOT / "tools" / "bitnodes" / "data" / "geo"
DEFAULT_W3W_DIR = DEFAULT_GEO_ROOT / "w3w"
DEFAULT_CACHE_PATH = DEFAULT_W3W_DIR / "w3w-cache.json"

W3W_API_URL = "https://api.what3words.com/v3/convert-to-3wa"
W3W_RE = re.compile(
    r"^(?:/{0,3})?([a-zA-ZÀ-ÿ0-9\-]+)\.([a-zA-ZÀ-ÿ0-9\-]+)\.([a-zA-ZÀ-ÿ0-9\-]+)$"
)

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
    )

    lon = number(
        row.get("longitude")
        or row.get("lon")
        or row.get("lng")
        or nested_dict(row, "geoloc").get("longitude")
        or nested_dict(row, "city_data").get("longitude")
        or nested_dict(row, "postal_data").get("longitude")
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


def normalize_w3w(value: Any) -> str:
    text = clean(value)

    if not text:
        return ""

    text = text.strip()

    if text.startswith("///"):
        text = text[3:]

    match = W3W_RE.match(text)

    if not match:
        return ""

    return f"///{match.group(1).lower()}.{match.group(2).lower()}.{match.group(3).lower()}"


def cache_key(lat: float, lon: float, language: str) -> str:
    return f"{lat:.6f},{lon:.6f}:{language.lower()}"


def load_cache(cache_path: Path) -> dict[str, Any]:
    cache = read_json(cache_path, fallback={})

    if not isinstance(cache, dict):
        return {}

    return cache


def save_cache(cache_path: Path, cache: dict[str, Any]) -> None:
    payload = {
        "schema": "zzx-bitnodes-w3w-cache-v1",
        "updated_at": utc_now(),
        "entries": cache.get("entries", cache),
    }

    write_json(cache_path, payload)


def cache_entries(cache: dict[str, Any]) -> dict[str, Any]:
    entries = cache.get("entries")

    if isinstance(entries, dict):
        return entries

    return cache


def lookup_w3w_api(
    lat: float,
    lon: float,
    *,
    api_key: str,
    language: str = "en",
    timeout: int = 12,
) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        {
            "coordinates": f"{lat},{lon}",
            "language": language,
            "key": api_key,
        }
    )

    url = f"{W3W_API_URL}?{query}"

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ZZX-Labs-Bitnodes-W3W-Lookup/1.0",
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))

    words = normalize_w3w(payload.get("words"))

    if not words:
        raise RuntimeError(f"what3words API returned no valid words: {payload}")

    coordinates = payload.get("coordinates") if isinstance(payload.get("coordinates"), dict) else {}
    square = payload.get("square") if isinstance(payload.get("square"), dict) else {}

    return {
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
        "looked_up_at": utc_now(),
    }


def fallback_w3w(
    lat: float,
    lon: float,
    *,
    language: str = "en",
) -> dict[str, Any]:
    lat_bucket = int(round((lat + 90.0) * 10000))
    lon_bucket = int(round((lon + 180.0) * 10000))

    word_a = f"lat{abs(lat_bucket):06d}"
    word_b = f"lon{abs(lon_bucket):06d}"
    word_c = f"grid{abs((lat_bucket * 31 + lon_bucket * 17) % 999999):06d}"

    words = f"///{word_a}.{word_b}.{word_c}"

    return {
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
        "warning": "This is not an official what3words address. Official what3words conversion requires a valid API key.",
        "looked_up_at": utc_now(),
    }


def resolve_w3w(
    row: dict[str, Any],
    *,
    api_key: str = "",
    language: str = "en",
    cache_path: Path = DEFAULT_CACHE_PATH,
    allow_api: bool = True,
    allow_fallback: bool = True,
    sleep_seconds: float = 0.0,
) -> dict[str, Any]:
    existing = normalize_w3w(
        row.get("w3w")
        or row.get("what3words")
        or nested_dict(row, "w3w_data").get("w3w")
        or nested_dict(row, "geo").get("w3w")
        or nested_dict(row, "geoloc").get("w3w")
    )

    lat, lon = row_lat_lon(row)

    if row.get("is_tor") or nested_dict(row, "tor").get("is_tor"):
        lat = 0.0
        lon = -32.0

    if row.get("is_i2p") or nested_dict(row, "i2p").get("is_i2p"):
        lat = 0.0
        lon = 32.0

    if existing:
        return {
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
            "looked_up_at": utc_now(),
        }

    if lat is None or lon is None:
        return {
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
            "warning": "No latitude/longitude available for what3words lookup.",
            "looked_up_at": utc_now(),
        }

    cache = load_cache(cache_path)
    entries = cache_entries(cache)
    key = cache_key(lat, lon, language)

    if key in entries:
        cached = dict(entries[key])
        cached["source"] = cached.get("source", "cache")
        cached["cache_hit"] = True
        return cached

    result: dict[str, Any]

    if allow_api and api_key:
        try:
            if sleep_seconds > 0:
                time.sleep(sleep_seconds)

            result = lookup_w3w_api(
                lat,
                lon,
                api_key=api_key,
                language=language,
            )
        except Exception as err:
            if not allow_fallback:
                raise

            result = fallback_w3w(lat, lon, language=language)
            result["api_error"] = str(err)
    else:
        if not allow_fallback:
            return {
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
                "warning": "what3words API disabled or missing key.",
                "looked_up_at": utc_now(),
            }

        result = fallback_w3w(lat, lon, language=language)

    entries[key] = result
    save_cache(cache_path, {"entries": entries})

    return result


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    context = context or {}

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

    for node in nodes:
        meta = resolve_w3w(
            node,
            api_key=api_key,
            language=language,
            cache_path=cache_path,
            allow_api=allow_api,
            allow_fallback=allow_fallback,
            sleep_seconds=sleep_seconds,
        )

        node["w3w_data"] = meta
        node["w3w"] = meta.get("w3w", "")
        node["what3words"] = meta.get("words", "")

        node.setdefault("enrichment", {})
        node["enrichment"]["w3w_lookup"] = {
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

    resolved = 0

    for node in nodes:
        data = nested_dict(node, "w3w_data")

        if clean(data.get("w3w")) or clean(node.get("w3w")):
            resolved += 1

        source = clean(data.get("source")) or "unknown"
        conf = clean(data.get("confidence")) or "unknown"

        sources[source] = sources.get(source, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1

    return {
        "schema": "zzx-bitnodes-w3w-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "resolved_w3w_nodes": resolved,
        "missing_w3w_nodes": max(0, len(nodes) - resolved),
        "sources": sources,
        "confidence": confidence,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with what3words-style addresses from coordinates."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--cache", default=str(DEFAULT_CACHE_PATH))
    parser.add_argument("--api-key", default="")
    parser.add_argument("--language", default="en")
    parser.add_argument("--no-api", action="store_true")
    parser.add_argument("--no-fallback", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.0)

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    api_key = args.api_key or os.environ.get("W3W_API_KEY") or os.environ.get("WHAT3WORDS_API_KEY") or ""

    enriched = enrich_nodes(
        nodes,
        {
            "w3w_api_key": api_key,
            "w3w_language": args.language,
            "w3w_cache": args.cache,
            "w3w_allow_api": not args.no_api,
            "w3w_allow_fallback": not args.no_fallback,
            "w3w_sleep_seconds": args.sleep,
        },
    )

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["w3w_enriched_at"] = utc_now()
        payload["metadata"]["w3w_cache"] = args.cache
        payload["metadata"]["w3w_language"] = args.language
        payload["metadata"]["w3w_api_enabled"] = bool(api_key and not args.no_api)
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"w3w lookup enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
