#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"
DEFAULT_SETTINGS_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "mapsettings"

DEFAULT_SETTINGS_ID = "default"


DEFAULT_SETTINGS = {
    "default": {
        "name": "Default Live Map",
        "description": "Balanced OpenStreetMap configuration for maps/ and live-map/.",
        "view": {
            "latitude": 20.0,
            "longitude": 0.0,
            "zoom": 2,
            "min_zoom": 2,
            "max_zoom": 20,
        },
        "tile": {
            "provider": "cartodb_dark",
            "url": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
            "attribution": "© OpenStreetMap contributors © CARTO",
            "subdomains": ["a", "b", "c", "d"],
        },
        "interaction": {
            "scroll_wheel_zoom": True,
            "drag_pan": True,
            "touch_zoom": True,
            "double_click_zoom": True,
            "box_zoom": True,
            "keyboard": True,
            "middle_mouse_reserved_for_network_map": True,
        },
        "refresh": {
            "enabled": True,
            "interval_seconds": 60,
            "vectors_url": "./data/map-vectors.json",
            "geojson_url": "./data/map-points.geojson",
            "settings_url": "./data/map-settings.json",
            "theme_url": "./data/map-theme.json",
            "layers_url": "./data/map-layers.json",
            "overlays_url": "./data/map-overlays.json",
            "polygons_url": "./data/map-polygons.geojson",
            "vector_types_url": "./data/vector-types.json",
        },
        "markers": {
            "radius_min": 4,
            "radius_max": 14,
            "opacity": 0.88,
            "fill_opacity": 0.72,
            "stroke_weight": 1,
            "cluster_enabled": True,
            "heatmap_enabled": True,
            "status_drives_color": True,
            "owner_type_drives_symbol": True,
        },
        "performance": {
            "max_points_before_clustering": 2500,
            "max_popup_rows": 16,
            "prefer_canvas_renderer": True,
            "chunked_loading": True,
        },
    },
    "live": {
        "name": "Live Monitoring",
        "description": "Faster refresh profile for active crawler watching.",
        "view": {
            "latitude": 20.0,
            "longitude": 0.0,
            "zoom": 2,
            "min_zoom": 2,
            "max_zoom": 20,
        },
        "tile": {
            "provider": "cartodb_dark",
            "url": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
            "attribution": "© OpenStreetMap contributors © CARTO",
            "subdomains": ["a", "b", "c", "d"],
        },
        "interaction": {
            "scroll_wheel_zoom": True,
            "drag_pan": True,
            "touch_zoom": True,
            "double_click_zoom": True,
            "box_zoom": True,
            "keyboard": True,
            "middle_mouse_reserved_for_network_map": True,
        },
        "refresh": {
            "enabled": True,
            "interval_seconds": 15,
            "vectors_url": "./data/map-vectors.json",
            "geojson_url": "./data/map-points.geojson",
            "settings_url": "./data/map-settings.json",
            "theme_url": "./data/map-theme.json",
            "layers_url": "./data/map-layers.json",
            "overlays_url": "./data/map-overlays.json",
            "polygons_url": "./data/map-polygons.geojson",
            "vector_types_url": "./data/vector-types.json",
        },
        "markers": {
            "radius_min": 4,
            "radius_max": 13,
            "opacity": 0.9,
            "fill_opacity": 0.76,
            "stroke_weight": 1,
            "cluster_enabled": True,
            "heatmap_enabled": False,
            "status_drives_color": True,
            "owner_type_drives_symbol": True,
        },
        "performance": {
            "max_points_before_clustering": 1500,
            "max_popup_rows": 12,
            "prefer_canvas_renderer": True,
            "chunked_loading": True,
        },
    },
    "analysis": {
        "name": "Analysis",
        "description": "Slower, richer map profile for deep review and dense overlays.",
        "view": {
            "latitude": 20.0,
            "longitude": 0.0,
            "zoom": 2,
            "min_zoom": 2,
            "max_zoom": 20,
        },
        "tile": {
            "provider": "cartodb_voyager",
            "url": "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
            "attribution": "© OpenStreetMap contributors © CARTO",
            "subdomains": ["a", "b", "c", "d"],
        },
        "interaction": {
            "scroll_wheel_zoom": True,
            "drag_pan": True,
            "touch_zoom": True,
            "double_click_zoom": True,
            "box_zoom": True,
            "keyboard": True,
            "middle_mouse_reserved_for_network_map": True,
        },
        "refresh": {
            "enabled": False,
            "interval_seconds": 300,
            "vectors_url": "./data/map-vectors.json",
            "geojson_url": "./data/map-points.geojson",
            "settings_url": "./data/map-settings.json",
            "theme_url": "./data/map-theme.json",
            "layers_url": "./data/map-layers.json",
            "overlays_url": "./data/map-overlays.json",
            "polygons_url": "./data/map-polygons.geojson",
            "vector_types_url": "./data/vector-types.json",
        },
        "markers": {
            "radius_min": 5,
            "radius_max": 18,
            "opacity": 0.88,
            "fill_opacity": 0.7,
            "stroke_weight": 1.25,
            "cluster_enabled": True,
            "heatmap_enabled": True,
            "status_drives_color": True,
            "owner_type_drives_symbol": True,
        },
        "performance": {
            "max_points_before_clustering": 5000,
            "max_popup_rows": 24,
            "prefer_canvas_renderer": True,
            "chunked_loading": True,
        },
    },
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


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


def settings_payload(settings_id: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-map-settings-profile-v2",
        "id": settings_id,
        "generated_at": utc_now(),
        "name": data["name"],
        "description": data["description"],
        "view": data["view"],
        "tile": data["tile"],
        "interaction": data["interaction"],
        "refresh": data["refresh"],
        "markers": data["markers"],
        "performance": data["performance"],
    }


def ensure_settings_files(settings_dir: Path, compact: bool = False) -> dict[str, Any]:
    settings_dir.mkdir(parents=True, exist_ok=True)

    entries = []

    for settings_id, data in DEFAULT_SETTINGS.items():
        payload = settings_payload(settings_id, data)
        path = settings_dir / f"{settings_id}.json"

        if not path.exists():
            write_json(path, payload, compact=compact)

        existing = read_json(path, fallback=payload)

        if not isinstance(existing, dict):
            existing = payload

        entries.append({
            "id": settings_id,
            "name": existing.get("name", data["name"]),
            "description": existing.get("description", data["description"]),
            "path": f"{settings_id}.json",
            "refresh_interval_seconds": existing.get("refresh", {}).get("interval_seconds"),
            "tile_provider": existing.get("tile", {}).get("provider"),
        })

    manifest = {
        "schema": "zzx-bitnodes-map-settings-manifest-v2",
        "generated_at": utc_now(),
        "default_settings": DEFAULT_SETTINGS_ID,
        "settings_count": len(entries),
        "profiles": entries,
    }

    write_json(settings_dir / "manifest.json", manifest, compact=compact)

    return manifest


def load_settings(settings_dir: Path, settings_id: str) -> dict[str, Any]:
    path = settings_dir / f"{settings_id}.json"
    fallback = settings_payload(DEFAULT_SETTINGS_ID, DEFAULT_SETTINGS[DEFAULT_SETTINGS_ID])
    payload = read_json(path, fallback={})

    if isinstance(payload, dict) and payload:
        return payload

    return fallback


def normalize_settings(profile: dict[str, Any]) -> dict[str, Any]:
    view = dict(profile.get("view", {}))
    tile = dict(profile.get("tile", {}))
    interaction = dict(profile.get("interaction", {}))
    refresh = dict(profile.get("refresh", {}))
    markers = dict(profile.get("markers", {}))
    performance = dict(profile.get("performance", {}))

    return {
        "schema": "zzx-bitnodes-map-settings-v2",
        "generated_at": utc_now(),
        "profile": {
            "id": profile.get("id", DEFAULT_SETTINGS_ID),
            "name": profile.get("name", "Default Live Map"),
            "description": profile.get("description", ""),
        },
        "tile_provider": tile.get("provider", "cartodb_dark"),
        "tile_url": tile.get("url", "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"),
        "tile_attribution": tile.get("attribution", "© OpenStreetMap contributors © CARTO"),
        "tile_subdomains": tile.get("subdomains", ["a", "b", "c", "d"]),
        "initial_view": {
            "latitude": view.get("latitude", 20.0),
            "longitude": view.get("longitude", 0.0),
            "zoom": view.get("zoom", 2),
            "min_zoom": view.get("min_zoom", 2),
            "max_zoom": view.get("max_zoom", 20),
        },
        "interaction": {
            "scroll_wheel_zoom": interaction.get("scroll_wheel_zoom", True),
            "drag_pan": interaction.get("drag_pan", True),
            "touch_zoom": interaction.get("touch_zoom", True),
            "double_click_zoom": interaction.get("double_click_zoom", True),
            "box_zoom": interaction.get("box_zoom", True),
            "keyboard": interaction.get("keyboard", True),
            "middle_mouse_reserved_for_network_map": interaction.get("middle_mouse_reserved_for_network_map", True),
        },
        "refresh": {
            "enabled": refresh.get("enabled", True),
            "interval_seconds": refresh.get("interval_seconds", 60),
            "vectors_url": refresh.get("vectors_url", "./data/map-vectors.json"),
            "geojson_url": refresh.get("geojson_url", "./data/map-points.geojson"),
            "settings_url": refresh.get("settings_url", "./data/map-settings.json"),
            "theme_url": refresh.get("theme_url", "./data/map-theme.json"),
            "layers_url": refresh.get("layers_url", "./data/map-layers.json"),
            "overlays_url": refresh.get("overlays_url", "./data/map-overlays.json"),
            "polygons_url": refresh.get("polygons_url", "./data/map-polygons.geojson"),
            "vector_types_url": refresh.get("vector_types_url", "./data/vector-types.json"),
        },
        "marker": {
            "radius_min": markers.get("radius_min", 4),
            "radius_max": markers.get("radius_max", 14),
            "opacity": markers.get("opacity", 0.88),
            "fill_opacity": markers.get("fill_opacity", 0.72),
            "stroke_weight": markers.get("stroke_weight", 1),
            "cluster_enabled": markers.get("cluster_enabled", True),
            "heatmap_enabled": markers.get("heatmap_enabled", True),
            "status_drives_color": markers.get("status_drives_color", True),
            "owner_type_drives_symbol": markers.get("owner_type_drives_symbol", True),
        },
        "performance": {
            "max_points_before_clustering": performance.get("max_points_before_clustering", 2500),
            "max_popup_rows": performance.get("max_popup_rows", 16),
            "prefer_canvas_renderer": performance.get("prefer_canvas_renderer", True),
            "chunked_loading": performance.get("chunked_loading", True),
        },
    }


def merge_settings(
    payload: dict[str, Any],
    *,
    settings_dir: Path,
    selected_settings: str,
    compact: bool = False,
) -> dict[str, Any]:
    output = dict(payload)

    manifest = ensure_settings_files(settings_dir, compact=compact)
    profile = load_settings(settings_dir, selected_settings)
    settings = normalize_settings(profile)

    existing = dict(output.get("settings", {}))
    merged = {
        **settings,
        **existing,
    }

    merged["settings_manifest"] = {
        "url": "./data/map-settings-profiles.json",
        "selected": profile.get("id", selected_settings),
        "user_selectable": True,
    }

    output["settings"] = merged
    output["settings_profiles"] = manifest

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}

    settings_dir = Path(
        context.get("settings_dir")
        or context.get("map_settings_dir")
        or DEFAULT_SETTINGS_DIR
    )

    selected_settings = str(
        context.get("settings")
        or context.get("selected_settings")
        or DEFAULT_SETTINGS_ID
    )

    compact = bool(context.get("compact", False))

    return merge_settings(
        payload,
        settings_dir=settings_dir,
        selected_settings=selected_settings,
        compact=compact,
    )


def sync_settings_assets(
    *,
    settings_dir: Path,
    map_dir: Path,
    live_map_dir: Path,
    selected_settings: str,
    compact: bool = False,
) -> dict[str, Any]:
    manifest = ensure_settings_files(settings_dir, compact=compact)
    profile = load_settings(settings_dir, selected_settings)
    settings = normalize_settings(profile)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"
        target_settings_dir = data_dir / "settings"

        target_settings_dir.mkdir(parents=True, exist_ok=True)

        write_json(data_dir / "map-settings-profiles.json", manifest, compact=compact)
        write_json(data_dir / "map-settings.json", settings, compact=compact)

        for entry in manifest["profiles"]:
            src = settings_dir / entry["path"]
            dst = target_settings_dir / entry["path"]
            write_json(dst, read_json(src, fallback={}), compact=compact)

    return {
        "schema": "zzx-bitnodes-mapsettings-build-report-v2",
        "generated_at": utc_now(),
        "settings_dir": str(settings_dir),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "selected_settings": profile.get("id", selected_settings),
        "settings_count": manifest["settings_count"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build selectable JSON settings profiles for Bitnodes maps and live-map pages."
    )

    parser.add_argument("--settings-dir", default=str(DEFAULT_SETTINGS_DIR))
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--settings", default=DEFAULT_SETTINGS_ID)
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = sync_settings_assets(
        settings_dir=Path(args.settings_dir).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        selected_settings=args.settings,
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map settings complete: "
        f"{report['settings_count']} profiles, "
        f"selected={report['selected_settings']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
