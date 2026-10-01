"""Check that exported country shards read in Factbook chapter/source order."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "tools" / "worldfactbook" / "local_ingest.py"
SPEC = importlib.util.spec_from_file_location("factbook_local_ingest", MODULE)
factbook = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(factbook)


class CountryOrderTests(unittest.TestCase):
    def test_export_preserves_chapter_order_and_source_order_within_chapter(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            database = root / "archive.sqlite"
            output = root / "site"
            source = "a" * 64
            with factbook.db(database) as con:
                con.execute(
                    "INSERT INTO sources(id,edition_year,name,format,bytes,status,"
                    "page_count,processed_pages,country_count,field_count,imported_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    (source, 2026, "verified-sample.txt", "txt", 100, "processed",
                     1, 1, 1, 4, "2026-09-30T00:00:00Z"),
                )
                for rowid, category, label, ordinal in (
                    ("a", "communications", "Telephones", 4),
                    ("b", "geography", "Area", 3),
                    ("c", "introduction", "Background second", 2),
                    ("d", "introduction", "Background first", 1),
                ):
                    con.execute(
                        "INSERT INTO fields(id,source_id,edition_year,country,country_name,"
                        "category,label,content,locator,extraction,ordinal) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                        (rowid, source, 2026, "US", "United States", category, label,
                         label, "page:1", "plain-text", ordinal),
                    )
            registry = root / "countries.json"
            registry.write_text(json.dumps({"countries": [
                {"country": "US", "countryName": "United States"}
            ]}), encoding="utf-8")
            factbook.export(database, output, registry)
            part = output / "api" / "country-archive" / "countries" / "US" / "2026" / "part-0001.json"
            fields = json.loads(part.read_text(encoding="utf-8"))["fields"]
            self.assertEqual([item["label"] for item in fields],
                             ["Background first", "Background second", "Area", "Telephones"])


if __name__ == "__main__":
    unittest.main()
