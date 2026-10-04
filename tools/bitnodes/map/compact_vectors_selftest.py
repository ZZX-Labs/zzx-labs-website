#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path

import compact_vectors


def build_fixture(root: Path, points: int = 2500) -> tuple[int, list[Path]]:
    features = []
    vectors = []
    raw_blob = "x" * 10000
    for i in range(points):
        lon = -179.5 + (i % 350)
        lat = -80.0 + (i % 160)
        props = {
            "id": f"node-{i}",
            "address": f"198.51.100.{i % 255}:8333",
            "network": "ipv4",
            "user_agent": "/Satoshi:27.0.0/",
            "country_code": "US",
            "country": "United States",
            "region": "PA",
            "county": "Lackawanna",
            "city": "Scranton",
            "asn": 64512,
            "organization": "Example ISP",
            "height": 900000 + i,
            "reachable": True,
            "label": f"node-{i}",
        }
        features.append({
            "type": "Feature",
            "id": i,
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": props,
        })
        vectors.append({
            **props,
            "lat": lat,
            "lon": lon,
            "color": "#c0d674",
            "radius": 3,
            "raw_json": raw_blob,
            "payload": {"raw": raw_blob},
        })

    geo = {"type": "FeatureCollection", "features": features}
    vec = {"schema": "fixture-old", "theme": "zzx_dark_olive", "points": vectors}

    paths = []
    for rel in (
        "maps/data",
        "maps/zzxbitnodes/data",
        "live-map/data",
        "live-map/zzxbitnodes/data",
    ):
        d = root / rel
        d.mkdir(parents=True, exist_ok=True)
        (d / "map-points.geojson").write_text(
            json.dumps(geo, separators=(",", ":")), encoding="utf-8"
        )
        vp = d / "map-vectors.json"
        vp.write_text(json.dumps(vec, separators=(",", ":")), encoding="utf-8")
        paths.append(vp)

    return paths[0].stat().st_size, paths


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        before, paths = build_fixture(root)
        if before <= 24_000_000:
            raise AssertionError(f"fixture must start oversized, got {before}")

        reports = compact_vectors.compact_roots(
            [root / "maps", root / "live-map"], max_bytes=24_000_000
        )
        assert len(reports) == 4

        digests = set()
        for path in paths:
            assert path.stat().st_size < 24_000_000
            data = json.loads(path.read_text(encoding="utf-8"))
            assert data["schema"] == compact_vectors.SCHEMA
            assert data["point_count"] == 2500
            assert len(data["points"]) == 2500
            first = data["points"][0]
            assert first["address"].endswith(":8333")
            assert first["country_code"] == "US"
            assert first["city"] == "Scranton"
            assert first["coordinates"] == [-179.5, -80.0]
            assert "raw_json" not in first
            assert "payload" not in first
            digests.add(hashlib.sha256(path.read_bytes()).hexdigest())

        assert len(digests) == 1, "compatibility copies must be deterministic"

        invalid_dir = root / "maps" / "invalid-current" / "data"
        invalid_dir.mkdir(parents=True, exist_ok=True)
        (invalid_dir / "map-points.geojson").write_text(
            json.dumps({"type": "FeatureCollection", "features": []}),
            encoding="utf-8",
        )
        (invalid_dir / "map-vectors.json").write_text(
            json.dumps({"schema": "invalid", "points": []}),
            encoding="utf-8",
        )
        try:
            compact_vectors.compact_one(
                invalid_dir / "map-vectors.json",
                max_bytes=24_000_000,
            )
        except ValueError:
            pass
        else:
            raise AssertionError("invalid current-run GeoJSON must remain a hard failure")


    print("compact_vectors_selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
