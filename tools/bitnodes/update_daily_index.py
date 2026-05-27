
`tools/bitnodes/update_daily_index.py`

```python
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            ensure_ascii=False,
            indent=2,
            sort_keys=True
        )

        handle.write("\n")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build manifests/daily-index.json for private Bitnodes registry repo."
    )

    parser.add_argument(
        "--repo-root",
        default=".",
        help="Private registry repo root."
    )

    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    registry_dir = repo_root / "registry"
    output_path = repo_root / "manifests" / "daily-index.json"

    entries = []

    if registry_dir.exists():
        for day_dir in sorted(registry_dir.iterdir()):
            if not day_dir.is_dir():
                continue

            manifest_path = day_dir / "manifest.json"

            if not manifest_path.exists():
                continue

            try:
                manifest = read_json(manifest_path)
            except Exception:
                continue

            chunks = manifest.get("chunks", [])

            entries.append({
                "date": day_dir.name,
                "path": f"registry/{day_dir.name}/manifest.json",
                "generated_at": manifest.get("generated_at"),
                "node_count": manifest.get("node_count", 0),
                "chunk_count": manifest.get("chunk_count", len(chunks)),
                "max_bytes": manifest.get("max_bytes"),
                "manifest_sha256": sha256_file(manifest_path),
                "total_bytes": sum(
                    int(chunk.get("bytes", 0))
                    for chunk in chunks
                    if isinstance(chunk, dict)
                )
            })

    payload = {
        "schema": "zzx-bitnodes-global-registry-daily-index-v1",
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "entry_count": len(entries),
        "entries": entries
    }

    write_json(output_path, payload)

    print(f"daily index written: {output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
