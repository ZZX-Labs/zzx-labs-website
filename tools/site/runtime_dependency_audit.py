#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path

# The market-data/index/history runtime is intentionally standard-library only.
DEFAULT_FILES = [
    "tools/bpi/collector.py", "tools/bpi/history_store.py", "tools/bpi/history_api.py",
    "tools/bpi/history_backfill.py", "tools/bpi/backtest_all_exchanges.py",
    "tools/bpi/bpi_index_engine.py", "tools/bpi/master_daemon.py", "tools/bpi/run-bpi-master.py",
]


def local_modules(root: Path) -> set[str]:
    names = set()
    for path in (root / "tools/bpi").glob("*.py"):
        names.add(path.stem.replace("-", "_"))
    return names


def imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    out = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            out.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            out.add(node.module.split(".")[0])
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Fail if the critical BPI runtime introduces third-party Python imports.")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    args = parser.parse_args()
    root = Path(args.root).resolve()
    stdlib = set(sys.stdlib_module_names) | {"__future__"}
    local = local_modules(root)
    report = []
    failures = []
    for rel in DEFAULT_FILES:
        path = root / rel
        found = sorted(imports(path))
        external = [name for name in found if name not in stdlib and name not in local]
        report.append({"file": rel, "imports": found, "third_party": external})
        if external:
            failures.append({"file": rel, "third_party": external})
    print(json.dumps({"schema": "zzx-runtime-dependency-audit-v1", "files": report, "failures": failures}, indent=2))
    if failures:
        raise SystemExit("critical BPI runtime contains third-party imports")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
