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
DEFAULT_ZZXGCS_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo" / "zzxgcs"

SCHEMA = "zzx-bitnodes-map-zzxgcs-addresses-v1"


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


def point_zzxgcs(point: Mapping[str, Any]) -> str:
    value = clean(first(point, (
        "zzxgcs",
        "zzx_gcs",
        "map_zzxgcs",
        "zzxgcs_data.zzxgcs",
        "zzxgcs_data.address",
        "zzxgcs_data.words",
        "geo.zzxgcs",
        "geoloc.zzxgcs",
        "metadata.zzxgcs",
        "metadata.zzx_gcs",
    )))

    if isinstance(value, str) and value.startswith("[") and value.endswith("]"):
        try:
            decoded = json.loads(value)
            if isinstance(decoded, list):
                value = ".".join(str(item).strip() for item in decoded if str(item).strip())
        except Exception:
            pass

    if value and not value.startswith("zzx://"):
        value = f"zzx://{value.removeprefix('zzx:').lstrip('/')}"

    return value


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


def load_zzxgcs_reference(zzxgcs_dir: Path) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    for candidate in (
        zzxgcs_dir / "zzxgcs-addresses.json",
        zzxgcs_dir / "mapzzxgcsaddresses.json",
        zzxgcs_dir / "zzxgcs-cache.json",
    ):
        data = read_json(candidate, fallback={})
        if not isinstance(data, dict):
            continue

        rows = data.get("addresses", data.get("entries", data))

        if isinstance(rows, dict):
            for key, row in rows.items():
                if isinstance(row, dict):
                    address = clean(row.get("zzxgcs") or row.get("address") or key)
                    if address:
                        if not address.startswith("zzx://"):
                            address = f"zzx://{address.removeprefix('zzx:').lstrip('/')}"
                        refs[address] = row

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue

                address = clean(row.get("zzxgcs") or row.get("address") or row.get("words"))
                if address:
                    if not address.startswith("zzx://"):
                        address = f"zzx://{address.removeprefix('zzx:').lstrip('/')}"
                    refs[address] = row

    return refs


def build_zzxgcs_summary(rows: list[dict[str, Any]], refs: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}

    for row in rows:
        address = point_zzxgcs(row)

        if not address:
            continue

        ref = refs.get(address, {})
        words_raw = first(row, ("zzxgcs_data.words",))

        if isinstance(words_raw, list):
            words = [str(item) for item in words_raw]
        else:
            words = address.replace("zzx://", "").split(".") if address else []

        item = grouped.setdefault(address, {
            "id": address,
            "zzxgcs": address,
            "words": words,
            "country": point_country(row),
            "city": point_city(row),
            "language": clean(ref.get("language") or first(row, ("zzxgcs_data.language",))) or "en",
            "volume": clean(ref.get("volume") or first(row, ("zzxgcs_data.volume",))) or "zzxgcs-v1",
            "version": clean(ref.get("version") or first(row, ("zzxgcs_data.version",))) or "1.0.0",
            "source": clean(ref.get("source") or first(row, ("zzxgcs_data.source",))) or "zzx-gcs-local-deterministic",
            "confidence": clean(ref.get("confidence") or first(row, ("zzxgcs_data.confidence",))) or "unknown",
            "point_count": 0,
            "network_counts": {},
            "status_counts": {},
            "nodes": [],
        })

        item["point_count"] += 1

        network = point_network(row)
        status = point_status(row)

        item["network_counts"][network] = item["network_counts"].get(network, 0) + 1
        item["status_counts"][status] = item["status_counts"].get(status, 0) + 1

        node_address = point_address(row)
        if node_address:
            item["nodes"].append(node_address)

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
        "zzxgcs_address_count": len(addresses),
        "addresses": dict(sorted(addresses.items(), key=lambda pair: (-pair[1]["point_count"], pair[0]))),
    }


def build_zzxgcs_layers(payload: Mapping[str, Any]) -> dict[str, Any]:
    addresses = payload.get("addresses", {})
    if not isinstance(addresses, Mapping):
        addresses = {}

    layers = []

    for address, item in addresses.items():
        if not isinstance(item, Mapping):
            continue

        layers.append({
            "id": f"zzxgcs:{address}",
            "label": address,
            "kind": "zzxgcs-address-filter",
            "enabled": True,
            "visible": False,
            "color": "#e6a42b",
            "point_count": item.get("point_count", 0),
            "filter": {
                "type": "zzxgcs",
                "key": "map_zzxgcs",
                "value": address,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-zzxgcs-address-layers-v1",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []

    for row in rows:
        item = dict(row)
        address = point_zzxgcs(item)

        item["map_zzxgcs"] = address
        item["map_zzxgcs_label"] = address or "No ZZX-GCS address"
        item["map_zzxgcs_color"] = "#e6a42b" if address else "#8c927e"

        output.append(item)

    return output


def merge_zzxgcs_addresses(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    zzxgcs_dir = Path(context.get("zzxgcs_dir") or context.get("map_zzxgcs_dir") or DEFAULT_ZZXGCS_DIR)

    output = dict(payload)
    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    refs = load_zzxgcs_reference(zzxgcs_dir)

    annotated = annotate_points(rows)
    zzxgcs_payload = build_zzxgcs_summary(annotated, refs)
    zzxgcs_layers = build_zzxgcs_layers(zzxgcs_payload)

    if vectors_payload:
        vectors_payload["points"] = annotated
        output["vectors"] = vectors_payload

    output["zzxgcs_addresses"] = zzxgcs_payload
    output["zzxgcs_address_layers"] = zzxgcs_layers

    settings = dict(output.get("settings", {}))
    settings["zzxgcs_addresses"] = {
        "url": "./data/map-zzxgcs-addresses.json",
        "layers_url": "./data/map-zzxgcs-address-layers.json",
        "zzxgcs_dir": str(zzxgcs_dir),
        "enabled": True,
        "user_selectable": True,
        "note": "ZZX-GCS values may be official ZZX-GCS list results or deterministic local fallback values.",
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_zzxgcs_addresses(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    zzxgcs_dir: Path = DEFAULT_ZZXGCS_DIR,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})
    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_zzxgcs_addresses(payload, {"zzxgcs_dir": str(zzxgcs_dir)})
    zzxgcs_payload = merged["zzxgcs_addresses"]
    zzxgcs_layers = merged["zzxgcs_address_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"

        write_json(data_dir / "map-zzxgcs-addresses.json", zzxgcs_payload, compact=compact)
        write_json(data_dir / "map-zzxgcs-address-layers.json", zzxgcs_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})
        if not isinstance(settings, dict):
            settings = {}

        settings["zzxgcs_addresses"] = merged["settings"]["zzxgcs_addresses"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapzzxgcsaddresses-build-report-v1",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "zzxgcs_dir": str(zzxgcs_dir),
        "zzxgcs_address_count": zzxgcs_payload.get("zzxgcs_address_count", 0),
        "total_points": zzxgcs_payload.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Bitnodes map ZZX-GCS address summaries and filters.")
    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--zzxgcs-dir", default=str(DEFAULT_ZZXGCS_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        zzxgcs_dir=Path(args.zzxgcs_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map zzxgcs addresses complete: "
        f"{report['zzxgcs_address_count']} addresses, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
