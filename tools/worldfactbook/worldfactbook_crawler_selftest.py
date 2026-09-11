#!/usr/bin/env python3
from __future__ import annotations
import json, sys, tempfile, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
from formats import extract
from shard_store import write_shards
from worldfactbook_crawler import parse_chunks


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="wfb-selftest-") as td:
        root = Path(td)
        txt = root / "book.txt"
        txt.write_text("United States\nGeography\nArea total 9,833,517 sq km. "*8 + "\nEconomy\nGDP data and economy notes. "*12, encoding="utf-8")
        docs = extract(txt)
        assert docs and "United States" in docs[0].text

        epub = root / "book.epub"
        with zipfile.ZipFile(epub, "w") as zf:
            zf.writestr("OPS/ch1.xhtml", "<html><body><h1>Canada</h1><h2>Geography</h2><p>Area and location details for Canada.</p></body></html>")
        assert extract(epub)

        aliases = {"united states":("US","United States"), "canada":("CA","Canada")}
        chunks = parse_chunks(docs[0].text, 2025, aliases)
        assert chunks
        rows = []
        import hashlib
        for i, row in enumerate(chunks, 1):
            sha = hashlib.sha256(row["content"].encode()).hexdigest()
            row.update({
                "chunk_id":hashlib.sha256((sha+str(i)).encode()).hexdigest(),
                "content_sha256":sha,"source_provider":"selftest","source_identifier":"selftest",
                "source_format":"txt","source_sha256":"0"*64,"source_url":"https://example.invalid/wfb.txt","extractor":"plain-text",
            })
            rows.append(row)
        manifest = write_shards(rows, root / "db", max_compressed_bytes=2_000_000, target_rows=2)
        assert manifest["rows"] == len(rows) and manifest["files"]
        json.loads((root / "db/manifest.json").read_text())
    print("World Factbook crawler self-tests passed")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
