#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BN = ROOT / "bitcoin" / "bitnodes"

SOURCE_PAGES = {
    "3d-network-map", "agents", "asns", "charts", "cities", "countries",
    "dns-seeder", "i2p", "isp", "latency", "network-map", "nodes",
    "peer-health", "ports", "propagation", "providers", "proxy", "rankings",
    "services", "snapshots", "tor", "versions", "vpn",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def duplicate_ids(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    ids = re.findall(r'id="([^"]+)"', text)
    return sorted({value for value in ids if ids.count(value) > 1})


def main() -> int:
    runtime = BN / "js" / "page-runtime.js"
    require(runtime.is_file() and runtime.stat().st_size > 0, "missing page-runtime.js")
    runtime_text = runtime.read_text(encoding="utf-8")
    for marker in (
        'PRIMARY_SOURCE = "zzxbitnodes"',
        'FALLBACK_SOURCE = "originalbitnodes"',
        'api/zzxbitnodes/latest.json',
        'api/originalbitnodes/latest.json',
        'function normalizeNodes',
        'function fetchEndpoint',
    ):
        require(marker in runtime_text, f"page runtime missing contract marker: {marker}")

    root_script = (BN / "script.js").read_text(encoding="utf-8")
    require('"js/page-runtime.js"' in root_script, "root Bitnodes loader does not load page runtime")

    html_files = list(BN.rglob("*.html"))
    for path in html_files:
        if "includes" in path.parts:
            continue
        dups = duplicate_ids(path)
        require(not dups, f"duplicate HTML ids in {path.relative_to(ROOT)}: {dups}")

    for name in sorted(SOURCE_PAGES):
        html = BN / name / "index.html"
        js_candidates = list((BN / name).glob("*.js"))
        require(html.is_file(), f"missing Bitnodes subpage: {html}")
        text = html.read_text(encoding="utf-8")
        require('data-bn-semantic="source"' in text, f"{name} source selector is not semantic")
        require('value="zzxbitnodes" selected' in text, f"{name} does not default to zzxbitnodes")
        require('value="originalbitnodes"' in text, f"{name} lacks originalbitnodes fallback")
        require("js/page-runtime.js" in text, f"{name} does not load page runtime")
        require(js_candidates, f"{name} has no page JavaScript")

        for js in js_candidates:
            js_text = js.read_text(encoding="utf-8")
            # The primary page source must never silently map to the old flat API.
            bad = re.search(r'zzxbitnodes\s*:\s*["\']\.\./api/(?!zzxbitnodes/)', js_text)
            require(not bad, f"{js.relative_to(ROOT)} maps zzxbitnodes to legacy flat API")
            # The secondary crawler may have specialized exports, but latest.json is
            # guaranteed and must remain an available fallback.
            if "originalbitnodes:" in js_text:
                require("../api/originalbitnodes/latest.json" in js_text,
                        f"{js.relative_to(ROOT)} lacks guaranteed originalbitnodes latest fallback")

    for rel in (
        "maps/index.html", "maps/map.js", "maps/maps.js", "maps/map.css",
        "live-map/index.html", "live-map/map.js", "live-map/live-map.js", "live-map/map.css",
        "map/index.html", "map/map.js", "map/map.css",
    ):
        path = BN / rel
        require(path.is_file() and path.stat().st_size > 0, f"missing map asset: {rel}")

    maps_js = (BN / "maps" / "maps.js").read_text(encoding="utf-8")
    live_js = (BN / "live-map" / "map.js").read_text(encoding="utf-8")
    require("renderFallbackCanvas" in maps_js, "maps page lacks local canvas fallback")
    require("renderFallbackCanvas" in live_js, "live-map page lacks local canvas fallback")
    require('./data/map-vectors.json' in maps_js, "maps page does not prefer generated canonical vectors")
    require('./data/map-vectors.json' in live_js, "live-map page does not consume generated canonical vectors")

    datasource = (BN / "js" / "datasource.js").read_text(encoding="utf-8")
    require('basePath: "./api/zzxbitnodes"' in datasource, "shared datasource primary base is not zzxbitnodes")
    require('basePath: "./api/originalbitnodes"' in datasource, "shared datasource fallback base is not originalbitnodes")

    core = (BN / "js" / "core.js").read_text(encoding="utf-8")
    require("Array.isArray(nodesValue)" in core, "core latest normalizer does not support list-form nodes")
    require("Array.isArray(nodes)" in core, "core row mapper does not support list-form nodes")

    print(
        "frontend_contract_selftest: PASS",
        f"html={len(html_files)}",
        f"source_pages={len(SOURCE_PAGES)}",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
