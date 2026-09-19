#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import prepare_canonical as pc


class FakeLookup:
    def lookup(self, ip: str):
        if ip == "8.8.8.8":
            return {
                "ip": ip,
                "country_code": "US",
                "country_name": "United States",
                "country_flag": "🇺🇸",
                "region": "California",
                "admin1_code": "CA",
                "county": "Santa Clara County",
                "admin2_code": "085",
                "city": "Mountain View",
                "latitude": 37.4,
                "longitude": -122.1,
                "asn": "AS15169",
                "organization": "Google",
                "geo_source": "fixture",
            }
        if ip == "1.1.1.1":
            return {
                "ip": ip,
                "country_code": "AU",
                "country_name": "Australia",
                "country_flag": "🇦🇺",
                "region": "New South Wales",
                "admin1_code": "NSW",
                "county": "",
                "admin2_code": "",
                "city": "Sydney",
                "latitude": -33.86,
                "longitude": 151.2,
                "asn": "AS13335",
                "organization": "Cloudflare",
                "geo_source": "fixture",
            }
        if ip == "9.9.9.9":
            return {
                "ip": ip,
                "country_code": "US",
                "country_name": "United States",
                "country_flag": "🇺🇸",
                "region": "New York",
                "admin1_code": "NY",
                "county": "",
                "admin2_code": "",
                "city": "New York",
                "latitude": 40.7128,
                "longitude": -74.0060,
                "asn": "AS19281",
                "organization": "Quad9",
                "geo_source": "fixture",
            }
        return {}


def write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def assert_single_source(inputs, expected_name: str, expected_path: Path) -> None:
    assert len(inputs) == 1, inputs
    source, path = inputs[0]
    assert source == expected_name, inputs
    assert path == expected_path, inputs


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        api = root / "bitcoin" / "bitnodes" / "api"

        # Primary public/default source: btcnodes.io normalized into zzxbitnodes.
        zzx_path = api / "zzxbitnodes" / "latest.json"
        zzx = {
            "schema": "zzx-bitnodes-normalized-v4",
            "nodes": {
                "8.8.8.8:8333": [70016, "/Satoshi:27.0/", 0, 1, 900000],
                "abc.onion:8333": [70016, "/Knots:27.1/", 0, 1, 900000],
            },
        }
        write(zzx_path, zzx)

        # Raw btcnodes namespace is an alias fallback for the same upstream,
        # never a second source to merge with zzxbitnodes.
        btc_path = api / "btcnodes" / "normalized" / "latest.json"
        btc = {
            "schema": "zzx-bitnodes-normalized-v5",
            "nodes": {
                "1.1.1.1:8333": [70016, "/Satoshi:26.0/", 0, 1, 900000],
                "10.0.0.1:8333": [70016, "/Satoshi:25.0/", 0, 1, 900000],
            },
        }
        write(btc_path, btc)

        # Independent Addy Yeow-style crawler fallback.
        original_path = api / "originalbitnodes" / "latest.json"
        original = {
            "schema": "zzx-originalbitnodes-v1",
            "nodes": {
                "9.9.9.9:8333": [70016, "/Satoshi:28.0/", 0, 1, 900000],
            },
        }
        write(original_path, original)

        # With all sources present, ONLY zzxbitnodes is canonicalized.
        inputs = pc.discover(root)
        assert_single_source(inputs, "zzxbitnodes", zzx_path)

        with tempfile.TemporaryDirectory() as wd:
            out = []
            fake = FakeLookup()
            for source, path in inputs:
                p, _ = pc.enrich_source(
                    source,
                    path,
                    lookup=fake,
                    work_dir=Path(wd),
                    compact=True,
                )
                out.append((source, p))
            payload = pc.merge_sources.build(out)

        assert payload["schema"] == "zzx-bitnodes-canonical-v2"
        rows = {r["address"]: r for r in payload["nodes"]}
        assert set(rows) == {"8.8.8.8:8333", "abc.onion:8333"}
        assert rows["8.8.8.8:8333"]["country"] == "US"
        assert rows["abc.onion:8333"]["country"] is None
        assert "1.1.1.1:8333" not in rows
        assert "9.9.9.9:8333" not in rows

        # If the zzxbitnodes alias is absent, Map Host may use the raw
        # btcnodes normalized namespace but still exposes it as the primary
        # zzxbitnodes-backed source identity.
        zzx_path.unlink()
        inputs = pc.discover(root)
        assert_single_source(inputs, "zzxbitnodes-btcnodes-alias", btc_path)

        # If the btcnodes-backed primary is unavailable entirely, fall back to
        # the independent originalbitnodes crawler.
        btc_path.unlink()
        inputs = pc.discover(root)
        assert_single_source(inputs, "originalbitnodes-fallback", original_path)

        # No source should be fabricated if every real source disappears.
        original_path.unlink()
        assert pc.discover(root) == []

    print("prepare_canonical_selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
