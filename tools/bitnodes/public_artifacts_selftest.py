#!/usr/bin/env python3
from __future__ import annotations

import gzip
import hashlib
import json
import tempfile
from pathlib import Path

import public_artifacts as pa


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        aggregate = root / "aggregate.json"
        aggregate_payload = {
            "schema": "legacy-aggregate",
            "source": "btcnodes.io",
            "reachable_nodes": 1200,
            "node_count": 1200,
            "by_network": {"ipv4": 800, "tor": 400},
            "top": {"countries": {"US": 500, "DE": 200}},
            "nodes": [
                {
                    "address": f"203.0.113.{i % 250}:8333",
                    "raw_json": "x" * 5000,
                    "geo": {"country": "US"},
                }
                for i in range(1200)
            ],
        }
        aggregate.write_text(json.dumps(aggregate_payload), encoding="utf-8")
        ar = pa.compact_aggregate(
            aggregate,
            aggregate,
            canonical_url="/bitcoin/bitnodes/api/snapshots/latest.json",
            max_bytes=100_000,
        )
        compact = json.loads(aggregate.read_text(encoding="utf-8"))
        assert ar["bytes"] < 100_000
        assert compact["nodes_omitted"] is True
        assert "nodes" not in compact
        assert compact["node_count"] == 1200
        assert compact["by_network"]["tor"] == 400

        latest = root / "ip_db.latest.json"
        ipdb_payload = {
            "schema": "ipdb-legacy",
            "source": "zzx-canonical",
            "nodes": [
                {
                    "address": f"198.51.{i // 250}.{i % 250}:8333",
                    "country": "US",
                    "city": "Fixture City",
                    "raw": "y" * 1500,
                }
                for i in range(2600)
            ],
        }
        latest.write_text(json.dumps(ipdb_payload), encoding="utf-8")
        shard_dir = root / "shards"
        manifest_path = root / "ip_db.public-manifest.json"
        ir = pa.shard_ipdb(
            latest,
            shard_dir,
            manifest_path,
            max_bytes=45_000,
            rows_per_shard=500,
            gzip_level=6,
            remove_source=True,
        )
        assert latest.exists()
        latest_pointer = json.loads(latest.read_text(encoding="utf-8"))
        assert latest_pointer["schema"] == pa.IPDB_LATEST_SCHEMA
        assert latest_pointer["manifest"] == "ip_db.public-manifest.json"
        assert latest_pointer["node_count"] == 2600
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert manifest["node_count"] == 2600
        assert manifest["shard_count"] == ir["shard_count"]
        assert manifest["shard_count"] >= 6

        seen = 0
        for item in manifest["shards"]:
            path = root / item["path"]
            blob = path.read_bytes()
            assert len(blob) <= 45_000
            assert hashlib.sha256(blob).hexdigest() == item["sha256"]
            payload = json.loads(gzip.decompress(blob).decode("utf-8"))
            assert payload["schema"] == pa.IPDB_SHARD_SCHEMA
            seen += len(payload["nodes"])
        assert seen == 2600

    print("public_artifacts_selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
