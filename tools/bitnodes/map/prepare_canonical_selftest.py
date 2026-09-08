#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from prepare_canonical import prepare


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        api = root / "bitcoin" / "bitnodes" / "api"
        (api / "snapshots").mkdir(parents=True)
        (api / "zzxbitnodes").mkdir(parents=True)

        # Reproduce the exact production failure: snapshots/latest is valid
        # normalized-v4, not canonical-v2.
        normalized = {
            "schema": "zzx-bitnodes-normalized-v4",
            "source": "btcnodes.io",
            "reachable_nodes": 3,
            "nodes": {
                "8.8.8.8:8333": [70016, "/Satoshi:27.0.0/", 0, 1, 900000, None, "Mountain View", "US", 37.4, -122.1],
                "10.0.0.8:8333": [70016, "/Satoshi:26.0.0/", 0, 1, 899999, None, "Fake", "US", 40.0, -75.0],
                "examplehiddenservice.onion:8333": [70016, "/Knots:27.1/", 0, 1, 900000, None, "Fake", "US", 41.0, -74.0],
            },
        }
        (api / "snapshots" / "latest.json").write_text(json.dumps(normalized), encoding="utf-8")

        zzx = {
            "schema": "zzx-bitnodes-normalized-v4",
            "source": "zzxbitnodes",
            "reachable_nodes": 2,
            "nodes": {
                "8.8.8.8:8333": {
                    "address": "8.8.8.8:8333",
                    "user_agent": "/Satoshi:27.0.0/",
                    "country": "US",
                    "country_name": "United States",
                    "city": "Mountain View",
                    "latitude": 37.4,
                    "longitude": -122.1,
                    "geo_source": "existing-real-fields",
                },
                "1.1.1.1:8333": {
                    "address": "1.1.1.1:8333",
                    "user_agent": "/Knots:27.1/",
                    "country": "AU",
                    "country_name": "Australia",
                    "city": "Sydney",
                    "latitude": -33.86,
                    "longitude": 151.20,
                    "geo_source": "existing-real-fields",
                },
            },
        }
        (api / "zzxbitnodes" / "latest.json").write_text(json.dumps(zzx), encoding="utf-8")

        out = root / "canonical.json"
        report = root / "report.json"
        result = prepare(root, out, report, include_original=False, compact=True)

        payload = json.loads(out.read_text(encoding="utf-8"))
        rows = payload["nodes"]

        assert payload["schema"] == "zzx-bitnodes-canonical-v2"
        assert result["mode"] == "rebuilt-canonical"
        assert len(rows) == 2
        by_addr = {row["address"]: row for row in rows}
        assert by_addr["8.8.8.8:8333"]["country"] == "US"
        assert by_addr["1.1.1.1:8333"]["country"] == "AU"

    print("prepare_canonical_selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
