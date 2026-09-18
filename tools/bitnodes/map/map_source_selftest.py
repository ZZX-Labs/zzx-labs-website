#!/usr/bin/env python3
from __future__ import annotations

from map_source import build


def main() -> int:
    payload = {
        "schema": "zzx-bitnodes-canonical-v2",
        "source": "fixture",
        "nodes": [
            {
                "address": "8.8.8.8:8333",
                "country": "US",
                "city": "Scranton",
                "county": "Lackawanna County",
                "latitude": 41.40897,
                "longitude": -75.66241,
                "geo_contract": {"synthetic": False},
            },
            {
                "address": "synthetic.example:8333",
                "latitude": 1,
                "longitude": 2,
                "geo_source": "deterministic-fallback:test",
                "geo_contract": {"synthetic": True},
            },
            {"address": "x.onion:8333", "latitude": None, "longitude": None},
        ],
    }
    output, report = build(payload, 5000)
    assert report["input_rows"] == 3
    assert report["emitted_rows"] == 1
    assert report["rejected_synthetic"] == 1
    assert report["rejected_without_coordinates"] == 1
    assert len(output["nodes"]) == 1
    assert output["metadata"]["synthetic_coordinates"] == 0
    print("map_source_selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
