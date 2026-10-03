"""Regression fixtures for the mixed-edition US feed and water/flag contracts."""
from __future__ import annotations

import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image


TOOLS=Path(__file__).resolve().parents[1]/"tools/worldfactbook"
sys.path.insert(0,str(TOOLS))


def module(name):
    spec=importlib.util.spec_from_file_location(name,TOOLS/(name+".py"))
    mod=importlib.util.module_from_spec(spec);sys.modules[name]=mod;spec.loader.exec_module(mod)
    return mod


crawler=module("worldfactbook_crawler")
water=module("build_water_index")
flags=module("recover_wayback_flags")
audit=module("audit_edition_provenance")
media=module("media")


class ScopeTests(unittest.TestCase):
    def test_front_matter_and_another_territory_are_not_a_us_profile(self):
        sample="""The World Factbook is prepared by the Central Intelligence Agency for officials.
A BRIEF HISTORY OF BASIC INTELLIGENCE AND THE WORLD FACTBOOK
The first classified Factbook was published in August 1962.
US
The states are included in an alphabetical list of geographic entities.
United States
Introduction
Background: Britain's American colonies became independent in 1776.
Geography
Area: 9,833,517 square kilometers of land and water.
Jarvis Island
Introduction
Background: Jarvis Island was established as a refuge in 1974.
"""
        aliases={"united states":("US","United States"),"jarvis island":("X-JARVIS","Jarvis Island")}
        rows=crawler.parse_chunks(sample,2014,aliases)
        us=" ".join(r["content"] for r in rows if r["entity_code"]=="US")
        edition=" ".join(r["content"] for r in rows if not r["entity_code"])
        island=" ".join(r["content"] for r in rows if r["entity_code"]=="X-JARVIS")
        self.assertIn("colonies",us)
        self.assertNotIn("first classified",us)
        self.assertNotIn("Jarvis Island was",us)
        self.assertIn("first classified",edition)
        self.assertIn("Jarvis Island was",island)

    def test_explicit_source_title_year_blocks_2014_as_2025(self):
        candidate=crawler.Candidate(2025,"internet-archive","id","https://example.org/book",
                 "The 2014 CIA World Factbook by United States Central Intelligence Agency_djvu.txt","txt")
        self.assertEqual(crawler.explicit_book_years(candidate),{2014})
        range_title=crawler.Candidate(2021,"internet-archive","id","https://example.org/book",
                                      "The_CIA_World_Factbook_2020_2021_djvu.txt","txt")
        self.assertEqual(crawler.explicit_book_years(range_title),{2020,2021})
        self.assertEqual(audit.title_years(range_title.name),{2020,2021})

    def test_very_long_ocr_line_is_partitioned_without_losing_characters(self):
        raw="X"*51000
        rows=crawler.parse_chunks("United States\nGeography\n"+raw,2014,
                                  {"united states":("US","United States")})
        self.assertEqual("".join(row["content"] for row in rows),raw)
        self.assertTrue(all(len(row["content"])<=23000 for row in rows))


class WaterTests(unittest.TestCase):
    @staticmethod
    def feature(name,geometry):return {"type":"Feature","properties":{"NAME":name},"geometry":geometry}
    def test_ocean_segments_merge_and_small_water_requires_zoom(self):
        datasets={
            "marine":[self.feature("North Atlantic Ocean",{"type":"Polygon","coordinates":[[[-40,20],[-30,20],[-30,30],[-40,30],[-40,20]]]}),
                      self.feature("South Atlantic Ocean",{"type":"Polygon","coordinates":[[[-40,-30],[-30,-30],[-30,-20],[-40,-20],[-40,-30]]]}),
                      self.feature("Southern Ocean",{"type":"Polygon","coordinates":[[[0,-60],[10,-60],[10,-55],[0,-55],[0,-60]]]})],
            "lakes":[self.feature("Lake Erie",{"type":"Polygon","coordinates":[[[-83,41],[-79,41],[-79,43],[-83,43],[-83,41]]]}),
                     self.feature("Lake Small",{"type":"Polygon","coordinates":[[[21,1],[22,1],[22,2],[21,2],[21,1]]]})],
            "rivers":[self.feature("River Sample",{"type":"LineString","coordinates":[[31,1],[32,2]]})],
        }
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);sources={}
            for key,features in datasets.items():
                path=root/(key+".geojson")
                path.write_text(json.dumps({"type":"FeatureCollection","features":features}))
                sources[key]=path
            urls={key:f"https://example.org/{key}" for key in sources}
            result=water.compile_index(sources,root/"water",urls)
            self.assertEqual(result["kinds"],{"ocean":2,"sea":0,"lake":2,"river":1})
            index=json.loads((root/"water/index.json").read_text())
            atlantic=next(row for row in index["features"] if row["name"]=="Atlantic Ocean")
            self.assertEqual(atlantic["code"],"X-ATLANTIC-OCEAN")
            self.assertEqual(atlantic["min_zoom"],1)
            self.assertEqual(next(row for row in index["features"] if row["name"]=="Lake Erie")["min_zoom"],1)
            self.assertEqual(next(row for row in index["features"] if row["name"]=="Lake Small")["min_zoom"],3)
            self.assertEqual(next(row for row in index["features"] if row["kind"]=="river")["min_zoom"],5)
            with Image.open(root/"water/lookup.png") as image:
                def pixel(lon,lat):return image.getpixel((int((lon+180)*4096/360),int((90-lat)*2048/180)))
                self.assertEqual(pixel(-35,25),pixel(-35,-25))
                self.assertNotEqual(pixel(-35,25),(0,0,0))

    def test_large_feature_catalogue_is_sharded_with_stable_pixel_ids(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);sources={}
            for kind in ("marine","lakes","rivers"):
                features=[]
                if kind=="rivers":
                    features=[self.feature(f"River {i:02d}",{"type":"LineString",
                        "coordinates":[[i,0],[i+.3,.3]]}) for i in range(24)]
                path=root/(kind+".geojson")
                path.write_text(json.dumps({"type":"FeatureCollection","features":features}))
                sources[kind]=path
            with patch.object(water,"MAX_INDEX_BYTES",2500):
                result=water.compile_index(sources,root/"water",{k:"https://example.org" for k in sources})
            index=json.loads((root/"water/index.json").read_text())
            self.assertGreater(result["feature_parts"],1)
            features=[r for part in index["feature_parts"] for r in
                      json.loads((root/"water"/part).read_text())["features"]]
            self.assertEqual({r["id"] for r in features},set(range(1,25)))
            self.assertTrue(all((root/"water"/part).stat().st_size<=2500 for part in index["feature_parts"]))


class FlagTests(unittest.TestCase):
    def test_failed_wayback_capture_is_retried_before_year_is_complete(self):
        source="https://www.cia.gov/the-world-factbook/about/archives/2023/countries/india/flag/"
        record={"original":source,"timestamp":"20230901120000"}
        with tempfile.TemporaryDirectory() as td,patch.object(flags,"cdx_page",return_value=([record],"")):
            with patch.object(flags,"recover_capture",side_effect=ValueError("snapshot unavailable")):
                result=flags.run(Path(td),2023,2023,10,0)
            self.assertFalse(result["complete"])
            self.assertEqual(result["pending_failures"],1)
            with patch.object(flags,"recover_capture",return_value={}) as recovered:
                result=flags.run(Path(td),2023,2023,10,0)
            self.assertTrue(result["complete"])
            self.assertEqual(result["pending_failures"],0)
            recovered.assert_called_once_with(record,Path(td))

    def test_wayback_json_resume_key_is_not_treated_as_capture(self):
        reply=json.dumps([["urlkey","timestamp","original","digest"],
                          ["gov,cia)/flag/","20240201120000","https://www.cia.gov/flag/","abc"],
                          [],["gov%2Ccia%29%2Fflag%2F+20240201120000%21"]]).encode()
        with patch.object(flags,"fetch",return_value=reply) as mock_fetch:
            rows,resume=flags.cdx_page(2023)
            self.assertEqual(len(rows),1)
            self.assertEqual(rows[0]["timestamp"],"20240201120000")
            self.assertEqual(resume,"gov%2Ccia%29%2Fflag%2F+20240201120000%21")
            flags.cdx_page(2023,resume)
            self.assertIn("resumeKey="+resume,mock_fetch.call_args.args[0])
            self.assertNotIn("%252C",mock_fetch.call_args.args[0])

    def test_book_image_keeps_edition_credit_and_source_inside_png(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            context=media.SourceContext(2014,"archive","example-book",
                "https://example.org/factbook-2014.pdf","factbook-2014.pdf","pdf","a"*64)
            extractor=media.MediaExtractor(root,root/"media",root/"api",{},ocr_enabled=False)
            row=extractor._record(context,Image.new("RGB",(50,50),(10,80,100)),
                context_text="Credit: Example Artist",original_name="original-cover.jpg")
            self.assertEqual(row["credit"],"Example Artist")
            with Image.open(root/row["path"]) as picture:
                self.assertEqual(picture.info["FactbookEditionYear"],"2014")
                self.assertEqual(picture.info["Creator"],"Example Artist")
                self.assertEqual(picture.info["SourceSHA256"],"a"*64)
                self.assertEqual(picture.info["RightsHolder"],"")

    def test_page_selection_credit_and_embedded_png_provenance(self):
        html=b'''<html><img src="/logo.png" alt="CIA logo"><h1>Flag</h1>
        <img src="/files/monaco-flag.jpg" alt="Flag of Monaco">
        <p>Credit: Flag archive photograph by Example Artist</p>
        Factbook images and photos obtained from a variety of sources are in the public domain.</html>'''
        choice,credit,rights=flags.flag_image_and_credit(html)
        self.assertIn("flag.jpg",choice["src"])
        self.assertEqual(credit,"Flag archive photograph by Example Artist")
        self.assertIn("public domain",rights)
        source="https://www.cia.gov/the-world-factbook/about/archives/2023/countries/monaco/flag/"
        rec={"original":source,"timestamp":"20240102112233"}
        raw=io.BytesIO();Image.new("RGB",(80,50),(212,30,30)).save(raw,"JPEG")
        with tempfile.TemporaryDirectory() as td,patch.object(flags,"fetch",side_effect=[html,raw.getvalue()]):
            result=flags.recover_capture(rec,Path(td))
            self.assertEqual(result["edition_year"],2023)
            self.assertEqual(result["credit_status"],"explicit")
            image=Path(td)/"2023/monaco"/result["filename"]
            with Image.open(image) as img:
                self.assertEqual(img.info["FactbookEditionYear"],"2023")
                self.assertEqual(img.info["Creator"],result["credit"])
                self.assertEqual(img.info["SourceURL"],source)
                self.assertEqual(img.info["RightsHolder"],"")


if __name__=="__main__":unittest.main()
