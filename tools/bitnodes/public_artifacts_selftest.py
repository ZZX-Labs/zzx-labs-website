#!/usr/bin/env python3
from __future__ import annotations

import gzip
import importlib.util
import json
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TARGET = HERE / "public_artifacts.py"
if not TARGET.exists():
    # Allows this validation bundle to execute before the file is renamed into repo position.
    TARGET = HERE / "public_artifacts-v10.10.py"

spec = importlib.util.spec_from_file_location("public_artifacts", TARGET)
if spec is None or spec.loader is None:
    raise SystemExit(f"unable to load {TARGET}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        aggregate = root / "aggregate.json"
        source = root / "ipdb-source.json"
        latest = root / "ip_db.latest.json"
        manifest = root / "ip_db.public-manifest.json"
        shards = root / "shards"

        aggregate.write_text(json.dumps({
            "schema": "fixture-aggregate-v1",
            "source": "fixture",
            "nodes": [{"address": "1.1.1.1:8333"}],
            "node_count": 1,
            "reachable_nodes": 1,
        }), encoding="utf-8")

        source_payload = {
            "schema": "fixture-ipdb-v1",
            "source": "fixture",
            "updated_at": "2026-09-09T00:00:00Z",
            "nodes": [
                {"address": "1.1.1.1:8333", "country": "AU"},
                {"address": "8.8.8.8:8333", "country": "US"},
                {"address": "9.9.9.9:8333", "country": "US"},
            ],
        }
        source.write_text(json.dumps(source_payload), encoding="utf-8")

        aggregate_report = mod.compact_aggregate(
            aggregate, aggregate, canonical_url="/canonical.json", max_bytes=24_000_000
        )
        compacted = load(aggregate)
        assert compacted["schema"] == mod.PUBLIC_AGGREGATE_SCHEMA
        assert compacted.get("nodes") in (None, [], {})
        assert aggregate_report["node_count"] == 1

        report = mod.shard_ipdb(
            source, shards, manifest,
            max_bytes=24_000_000, rows_per_shard=2, gzip_level=6,
            pointer_path=latest, write_pointer=True,
        )
        assert report["node_count"] == 3
        assert report["latest_pointer_written"] is True
        assert load(source)["nodes"] == source_payload["nodes"], "node-bearing source was mutated"

        pointer = load(latest)
        assert pointer["schema"] == mod.IPDB_LATEST_SCHEMA
        assert pointer["node_count"] == 3
        assert "nodes" not in pointer

        public_manifest = load(manifest)
        assert public_manifest["node_count"] == 3
        assert public_manifest["shard_count"] == 2
        seen = 0
        for item in public_manifest["shards"]:
            blob = (root / item["path"]).read_bytes()
            payload = json.loads(gzip.decompress(blob).decode("utf-8"))
            assert payload["schema"] == mod.IPDB_SHARD_SCHEMA
            assert isinstance(payload["nodes"], list)
            seen += len(payload["nodes"])
        assert seen == 3

        # Idempotency: rerunning from the immutable node-bearing source may replace
        # the pointer and shards, but must never try to consume the pointer as source.
        rerun = mod.shard_ipdb(
            source, shards, manifest,
            max_bytes=24_000_000, rows_per_shard=2, gzip_level=6,
            pointer_path=latest, write_pointer=True,
        )
        assert rerun["node_count"] == 3

        try:
            mod.shard_ipdb(
                latest, shards, manifest,
                max_bytes=24_000_000, rows_per_shard=2, gzip_level=6,
                pointer_path=latest, write_pointer=True,
            )
        except RuntimeError as exc:
            assert "--ipdb-source" in str(exc)
        else:
            raise AssertionError("bounded pointer was incorrectly accepted as node-bearing IPDB source")

    print("public_artifacts_selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
