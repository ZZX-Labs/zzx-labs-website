#!/usr/bin/env python3
from __future__ import annotations

import gzip
import hashlib
import json
import re
import tempfile
from pathlib import Path

import chunk_registry_backup as crb


def count_sql_rows(root: Path) -> int:
    total = 0
    for path in sorted(root.glob("nodes-*.sql.gz")):
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            text = handle.read()
        total += len(
            re.findall(
                r"INSERT\s+INTO\s+bitnodes_registry_nodes\b",
                text,
                flags=re.IGNORECASE,
            )
        )
    return total


def node(address: str, index: int) -> dict[str, object]:
    host, port = address.rsplit(":", 1)
    return {
        "address": address,
        "ip": host,
        "port": int(port),
        "protocol_version": 70016,
        "user_agent": f"/Satoshi:30.{index}.0/",
        "height": 900000 + index,
        "country": "US",
        "reachable": True,
        "metadata": {
            "canonical_address": address,
            "host": host,
            "port": int(port),
            "reachable": True,
        },
    }


def main() -> int:
    rows = [
        node("203.0.113.10:8333", 1),
        node("203.0.113.11:8333", 2),
        node("[2001:db8::12]:8333", 3),
    ]

    payload = {
        "schema": "zzx-bitnodes-test-v1",
        "total_nodes": len(rows),
        "nodes": rows,
        "network_counts": {"ipv4": 2, "ipv6": 1},
        "changes": {"added": 3},
        "dataplane": {"mode": "selftest"},
        "geo_summary": {"countries": 1},
        "metadata": {"note": "must never become a node"},
    }

    normalized = crb.normalize_nodes(payload)
    if len(normalized) != len(rows):
        raise SystemExit(
            f"list-form nodes normalized incorrectly: {len(normalized)}"
        )

    forbidden = {
        "nodes",
        "network_counts",
        "changes",
        "dataplane",
        "geo_summary",
        "metadata",
    }
    if forbidden.intersection(normalized):
        raise SystemExit(
            "structural top-level fields were incorrectly normalized as nodes"
        )

    first = normalized["203.0.113.10:8333"]
    if first.get("protocol") != 70016:
        raise SystemExit("protocol_version alias was not preserved")
    if first.get("agent") != "/Satoshi:30.1.0/":
        raise SystemExit("user_agent alias was not preserved")
    if first.get("country_code") != "US":
        raise SystemExit("country alias was not preserved")

    mapped_payload = {
        "nodes": {
            row["address"]: row
            for row in rows
        }
    }
    if len(crb.normalize_nodes(mapped_payload)) != len(rows):
        raise SystemExit("map-form nodes regression")

    with tempfile.TemporaryDirectory(prefix="zzx-bitnodes-registry-selftest-") as td:
        root = Path(td)
        source = root / "latest.json"
        out = root / "dated"
        latest = root / "latest"
        source.write_text(json.dumps(payload), encoding="utf-8")
        digest = hashlib.sha256(source.read_bytes()).hexdigest()

        rc = crb.backup(
            input_paths=[source],
            api_paths=[source],
            output_dir=out,
            latest_dir=latest,
            max_mb=24,
            source="zzxbitnodes",
            no_clean=False,
            expected_nodes=len(rows),
            expected_source_sha256=digest,
        )
        if rc != 0:
            raise SystemExit(f"backup returned {rc}")

        sql_rows = count_sql_rows(out)
        if sql_rows != len(rows):
            raise SystemExit(
                f"SQL row mismatch: expected={len(rows)} actual={sql_rows}"
            )

        dated_shards = sorted(out.glob("nodes-*.sql.gz"))
        latest_shards = sorted(latest.glob("nodes-*.sql.gz"))
        if [p.name for p in dated_shards] != [p.name for p in latest_shards]:
            raise SystemExit("dated/latest shard names diverged")
        for dated_path, latest_path in zip(dated_shards, latest_shards, strict=True):
            if dated_path.read_bytes() != latest_path.read_bytes():
                raise SystemExit(
                    f"dated/latest gzip bytes diverged: {dated_path.name}"
                )

        if (out / "manifest.sql.gz").read_bytes() != (latest / "manifest.sql.gz").read_bytes():
            raise SystemExit("dated/latest manifest gzip bytes diverged")

        # Force a multi-shard run so the exact private-registry failure mode
        # remains covered.  The live registry commonly spans multiple shards.
        multi_out = root / "multi-dated"
        multi_latest = root / "multi-latest"
        rc = crb.backup(
            input_paths=[source],
            api_paths=[source],
            output_dir=multi_out,
            latest_dir=multi_latest,
            max_mb=0.0003,
            source="zzxbitnodes",
            no_clean=False,
            expected_nodes=len(rows),
            expected_source_sha256=digest,
        )
        if rc != 0:
            raise SystemExit(f"multi-shard backup returned {rc}")

        multi_dated = sorted(multi_out.glob("nodes-*.sql.gz"))
        multi_alias = sorted(multi_latest.glob("nodes-*.sql.gz"))
        if len(multi_dated) < 2:
            raise SystemExit("multi-shard regression did not produce >=2 shards")
        if [p.name for p in multi_dated] != [p.name for p in multi_alias]:
            raise SystemExit("multi-shard dated/latest names diverged")
        for dated_path, latest_path in zip(multi_dated, multi_alias, strict=True):
            if dated_path.read_bytes() != latest_path.read_bytes():
                raise SystemExit(
                    f"multi-shard dated/latest gzip bytes diverged: {dated_path.name}"
                )

        try:
            crb.backup(
                input_paths=[source],
                api_paths=[source],
                output_dir=out,
                latest_dir=latest,
                max_mb=24,
                source="zzxbitnodes",
                no_clean=False,
                expected_nodes=len(rows) + 1,
                expected_source_sha256=digest,
            )
        except SystemExit as exc:
            if "normalized-node mismatch" not in str(exc):
                raise
        else:
            raise SystemExit("expected-node invariant did not reject mismatch")

    print("chunk_registry_backup self-test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
