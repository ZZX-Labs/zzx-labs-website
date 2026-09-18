#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Mapping

POINTS_SCHEMA = "zzx-bitnodes-map-points-public-v5"
LIVE_SCHEMA = "zzx-bitnodes-live-map-public-v5"
REPORT_SCHEMA = "zzx-bitnodes-public-map-contract-compaction-report-v1"


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def compact_bytes(value: Any) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        + "\n"
    ).encode("utf-8")


def atomic_write(path: Path, blob: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_bytes(blob)
    os.replace(tmp, path)


def scalar_metadata(payload: Any, keys: tuple[str, ...]) -> dict[str, Any]:
    if not isinstance(payload, Mapping):
        return {}
    out: dict[str, Any] = {}
    for key in keys:
        value = payload.get(key)
        if value is None or isinstance(value, (str, int, float, bool)):
            if value is not None:
                out[key] = value
    return out


def vector_points(vector_path: Path) -> tuple[dict[str, Any], list[Any]]:
    payload = read_json(vector_path)
    if not isinstance(payload, dict):
        raise RuntimeError(f"vector payload is not an object: {vector_path}")
    points = payload.get("points")
    if not isinstance(points, list) or not points:
        raise RuntimeError(f"vector payload has no point list: {vector_path}")
    return payload, points


def build_points_contract(
    original: Any,
    vectors: Mapping[str, Any],
    points: list[Any],
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "schema": POINTS_SCHEMA,
        "source": (
            vectors.get("source")
            or (original.get("source") if isinstance(original, Mapping) else None)
            or "zzx-canonical"
        ),
        "total_points": len(points),
        "point_count": len(points),
        "points": points,
        "aliases": {
            "results": "points",
        },
        "compatibility": {
            "duplicate_array_aliases_removed": True,
            "canonical_collection": "points",
            "retired_duplicate_keys": ["results"],
        },
    }
    out.update(
        scalar_metadata(
            original,
            ("updated_at", "generated_at"),
        )
    )
    return out


def build_live_contract(
    original: Any,
    vectors: Mapping[str, Any],
    points: list[Any],
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "schema": LIVE_SCHEMA,
        "source": (
            vectors.get("source")
            or (original.get("source") if isinstance(original, Mapping) else None)
            or "zzx-canonical"
        ),
        "total_points": len(points),
        "point_count": len(points),
        "points": points,
        "aliases": {
            "nodes": "points",
        },
        "compatibility": {
            "duplicate_array_aliases_removed": True,
            "canonical_collection": "points",
            "retired_duplicate_keys": ["nodes"],
        },
    }
    out.update(
        scalar_metadata(
            original,
            ("updated_at", "generated_at"),
        )
    )
    return out


def rewrite_contract(
    path: Path,
    payload: dict[str, Any],
    *,
    max_bytes: int,
    point_count: int,
) -> dict[str, Any]:
    before = path.stat().st_size if path.exists() else 0
    blob = compact_bytes(payload)
    if len(blob) > max_bytes:
        raise RuntimeError(
            f"compacted public map contract still exceeds limit: "
            f"{len(blob)} > {max_bytes}: {path}"
        )
    atomic_write(path, blob)

    verify = read_json(path)
    points = verify.get("points") if isinstance(verify, dict) else None
    if not isinstance(points, list) or len(points) != point_count:
        raise RuntimeError(f"public contract point-count mismatch after rewrite: {path}")

    return {
        "path": str(path),
        "before_bytes": before,
        "after_bytes": len(blob),
        "point_count": point_count,
        "sha256": hashlib.sha256(blob).hexdigest(),
        "schema": verify.get("schema"),
    }


def compact_data_dir(data_dir: Path, *, max_bytes: int) -> list[dict[str, Any]]:
    vector_path = data_dir / "map-vectors.json"
    points_path = data_dir / "points.json"
    live_path = data_dir / "live-map.json"
    if not vector_path.is_file() or not (points_path.is_file() or live_path.is_file()):
        return []

    vectors, points = vector_points(vector_path)
    if vector_path.stat().st_size > max_bytes:
        raise RuntimeError(
            f"map-vectors.json must be compacted before public contracts: {vector_path}"
        )

    reports: list[dict[str, Any]] = []

    if points_path.is_file():
        original = read_json(points_path)
        original_points = original.get("points") if isinstance(original, Mapping) else None
        selected = original_points if isinstance(original_points, list) and len(original_points) == len(points) else points
        try:
            row = rewrite_contract(
                points_path,
                build_points_contract(original, vectors, selected),
                max_bytes=max_bytes,
                point_count=len(points),
            )
            row["point_source"] = "existing-points" if selected is original_points else "compacted-vectors"
        except RuntimeError:
            if selected is points:
                raise
            row = rewrite_contract(
                points_path,
                build_points_contract(original, vectors, points),
                max_bytes=max_bytes,
                point_count=len(points),
            )
            row["point_source"] = "compacted-vectors-fallback"
        reports.append(row)

    if live_path.is_file():
        original = read_json(live_path)
        original_points = original.get("points") if isinstance(original, Mapping) else None
        selected = original_points if isinstance(original_points, list) and len(original_points) == len(points) else points
        try:
            row = rewrite_contract(
                live_path,
                build_live_contract(original, vectors, selected),
                max_bytes=max_bytes,
                point_count=len(points),
            )
            row["point_source"] = "existing-points" if selected is original_points else "compacted-vectors"
        except RuntimeError:
            if selected is points:
                raise
            row = rewrite_contract(
                live_path,
                build_live_contract(original, vectors, points),
                max_bytes=max_bytes,
                point_count=len(points),
            )
            row["point_source"] = "compacted-vectors-fallback"
        reports.append(row)

    return reports


def compact_roots(roots: list[Path], *, max_bytes: int) -> list[dict[str, Any]]:
    reports: list[dict[str, Any]] = []
    seen: set[Path] = set()

    for root in roots:
        if not root.exists():
            continue
        for vector_path in sorted(root.rglob("map-vectors.json")):
            data_dir = vector_path.parent.resolve()
            if data_dir in seen:
                continue
            seen.add(data_dir)
            reports.extend(compact_data_dir(vector_path.parent, max_bytes=max_bytes))

    if not reports:
        raise FileNotFoundError("no points.json/live-map.json public contracts found under requested roots")
    return reports


def main() -> int:
    ap = argparse.ArgumentParser(
        description=(
            "Compact Bitnodes public points.json/live-map.json contracts from the "
            "already-compacted canonical map-vectors.json point collection."
        )
    )
    ap.add_argument("--root", action="append", required=True, help="Map root to scan; repeatable")
    ap.add_argument("--max-bytes", type=int, default=24_000_000)
    ap.add_argument("--report", default="")
    args = ap.parse_args()

    if args.max_bytes < 1:
        raise SystemExit("--max-bytes must be positive")

    reports = compact_roots([Path(item) for item in args.root], max_bytes=args.max_bytes)
    payload = {
        "schema": REPORT_SCHEMA,
        "files": reports,
        "file_count": len(reports),
        "total_before_bytes": sum(row["before_bytes"] for row in reports),
        "total_after_bytes": sum(row["after_bytes"] for row in reports),
        "max_bytes": args.max_bytes,
    }

    if args.report:
        Path(args.report).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
