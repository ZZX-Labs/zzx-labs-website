#!/usr/bin/env python3
"""Run directly from the checkout: python tests/test_daily_fact_recovery.py"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "tools/worldfactbook/recover_daily_facts.py"
spec = importlib.util.spec_from_file_location("recover_daily_facts", MODULE)
daily = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily)

ARCHIVE = """The World Factbook\nDaily Facts Archive\nJanuary 14, 2026\nThe Waterworks\n\n""" + \
    "A source-backed fact with enough original text to meet the strict parser length.\n" + \
    "January 13, 2026\nMalta’s Coat of Arms\n\n" + \
    "A second dated source-backed fact with enough original text to be indexed.\n"


class DailyArchiveTests(unittest.TestCase):
    def test_pdf_style_text_preserves_date_title_and_separates_caption(self):
        rows = daily.parse_archive_text(ARCHIVE)
        self.assertEqual([r["date"] for r in rows], ["2026-01-14", "2026-01-13"])
        self.assertEqual(rows[1]["title"], "Malta’s Coat of Arms")
        self.assertNotIn("associated_caption", rows[0])
        with_caption = ARCHIVE.replace("January 13, 2026", "\nA separately printed image caption.\n\nJanuary 13, 2026")
        self.assertEqual(daily.parse_archive_text(with_caption)[0]["associated_caption"],
                         "A separately printed image caption.")

    def test_html_requires_explicit_date_and_keeps_features_distinct(self):
        raw = b"""<article><h2>Fact of the Day</h2><time>January 14, 2026</time>
        <h3>The Waterworks</h3><p>A dated historical fact whose body contains more than thirty-five characters.</p>
        <a>VIEW 30-DAY ARCHIVE</a><h2>Image of the Day</h2><p>Unrelated image caption.</p></article>"""
        rows = daily.parse_html(raw, "https://www.cia.gov/the-world-factbook/")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "The Waterworks")
        self.assertNotIn("Unrelated", rows[0]["body"])
        self.assertEqual(daily.parse_html(b"<h2>Fact of the Day</h2><p>No date</p>",
             "https://www.cia.gov/the-world-factbook/"), [])

    def test_backtest_reports_gaps_conflicts_and_private_paths_stay_private(self):
        with tempfile.TemporaryDirectory() as temporary:
            store, api = Path(temporary) / "private", Path(temporary) / "public"
            evidence = {"snapshot_url": "https://web.archive.org/web/20260114000000id_/https://www.cia.gov/the-world-factbook/",
                        "raw_path": "raw/2026/source.html.gz"}
            for row in daily.parse_archive_text(ARCHIVE):
                self.assertTrue(daily.put_record(store, row, evidence))
                self.assertFalse(daily.put_record(store, row, evidence))
            report = daily.audit(store)
            self.assertEqual(report["observed_days"], 2)
            self.assertTrue(report["complete_between_observations"])
            extra = {"date": "2026-01-14", "title": "Different version",
                     "body": "This distinct publication has enough text to be reviewed independently."}
            daily.put_record(store, extra, evidence)
            daily.put_record(store, {"date": "2026-01-16", "title": "Another day",
                "body": "The next day has a similarly long and independently sourced text."}, evidence)
            report = daily.audit(store)
            self.assertEqual(report["missing_days_between_observations"], ["2026-01-15"])
            self.assertEqual(report["conflicting_dates"], ["2026-01-14"])
            self.assertFalse(report["complete_between_observations"])
            daily.export(store, api, store / "training.jsonl")
            public = (api / "months/2026-01.json").read_text(encoding="utf-8")
            self.assertNotIn("raw_path", public)
            self.assertEqual(json.loads((api / "index.json").read_text())["gaps"], 1)
            training = (store / "training.jsonl").read_text(encoding="utf-8")
            self.assertNotIn("Different version", training)

    def test_newest_first_recovery_resumes_without_repeating_capture(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = Path(temporary)
            source = daily.SOURCES[0]
            rows = [{"timestamp": "20260114000000", "original": source},
                    {"timestamp": "20260113000000", "original": source}]
            fetched = []
            def fake_fetch(url, timeout=50):
                fetched.append(url)
                return ("<article>" + ARCHIVE + "</article>").encode()
            with patch.object(daily, "cdx_rows", side_effect=lambda year, url: rows if url == source else []), \
                 patch.object(daily, "fetch", side_effect=fake_fetch):
                first = daily.recover(store, 2026, 2026, 1, 0)
                self.assertTrue(first["more_captures_pending"])
                second = daily.recover(store, 2026, 2026, 2, 0)
            self.assertFalse(second["more_captures_pending"])
            self.assertEqual(len(fetched), 2)
            self.assertIn("20260114000000", fetched[0])
            self.assertIn("20260113000000", fetched[1])
            self.assertEqual(daily.audit(store)["records"], 2)


if __name__ == "__main__":
    unittest.main()
