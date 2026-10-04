"""Validate the supplied HTML editions, water clicks, and monthly leaders."""
from __future__ import annotations

import json
from pathlib import Path
import unittest

from PIL import Image


ROOT=Path(__file__).resolve().parents[1]


class RestoredArchiveTests(unittest.TestCase):
    def test_us_fields_are_edition_specific_and_renderable(self):
        for year,population in ((2000,"275,562,673"),(2003,"290,342,554"),
                                (2004,"293,027,571"),(2005,"295,734,134"),
                                (2006,"298,444,215"),(2007,"301,139,947"),
                                (2008,"303,824,640")):
            profile=json.loads((ROOT/f"worldfactbook/api/verified-html/countries/US/{year}.json").read_text())
            self.assertEqual(profile["name"],"United States")
            self.assertGreater(len(profile["fields"]),100)
            self.assertEqual(next(f["content"] for f in profile["fields"]
                                  if f["label"]=="Population").split()[0],population)
            self.assertTrue(all(f["country"]=="US" and f["edition_year"]==year
                                and f["locator"].startswith(f"factbook-{year}/geos/us.html#")
                                for f in profile["fields"]))
            self.assertEqual(profile["fields"][0]["label"],"Background")
            self.assertNotIn("World Factbook is prepared",profile["fields"][0]["content"])
            for image in profile["media"]:
                with Image.open(ROOT/"worldfactbook"/image["path"]) as bitmap:
                    self.assertEqual(bitmap.info["EditionYear"],str(year))
                    self.assertEqual(bitmap.info["SourceSHA256"],image["source_sha256"])
                    self.assertEqual(bitmap.info["EditionRightsNoticeSHA256"],
                                     profile["rights_notice_sha256"])

    def test_source_page_collision_is_preserved_as_explicit_variant(self):
        index=json.loads((ROOT/"worldfactbook/api/verified-html/index.json").read_text())
        self.assertEqual([x["edition_year"] for x in index["editions"]],
                         [2000,2003,2004,2005,2006,2007,2008])
        self.assertGreater(sum(x["fields"] for x in index["editions"]),200_000)
        self.assertGreater(sum(x["images"] for x in index["editions"]),3600)
        main=json.loads((ROOT/"worldfactbook/api/verified-html/countries/RS/2008.json").read_text())
        variant=json.loads((ROOT/"worldfactbook/api/verified-html/countries/X-CIA-RI/2008.json").read_text())
        self.assertTrue(main["source"]["member"].endswith("/geos/rb.html"))
        self.assertTrue(variant["source"]["member"].endswith("/geos/ri.html"))
        self.assertIn("alternate source page",variant["name"])
        self.assertEqual([r["year"] for r in index["countries"]["RS"]].count(2008),1)

    def test_water_lookup_resolves_named_oceans_lake_and_river(self):
        water=ROOT/"worldfactbook/boundaries/water"
        index=json.loads((water/"index.json").read_text())
        features={r["id"]:r for name in index["feature_parts"] for r in
                  json.loads((water/name).read_text())["features"]}
        self.assertGreaterEqual(len(features),2000)
        self.assertEqual({r["name"] for r in features.values() if r["kind"]=="ocean"},
                         {"Atlantic Ocean","Pacific Ocean","Indian Ocean","Arctic Ocean","Southern Ocean"})
        with Image.open(water/index["lookup"]) as bitmap:
            for lon,lat,kind,name in ((-35,25,"ocean","Atlantic Ocean"),(0,-65,"ocean","Southern Ocean"),
                                      (-81.2,42.1,"lake","Erie"),(-.1,51.5,"river","Thames")):
                rgb=bitmap.getpixel((int((lon+180)*4096/360),int((90-lat)*2048/180)))
                feature=features[rgb[0]+256*rgb[1]+65536*rgb[2]]
                self.assertEqual((feature["kind"],feature["name"]),(kind,name))
                if kind=="river":self.assertEqual(feature["min_zoom"],4)

    def test_monthly_leaders_have_snapshot_provenance_without_invented_terms(self):
        base=ROOT/"worldfactbook/api/leaders"
        index=json.loads((base/"index.json").read_text())
        self.assertEqual(len(index["months"]),24)
        self.assertEqual([(r["year"],r["month"]) for r in index["months"]],
                         [(year,month) for year in (2012,2013) for month in range(1,13)])
        self.assertGreater(index["record_count"],100_000)
        for year in (2012,2013):
            page=json.loads((base/f"countries/IN/{year}/part-0001.json").read_text())
            self.assertEqual(len({item["month"] for item in page["terms"]}),12)
            self.assertTrue(all(item["start"] is None and item["end"] is None
                                and len(item["source_sha256"])==64 for item in page["terms"]))


if __name__=="__main__":unittest.main()
