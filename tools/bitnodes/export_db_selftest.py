#!/usr/bin/env python3
from __future__ import annotations

import gzip
import hashlib
import importlib.util
import json
import tempfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
EXPORTER = HERE / "export_db.py"


def load_module():
    spec = importlib.util.spec_from_file_location("zzx_export_db_selftest", EXPORTER)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load export_db.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture(path: Path, count: int = 2000) -> None:
    rows = []
    for i in range(count):
        rows.append({
            "address": f"8.8.{i // 250}.{(i % 250) + 1}:8333",
            "network": "ipv4",
            "user_agent": "/Satoshi:27.0.0/" if i % 5 else "/Knots:27.1/",
            "protocol_version": 70016,
            "services": 1033,
            "height": 900000 + (i % 12),
            "country": "US",
            "country_name": "United States",
            "region": "Pennsylvania",
            "county": "Lackawanna County" if i % 2 else None,
            "city": "Scranton",
            "latitude": 41.4,
            "longitude": -75.66,
            "asn": f"AS{15000 + (i % 100)}",
            "organization": "Fixture Network",
            "reachable_now": True,
            "reachable_24h": True,
            "metadata": {"note": "x" * 96},
        })

    payload = {
        "schema": "zzx-bitnodes-canonical-v2",
        "source": "selftest",
        "reachable_nodes": count,
        "nodes": rows,
    }
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def main() -> int:
    module = load_module()

    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        source = root / "canonical.json"
        output = root / "data"
        fixture(source)

        original_hash = module.sha256_file
        hash_calls = {"count": 0}

        def counted_hash(path: Path, chunk_size: int = 1024 * 1024) -> str:
            hash_calls["count"] += 1
            return original_hash(path, chunk_size)

        module.sha256_file = counted_hash
        records = module.load_records([source])

        assert len(records) == 2000
        assert hash_calls["count"] == 1, (
            "input payload must be hashed exactly once; "
            f"got {hash_calls['count']} calls"
        )

        manifest = module.export_mariadb_shards(
            records,
            output,
            "zzx_bitnodes",
            24_000_000,
            True,
            gzip_level=6,
            plain_factor=4,
            rows_per_shard=500,
        )

        assert manifest["node_count"] == 2000
        assert manifest["shard_count"] == 4
        assert manifest["format"] == "mariadb-sql-gzip-true-streaming-shards"

        for item in manifest["shards"]:
            path = output / item["path"]
            assert path.is_file()
            assert path.stat().st_size <= 24_000_000
            assert hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"]
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                for _ in handle:
                    pass

        first = output / manifest["shards"][0]["path"]
        insert = None
        with gzip.open(first, "rt", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("INSERT INTO bitnodes_nodes"):
                    insert = line
                    break

        assert insert is not None
        prefix = insert.split(" ON DUPLICATE KEY UPDATE ", 1)[0]
        values = prefix.rsplit(" VALUES (", 1)[1].rsplit(")", 1)[0]
        updated_at = values.rsplit(", ", 1)[1]
        assert updated_at.startswith("'20") and "T" in updated_at and updated_at.endswith("'")
        assert updated_at != "NULL"

    print("export_db_selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
