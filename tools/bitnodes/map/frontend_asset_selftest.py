#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path

HERE=Path(__file__).resolve().parent


def main() -> int:
    js=HERE/'assets'/'map.js'
    css=HERE/'assets'/'map.css'
    if not js.is_file() or not css.is_file():
        raise SystemExit('map frontend source assets are missing')
    jt=js.read_text(encoding='utf-8')
    ct=css.read_text(encoding='utf-8')
    for token in ('function renderFallbackCanvas', './data/map-vectors.json', 'startVectorRefresh'):
        if token not in jt:
            raise SystemExit(f'map.js asset missing token: {token}')
    for token in ('.bn-map-canvas-fallback', 'canvas[data-bn-map-fallback]'):
        if token not in ct:
            raise SystemExit(f'map.css asset missing token: {token}')

    # Verify the generator actually resolves these assets rather than its older
    # embedded compatibility fallback.
    import maps
    rendered_js=maps.render_map_js()
    rendered_css=maps.render_map_css()
    if 'function renderFallbackCanvas' not in rendered_js:
        raise SystemExit('render_map_js did not load fixed map asset')
    if '.bn-map-canvas-fallback' not in rendered_css:
        raise SystemExit('render_map_css did not load fixed map asset')
    print('frontend_asset_selftest: PASS')
    return 0


if __name__=='__main__':
    raise SystemExit(main())
