#!/usr/bin/env python3
"""Exercise water geometry continuity, source checks, and edition provenance."""
from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    path = ROOT / "tools/worldfactbook" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


builder = module("build_water_boundaries")
verifier = module("verify_water_boundaries")


class WaterBoundariesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        square = [[170, -10], [-170, -10], [-170, 10], [170, 10], [170, -10]]
        lake = [[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]]
        hole = [[-1, -1], [-1, 1], [1, 1], [1, -1], [-1, -1]]
        inputs = [("marine", "Polygon", [square], "Test Sea"),
                  ("lakes", "Polygon", [lake, hole], "Test Lake"),
                  ("rivers", "MultiLineString", [[[0, 0], [1, 1], [2, 0]]], "Test River")]
        rows = []
        for name, kind, coords, label in inputs:
            raw = json.dumps({"type": "FeatureCollection", "features": [
                {"type": "Feature", "properties": {"name": label,
                 "featurecla": "sea" if name == "marine" else name},
                 "geometry": {"type": kind, "coordinates": coords}}]}, separators=(",", ":")).encode()
            (self.root / f"{name}.geojson").write_bytes(raw)
            rows.append({"id": name, "kind": name, "path": f"{name}.geojson",
                         "url": f"https://www.naturalearthdata.com/{name}",
                         "license": "Public domain", "sha256": hashlib.sha256(raw).hexdigest()})
        self.sources = self.root / "sources.json"
        self.sources.write_text(json.dumps({"schema": 1, "sources": rows}))
        self.output = self.root / "worldfactbook/boundaries/water"

    def run_build(self, year=None):
        with contextlib.redirect_stdout(io.StringIO()):
            builder.build(SimpleNamespace(sources=self.sources, output=self.output,
                                          year=year, download=False))

    def test_reference_reconstructs_all_paths(self):
        self.run_build()
        summary = verifier.verify(self.root)["reference"]
        self.assertEqual(summary["features"], 3)
        index = json.loads((self.output / "reference/index.json").read_text())
        self.assertIsNone(index["year"])
        self.assertEqual(index["counts"], {"sea": 1, "lake": 1, "river": 1})

    def test_edition_requires_dated_sources(self):
        with self.assertRaisesRegex(ValueError, "cite the selected year"):
            self.run_build(1962)

    def test_dated_dataset_keeps_reference_separate(self):
        self.run_build()
        manifest = json.loads(self.sources.read_text())
        for source in manifest["sources"]:
            source["year"] = 1962
        self.sources.write_text(json.dumps(manifest))
        self.run_build(1962)
        result = verifier.verify(self.root)
        self.assertEqual(result["1962"]["features"], 3)
        self.assertEqual(result["reference"]["features"], 3)

    def test_changed_input_is_rejected(self):
        (self.root / "marine.geojson").write_text('{"type":"FeatureCollection","features":[]}')
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            self.run_build()


if __name__ == "__main__":
    unittest.main()
