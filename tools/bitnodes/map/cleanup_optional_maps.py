#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any


def safe_subtree(name: str) -> str:
    value = str(name or "").strip().strip("/\\")
    if not value:
        raise ValueError("optional subtree must not be empty")
    if value in {".", ".."}:
        raise ValueError(f"unsafe optional subtree: {value!r}")
    path = Path(value)
    if path.is_absolute() or len(path.parts) != 1 or path.parts[0] in {".", ".."}:
        raise ValueError(f"optional subtree must be one direct child name: {value!r}")
    return value


def tree_stats(path: Path) -> tuple[int, int]:
    files = 0
    total = 0
    if not path.exists():
        return files, total
    for item in path.rglob("*"):
        if item.is_file():
            files += 1
            try:
                total += item.stat().st_size
            except OSError:
                pass
    return files, total


def cleanup(roots: list[Path], subtree: str) -> dict[str, Any]:
    child = safe_subtree(subtree)
    rows = []

    seen = set()
    for root in roots:
        root = Path(root)
        resolved_root = root.resolve()
        if resolved_root in seen:
            continue
        seen.add(resolved_root)

        target = root / child
        files, total = tree_stats(target)
        existed = target.exists()

        if existed:
            shutil.rmtree(target)

        rows.append({
            "root": str(root),
            "target": str(target),
            "existed": existed,
            "removed_files": files,
            "removed_bytes": total,
            "exists_after": target.exists(),
        })

    return {
        "schema": "zzx-bitnodes-optional-map-cleanup-v1",
        "subtree": child,
        "roots": rows,
        "removed_files": sum(row["removed_files"] for row in rows),
        "removed_bytes": sum(row["removed_bytes"] for row in rows),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Delete stale optional Bitnodes map compatibility subtrees before an optional rebuild."
    )
    parser.add_argument(
        "--root",
        action="append",
        required=True,
        help="Map root whose direct optional child may be removed; repeatable.",
    )
    parser.add_argument(
        "--subtree",
        default="originalbitnodes",
        help="Direct child compatibility subtree to reset.",
    )
    parser.add_argument("--report", default="")
    args = parser.parse_args()

    report = cleanup([Path(value) for value in args.root], args.subtree)

    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    print(json.dumps(report, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
