#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import cleanup_optional_maps


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        maps = root / "maps"
        live = root / "live-map"

        for base in (maps, live):
            stale = base / "originalbitnodes" / "data"
            stale.mkdir(parents=True, exist_ok=True)
            (stale / "map-points.geojson").write_text(
                json.dumps({"type": "FeatureCollection", "features": []}),
                encoding="utf-8",
            )
            (stale / "map-vectors.json").write_text(
                json.dumps({
                    "schema": "stale",
                    "points": [],
                    "raw_json": "x" * 100000,
                }),
                encoding="utf-8",
            )

            canonical = base / "data"
            canonical.mkdir(parents=True, exist_ok=True)
            (canonical / "map-points.geojson").write_text(
                json.dumps({
                    "type": "FeatureCollection",
                    "features": [{
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [-75.66, 41.40]},
                        "properties": {"address": "8.8.8.8:8333", "country_code": "US"},
                    }],
                }),
                encoding="utf-8",
            )
            (canonical / "map-vectors.json").write_text(
                json.dumps({"schema": "fixture", "points": [{"address": "8.8.8.8:8333"}]}),
                encoding="utf-8",
            )

        report = cleanup_optional_maps.cleanup(
            [maps, live],
            "originalbitnodes",
        )

        assert report["removed_files"] == 4
        assert report["removed_bytes"] > 100000
        assert not (maps / "originalbitnodes").exists()
        assert not (live / "originalbitnodes").exists()

        # Required/canonical output must never be touched.
        assert (maps / "data" / "map-points.geojson").is_file()
        assert (maps / "data" / "map-vectors.json").is_file()
        assert (live / "data" / "map-points.geojson").is_file()
        assert (live / "data" / "map-vectors.json").is_file()

        for bad in ("", ".", "..", "../originalbitnodes", "a/b", "/tmp/x"):
            try:
                cleanup_optional_maps.safe_subtree(bad)
            except ValueError:
                pass
            else:
                raise AssertionError(f"unsafe subtree accepted: {bad!r}")

    print("cleanup_optional_maps_selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
