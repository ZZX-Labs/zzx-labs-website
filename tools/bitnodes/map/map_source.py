#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Mapping

SYNTHETIC = ("synthetic", "deterministic-fallback", "workflow-map-ready-fallback")


def clean(value: Any) -> str:
    return str(value or "").strip()


def finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def valid_coords(row: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = finite(row.get("latitude") if row.get("latitude") is not None else row.get("lat"))
    lon = finite(row.get("longitude") if row.get("longitude") is not None else row.get("lon") if row.get("lon") is not None else row.get("lng"))
    if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None
    return lat, lon


def synthetic(row: Mapping[str, Any]) -> bool:
    contract = row.get("geo_contract") if isinstance(row.get("geo_contract"), Mapping) else {}
    if contract.get("synthetic") is True:
        return True
    values = [
        row.get("geoip_confidence"), row.get("geoip_source"), row.get("geo_confidence"), row.get("geo_source"),
        contract.get("source"), contract.get("confidence"),
    ]
    text = " ".join(str(value or "").lower() for value in values)
    return any(marker in text for marker in SYNTHETIC)


def node_rows(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    raw = payload.get("nodes")
    out: list[dict[str, Any]] = []
    if isinstance(raw, list):
        out.extend(dict(row) for row in raw if isinstance(row, Mapping))
    elif isinstance(raw, Mapping):
        for address, value in raw.items():
            if isinstance(value, Mapping):
                row = dict(value)
                row.setdefault("address", address)
                out.append(row)
    return out


def build(payload: Mapping[str, Any], max_points: int) -> tuple[dict[str, Any], dict[str, Any]]:
    rows = node_rows(payload)
    kept: list[dict[str, Any]] = []
    rejected_synthetic = 0
    rejected_no_coords = 0

    for row in rows:
        if synthetic(row):
            rejected_synthetic += 1
            continue
        lat, lon = valid_coords(row)
        if lat is None or lon is None:
            rejected_no_coords += 1
            continue
        copy = dict(row)
        copy["latitude"] = lat
        copy["longitude"] = lon
        copy["lat"] = lat
        copy["lon"] = lon
        kept.append(copy)

    kept.sort(key=lambda row: str(row.get("address") or row.get("node") or ""))
    total_real = len(kept)
    if max_points > 0:
        kept = kept[:max_points]

    nodes = {
        str(row.get("address") or row.get("node") or f"node-{index:08d}"): row
        for index, row in enumerate(kept)
    }

    output = {
        "schema": "zzx-bitnodes-map-source-v1",
        "source": payload.get("source") or "zzx-canonical",
        "source_schema": payload.get("schema"),
        "updated_ms": payload.get("updated_ms"),
        "metadata": {
            "real_coordinates_only": True,
            "synthetic_coordinates": 0,
            "input_rows": len(rows),
            "real_coordinate_rows": total_real,
            "emitted_rows": len(nodes),
            "max_points": max_points,
        },
        "nodes": nodes,
    }
    report = {
        "input_rows": len(rows),
        "real_coordinate_rows": total_real,
        "emitted_rows": len(nodes),
        "rejected_synthetic": rejected_synthetic,
        "rejected_without_coordinates": rejected_no_coords,
    }
    return output, report


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a real-coordinate-only map source from the canonical Bitnodes snapshot.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", default="")
    parser.add_argument("--max-points", type=int, default=5000)
    parser.add_argument("--minimum-points", type=int, default=1)
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args()

    path = Path(args.input)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise SystemExit("map source input must be a JSON object")

    output, report = build(payload, max(0, args.max_points))
    if report["emitted_rows"] < max(1, args.minimum_points):
        raise SystemExit(f"map source has too few real-coordinate rows: {report['emitted_rows']}")

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    kwargs = {"ensure_ascii": False, "separators": (",", ":")} if args.compact else {"ensure_ascii": False, "indent": 2}
    out.write_text(json.dumps(output, **kwargs) + "\n", encoding="utf-8")
    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, **kwargs) + "\n", encoding="utf-8")
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
