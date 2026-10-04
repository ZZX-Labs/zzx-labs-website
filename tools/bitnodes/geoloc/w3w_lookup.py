#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
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

SCHEMA = "zzx-bitnodes-w3w-v3"
CACHE_SCHEMA = "zzx-bitnodes-w3w-cache-v3"
SUMMARY_SCHEMA = "zzx-bitnodes-w3w-summary-v3"

W3W_API_URL = "https://api.what3words.com/v3/convert-to-3wa"
W3W_RE = re.compile(
    r"^(?:/{0,3})?([a-zA-ZÀ-ÿ0-9\-]+)\.([a-zA-ZÀ-ÿ0-9\-]+)\.([a-zA-ZÀ-ÿ0-9\-]+)$"
)

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
        "words",
        "w3w_data.w3w",
        "w3w_data.words",
        "geo.w3w",
        "geo.what3words",
        "geoloc.w3w",
        "metadata.w3w",
        "metadata.what3words",
        "metadata.w3w_data.w3w",
    ):
        value = normalize_w3w(deep_get(row, key) if "." in key else row.get(key))

        if value:
            return value

    return ""


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
            "schema": CACHE_SCHEMA,
            "updated_at": utc_now(),
            "entries": entries,
        },
        compact=compact,
    )


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

    request = urllib.request.Request(
        f"{W3W_API_URL}?{query}",
        headers={
            "User-Agent": "ZZX-Labs-Bitnodes-W3W-Lookup/3.0",
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
        "schema": SCHEMA,
        "w3w": words,
        "words": words,
        "what3words": words,
        "language": payload.get("language") or language,
        "nearest_place": payload.get("nearestPlace") or "",
        "country": payload.get("country") or "",
        "center_latitude": number(coordinates.get("lat"), lat),
        "center_longitude": number(coordinates.get("lng"), lon),
        "square": square,
        "source": "what3words-api",
        "confidence": "api-high",
        "cache_hit": False,
        "is_official_w3w": True,
        "is_synthetic_w3w": False,
        "is_overlay": False,
        "overlay_network": "",
        "looked_up_at": utc_now(),
    }


def fallback_w3w(
    lat: float,
    lon: float,
    *,
    language: str = "en",
    overlay_network: str = "",
) -> dict[str, Any]:
    lat_bucket = int(round((lat + 90.0) * 10000))
    lon_bucket = int(round((lon + 180.0) * 10000))
    grid = abs((lat_bucket * 31 + lon_bucket * 17) % 999999)

    if overlay_network == "tor":
        words = "///tor.overlay.synthetic"
        source = "tor-overlay-synthetic"
    elif overlay_network == "i2p":
        words = "///i2p.overlay.synthetic"
        source = "i2p-overlay-synthetic"
    else:
        words = f"///lat{abs(lat_bucket):06d}.lon{abs(lon_bucket):06d}.grid{grid:06d}"
        source = "zzx-fallback-grid"

    return {
        "schema": SCHEMA,
        "w3w": words,
        "words": words,
        "what3words": words,
        "language": language,
        "nearest_place": "",
        "country": "",
        "center_latitude": lat,
        "center_longitude": lon,
        "square": {},
        "source": source,
        "confidence": "synthetic-low",
        "cache_hit": False,
        "is_official_w3w": False,
        "is_synthetic_w3w": True,
        "is_overlay": bool(overlay_network),
        "overlay_network": overlay_network,
        "warning": "This is not an official what3words address. Official conversion requires a valid API key.",
        "looked_up_at": utc_now(),
    }


def disabled_payload(
    *,
    lat: float | None,
    lon: float | None,
    language: str,
    source: str,
    warning: str,
    overlay_network: str = "",
) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "w3w": "",
        "words": "",
        "what3words": "",
        "language": language,
        "nearest_place": "",
        "country": "",
        "center_latitude": lat,
        "center_longitude": lon,
        "square": {},
        "source": source,
        "confidence": "none",
        "cache_hit": False,
        "is_official_w3w": False,
        "is_synthetic_w3w": False,
        "is_overlay": bool(overlay_network),
        "overlay_network": overlay_network,
        "warning": warning,
        "looked_up_at": utc_now(),
    }


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
    lat, lon, overlay_network = overlay_coordinates(row, lat, lon)

    existing = existing_w3w(row)

    if existing:
        return {
            "schema": SCHEMA,
            "w3w": existing,
            "words": existing,
            "what3words": existing,
            "language": language,
            "nearest_place": "",
            "country": "",
            "center_latitude": lat,
            "center_longitude": lon,
            "square": {},
            "source": "explicit",
            "confidence": "explicit",
            "cache_hit": False,
            "is_official_w3w": True,
            "is_synthetic_w3w": False,
            "is_overlay": bool(overlay_network),
            "overlay_network": overlay_network,
            "looked_up_at": utc_now(),
        }

    if lat is None or lon is None:
        return disabled_payload(
            lat=None,
            lon=None,
            language=language,
            source="missing-coordinates",
            warning="No latitude/longitude available for what3words lookup.",
            overlay_network=overlay_network,
        )

    cache = load_cache(cache_path)
    entries = cache_entries(cache)
    key = cache_key(lat, lon, language)

    if key in entries and isinstance(entries[key], Mapping):
        cached = dict(entries[key])
        cached.setdefault("schema", SCHEMA)
        cached.setdefault("source", "cache")
        cached.setdefault("what3words", cached.get("words") or cached.get("w3w", ""))
        cached.setdefault("is_official_w3w", cached.get("source") == "what3words-api")
        cached.setdefault("is_synthetic_w3w", cached.get("source") == "zzx-fallback-grid")
        cached.setdefault("is_overlay", bool(overlay_network))
        cached.setdefault("overlay_network", overlay_network)
        cached["cache_hit"] = True
        return cached

    if allow_api and api_key and not overlay_network:
        try:
            if sleep_seconds > 0:
                time.sleep(sleep_seconds)

            result = lookup_w3w_api(lat, lon, api_key=api_key, language=language)
        except Exception as err:
            if not allow_fallback:
                raise

            result = fallback_w3w(lat, lon, language=language, overlay_network=overlay_network)
            result["api_error"] = str(err)
    else:
        if not allow_fallback:
            return disabled_payload(
                lat=lat,
                lon=lon,
                language=language,
                source="disabled",
                warning="what3words API disabled, missing key, or overlay lookup suppressed.",
                overlay_network=overlay_network,
            )

        result = fallback_w3w(lat, lon, language=language, overlay_network=overlay_network)

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

    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["w3w_data"] = meta
    metadata["w3w_data"] = meta

    node["w3w"] = meta.get("w3w", "")
    node["what3words"] = meta.get("words", "")
    node["w3w_source"] = meta.get("source", "")
    node["w3w_confidence"] = meta.get("confidence", "")

    metadata["w3w"] = node["w3w"]
    metadata["what3words"] = node["what3words"]
    metadata["w3w_source"] = node["w3w_source"]
    metadata["w3w_confidence"] = node["w3w_confidence"]

    if meta.get("is_overlay"):
        node["is_overlay"] = True
        node["overlay_network"] = meta.get("overlay_network", "")
        metadata["is_overlay"] = True
        metadata["overlay_network"] = meta.get("overlay_network", "")

    enrichment["w3w_lookup"] = {
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
        output["metadata"]["w3w_enriched_at"] = utc_now()
        output["metadata"]["w3w_schema"] = SCHEMA
        output["metadata"]["w3w_cache"] = str(context.get("w3w_cache") or DEFAULT_CACHE_PATH)
        output["metadata"]["w3w_language"] = str(context.get("w3w_language") or context.get("language") or "en")
        output["metadata"]["w3w_api_enabled"] = bool(
            (
                context.get("w3w_api_key")
                or os.environ.get("W3W_API_KEY")
                or os.environ.get("WHAT3WORDS_API_KEY")
            )
            and context.get("w3w_allow_api", True)
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
    sources: dict[str, int] = {}
    confidence: dict[str, int] = {}

    resolved = 0
    official = 0
    synthetic = 0
    cache_hits = 0
    overlay = 0
    tor = 0
    i2p = 0

    for node in nodes:
        data = node.get("w3w_data", {})

        if not isinstance(data, Mapping):
            data = {}

        if clean(data.get("w3w")) or clean(node.get("w3w")):
            resolved += 1

        if boolish(data.get("is_official_w3w")):
            official += 1

        if boolish(data.get("is_synthetic_w3w")):
            synthetic += 1

        if boolish(data.get("cache_hit")):
            cache_hits += 1

        overlay_network = clean(data.get("overlay_network")) or clean(node.get("overlay_network"))

        if boolish(data.get("is_overlay")) or boolish(node.get("is_overlay")):
            overlay += 1

        if overlay_network == "tor" or clean(node.get("network")).lower() == "tor":
            tor += 1

        if overlay_network == "i2p" or clean(node.get("network")).lower() == "i2p":
            i2p += 1

        source = clean(data.get("source")) or "unknown"
        conf = clean(data.get("confidence")) or "unknown"

        sources[source] = sources.get(source, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1

    return {
        "schema": SUMMARY_SCHEMA,
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "resolved_w3w_nodes": resolved,
        "missing_w3w_nodes": max(0, len(nodes) - resolved),
        "official_w3w_nodes": official,
        "synthetic_w3w_nodes": synthetic,
        "cache_hit_nodes": cache_hits,
        "overlay_w3w_nodes": overlay,
        "tor_w3w_nodes": tor,
        "i2p_w3w_nodes": i2p,
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))),
        "confidence": dict(sorted(confidence.items(), key=lambda item: (-item[1], item[0]))),
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with what3words-style addresses from coordinates.",
        allow_abbrev=False,
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
