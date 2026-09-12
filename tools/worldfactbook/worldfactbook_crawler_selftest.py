#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from formats import extract
from media import MediaExtractor, SourceContext, write_media_indexes, write_media_shards
from shard_store import write_shards
from worldfactbook_crawler import (
    _candidate_years,
    _doc_years,
    _select_ia_files,
    discover_wayback,
    parse_chunks,
)


def _font(size: int = 34):
    for candidate in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    ):
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="wfb-selftest-") as td:
        root = Path(td)
        txt = root / "book.txt"
        txt.write_text(
            "United States\nGeography\nArea total 9,833,517 sq km. " * 8
            + "\nEconomy\nGDP data and economy notes. " * 12,
            encoding="utf-8",
        )
        docs = extract(txt)
        assert docs and "United States" in docs[0].text

        epub = root / "book.epub"
        with zipfile.ZipFile(epub, "w") as zf:
            zf.writestr(
                "OPS/ch1.xhtml",
                "<html><body><h1>Canada</h1><h2>Geography</h2>"
                "<p>Area and location details for Canada.</p></body></html>",
            )
        assert extract(epub)

        aliases = {
            "united states": ("US", "United States"),
            "canada": ("CA", "Canada"),
        }
        # Historical IA metadata does not reliably populate ``year`` with the
        # edition year.  Verify the crawler can recover it from title/identifier
        # and that direct documents outrank expensive derivative archive bundles.
        assert _candidate_years("National Basic Intelligence Factbook 1963") == {1963}
        assert 1975 in _doc_years({
            "title": "The World Factbook 1975",
            "identifier": "worldfactbook1975scan",
            "date": "2004-01-01",
        })
        selected = _select_ia_files({
            "files": [
                {"name": "worldfactbook1975_archive.zip", "size": "900000000", "source": "original"},
                {"name": "worldfactbook1975.pdf", "size": "120000000", "source": "original"},
                {"name": "worldfactbook1975_text.pdf", "size": "40000000", "source": "derivative"},
                {"name": "worldfactbook1975.epub", "size": "10000000", "source": "derivative"},
            ]
        }, 1975, 3)
        assert selected
        assert all(not name.endswith(".zip") for name, _ in selected)
        assert selected[0][0].endswith(".pdf")
        assert discover_wayback(1975, 320) == []

        chunks = parse_chunks(docs[0].text, 2025, aliases)
        assert chunks
        rows = []
        for i, row in enumerate(chunks, 1):
            sha = hashlib.sha256(row["content"].encode()).hexdigest()
            row.update(
                {
                    "chunk_id": hashlib.sha256((sha + str(i)).encode()).hexdigest(),
                    "content_sha256": sha,
                    "source_provider": "selftest",
                    "source_identifier": "selftest",
                    "source_format": "txt",
                    "source_sha256": "0" * 64,
                    "source_url": "https://example.invalid/wfb.txt",
                    "extractor": "plain-text",
                }
            )
            rows.append(row)
        manifest = write_shards(
            rows,
            root / "db",
            max_compressed_bytes=2_000_000,
            target_rows=2,
        )
        assert manifest["rows"] == len(rows) and manifest["files"]
        json.loads((root / "db/manifest.json").read_text())

        # Media/OCR/attribution self-test. The image has a white border so the
        # cropper must tighten it, and the HTML context carries explicit credit.
        img = Image.new("RGB", (520, 300), "white")
        draw = ImageDraw.Draw(img)
        draw.rectangle((70, 55, 450, 240), fill=(36, 72, 54), outline=(0, 0, 0), width=4)
        draw.text((105, 105), "CANADA MAP", font=_font(38), fill="white")
        draw.text((140, 165), "OTTAWA", font=_font(28), fill="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        data_uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

        html = root / "edition.html"
        html.write_text(
            "<html><body><figure>"
            f'<img src="{data_uri}" alt="Canada geography map" title="Photo credit: CIA" />'
            "<figcaption>Canada geography map showing Ottawa. Photo credit: CIA</figcaption>"
            "</figure></body></html>",
            encoding="utf-8",
        )

        media_root = root / "worldfactbook/media"
        portal_root = root / "worldfactbook/api"
        extractor = MediaExtractor(
            root,
            media_root,
            portal_root,
            aliases,
            max_images_per_source=10,
        )
        source = SourceContext(
            edition_year=2025,
            provider="selftest",
            identifier="media-selftest",
            source_url="https://example.invalid/2025/world-factbook.html",
            source_name="edition.html",
            source_format="html",
            source_sha256=hashlib.sha256(html.read_bytes()).hexdigest(),
        )
        media = extractor.extract(html, source)
        assert len(media) == 1
        rec = media[0]
        assert rec["credit_status"] == "explicit"
        assert rec["credit"].startswith("CIA")
        assert rec["visual_type"] in {
            "map", "illustration", "photograph", "diagram", "flag", "seal-or-emblem"
        }
        assert re.fullmatch(
            r"wfb-2025-[a-z0-9-]+-[a-z0-9-]+-p0000-i001-[0-9a-f]{12}\.png",
            rec["filename"],
        )
        assert rec["citation_key"] == Path(rec["filename"]).stem
        assert rec["citation_key"] in rec["citation"]
        assert Path(root / rec["path"]).is_file()
        assert rec["crop_box"] != [0, 0, 520, 300]
        # OCR is expected with the workflow's tesseract dependency. Do not bind
        # the test to exact OCR spelling; just require actual extracted text.
        assert len(rec["ocr_text"].strip()) >= 4

        media_index = write_media_indexes(media, portal_root, media_root, root, 2025, 2025)
        media_shards = write_media_shards(media, root / "worldfactbook/db")
        assert media_index["schema"] == "zzx-worldfactbook-media-index-v1"
        assert media_index["images"] == 1
        assert media_shards["schema"] == "zzx-worldfactbook-media-mariadb-shards-v1"
        assert media_shards["rows"] == 1 and media_shards["files"]
        year_index = json.loads((portal_root / "media/2025/index.json").read_text())
        attribution = json.loads((portal_root / "attributions/2025/images.json").read_text())
        assert year_index["images"][0]["citation_key"] == rec["citation_key"]
        assert attribution["images"][0]["filename"] == rec["filename"]

    print("World Factbook crawler + OCR/media self-tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
