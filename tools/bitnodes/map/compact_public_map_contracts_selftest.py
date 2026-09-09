#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODULE_PATH = HERE / "compact_public_map_contracts.py"

spec = importlib.util.spec_from_file_location("compact_public_map_contracts", MODULE_PATH)
if spec is None or spec.loader is None:
    raise SystemExit("unable to load compact_public_map_contracts.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def write(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td) / "maps"
        data = root / "data"
        points = [
            {
                "id": f"node-{i}",
                "address": f"203.0.113.{i + 1}:8333",
                "lat": 40.0 + (i / 1000),
                "lon": -75.0 - (i / 1000),
                "coordinates": [-75.0 - (i / 1000), 40.0 + (i / 1000)],
                "network": "ipv4",
                "status": "reachable_now",
                "user_agent": "/Satoshi:30.0.0/",
            }
            for i in range(64)
        ]

        write(
            data / "map-vectors.json",
            {
                "schema": "zzx-bitnodes-map-vectors-public-v2",
                "source": "zzx-canonical",
                "point_count": len(points),
                "points": points,
            },
        )
        write(
            data / "points.json",
            {
                "schema": "zzx-bitnodes-map-points-v4",
                "source": "zzx-canonical",
                "total_points": len(points),
                "points": points,
                "results": points,
            },
        )
        write(
            data / "live-map.json",
            {
                "schema": "zzx-bitnodes-live-map-v4",
                "source": "zzx-canonical",
                "total_points": len(points),
                "point_count": len(points),
                "points": points,
                "nodes": points,
            },
        )

        points_before = (data / "points.json").stat().st_size
        live_before = (data / "live-map.json").stat().st_size

        reports = mod.compact_roots([root], max_bytes=200_000)
        if len(reports) != 2:
            raise SystemExit(f"expected two rewritten contracts, got {len(reports)}")

        points_payload = json.loads((data / "points.json").read_text(encoding="utf-8"))
        live_payload = json.loads((data / "live-map.json").read_text(encoding="utf-8"))

        if len(points_payload.get("points", [])) != len(points):
            raise SystemExit("points.json lost rows")
        if len(live_payload.get("points", [])) != len(points):
            raise SystemExit("live-map.json lost rows")
        if "results" in points_payload:
            raise SystemExit("points.json still duplicates the point array as results")
        if "nodes" in live_payload:
            raise SystemExit("live-map.json still duplicates the point array as nodes")
        if points_payload.get("aliases", {}).get("results") != "points":
            raise SystemExit("points.json missing results alias metadata")
        if live_payload.get("aliases", {}).get("nodes") != "points":
            raise SystemExit("live-map.json missing nodes alias metadata")
        if (data / "points.json").stat().st_size >= points_before:
            raise SystemExit("points.json did not shrink")
        if (data / "live-map.json").stat().st_size >= live_before:
            raise SystemExit("live-map.json did not shrink")

        # Idempotency: a second pass must preserve the same point counts and remain valid.
        mod.compact_roots([root], max_bytes=200_000)
        points_payload = json.loads((data / "points.json").read_text(encoding="utf-8"))
        live_payload = json.loads((data / "live-map.json").read_text(encoding="utf-8"))
        if len(points_payload["points"]) != len(points) or len(live_payload["points"]) != len(points):
            raise SystemExit("idempotent rewrite changed point count")

    print("compact_public_map_contracts_selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
