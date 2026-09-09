#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path


def write_status(report_path: Path, max_points_raw: str, outputs: list[Path]) -> dict:
    if not report_path.is_file() or report_path.stat().st_size <= 0:
        raise RuntimeError(f"missing Map Host map-source report: {report_path}")

    report = json.loads(report_path.read_text(encoding="utf-8"))

    try:
        max_points = int(max_points_raw)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"invalid MAP_MAX_POINTS: {max_points_raw!r}") from exc

    if max_points < 1:
        raise RuntimeError(f"MAP_MAX_POINTS must be positive, got {max_points}")

    status = {
        "schema": "zzx-bitnodes-maphost-status-v2",
        "generated_at": 1,
        "source": "Map Host prepared canonical snapshot",
        "published_source_hint": "bitcoin/bitnodes/api/snapshots/latest.json",
        "source_schema": "zzx-bitnodes-canonical-v2",
        "real_coordinates_only": True,
        "synthetic_coordinates": 0,
        "max_points": max_points,
        "map_source": report,
    }

    text = json.dumps(
        status,
        ensure_ascii=False,
        separators=(",", ":"),
    ) + "\n"

    for path in outputs:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    return status


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        report = root / "map-report.json"
        report.write_text(
            json.dumps({
                "input_rows": 28200,
                "real_coordinate_rows": 10078,
                "emitted_rows": 5000,
            }),
            encoding="utf-8",
        )

        outputs = [
            root / "maps/data/maphost-status.json",
            root / "live-map/data/maphost-status.json",
        ]

        status = write_status(report, "5000", outputs)
        assert status["max_points"] == 5000
        assert status["schema"] == "zzx-bitnodes-maphost-status-v2"

        for path in outputs:
            data = json.loads(path.read_text(encoding="utf-8"))
            assert data["max_points"] == 5000
            assert data["map_source"]["emitted_rows"] == 5000

        for bad in ("${MAP_MAX_POINTS}", "0", "-1", ""):
            try:
                write_status(report, bad, outputs)
            except RuntimeError:
                pass
            else:
                raise AssertionError(f"bad MAP_MAX_POINTS accepted: {bad!r}")

    print("maphost_status_selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
