#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"
DEFAULT_GEOHASH_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo" / "geohash"

SCHEMA = "zzx-bitnodes-map-geohashids-v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()
    if text.lower() in {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}:
        return ""
    return " ".join(text.split())


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}
    if not path.exists():
        return fallback
    try:
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


def first(row: Mapping[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = deep_get(row, key)
        if value not in ("", None):
            return value
    return None


def vectors(payload: Mapping[str, Any]) -> dict[str, Any]:
    value = payload.get("vectors", {})
    return value if isinstance(value, dict) else {}


def points(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    vp = vectors(payload)

    for key in ("points", "results", "data"):
        value = vp.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    for key in ("points", "results", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    return []


def point_geohash(point: Mapping[str, Any]) -> str:
    raw = clean(first(point, (
        "geohash",
        "map_geohash",
        "geohashid_data.geohash",
        "geo.geohash",
        "geoloc.geohash",
        "metadata.geohash",
    )))

    if raw.startswith("gh:"):
        raw = raw.split(":", 1)[1]

    return raw.lower()


def point_geohashid(point: Mapping[str, Any]) -> str:
    raw = clean(first(point, (
        "geohashid",
        "map_geohashid",
        "geohashid_data.geohashid",
        "metadata.geohashid",
    )))

    if raw:
        return raw.lower()

    geohash = point_geohash(point)

    if geohash:
        return f"gh:{geohash}"

    return ""


def point_country(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "map_country",
        "country",
        "country_code",
        "geoip.country_code",
        "metadata.country_code",
    ))).upper() or "UNKNOWN"


def point_city(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "map_city_name",
        "city",
        "city_name",
        "place_name",
        "geoip.city",
        "metadata.city",
    ))) or "Unknown"


def point_network(point: Mapping[str, Any]) -> str:
    network = clean(first(point, ("network", "metadata.network"))).lower()
    if network:
        return network

    address = clean(first(point, ("address", "host", "node", "addr"))).lower()
    if ".onion" in address:
        return "tor"
    if ".i2p" in address:
        return "i2p"
    if ":" in address and ".onion" not in address and ".i2p" not in address:
        return "ipv6"
    if address.count(".") >= 3:
        return "ipv4"
    return "unknown"


def point_status(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("status", "metadata.status"))).lower() or "unknown"


def point_address(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("address", "host", "node", "addr", "hostname")))


def load_geohash_reference(geohash_dir: Path) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    for candidate in (
        geohash_dir / "geohash-cache.json",
        geohash_dir / "geohashids.json",
        geohash_dir / "mapgeohashids.json",
    ):
        data = read_json(candidate, fallback={})
        if not isinstance(data, dict):
            continue

        rows = data.get("entries", data.get("geohashes", data.get("addresses", data)))

        if isinstance(rows, dict):
            for key, row in rows.items():
                if isinstance(row, dict):
                    gh = clean(row.get("geohash") or key).lower()
                    ghid = clean(row.get("geohashid") or f"gh:{gh}").lower()
                    if gh:
                        refs[gh] = row
                    if ghid:
                        refs[ghid] = row

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue
                gh = clean(row.get("geohash")).lower()
                ghid = clean(row.get("geohashid") or f"gh:{gh}").lower()
                if gh:
                    refs[gh] = row
                if ghid:
                    refs[ghid] = row

    return refs


def build_geohash_summary(rows: list[dict[str, Any]], refs: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}

    for row in rows:
        geohash = point_geohash(row)
        geohashid = point_geohashid(row)

        if not geohash and not geohashid:
            continue

        key = geohashid or f"gh:{geohash}"
        ref = refs.get(key) or refs.get(geohash) or {}

        item = grouped.setdefault(key, {
            "id": key,
            "geohash": geohash or clean(ref.get("geohash")).lower(),
            "geohashid": key,
            "country": point_country(row),
            "city": point_city(row),
            "precision": len(geohash or clean(ref.get("geohash"))),
            "source": clean(ref.get("source") or first(row, ("geohashid_data.source",))) or "node-enrichment",
            "confidence": clean(ref.get("confidence") or first(row, ("geohashid_data.confidence",))) or "deterministic",
            "point_count": 0,
            "network_counts": {},
            "status_counts": {},
            "nodes": [],
        })

        for attr in (
            "center_latitude",
            "center_longitude",
            "lat_min",
            "lat_max",
            "lon_min",
            "lon_max",
            "lat_error",
            "lon_error",
        ):
            value = ref.get(attr) if isinstance(ref, Mapping) else None
            if value is None:
                value = first(row, (f"geohashid_data.{attr}",))
            if value is not None:
                item[attr] = value

        item["point_count"] += 1

        network = point_network(row)
        status = point_status(row)

        item["network_counts"][network] = item["network_counts"].get(network, 0) + 1
        item["status_counts"][status] = item["status_counts"].get(status, 0) + 1

        node = point_address(row)
        if node:
            item["nodes"].append(node)

    addresses = {}

    for key, item in grouped.items():
        item["network_counts"] = dict(sorted(item["network_counts"].items()))
        item["status_counts"] = dict(sorted(item["status_counts"].items()))
        item["nodes"] = sorted(set(item["nodes"]))
        addresses[key] = item

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "geohashid_count": len(addresses),
        "addresses": dict(sorted(addresses.items(), key=lambda pair: (-pair[1]["point_count"], pair[0]))),
    }


def build_geohash_layers(payload: Mapping[str, Any]) -> dict[str, Any]:
    addresses = payload.get("addresses", {})
    if not isinstance(addresses, Mapping):
        addresses = {}

    layers = []

    for geohashid, item in addresses.items():
        if not isinstance(item, Mapping):
            continue

        layers.append({
            "id": f"geohashid:{geohashid}",
            "label": geohashid,
            "kind": "geohashid-filter",
            "enabled": True,
            "visible": False,
            "color": "#70b7ff",
            "point_count": item.get("point_count", 0),
            "filter": {
                "type": "geohashid",
                "key": "map_geohashid",
                "value": geohashid,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-geohashid-layers-v1",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []

    for row in rows:
        item = dict(row)
        geohash = point_geohash(item)
        geohashid = point_geohashid(item)

        item["map_geohash"] = geohash
        item["map_geohashid"] = geohashid
        item["map_geohashid_label"] = geohashid or "No GeoHashID"
        item["map_geohashid_color"] = "#70b7ff" if geohashid else "#8c927e"

        output.append(item)

    return output


def merge_geohashids(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    geohash_dir = Path(context.get("geohash_dir") or context.get("map_geohash_dir") or DEFAULT_GEOHASH_DIR)

    output = dict(payload)
    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    refs = load_geohash_reference(geohash_dir)

    annotated = annotate_points(rows)
    geohash_payload = build_geohash_summary(annotated, refs)
    geohash_layers = build_geohash_layers(geohash_payload)

    if vectors_payload:
        vectors_payload["points"] = annotated
        output["vectors"] = vectors_payload

    output["geohashids"] = geohash_payload
    output["geohashid_layers"] = geohash_layers

    settings = dict(output.get("settings", {}))
    settings["geohashids"] = {
        "url": "./data/map-geohashids.json",
        "layers_url": "./data/map-geohashid-layers.json",
        "geohash_dir": str(geohash_dir),
        "enabled": True,
        "user_selectable": True,
        "note": "GeoHashID values are deterministic local geohash buckets derived from available coordinates.",
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_geohashids(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    geohash_dir: Path = DEFAULT_GEOHASH_DIR,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})
    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_geohashids(payload, {"geohash_dir": str(geohash_dir)})
    geohash_payload = merged["geohashids"]
    geohash_layers = merged["geohashid_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"

        write_json(data_dir / "map-geohashids.json", geohash_payload, compact=compact)
        write_json(data_dir / "map-geohashid-layers.json", geohash_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})
        if not isinstance(settings, dict):
            settings = {}

        settings["geohashids"] = merged["settings"]["geohashids"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapgeohashids-build-report-v1",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "geohash_dir": str(geohash_dir),
        "geohashid_count": geohash_payload.get("geohashid_count", 0),
        "total_points": geohash_payload.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Bitnodes map GeoHashID summaries and filters.")
    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--geohash-dir", default=str(DEFAULT_GEOHASH_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        geohash_dir=Path(args.geohash_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map geohashids complete: "
        f"{report['geohashid_count']} geohashids, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
