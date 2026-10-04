#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
TARGET = HERE / "aggregate.py"
spec = importlib.util.spec_from_file_location("bitnodes_aggregate", TARGET)
if spec is None or spec.loader is None:
    raise SystemExit(f"unable to load {TARGET}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def main() -> int:
    metadata_blob = {
        "geoip_data": {"provider": "fixture", "padding": "x" * 20_000},
        "organization_data": {"padding": "y" * 20_000},
        "provider_data": {"padding": "z" * 20_000},
    }
    rows = []
    for i in range(250):
        rows.append({
            "address": f"203.0.113.{(i % 250) + 1}:{8333 + (i // 250)}",
            "reachable": True,
            "reachable_now": True,
            "reachable_24h": True,
            "protocol": 70016,
            "user_agent": "/Satoshi:29.0.0/",
            "height": 900000,
            "services": 1033,
            "country": "US",
            "city": "Example City",
            "asn": "AS64500",
            "provider": "Example Provider",
            "organization": "Example Org",
            "latency_ms": 42.5,
            "metadata": metadata_blob,
        })

    full = mod.aggregate(rows, source="selftest", include_nodes=True, include_node_metadata=True)
    public = mod.aggregate(rows, source="selftest", include_nodes=True, include_node_metadata=False)

    full_bytes = len(json.dumps(full, separators=(",", ":")).encode("utf-8"))
    public_bytes = len(json.dumps(public, separators=(",", ":")).encode("utf-8"))

    assert full["total_nodes"] == public["total_nodes"] == 250
    assert public["reachable_nodes"] == 250
    assert public["latest_height"] == 900000
    assert public["counts"]["reachable"] == 250
    assert public["top"]["countries"][0]["name"] == "US"
    assert public_bytes < full_bytes * 0.20, (full_bytes, public_bytes)

    sample = next(iter(public["nodes"].values()))
    assert "metadata" not in sample
    for key in (
        "address", "canonical_address", "reachable", "reachable_now", "reachable_24h",
        "protocol", "agent", "height", "services", "country", "city", "asn",
        "provider", "organization", "latency_ms", "peer_index", "source",
    ):
        assert key in sample, key

    print(
        "aggregate_public_selftest: PASS",
        f"full_bytes={full_bytes}",
        f"public_bytes={public_bytes}",
        f"ratio={public_bytes / full_bytes:.4f}",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
