#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[3]
BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))

DEFAULT_MAP_DIR = BITNODES_ROOT / "maps"
DEFAULT_LIVE_MAP_DIR = BITNODES_ROOT / "live-map"

OPENSTREETMAP_TILESETS = {
    "openstreetmap": {
        "id": "openstreetmap",
        "name": "OpenStreetMap Standard",
        "url": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "attribution": "© OpenStreetMap contributors",
        "subdomains": ["a", "b", "c"],
        "min_zoom": 2,
        "max_zoom": 19,
    },
    "osm_hot": {
        "id": "osm_hot",
        "name": "OpenStreetMap Humanitarian",
        "url": "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
        "attribution": "© OpenStreetMap contributors, Tiles style by HOT",
        "subdomains": ["a", "b", "c"],
        "min_zoom": 2,
        "max_zoom": 19,
    },
    "cartodb_dark": {
        "id": "cartodb_dark",
        "name": "CartoDB Dark Matter",
        "url": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        "attribution": "© OpenStreetMap contributors © CARTO",
        "subdomains": ["a", "b", "c", "d"],
        "min_zoom": 2,
        "max_zoom": 20,
    },
    "cartodb_voyager": {
        "id": "cartodb_voyager",
        "name": "CartoDB Voyager",
        "url": "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        "attribution": "© OpenStreetMap contributors © CARTO",
        "subdomains": ["a", "b", "c", "d"],
        "min_zoom": 2,
        "max_zoom": 20,
    },
}

SCHEMA = "zzx-bitnodes-openstreetmaps-v4"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback

        if path.name.endswith(".gz"):
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)

        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
            default=str,
        ) + "\n",
        encoding="utf-8",
    )


def selected_tileset(tile_provider: str) -> dict[str, Any]:
    return dict(OPENSTREETMAP_TILESETS.get(tile_provider, OPENSTREETMAP_TILESETS["cartodb_dark"]))


def default_openstreetmaps_payload(tile_provider: str = "cartodb_dark") -> dict[str, Any]:
    selected = selected_tileset(tile_provider)

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "engine": "leaflet",
        "provider": selected["id"],
        "selected_tileset": selected,
        "tilesets": OPENSTREETMAP_TILESETS,
        "library": {
            "leaflet_css": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
            "leaflet_js": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
            "local_leaflet_css": "../../vendor/leaflet/leaflet.css",
            "local_leaflet_js": "../../vendor/leaflet/leaflet.js",
            "preferred_production_mode": "vendor-local",
        },
        "controls": {
            "zoom": True,
            "scale": True,
            "layers": True,
            "fullscreen_placeholder": True,
            "measure_placeholder": True,
            "locate_placeholder": True,
        },
        "interaction": {
            "drag_pan": True,
            "scroll_wheel_zoom": True,
            "double_click_zoom": True,
            "box_zoom": True,
            "keyboard": True,
            "touch_zoom": True,
            "middle_mouse_drag_reserved_for_network_map": True,
        },
        "view": {
            "latitude": 20.0,
            "longitude": 0.0,
            "zoom": 2,
            "min_zoom": selected.get("min_zoom", 2),
            "max_zoom": selected.get("max_zoom", 20),
        },
        "overlay_channels": {
            "tor": {
                "name": "Tor Atlantic Channel",
                "latitude": 0.0,
                "longitude": -32.0,
                "color": "#9d67ad",
                "symbolic": True,
            },
            "i2p": {
                "name": "I2P Indian Ocean Channel",
                "latitude": 0.0,
                "longitude": 32.0,
                "color": "#b889ff",
                "symbolic": True,
            },
        },
        "red_ring_semantics": {
            "is_sanctioned_node": "red marker ring",
            "is_policy_restricted_node": "red-orange marker ring",
            "confirmed_or_high_threat": "red marker/ring",
        },
    }


def merge_settings(payload: dict[str, Any], osm: dict[str, Any]) -> dict[str, Any]:
    output = dict(payload)
    settings = dict(output.get("settings", {}))
    selected = osm["selected_tileset"]

    settings["tile_provider"] = osm["provider"]
    settings["tile_url"] = selected["url"]
    settings["tile_attribution"] = selected["attribution"]
    settings["tile_subdomains"] = selected.get("subdomains", [])
    settings["tile_min_zoom"] = selected.get("min_zoom", 2)
    settings["tile_max_zoom"] = selected.get("max_zoom", 20)
    settings["openstreetmaps"] = osm

    initial_view = dict(settings.get("initial_view", {}))
    initial_view.setdefault("latitude", osm["view"]["latitude"])
    initial_view.setdefault("longitude", osm["view"]["longitude"])
    initial_view.setdefault("zoom", osm["view"]["zoom"])
    initial_view.setdefault("min_zoom", osm["view"]["min_zoom"])
    initial_view.setdefault("max_zoom", osm["view"]["max_zoom"])
    settings["initial_view"] = initial_view

    interaction = dict(settings.get("interaction", {}))
    interaction.update(osm["interaction"])
    settings["interaction"] = interaction

    settings.setdefault("refresh", {})
    if isinstance(settings["refresh"], dict):
        settings["refresh"].setdefault("vectors_url", "./data/map-vectors.json")
        settings["refresh"].setdefault("geojson_url", "./data/map-points.geojson")
        settings["refresh"].setdefault("settings_url", "./data/map-settings.json")
        settings["refresh"].setdefault("theme_url", "./data/map-theme.json")
        settings["refresh"].setdefault("layers_url", "./data/map-layers.json")
        settings["refresh"].setdefault("overlays_url", "./data/map-overlays.json")
        settings["refresh"].setdefault("polygons_url", "./data/map-polygons.geojson")

    output["settings"] = settings
    output["openstreetmaps"] = osm
    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    tile_provider = str(context.get("tile_provider") or context.get("osm_tile_provider") or "cartodb_dark")
    return merge_settings(payload, default_openstreetmaps_payload(tile_provider))


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return build(payload, context)


def build_standalone(
    *,
    output_dir: Path,
    live_map_dir: Path,
    tile_provider: str,
    compact: bool = False,
) -> dict[str, Any]:
    osm = default_openstreetmaps_payload(tile_provider)

    for directory in (output_dir, live_map_dir):
        write_json(directory / "data" / "openstreetmaps.json", osm, compact=compact)

        settings_path = directory / "data" / "map-settings.json"
        settings = read_json(settings_path, fallback={})
        if not isinstance(settings, dict):
            settings = {}

        merged = merge_settings({"settings": settings}, osm)
        write_json(settings_path, merged["settings"], compact=compact)

    return {
        "schema": "zzx-bitnodes-openstreetmaps-build-report-v4",
        "generated_at": utc_now(),
        "map_dir": str(output_dir),
        "live_map_dir": str(live_map_dir),
        "tile_provider": tile_provider,
        "provider": osm["provider"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build OpenStreetMap/Leaflet map configuration for ZZX Bitnodes maps.",
        allow_abbrev=False,
    )

    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--tile-provider", default="cartodb_dark", choices=sorted(OPENSTREETMAP_TILESETS.keys()))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        output_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        tile_provider=args.tile_provider,
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "openstreetmaps config complete: "
        f"provider={report['provider']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
