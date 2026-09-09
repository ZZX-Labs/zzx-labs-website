#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

SCHEMA = "zzx-bitnodes-map-vectors-public-v2"

DROP_KEYS = {
    "raw", "raw_json", "payload", "record", "source_row", "source_record",
    "snapshot", "snapshot_row", "original", "original_row", "full_record",
    "geoip_data", "geoloc", "location", "debug", "trace", "history",
    "archive", "archive_record", "database_record", "serialized",
}

KEEP_NESTED = {
    "style", "vector", "display", "network", "client", "geo", "metrics",
}

CANONICAL_PROP_KEYS = (
    "id", "node_id", "address", "host", "hostname", "port", "network",
    "protocol_version", "version", "user_agent", "subver", "services",
    "height", "block_height", "reachable", "reachable_now", "reachable_24h",
    "status", "last_seen", "connected_since", "country", "country_code",
    "flag", "region", "region_code", "territory", "county", "admin1_code",
    "admin2_code", "city", "postal_code", "timezone", "asn", "organization",
    "org", "isp", "source", "source_id", "client", "client_family",
    "client_version", "label", "title", "color", "fill", "stroke", "radius",
    "size", "symbol", "icon", "layer", "vector_type", "network_type",
    "owner_symbol", "bearing", "heading", "weight", "score", "confidence",
)


def encoded_size(value: Any) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def sanitize(value: Any, *, depth: int = 0, max_string: int = 2048) -> Any:
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        return value if len(value) <= max_string else value[:max_string]
    if depth >= 2:
        return None
    if isinstance(value, list):
        if len(value) > 64:
            return None
        out = []
        for item in value:
            clean = sanitize(item, depth=depth + 1, max_string=max_string)
            if clean is not None:
                out.append(clean)
        return out
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            k = str(key)
            if k.lower() in DROP_KEYS:
                continue
            clean = sanitize(item, depth=depth + 1, max_string=max_string)
            if clean is not None:
                out[k] = clean
        return out
    return str(value)[:max_string]


def feature_projection(feature: dict[str, Any], index: int) -> dict[str, Any]:
    geometry = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else {}
    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or len(coords) < 2:
        raise ValueError(f"feature {index} has no point coordinates")
    lon = float(coords[0])
    lat = float(coords[1])
    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError(f"feature {index} has invalid coordinates")
    props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}

    out: dict[str, Any] = {
        "id": str(props.get("id") or props.get("node_id") or props.get("address") or feature.get("id") or index),
        "lat": lat,
        "lon": lon,
        "latitude": lat,
        "longitude": lon,
        "x": lon,
        "y": lat,
        "coordinates": [lon, lat],
    }
    for key in CANONICAL_PROP_KEYS:
        if key not in props:
            continue
        clean = sanitize(props.get(key), max_string=1024)
        if clean is not None:
            out[key] = clean

    # Preserve other scalar display properties without carrying nested raw node payloads.
    for key, value in props.items():
        if key in out or key.lower() in DROP_KEYS:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            clean = sanitize(value, max_string=1024)
            if clean is not None:
                out[key] = clean
        elif key in KEEP_NESTED:
            clean = sanitize(value, depth=0, max_string=512)
            if clean is not None and encoded_size(clean) <= 8192:
                out[key] = clean
    return out


def merge_original(projected: dict[str, Any], original: Any) -> dict[str, Any]:
    if not isinstance(original, dict):
        return projected
    out = dict(projected)
    for key, value in original.items():
        k = str(key)
        if k in out or k.lower() in DROP_KEYS:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            clean = sanitize(value, max_string=1024)
            if clean is not None:
                out[k] = clean
        elif k in KEEP_NESTED:
            clean = sanitize(value, depth=0, max_string=512)
            if clean is not None and encoded_size(clean) <= 8192:
                out[k] = clean
    return out


def compact_one(vector_path: Path, *, max_bytes: int) -> dict[str, Any]:
    geo_path = vector_path.with_name("map-points.geojson")
    if not geo_path.is_file():
        raise FileNotFoundError(f"missing sibling GeoJSON for {vector_path}: {geo_path}")

    original = json.loads(vector_path.read_text(encoding="utf-8"))
    geo = json.loads(geo_path.read_text(encoding="utf-8"))
    features = geo.get("features") if isinstance(geo, dict) else None
    if not isinstance(features, list) or not features:
        raise ValueError(f"empty or invalid GeoJSON features: {geo_path}")

    old_points = original.get("points") if isinstance(original, dict) else None
    if not isinstance(old_points, list):
        old_points = []

    points = []
    for index, feature in enumerate(features):
        if not isinstance(feature, dict):
            raise ValueError(f"invalid GeoJSON feature {index} in {geo_path}")
        projected = feature_projection(feature, index)
        original_point = old_points[index] if index < len(old_points) else None
        points.append(merge_original(projected, original_point))

    result: dict[str, Any] = {
        "schema": SCHEMA,
        "source_geojson": geo_path.name,
        "point_count": len(points),
        "points": points,
    }

    if isinstance(original, dict):
        for key, value in original.items():
            if key in {"points", "schema"}:
                continue
            if isinstance(value, (str, int, float, bool)) or value is None:
                result[key] = sanitize(value, max_string=2048)
            elif key in {"bounds", "bbox", "meta", "summary", "settings", "theme"}:
                clean = sanitize(value, depth=0, max_string=1024)
                if clean is not None and encoded_size(clean) <= 262144:
                    result[key] = clean

    blob = (json.dumps(result, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")
    if len(blob) > max_bytes:
        # Strict fallback: feature projection only; this preserves the public map contract
        # while dropping every nonessential original-vector scalar.
        result = {
            "schema": SCHEMA,
            "source_geojson": geo_path.name,
            "point_count": len(features),
            "points": [feature_projection(feature, i) for i, feature in enumerate(features)],
        }
        blob = (json.dumps(result, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")

    if len(blob) > max_bytes:
        raise ValueError(f"compacted vector artifact still exceeds limit: {len(blob)} > {max_bytes}: {vector_path}")

    before = vector_path.stat().st_size
    vector_path.write_bytes(blob)
    digest = hashlib.sha256(blob).hexdigest()
    return {
        "path": str(vector_path),
        "before_bytes": before,
        "after_bytes": len(blob),
        "points": len(points),
        "sha256": digest,
    }


def compact_roots(roots: list[Path], *, max_bytes: int) -> list[dict[str, Any]]:
    paths = []
    seen = set()
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("map-vectors.json"):
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            paths.append(path)
    if not paths:
        raise FileNotFoundError("no map-vectors.json files found under requested roots")
    reports = [compact_one(path, max_bytes=max_bytes) for path in sorted(paths)]
    return reports


def main() -> int:
    ap = argparse.ArgumentParser(description="Compact public Bitnodes map-vectors.json artifacts from validated map-points.geojson files")
    ap.add_argument("--root", action="append", required=True, help="Map root to scan recursively; repeatable")
    ap.add_argument("--max-bytes", type=int, default=24_000_000)
    ap.add_argument("--report", default="")
    args = ap.parse_args()
    if args.max_bytes < 1:
        raise SystemExit("--max-bytes must be positive")
    reports = compact_roots([Path(p) for p in args.root], max_bytes=args.max_bytes)
    payload = {
        "schema": "zzx-bitnodes-map-vector-compaction-report-v1",
        "files": reports,
        "total_before_bytes": sum(r["before_bytes"] for r in reports),
        "total_after_bytes": sum(r["after_bytes"] for r in reports),
    }
    if args.report:
        Path(args.report).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
