#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_THEME_DIR = APP_ROOT / "tools" / "bitnodes" / "data" / "mapthemes"
DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"

DEFAULT_THEME = "zzx_dark_olive"

THEME_FILES = {
    "zzx_dark_olive": {
        "name": "ZZX Dark Olive",
        "description": "Default ZZX-Labs dark tactical olive/ochre map theme.",
        "font_family": "IBM Plex Mono, monospace",
        "heading_font_family": "var(--bn-heading, IBM Plex Mono, monospace)",
        "colors": {
            "background": "#050705",
            "panel": "#080b08",
            "panel_alt": "#10140d",
            "text": "#edf7b9",
            "muted": "#ccd8b6",
            "accent": "#c0d674",
            "accent_soft": "#617039",
            "ochre": "#e6a42b",
            "danger": "#d95c5c",
            "warning": "#e6a42b",
            "purple": "#9d67ad",
            "blue": "#70b7ff",
            "unknown": "#8c927e"
        },
        "markers": {
            "duplicate_location": "#d95c5c",
            "not_yet_synced": "#9d67ad",
            "stable_48h_plus": "#c0d674",
            "synced_10m_plus": "#e6a42b",
            "synced": "#edf7b9",
            "ipv4": "#c0d674",
            "ipv6": "#70b7ff",
            "tor": "#9d67ad",
            "i2p": "#b889ff",
            "unknown": "#8c927e"
        },
        "layout": {
            "border_radius": "18px",
            "panel_padding": "1.1rem",
            "control_radius": "999px",
            "shadow": "0 16px 34px rgba(0,0,0,0.32)"
        },
        "tiles": {
            "provider": "cartodb_dark"
        }
    },
    "terminal_green": {
        "name": "Terminal Green",
        "description": "Classic monochrome terminal map with high contrast green telemetry.",
        "font_family": "IBM Plex Mono, monospace",
        "heading_font_family": "IBM Plex Mono, monospace",
        "colors": {
            "background": "#020402",
            "panel": "#041004",
            "panel_alt": "#071807",
            "text": "#d9ffd0",
            "muted": "#8fbf85",
            "accent": "#78ff66",
            "accent_soft": "#245c20",
            "ochre": "#b7ff66",
            "danger": "#ff5f56",
            "warning": "#ffe66d",
            "purple": "#b48cff",
            "blue": "#66d9ff",
            "unknown": "#6f7f6b"
        },
        "markers": {
            "duplicate_location": "#ff5f56",
            "not_yet_synced": "#b48cff",
            "stable_48h_plus": "#78ff66",
            "synced_10m_plus": "#ffe66d",
            "synced": "#d9ffd0",
            "ipv4": "#78ff66",
            "ipv6": "#66d9ff",
            "tor": "#b48cff",
            "i2p": "#d28cff",
            "unknown": "#6f7f6b"
        },
        "layout": {
            "border_radius": "10px",
            "panel_padding": "1rem",
            "control_radius": "6px",
            "shadow": "0 0 28px rgba(120,255,102,0.08)"
        },
        "tiles": {
            "provider": "cartodb_dark"
        }
    },
    "amber_ops": {
        "name": "Amber Operations",
        "description": "Black and amber operations-room theme for warm tactical dashboards.",
        "font_family": "IBM Plex Mono, monospace",
        "heading_font_family": "IBM Plex Mono, monospace",
        "colors": {
            "background": "#070502",
            "panel": "#120d05",
            "panel_alt": "#1b1308",
            "text": "#ffe4ad",
            "muted": "#c8a66f",
            "accent": "#ffb84d",
            "accent_soft": "#6a4215",
            "ochre": "#f2a93b",
            "danger": "#ff6b5f",
            "warning": "#ffd166",
            "purple": "#c792ea",
            "blue": "#7dcfff",
            "unknown": "#8d806c"
        },
        "markers": {
            "duplicate_location": "#ff6b5f",
            "not_yet_synced": "#c792ea",
            "stable_48h_plus": "#ffb84d",
            "synced_10m_plus": "#ffd166",
            "synced": "#ffe4ad",
            "ipv4": "#ffb84d",
            "ipv6": "#7dcfff",
            "tor": "#c792ea",
            "i2p": "#df9fff",
            "unknown": "#8d806c"
        },
        "layout": {
            "border_radius": "16px",
            "panel_padding": "1.15rem",
            "control_radius": "999px",
            "shadow": "0 18px 38px rgba(0,0,0,0.38)"
        },
        "tiles": {
            "provider": "cartodb_dark"
        }
    },
    "midnight_blue": {
        "name": "Midnight Blue",
        "description": "Deep blue intelligence-room theme with bright node telemetry.",
        "font_family": "IBM Plex Mono, monospace",
        "heading_font_family": "IBM Plex Mono, monospace",
        "colors": {
            "background": "#020711",
            "panel": "#06101f",
            "panel_alt": "#0a1830",
            "text": "#d8ecff",
            "muted": "#94abc4",
            "accent": "#70b7ff",
            "accent_soft": "#24496d",
            "ochre": "#f2c14e",
            "danger": "#ff6b6b",
            "warning": "#f2c14e",
            "purple": "#b889ff",
            "blue": "#70b7ff",
            "unknown": "#7a8794"
        },
        "markers": {
            "duplicate_location": "#ff6b6b",
            "not_yet_synced": "#b889ff",
            "stable_48h_plus": "#79e6c5",
            "synced_10m_plus": "#f2c14e",
            "synced": "#d8ecff",
            "ipv4": "#79e6c5",
            "ipv6": "#70b7ff",
            "tor": "#b889ff",
            "i2p": "#d3a2ff",
            "unknown": "#7a8794"
        },
        "layout": {
            "border_radius": "18px",
            "panel_padding": "1.1rem",
            "control_radius": "12px",
            "shadow": "0 20px 40px rgba(0,0,0,0.42)"
        },
        "tiles": {
            "provider": "cartodb_dark"
        }
    },
    "paper_light": {
        "name": "Paper Light",
        "description": "Clean light theme for printable reports and lower contrast reading.",
        "font_family": "IBM Plex Mono, monospace",
        "heading_font_family": "IBM Plex Mono, monospace",
        "colors": {
            "background": "#f4f1e8",
            "panel": "#fffaf0",
            "panel_alt": "#eee7d7",
            "text": "#172017",
            "muted": "#586352",
            "accent": "#536d1f",
            "accent_soft": "#cfd8a2",
            "ochre": "#a86d0b",
            "danger": "#b53030",
            "warning": "#b77c12",
            "purple": "#714a91",
            "blue": "#1d5f8f",
            "unknown": "#777568"
        },
        "markers": {
            "duplicate_location": "#b53030",
            "not_yet_synced": "#714a91",
            "stable_48h_plus": "#536d1f",
            "synced_10m_plus": "#b77c12",
            "synced": "#172017",
            "ipv4": "#536d1f",
            "ipv6": "#1d5f8f",
            "tor": "#714a91",
            "i2p": "#8f60ad",
            "unknown": "#777568"
        },
        "layout": {
            "border_radius": "14px",
            "panel_padding": "1.05rem",
            "control_radius": "999px",
            "shadow": "0 12px 24px rgba(23,32,23,0.12)"
        },
        "tiles": {
            "provider": "cartodb_voyager"
        }
    },
    "red_team": {
        "name": "Red Team",
        "description": "Red/black adversarial analysis theme for risk and threat views.",
        "font_family": "IBM Plex Mono, monospace",
        "heading_font_family": "IBM Plex Mono, monospace",
        "colors": {
            "background": "#070202",
            "panel": "#120505",
            "panel_alt": "#1e0808",
            "text": "#ffd7d7",
            "muted": "#c48c8c",
            "accent": "#ff4d4d",
            "accent_soft": "#661818",
            "ochre": "#ffb84d",
            "danger": "#ff3030",
            "warning": "#ffcc66",
            "purple": "#c084fc",
            "blue": "#6ecbff",
            "unknown": "#8d7373"
        },
        "markers": {
            "duplicate_location": "#ff3030",
            "not_yet_synced": "#c084fc",
            "stable_48h_plus": "#7dff91",
            "synced_10m_plus": "#ffcc66",
            "synced": "#ffd7d7",
            "ipv4": "#7dff91",
            "ipv6": "#6ecbff",
            "tor": "#c084fc",
            "i2p": "#dc9dff",
            "unknown": "#8d7373"
        },
        "layout": {
            "border_radius": "12px",
            "panel_padding": "1rem",
            "control_radius": "4px",
            "shadow": "0 18px 38px rgba(0,0,0,0.42)"
        },
        "tiles": {
            "provider": "cartodb_dark"
        }
    },
    "violet_onion": {
        "name": "Violet Onion",
        "description": "Tor/I2P-oriented purple overlay theme for privacy-network analysis.",
        "font_family": "IBM Plex Mono, monospace",
        "heading_font_family": "IBM Plex Mono, monospace",
        "colors": {
            "background": "#07030d",
            "panel": "#100719",
            "panel_alt": "#180b25",
            "text": "#f0dcff",
            "muted": "#bda4cf",
            "accent": "#b889ff",
            "accent_soft": "#43245f",
            "ochre": "#f0b85a",
            "danger": "#ff5f7e",
            "warning": "#f0b85a",
            "purple": "#b889ff",
            "blue": "#74d6ff",
            "unknown": "#85758f"
        },
        "markers": {
            "duplicate_location": "#ff5f7e",
            "not_yet_synced": "#b889ff",
            "stable_48h_plus": "#c0d674",
            "synced_10m_plus": "#f0b85a",
            "synced": "#f0dcff",
            "ipv4": "#c0d674",
            "ipv6": "#74d6ff",
            "tor": "#b889ff",
            "i2p": "#d6a8ff",
            "unknown": "#85758f"
        },
        "layout": {
            "border_radius": "20px",
            "panel_padding": "1.15rem",
            "control_radius": "999px",
            "shadow": "0 18px 38px rgba(0,0,0,0.38)"
        },
        "tiles": {
            "provider": "cartodb_dark"
        }
    },
    "minimal_black": {
        "name": "Minimal Black",
        "description": "Sparse black theme for maximum focus on map markers.",
        "font_family": "IBM Plex Mono, monospace",
        "heading_font_family": "IBM Plex Mono, monospace",
        "colors": {
            "background": "#000000",
            "panel": "#060606",
            "panel_alt": "#101010",
            "text": "#f2f2f2",
            "muted": "#a5a5a5",
            "accent": "#d7ff72",
            "accent_soft": "#3a4a1e",
            "ochre": "#ffb84d",
            "danger": "#ff4d4d",
            "warning": "#ffcc4d",
            "purple": "#b889ff",
            "blue": "#70b7ff",
            "unknown": "#777777"
        },
        "markers": {
            "duplicate_location": "#ff4d4d",
            "not_yet_synced": "#b889ff",
            "stable_48h_plus": "#d7ff72",
            "synced_10m_plus": "#ffcc4d",
            "synced": "#f2f2f2",
            "ipv4": "#d7ff72",
            "ipv6": "#70b7ff",
            "tor": "#b889ff",
            "i2p": "#d8a8ff",
            "unknown": "#777777"
        },
        "layout": {
            "border_radius": "8px",
            "panel_padding": "1rem",
            "control_radius": "8px",
            "shadow": "none"
        },
        "tiles": {
            "provider": "cartodb_dark"
        }
    }
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


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


def theme_payload(theme_id: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-map-theme-v1",
        "id": theme_id,
        "generated_at": utc_now(),
        "name": data["name"],
        "description": data["description"],
        "font_family": data["font_family"],
        "heading_font_family": data["heading_font_family"],
        "colors": data["colors"],
        "markers": data["markers"],
        "layout": data["layout"],
        "tiles": data["tiles"],
        "css_variables": build_css_variables(data),
    }


def build_css_variables(data: dict[str, Any]) -> dict[str, str]:
    colors = data.get("colors", {})
    markers = data.get("markers", {})
    layout = data.get("layout", {})

    output = {
        "--bn-map-font": data.get("font_family", "IBM Plex Mono, monospace"),
        "--bn-map-heading": data.get("heading_font_family", "IBM Plex Mono, monospace"),
    }

    for key, value in colors.items():
        output[f"--bn-map-{key.replace('_', '-')}"] = value

    for key, value in markers.items():
        output[f"--bn-map-marker-{key.replace('_', '-')}"] = value

    for key, value in layout.items():
        output[f"--bn-map-{key.replace('_', '-')}"] = value

    return output


def ensure_theme_files(theme_dir: Path) -> dict[str, Any]:
    theme_dir.mkdir(parents=True, exist_ok=True)

    entries = []

    for theme_id, data in THEME_FILES.items():
        payload = theme_payload(theme_id, data)
        path = theme_dir / f"{theme_id}.json"

        if not path.exists():
            write_json(path, payload)

        existing = read_json(path, fallback=payload)

        entries.append({
            "id": theme_id,
            "name": existing.get("name", data["name"]),
            "description": existing.get("description", data["description"]),
            "path": f"{theme_id}.json",
            "tile_provider": existing.get("tiles", {}).get("provider", data["tiles"]["provider"]),
        })

    manifest = {
        "schema": "zzx-bitnodes-map-themes-manifest-v1",
        "generated_at": utc_now(),
        "default_theme": DEFAULT_THEME,
        "theme_count": len(entries),
        "themes": entries,
    }

    write_json(theme_dir / "manifest.json", manifest)

    return manifest


def load_theme(theme_dir: Path, theme_id: str) -> dict[str, Any]:
    path = theme_dir / f"{theme_id}.json"
    fallback = theme_payload(DEFAULT_THEME, THEME_FILES[DEFAULT_THEME])

    payload = read_json(path, fallback={})

    if isinstance(payload, dict) and payload:
        return payload

    return fallback


def merge_theme(
    payload: dict[str, Any],
    *,
    theme_dir: Path,
    selected_theme: str,
) -> dict[str, Any]:
    output = dict(payload)

    manifest = ensure_theme_files(theme_dir)
    theme = load_theme(theme_dir, selected_theme)

    output["theme"] = theme
    output["themes"] = manifest

    settings = dict(output.get("settings", {}))
    settings["theme"] = {
        "selected": theme.get("id", selected_theme),
        "manifest_url": "./data/map-themes.json",
        "theme_url": f"./data/themes/{theme.get('id', selected_theme)}.json",
        "user_selectable": True,
        "css_variables": theme.get("css_variables", {}),
    }

    tile_provider = theme.get("tiles", {}).get("provider")

    if tile_provider:
        settings["preferred_tile_provider"] = tile_provider

    output["settings"] = settings

    return output


def build(
    payload: dict[str, Any],
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    context = context or {}

    theme_dir = Path(
        context.get("theme_dir")
        or context.get("map_theme_dir")
        or DEFAULT_THEME_DIR
    )

    selected_theme = str(
        context.get("theme")
        or context.get("selected_theme")
        or DEFAULT_THEME
    )

    return merge_theme(
        payload,
        theme_dir=theme_dir,
        selected_theme=selected_theme,
    )


def sync_theme_assets(
    *,
    theme_dir: Path,
    map_dir: Path,
    live_map_dir: Path,
    selected_theme: str,
) -> dict[str, Any]:
    manifest = ensure_theme_files(theme_dir)
    selected = load_theme(theme_dir, selected_theme)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"
        target_theme_dir = data_dir / "themes"

        target_theme_dir.mkdir(parents=True, exist_ok=True)

        write_json(data_dir / "map-themes.json", manifest)
        write_json(data_dir / "map-theme.json", selected)

        for entry in manifest["themes"]:
            src = theme_dir / entry["path"]
            dst = target_theme_dir / entry["path"]

            write_json(dst, read_json(src, fallback={}))

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})

        settings["theme"] = {
            "selected": selected.get("id", selected_theme),
            "manifest_url": "./data/map-themes.json",
            "theme_url": f"./data/themes/{selected.get('id', selected_theme)}.json",
            "user_selectable": True,
            "css_variables": selected.get("css_variables", {}),
        }

        tile_provider = selected.get("tiles", {}).get("provider")

        if tile_provider:
            settings["preferred_tile_provider"] = tile_provider

        write_json(settings_path, settings)

    return {
        "schema": "zzx-bitnodes-mapthemes-build-report-v1",
        "generated_at": utc_now(),
        "theme_dir": str(theme_dir),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "selected_theme": selected.get("id", selected_theme),
        "theme_count": manifest["theme_count"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build selectable JSON themes for Bitnodes maps and live-map pages."
    )

    parser.add_argument("--theme-dir", default=str(DEFAULT_THEME_DIR))
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--theme", default=DEFAULT_THEME)
    parser.add_argument("--report", default="")

    args = parser.parse_args()

    report = sync_theme_assets(
        theme_dir=Path(args.theme_dir).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        selected_theme=args.theme,
    )

    if args.report:
        write_json(Path(args.report), report)

    print(
        "map themes complete: "
        f"{report['theme_count']} themes, "
        f"selected={report['selected_theme']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
