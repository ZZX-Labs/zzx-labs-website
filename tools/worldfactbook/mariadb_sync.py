#!/usr/bin/env python3
from __future__ import annotations
import argparse, gzip, json, os, subprocess
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="worldfactbook/db")
    ap.add_argument("--host", default=os.getenv("WORLDFACTBOOK_MARIADB_HOST", ""))
    ap.add_argument("--port", default=os.getenv("WORLDFACTBOOK_MARIADB_PORT", "3306"))
    ap.add_argument("--user", default=os.getenv("WORLDFACTBOOK_MARIADB_USER", ""))
    ap.add_argument("--password", default=os.getenv("WORLDFACTBOOK_MARIADB_PASSWORD", ""))
    ap.add_argument("--database", default=os.getenv("WORLDFACTBOOK_MARIADB_DATABASE", "worldfactbook"))
    args = ap.parse_args()
    if not args.host or not args.user:
        raise SystemExit("MariaDB host/user not configured")
    root = Path(args.root)
    manifests = [root / "manifest.json"]
    media_manifest = root / "media-manifest.json"
    if media_manifest.is_file():
        manifests.append(media_manifest)

    env = os.environ.copy()
    env["MYSQL_PWD"] = args.password
    base = [
        "mariadb", "--protocol=tcp", "--host", args.host,
        "--port", str(args.port), "--user", args.user, args.database,
    ]

    for manifest_path in manifests:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for entry in manifest.get("files", []):
            path = root / entry["path"]
            with gzip.open(path, "rb") as src:
                proc = subprocess.run(base, stdin=src, env=env, check=False)
            if proc.returncode != 0:
                raise SystemExit(f"MariaDB import failed: {path}")
            print("imported", path)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
