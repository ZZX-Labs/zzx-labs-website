#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import geo_contract as gc


class FakeLookup:
    def lookup(self, ip: str):
        if ip == "8.8.8.8":
            return {
                "ip": ip,
                "country_code": "US",
                "country_name": "United States",
                "country_flag": gc.country_flag("US"),
                "region": "Pennsylvania",
                "admin1_code": "PA",
                "county": "Lackawanna County",
                "admin2_code": "069",
                "city": "Scranton",
                "latitude": 41.40897,
                "longitude": -75.66241,
                "asn": "AS15169",
                "organization": "fixture",
                "geo_source": "fixture-dbip+geonames",
                "county_source": "geonames-city-admin2-crosswalk",
            }
        return {}


def test_geonames() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        source = root / "sources"
        source.mkdir(parents=True)
        (source / "admin1CodesASCII.txt").write_text(
            "US.PA\tPennsylvania\tPennsylvania\t6254927\n",
            encoding="utf-8",
        )
        (source / "admin2Codes.txt").write_text(
            "US.PA.069\tLackawanna County\tLackawanna County\t5200000\n",
            encoding="utf-8",
        )
        fields = [
            "5200000", "Scranton", "Scranton", "", "41.40897", "-75.66241",
            "P", "PPLA2", "US", "", "PA", "069", "", "", "76000", "",
            "", "America/New_York", "2026-01-01",
        ]
        (source / "cities500.txt").write_text("\t".join(fields) + "\n", encoding="utf-8")
        crosswalk = gc.GeoNamesCrosswalk(root)
        match = crosswalk.resolve_city("US", "PA", "Scranton", 41.41, -75.66)
        assert match is not None and match.admin2 == "069"
        assert crosswalk.county_name("US", "PA", "069") == "Lackawanna County"


def test_real_ip_only() -> None:
    payload = {
        "nodes": {
            "8.8.8.8:8333": {"address": "8.8.8.8:8333"},
            "abcdef.onion:8333": {
                "address": "abcdef.onion:8333",
                "country": "US",
                "city": "Fake",
                "county": "Fake County",
                "latitude": 1.2,
                "longitude": 2.3,
                "geoip_source": "deterministic-fallback:tor",
                "geoip_confidence": "synthetic",
            },
            "10.0.0.1:8333": {
                "address": "10.0.0.1:8333",
                "country": "US",
                "city": "Legacy",
                "latitude": 10,
                "longitude": 10,
            },
        }
    }
    output, report = gc.build(payload, FakeLookup())
    rows = {row["address"]: row for row in output["nodes"]}
    public = rows["8.8.8.8:8333"]
    assert public["country"] == "US"
    assert public["country_flag"] == "🇺🇸"
    assert public["city"] == "Scranton"
    assert public["county"] == "Lackawanna County"
    assert public["admin2_code"] == "069"
    assert public["geo_contract"]["synthetic"] is False

    for key in ("abcdef.onion:8333", "10.0.0.1:8333"):
        row = rows[key]
        assert row["country"] is None
        assert row["city"] is None
        assert row["county"] is None
        assert row["latitude"] is None
        assert row["longitude"] is None
        assert row["geo_available"] is False

    assert report["country"] == 1
    assert report["city"] == 1
    assert report["county"] == 1
    assert report["coordinates"] == 1
    assert report["overlay_or_non_ip"] == 1
    assert report["non_public_ip"] == 1
    print(json.dumps(report, sort_keys=True))


def main() -> int:
    test_geonames()
    test_real_ip_only()
    print("geo_contract_selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
