#!/usr/bin/env python3
"""Optionally apply generated hourly MariaDB SQL shards to a remote/local server."""
from __future__ import annotations

import argparse
import gzip
import json
import os
import shutil
import subprocess
from pathlib import Path


def latest_manifest(root: Path) -> Path:
    index = root / "bitcoin/bpi/archive/archive-index.json"
    data = json.loads(index.read_text(encoding="utf-8"))
    hours = data.get("hours") or []
    if not hours:
        raise RuntimeError("archive index has no hours")
    path = root / str(hours[-1]["manifest"])
    if not path.is_file():
        raise RuntimeError(f"manifest missing: {path}")
    return path


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    p.add_argument("--manifest")
    p.add_argument("--host", default=os.environ.get("ZZX_MARIADB_HOST"))
    p.add_argument("--port", type=int, default=int(os.environ.get("ZZX_MARIADB_PORT") or "3306"))
    p.add_argument("--user", default=os.environ.get("ZZX_MARIADB_USER"))
    p.add_argument("--password", default=os.environ.get("ZZX_MARIADB_PASSWORD"))
    p.add_argument("--database", default=os.environ.get("ZZX_MARIADB_DATABASE") or "zzx_bpi")
    args = p.parse_args()

    if not args.host or not args.user or args.password is None:
        raise SystemExit("MariaDB credentials are not configured")

    client = shutil.which("mariadb") or shutil.which("mysql")
    if not client:
        raise SystemExit("mariadb/mysql client executable not found")

    root = Path(args.root).resolve()
    manifest_path = Path(args.manifest).resolve() if args.manifest else latest_manifest(root)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    sql_chunks = [c for c in manifest.get("chunks", []) if c.get("kind") == "mariadb-sql-gzip"]
    orderbook = manifest.get("orderbook_history") if isinstance(manifest.get("orderbook_history"), dict) else {}
    sql_chunks.extend(
        c for c in (orderbook.get("chunks") or [])
        if str(c.get("kind") or "").endswith("mariadb-sql-gzip")
    )

    env = os.environ.copy()
    env["MYSQL_PWD"] = args.password
    applied = 0
    for chunk in sql_chunks:
        path = manifest_path.parent / str(chunk["path"])
        with gzip.open(path, "rb") as fh:
            proc = subprocess.run(
                [client, "--protocol=TCP", "--host", args.host, "--port", str(args.port), "--user", args.user, args.database],
                stdin=fh,
                env=env,
            )
        if proc.returncode != 0:
            return proc.returncode
        applied += 1

    print(json.dumps({"manifest": str(manifest_path), "sql_chunks_applied": applied, "database": args.database}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
