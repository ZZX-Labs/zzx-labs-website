#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

EXTENSIONS = {".py": "Python", ".html": "HTML", ".css": "CSS", ".js": "JavaScript", ".sh": "Shell", ".yml": "YAML", ".yaml": "YAML"}
SKIP_PARTS = {".git", "node_modules", "vendor", "archive", "downloads", "__pycache__"}


def measure(root: Path) -> dict:
    totals = {name: 0 for name in sorted(set(EXTENSIONS.values()))}
    files = {name: 0 for name in totals}
    for path in root.rglob("*"):
        if not path.is_file() or any(part in SKIP_PARTS for part in path.parts):
            continue
        kind = EXTENSIONS.get(path.suffix.lower())
        if not kind:
            continue
        try:
            size = path.stat().st_size
        except OSError:
            continue
        totals[kind] += size; files[kind] += 1
    total = sum(totals.values())
    return {
        "total_source_bytes": total,
        "languages": {
            name: {"bytes": totals[name], "files": files[name], "percent": round(totals[name] / total * 100.0, 3) if total else 0.0}
            for name in totals
        },
        "targets": {"Python": "65-80%", "JavaScript": "<5% preferred; <=12% transitional ceiling"},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit ZZX site source-code language budget by source bytes.")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--enforce-js-max", type=float)
    parser.add_argument("--enforce-python-min", type=float)
    args = parser.parse_args()
    result = measure(Path(args.root).resolve())
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for name, row in sorted(result["languages"].items(), key=lambda item: -item[1]["bytes"]):
            print(f"{name:10s} {row['percent']:7.3f}% {row['bytes']:12d} bytes {row['files']:5d} files")
    py = result["languages"]["Python"]["percent"]
    js = result["languages"]["JavaScript"]["percent"]
    if args.enforce_python_min is not None and py < args.enforce_python_min:
        raise SystemExit(f"Python budget {py:.3f}% < required {args.enforce_python_min:.3f}%")
    if args.enforce_js_max is not None and js > args.enforce_js_max:
        raise SystemExit(f"JavaScript budget {js:.3f}% > allowed {args.enforce_js_max:.3f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
