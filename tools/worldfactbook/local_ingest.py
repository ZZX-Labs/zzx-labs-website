"""Incremental, provenance preserving local Factbook import and static export.

This module is also installed at tools/worldfactbook/local_ingest.py in the
static site. It never labels a year complete without a source audit and an
explicit review file matching the current extraction digest.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unicodedata
import zipfile

MIN_YEAR, MAX_YEAR = 1962, 2027
MAX_SOURCE_BYTES = 600_000_000
SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS sources(
 id TEXT PRIMARY KEY, edition_year INTEGER NOT NULL, name TEXT NOT NULL,
 format TEXT NOT NULL, bytes INTEGER NOT NULL, status TEXT NOT NULL,
 page_count INTEGER NOT NULL DEFAULT 0, processed_pages INTEGER NOT NULL DEFAULT 0,
 embedded_images INTEGER NOT NULL DEFAULT 0, processed_images INTEGER NOT NULL DEFAULT 0,
 ocr_pages INTEGER NOT NULL DEFAULT 0, issues INTEGER NOT NULL DEFAULT 0,
 country_count INTEGER NOT NULL DEFAULT 0, field_count INTEGER NOT NULL DEFAULT 0,
 variant_of TEXT NOT NULL DEFAULT '', imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sources_year ON sources(edition_year);
CREATE TABLE IF NOT EXISTS fields(
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
 edition_year INTEGER NOT NULL, country TEXT NOT NULL, country_name TEXT NOT NULL,
 category TEXT NOT NULL, label TEXT NOT NULL, content TEXT NOT NULL,
 locator TEXT NOT NULL, extraction TEXT NOT NULL, reported_year INTEGER,
 ordinal INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fields_country_year ON fields(country,edition_year);
CREATE INDEX IF NOT EXISTS fields_source ON fields(source_id);
CREATE TABLE IF NOT EXISTS media(
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
 edition_year INTEGER NOT NULL, country TEXT NOT NULL, category TEXT NOT NULL,
 kind TEXT NOT NULL, label TEXT NOT NULL, locator TEXT NOT NULL,
 alt TEXT NOT NULL, ocr TEXT NOT NULL, path TEXT NOT NULL,
 embedded_count INTEGER NOT NULL DEFAULT 1, rights TEXT NOT NULL DEFAULT 'source review required'
);
CREATE INDEX IF NOT EXISTS media_country_year ON media(country,edition_year);
CREATE TABLE IF NOT EXISTS issues(
 source_id TEXT NOT NULL, locator TEXT NOT NULL, kind TEXT NOT NULL,
 detail TEXT NOT NULL, PRIMARY KEY(source_id,locator,kind,detail)
);
"""

HISTORIC = {
 "SOVIET UNION":"SU", "USSR":"SU", "YUGOSLAVIA":"YU",
 "CZECHOSLOVAKIA":"CS", "EAST GERMANY":"DD", "GERMAN DEMOCRATIC REPUBLIC":"DD",
 "GERMANY FEDERAL REPUBLIC OF":"DE", "WEST GERMANY":"DE", "ZAIRE":"ZR",
 "BURMA":"MM", "SWAZILAND":"SZ", "RHODESIA":"ZW", "WORLD":"WORLD",
 "KOREA NORTH":"KP", "KOREA SOUTH":"KR", "MAN ISLE OF":"IM",
 "KOREA DEMOCRATIC PEOPLES REPUBLIC OF":"KP", "KOREA REPUBLIC OF":"KR",
 "MACAU":"MO", "MICRONESIA FEDERATED STATES OF":"FM",
 "HOLY SEE VATICAN CITY":"VA", "CONGO DEMOCRATIC REPUBLIC OF THE":"CD",
 "CONGO REPUBLIC OF THE":"CG", "BAHAMAS THE":"BS", "GAMBIA THE":"GM",
 "UNITED STATES":"US", "UNITED KINGDOM":"GB",
 "BOLIVIA":"BO", "BRUNEI":"BN", "BURKINA":"BF", "CAPE VERDE":"CV",
 "VENEZUELA":"VE", "TANZANIA":"TZ", "MOLDOVA":"MD", "RUSSIA":"RU",
 "IRAN":"IR", "LAOS":"LA", "SYRIA":"SY", "TAIWAN":"TW",
 "TURKEY":"TR", "VIETNAM":"VN", "IVORY COAST":"CI", "AFGANISTAN":"AF",
 "THE BAHAMAS":"BS", "THE GAMBIA":"GM", "VATICAN CITY":"VA",
 "VIRGIN ISLANDS":"VI", "PITCAIRN ISLANDS":"PN",
 "SAINT HELENA":"SH", "FALKLAND ISLANDS":"FK",
 "FALKLAND ISLANDS ISLAS MALVINAS":"FK", "SAINT MARTIN":"MF",
 "SVALBARD":"SJ", "PARACEL ISLANDS":"X-PARACEL-ISLANDS",
 "SPRATLY ISLANDS":"X-SPRATLY-ISLANDS",
 "ASHMORE AND CARTIER ISLANDS":"X-ASHMORE-CARTIER-ISLANDS",
 "WEST BANK":"X-WEST-BANK", "GAZA STRIP":"X-GAZA-STRIP",
 "EUROPEAN UNION":"X-EUROPEAN-UNION", "SOUTHERN OCEAN":"X-SOUTHERN-OCEAN",
 "EAST TIMOR":"TL", "MACEDONIA":"MK", "SERBIA AND MONTENEGRO":"X-SERBIA-MONTENEGRO",
 "INDIAN OCEAN":"X-INDIAN-OCEAN", "ATLANTIC OCEAN":"X-ATLANTIC-OCEAN",
 "PACIFIC OCEAN":"X-PACIFIC-OCEAN", "ARCTIC OCEAN":"X-ARCTIC-OCEAN",
 "ANTARCTICA":"AQ", "AKROTIRI":"X-AKROTIRI", "DHEKELIA":"X-DHEKELIA",
}
CATEGORIES = {
 "LAND":"geography", "WATER":"geography", "PEOPLE":"people-and-society",
 "GOVERNMENT":"government", "ECONOMY":"economy", "COMMUNICATIONS":"communications",
 "DEFENSE FORCES":"military-and-security", "MILITARY":"military-and-security",
 "TRANSPORTATION":"transportation", "GEOGRAPHY":"geography",
 "INTRODUCTION":"introduction", "ENVIRONMENT":"environment",
 "TRANSNATIONAL ISSUES":"transnational-issues", "SPACE":"space",
 "TERRORISM":"terrorism", "MILITARY AND SECURITY":"military-and-security",
 "PEOPLE AND SOCIETY":"people-and-society", "ENERGY":"energy",
}
IMAGE_TOKEN = re.compile(r"^\[\[WFB_IMAGE:(.*?)\]\]$")
FIELD_RE = re.compile(r"^([A-Za-z][A-Za-z0-9 /(),.'\u2019\u2013\u2014+\-]{1,85}):\s*(.*)$")
YEAR_RE = re.compile(r"\b(?:18|19|20)\d{2}\b")


def key(value: str) -> str:
    s = unicodedata.normalize("NFKD", value).upper()
    return re.sub(r"[^A-Z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c))).strip()


def registry(path: Path) -> tuple[dict[str, tuple[str,str]], dict[str,str]]:
    obj = json.loads(path.read_text(encoding="utf-8"))
    rows = obj.get("countries", [])
    names = {}
    entities = {}
    for item in rows:
        code, name = item["country"], item["countryName"]
        entities[code] = name
        for alias in (name, item.get("officialName") or ""):
            if alias: names[key(alias)] = (code, name)
    for label, code in HISTORIC.items():
        name = entities.get(code, label.title())
        names[key(label)] = (code, name)
        entities.setdefault(code, name)
    return names, entities


def inferred_year(filename: str) -> int | None:
    # The edition title precedes reprint and ebook publication dates.
    stem = PurePosixPath(filename).name.replace("_", " ").replace("-", " ")
    patterns = [r"(?:THE\s+)?(19\d{2}|20\d{2})\s+CIA\s+WORLD\s+FACTBOOK",
                r"CIA\s+WORLD\s+FACTBOOK\s+(19\d{2}|20\d{2})",
                r"WORLD\s+FACTBOOK\s+(19\d{2}|20\d{2})"]
    for pattern in patterns:
        m = re.search(pattern, stem, re.I)
        if m: return int(m.group(1))
    bare=re.fullmatch(r"(19\d{2}|20\d{2})\.(?:txt|epub|pdf)",stem,re.I)
    if bare:return int(bare.group(1))
    return None


def embedded_title_year(raw: bytes, fmt: str) -> int | None:
    try:
        if fmt == "epub":
            with zipfile.ZipFile(io.BytesIO(raw)) as book:
                for name in book.namelist():
                    if not name.endswith(".opf"):continue
                    metadata=decode(book.read(name))
                    match=re.search(r"<dc:title\b[^>]*>(.*?)</dc:title>",metadata,re.I|re.S)
                    if match:
                        return inferred_year(re.sub(r"<[^>]+>","",match.group(1))+".epub")
        if fmt == "txt":
            head=decode(raw[:12000])
            match=re.search(r"(?im)^\s*Title:\s*(.+)$",head)
            if match:return inferred_year(match.group(1)+".txt")
        if fmt == "pdf":
            import fitz
            book=fitz.open(stream=raw,filetype="pdf")
            title=book.metadata.get("title","")
            book.close()
            if title:return inferred_year(title+".pdf")
    except Exception:
        return None
    return None


class HTMLLines(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {"p","div","h1","h2","h3","h4","h5","h6","li","br","tr"}:
            self.parts.append("\n")
        if tag == "img":
            d = dict(attrs)
            if d.get("src"):
                self.parts.append("\n[[WFB_IMAGE:" + d["src"] + "|" + d.get("alt","") + "]]\n")

    def handle_endtag(self, tag):
        if tag in {"p","div","h1","h2","h3","h4","h5","h6","li","tr"}:
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)

    def lines(self):
        text = "".join(self.parts).replace("\xa0", " ")
        return [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]


def decode(raw: bytes) -> str:
    for codec in ("utf-8-sig", "cp1252", "latin-1"):
        try: return raw.decode(codec)
        except UnicodeDecodeError: continue
    return raw.decode("utf-8", "replace")


def identifier(*items: str) -> str:
    return sha256("\x1f".join(map(str, items)).encode("utf-8")).hexdigest()


@contextmanager
def db(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=DELETE")
    con.execute("PRAGMA synchronous=FULL")
    con.executescript(SCHEMA)
    try:
        yield con
        con.commit()
        result=con.execute("PRAGMA quick_check").fetchone()[0]
        if result!="ok":raise RuntimeError(f"Factbook SQLite integrity check failed: {result}")
    finally:
        con.close()


class Parser:
    def __init__(self, con, source: str, year: int, names: dict, *, pdf=False):
        self.con, self.source, self.year, self.names = con, source, year, names
        self.pdf = pdf
        self.country = None
        self.category = "raw"
        self.label = "Unlabeled text"
        self.contents = []
        self.locator = ""
        self.method = ""
        self.ordinal = 0
        self.parent_label = ""
        self.seen = set()
        self.issues = 0

    def issue(self, locator, kind, detail):
        self.con.execute("INSERT OR IGNORE INTO issues VALUES(?,?,?,?)",
                         (self.source,locator,kind,detail[:400]))
        self.issues += 1

    def flush(self):
        if not self.contents or not self.country:
            self.contents.clear()
            return
        value = "\n".join(self.contents).strip()
        self.contents.clear()
        if not value: return
        self.ordinal += 1
        code, name = self.country
        years = {int(y) for y in YEAR_RE.findall(value)}
        reported = next(iter(years)) if len(years) == 1 else None
        rowid = identifier(self.source,code,self.category,self.label,self.locator,str(self.ordinal),value)
        self.con.execute("INSERT OR IGNORE INTO fields VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (rowid,self.source,self.year,code,name,self.category,self.label,value,
             self.locator,self.method,reported,self.ordinal))
        self.seen.add(code)

    def parse(self, lines, locator, method, media_callback=None):
        lines=list(lines)
        for idx,line in enumerate(lines):
            line = line.strip().strip("\ufeff")
            if not line: continue
            image = IMAGE_TOKEN.fullmatch(line)
            if image:
                self.flush()
                if media_callback:
                    media_callback(image.group(1),self.country,self.category,
                                   f"{locator}#line:{idx+1}")
                continue
            # Modern electronic editions put the section before ::Country.
            embedded_country=re.match(r"^(.{3,45}?)\s*::\s*(.{2,65})$",line)
            if embedded_country and key(embedded_country.group(1)) in CATEGORIES:
                entity=self.names.get(key(embedded_country.group(2)))
                if entity:
                    self.flush();self.country=entity
                    self.category=CATEGORIES[key(embedded_country.group(1))]
                    self.label="Unlabeled text";self.parent_label=""
                    self.locator,self.method=locator,method
                    continue
            # Printed PDFs use a large, standalone country title on the cover.
            standalone=self.names.get(key(line)) if len(line)<65 else None
            following_nonempty=[raw.strip() for raw in lines[idx+1:idx+25] if raw.strip()]
            starts_epub_chapter=(not self.pdf and
                (idx<18 or line==line.upper()) and
                any(key(raw.strip()).split(" ")[0] in CATEGORIES
                    for raw in lines[idx+1:idx+50]) and
                (any(IMAGE_TOKEN.fullmatch(raw) or raw==">" for raw in following_nonempty)
                 or bool(following_nonempty and key(following_nonempty[0])=="INTRODUCTION")))
            starts_pdf_country=(self.pdf and line==line.upper() and (
                any(key(raw.strip()) in CATEGORIES for raw in lines[idx+1:idx+91])
                or idx==len(lines)-1))
            if standalone and (starts_epub_chapter or starts_pdf_country):
                self.flush();self.country=standalone;self.category="raw"
                self.label="Unlabeled text";self.parent_label=""
                self.locator,self.method=locator,method
                continue
            # Some 2002 EPUBs and print-to-PDF books lead with "Geography India"
            # or "Government Afghanistan" instead of a separate country line.
            heading=None
            for title,category in sorted(CATEGORIES.items(),key=lambda x:len(x[0]),reverse=True):
                if key(line) in CATEGORIES:break
                if key(line).startswith(title+" "):
                    candidate=line[len(title):].strip()
                    if not candidate or len(candidate)>65 or not candidate[0].isupper():continue
                    entity=self.names.get(key(candidate))
                    if entity:
                        heading=(entity,category);break
                    following=[x.strip() for x in lines[idx+1:idx+8] if x.strip()]
                    if following and FIELD_RE.match(following[0]):
                        provisional="X-"+re.sub(r"[^A-Z0-9]+","-",key(candidate)).strip("-")[:32]
                        self.issue(locator,"unknown-country",candidate)
                        heading=((provisional,candidate),category);break
            if heading:
                self.flush();self.country,self.category=heading
                self.label="Unlabeled text";self.parent_label=""
                self.locator,self.method=locator,method
                continue
            # Gutenberg edition grammar, including the trailing _%_ delimiter.
            if line.startswith("_%_"): self.flush();continue
            explicit = re.match(r"^(?:_@_|@)(.+)$",line)
            if (line.startswith("*") and "," in line and
                    key(line.rsplit(",",1)[1]) in CATEGORIES):
                explicit=re.match(r"^\*(.+)$",line)
            colon_section = None
            if line.startswith(":") and len(line)<110:
                for title,c in sorted(CATEGORIES.items(),key=lambda x:len(x[0]),reverse=True):
                    if key(line).endswith(" "+title):
                        candidate=line[1:-len(title)].strip()
                        explicit=re.match(r"^:(.+)$",":"+candidate)
                        colon_section=c
                        break
            country_line = re.match(r"^Country:\s*(.+)$",line,re.I)
            if country_line and len(country_line.group(1))<100:
                explicit=country_line
            if explicit:
                candidate = explicit.group(1).strip()
                if re.match(r"^\d",candidate):
                    self.flush();self.country=None;continue
                match = self.names.get(key(candidate))
                category_after=""
                if not match and ":" in candidate:
                    left,right=candidate.rsplit(":",1)
                    if key(right) in CATEGORIES:
                        candidate=left.strip();match=self.names.get(key(candidate))
                        category_after=CATEGORIES[key(right)]
                if not match and "," in candidate:
                    left,right=candidate.rsplit(",",1)
                    if key(right) in CATEGORIES:
                        candidate=left.strip();match=self.names.get(key(candidate))
                        category_after=CATEGORIES[key(right)]
                if not match:
                    upcoming=[x.strip() for x in lines[idx+1:idx+6] if x.strip()]
                    def follows_country_section(raw):
                        test=key(raw.removeprefix("_*_").removeprefix("- "))
                        return any(test==title or test==title+" "+key(candidate)
                                   for title in CATEGORIES)
                    starts_country=(country_line is not None or bool(category_after or colon_section)
                        or any(follows_country_section(x) for x in upcoming[:2]))
                    if not starts_country or len(candidate)>60 or re.search(r"\d",candidate):
                        self.flush();self.country=None;continue
                    self.issue(locator,"unknown-country",candidate)
                    provisional="X-"+re.sub(r"[^A-Z0-9]+","-",key(candidate)).strip("-")[:32]
                    match=(provisional,candidate)
                previous=self.country
                self.flush();self.country=match
                if previous!=match:self.category="raw"
                self.label="Unlabeled text"
                self.parent_label=""
                if category_after or colon_section:self.category=category_after or colon_section
                self.locator,self.method=locator,method
                continue
            if not self.country: continue
            section_line=line.removeprefix("_*_").removeprefix("- ").strip()
            for title,c in sorted(CATEGORIES.items(),key=lambda item:len(item[0]),reverse=True):
                if key(section_line)==title:
                    trailing=""
                elif key(section_line).startswith(title+" "):
                    trailing=section_line[len(title):].strip()
                else:
                    continue
                if not trailing or self.names.get(key(trailing)) == self.country:
                    self.flush();self.category=c;self.label="Unlabeled text"
                    self.parent_label=""
                    self.locator,self.method=locator,method
                    break
            else:
                title=None
            if title:continue
            marker = re.match(r"^_#_(.+)",line)
            if marker:
                line = marker.group(1).strip()
            field = FIELD_RE.match(line)
            if field and (not self.pdf or len(field.group(1)) < 65):
                self.flush()
                raw_label=field.group(1).strip()
                if raw_label[0].islower() and self.parent_label:
                    self.label=self.parent_label+" / "+raw_label
                else:
                    self.label=raw_label
                    self.parent_label=raw_label if not field.group(2) else ""
                self.locator,self.method=locator,method
                if field.group(2): self.contents.append(field.group(2).strip())
            elif line not in {"===","======================================================================"}:
                if not self.contents and self.locator != locator:
                    self.locator,self.method=locator,method
                self.contents.append(line)


def epub_order(name):
    return [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)",name)]


def detect_kind(name: str, caption: str) -> str:
    s = (name + " " + caption).lower()
    for kind, words in (("map",(" map","map_","map-")),("chart",("chart","graph","plot")),
                        ("diagram",("diagram","schematic")),("flag",("flag",))):
        if any(w in s for w in words): return kind
    return "illustration"


def ocr_png(image_bytes: bytes, timeout=45, psm=None) -> str:
    try:
        command=["tesseract","stdin","stdout","-l","eng"]
        if psm is not None:command.extend(["--psm",str(psm)])
        proc = subprocess.run(command,
            input=image_bytes,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            timeout=timeout,check=False)
        if proc.returncode != 0: raise RuntimeError(decode(proc.stderr)[-200:])
        return decode(proc.stdout).strip()
    except FileNotFoundError as exc:
        raise RuntimeError("Install Tesseract with the English OCR data") from exc


def emit_media(con, root, source, year, country, category, locator, name, data,
               kind, alt="", ocr="", embedded_count=1, quality=75):
    if not data: return False
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(data)).convert("RGB")
        im.thumbnail((1500,1500))
        buffer = io.BytesIO();im.save(buffer,format="WEBP",quality=quality,method=4)
        compact = buffer.getvalue()
    except Exception as exc:
        con.execute("INSERT OR IGNORE INTO issues VALUES(?,?,?,?)",
                    (source,locator,"image-decode",str(exc)[:400]))
        return False
    code = country[0] if country else "_unassigned"
    digest = identifier(source,locator,name,sha256(data).hexdigest())
    rel = Path("media") / code / str(year) / (sha256(compact).hexdigest()[:24]+".webp")
    target = root / rel
    target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists(): target.write_bytes(compact)
    label = alt.strip() or f"{kind.title()} from {year} edition, {locator}"
    con.execute("INSERT OR IGNORE INTO media VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (digest,source,year,code,category,kind,label,locator,alt,ocr,
         rel.as_posix(),embedded_count,"source review required"))
    return True


def text_source(con, parser, raw, locator="text"):
    lines = decode(raw).replace("\r\n","\n").replace("\r","\n").splitlines()
    parser.parse(lines,locator,"plain-text")
    parser.flush()
    return {"page_count":1,"processed_pages":1,"embedded_images":0,"processed_images":0,"ocr_pages":0}


def epub_source(con, parser, raw, root, reparse_media=False):
    nimages = emitted = 0
    with zipfile.ZipFile(io.BytesIO(raw)) as book:
        members=set(book.namelist())
        files = [x for x in members if x.lower().endswith((".html",".xhtml",".htm"))]
        files.sort(key=epub_order)
        # Image paths are resolved relative to the XHTML member, inside this EPUB only.
        for member in files:
            h=HTMLLines();h.feed(decode(book.read(member)))
            def image(ref, country, category, locator):
                nonlocal nimages, emitted
                nimages += 1
                src,_,alt = ref.partition("|")
                loc = str(PurePosixPath(member).parent.joinpath(src))
                parts=[]
                for part in PurePosixPath(loc).parts:
                    if part == "..":
                        if parts: parts.pop()
                    elif part != ".": parts.append(part)
                name = "/".join(parts)
                if name not in members:
                    parser.issue(locator,"missing-image",name);return
                data = book.read(name)
                if len(data)>30_000_000:
                    parser.issue(locator,"oversized-image",name);return
                if reparse_media:
                    digest=identifier(parser.source,locator,name,sha256(data).hexdigest())
                    legacy_locator=locator.partition("#line:")[0]
                    previous_id=identifier(parser.source,legacy_locator,name,sha256(data).hexdigest())
                    old=con.execute("SELECT * FROM media WHERE id=?",(digest,)).fetchone()
                    if old is None:
                        old=con.execute("SELECT * FROM media WHERE id=?",(previous_id,)).fetchone()
                    if old:
                        code=country[0] if country else "_unassigned"
                        old_rel=Path(old["path"])
                        new_rel=Path("media")/code/str(parser.year)/old_rel.name
                        old_path=Path(root)/old_rel;new_path=Path(root)/new_rel
                        if not old_path.is_file():
                            parser.issue(locator,"missing-image",old_rel.as_posix());return
                        if not new_path.is_file():
                            new_path.parent.mkdir(parents=True,exist_ok=True)
                            shutil.copyfile(old_path,new_path)
                        con.execute("INSERT OR REPLACE INTO media VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                                    (digest,parser.source,parser.year,code,category,
                                     old["kind"],old["label"],locator,old["alt"],old["ocr"],
                                     new_rel.as_posix(),1,old["rights"]))
                        emitted+=1
                        return
                try:
                    from PIL import Image
                    im=Image.open(io.BytesIO(data))
                    ocr=ocr_png(image_to_png(im)) if im.width>=700 and im.height>=500 else ""
                except Exception as exc:
                    parser.issue(locator,"image-ocr",str(exc));ocr=""
                kind=detect_kind(name,alt)
                if kind=="illustration" and not alt.strip():
                    parser.issue(locator,"unclassified-media",name)
                emitted += emit_media(con,root,parser.source,parser.year,country,category,
                    locator,name,data,kind,alt,ocr)
            parser.parse(h.lines(),member,"epub-html",image)
        parser.flush()
        return {"page_count":len(files),"processed_pages":len(files),
                "embedded_images":nimages,"processed_images":emitted,"ocr_pages":0}


def image_to_png(im):
    im.thumbnail((2200,2200))
    b=io.BytesIO();im.convert("RGB").save(b,format="PNG");return b.getvalue()


def ocr_country_banner(page, names):
    """Read the small printed location title in a page's raster header."""
    import fitz
    clip=fitz.Rect(page.rect.width*.38, 0, page.rect.width*.62, min(35,page.rect.height))
    pix=page.get_pixmap(matrix=fitz.Matrix(5,5),clip=clip,alpha=False)
    try:
        candidate=ocr_png(pix.tobytes("png"),psm=7)
    except RuntimeError:
        return None
    candidate=re.sub(r"\s+", " ",candidate).strip("- .,:;!|\t")
    return names.get(key(candidate)) if len(candidate)<65 else None


def pdf_source(con, parser, raw, root, max_pages=0):
    try: import fitz
    except ImportError as exc: raise RuntimeError("Install PyMuPDF for page aware PDF extraction") from exc
    doc=fitz.open(stream=raw,filetype="pdf")
    processed=images=emitted=ocr_pages=0
    total_pages=len(doc)
    page_limit=min(total_pages,max_pages) if max_pages else total_pages
    for ix in range(page_limit):
        page=doc[ix]; locator=f"page:{ix+1}"
        blocks=[b for b in page.get_text("blocks") if len(b)>4 and isinstance(b[4],str)]
        # Print era pages are two-column; x order precedes y order. Other PDFs
        # are kept in the PDF's own reading order.
        if parser.year<=1989:
            middle=page.rect.width/2
            blocks.sort(key=lambda b: ((b[0]+b[2])/2>=middle,b[1],b[0]))
        lines=[]
        for b in blocks:
            lines.extend(b[4].splitlines())
        plain="\n".join(lines).strip()
        embedded=page.get_images(full=True)
        images += len(embedded)
        banner=ocr_country_banner(page,parser.names) if embedded and parser.year>=1990 else None
        page_codes=set()
        if banner:
            page_codes.add(banner)
            # The printed title may be the only country marker on this page.
            lines.insert(0,"@"+banner[1])
        if parser.year<=1989:
            for b in blocks:
                if b[1]>=125:continue
                first=b[4].strip().splitlines()
                if not first:continue
                header=re.sub(r"\s*\(Continued\).*", "",first[0],flags=re.I)
                entity=parser.names.get(key(header)) if len(header)<62 else None
                if entity:page_codes.add(entity)
        else:
            for header in re.findall(r"(?m)^@([^\n:]+)(?:[:\n]|$)",plain):
                entity=parser.names.get(key(header))
                if entity:page_codes.add(entity)
        if len(page_codes)>1:
            parser.issue(locator,"multi-country-page","Image covers multiple locations; country review required")
        page_country=next(iter(page_codes)) if len(page_codes)==1 else (
            parser.country if not page_codes else None)
        if len(plain)<55:
            pix=page.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False)
            try:
                recovered=ocr_png(pix.tobytes("png"));ocr_pages+=1
                plain=(plain+"\n"+recovered).strip() if plain else recovered
            except Exception as exc:
                parser.issue(locator,"page-ocr",str(exc));plain=""
            if not plain: parser.issue(locator,"blank-page","No usable text or OCR")
            lines=(["@"+banner[1]] if banner else [])+plain.splitlines()
            if parser.year<=1989:
                for candidate in lines[:5]:
                    if parser.names.get(key(candidate)):
                        lines.insert(0,"@"+candidate.strip());break
            # A scanned page is rendered as one complete image, because source
            # PDFs often encode a page as several complementary image masks.
            emitted += emit_media(con,root,parser.source,parser.year,page_country,
                parser.category,locator,"scanned-page",pix.tobytes("png"),"scanned-page",
                "",plain,len(embedded))
        elif embedded:
            page_scans=[]
            for image in embedded:
                xref=image[0]
                rectangles=page.get_image_rects(xref)
                if any(r.get_area()/page.rect.get_area()>.68 for r in rectangles):
                    page_scans.append(xref);continue
                try:
                    blob=doc.extract_image(xref)["image"]
                except Exception as exc:
                    parser.issue(locator,"image-extract",str(exc));continue
                caption=" ".join(page.get_textbox(fitz.Rect(rectangles[0].x0,
                    rectangles[0].y1,rectangles[0].x1,min(page.rect.y1,rectangles[0].y1+35))).split())[:140] if rectangles else ""
                kind=detect_kind("",caption) if caption else "unclassified"
                if kind=="illustration":kind="unclassified"
                if kind=="unclassified":parser.issue(locator,"unclassified-media",f"xref:{xref}")
                try:
                    from PIL import Image
                    original=Image.open(io.BytesIO(blob))
                    image_ocr=ocr_png(image_to_png(original)) if original.width>=150 and original.height>=100 else ""
                except Exception as exc:
                    parser.issue(locator,"image-ocr",f"xref:{xref}: {exc}")
                    image_ocr=""
                emitted += emit_media(con,root,parser.source,parser.year,page_country,
                    parser.category,locator,f"xref:{xref}",blob,kind,caption,image_ocr)
            if page_scans:
                # Record the page composite only once; individual mask layers
                # are not meaningful pictures in these LuraDocument scans.
                pix=page.get_pixmap(matrix=fitz.Matrix(1.35,1.35),alpha=False)
                emitted += emit_media(con,root,parser.source,parser.year,page_country,
                    parser.category,locator,"page-composite",pix.tobytes("png"),
                    "scanned-page","",plain,len(page_scans))
        # Restrict print-era country changes to column-leading printed headers.
        if parser.year<=1989:
            split=[]
            for b in blocks:
                s=b[4].strip().splitlines()
                if not s:continue
                h=re.sub(r"\s*\(Continued\).*", "",s[0],flags=re.I)
                c=parser.names.get(key(h)) if len(h)<62 else None
                if c and (b[1]<125 or not parser.country):
                    split.append("@"+h)
                split.extend(s)
            if split: lines=split
        parser.parse(lines,locator,"pdf-text-or-ocr")
        processed+=1
        if (ix+1)%100==0: con.commit()
    parser.flush();doc.close()
    if processed<total_pages: parser.issue("pdf","pages-skipped",str(total_pages-processed))
    return {"page_count":total_pages,"processed_pages":processed,
            "embedded_images":images,"processed_images":emitted,"ocr_pages":ocr_pages}


def source_members(inputs):
    for entry in inputs:
        path=Path(entry)
        if path.is_dir():
            yield from source_members(sorted(str(x) for x in path.rglob("*") if x.is_file()))
        elif path.suffix.lower()==".zip":
            with zipfile.ZipFile(path) as archive:
                for info in archive.infolist():
                    if info.is_dir() or PurePosixPath(info.filename).suffix.lower() not in {".txt",".epub",".pdf"}:continue
                    if info.file_size>MAX_SOURCE_BYTES:
                        raise ValueError(f"Source exceeds configured import limit: {info.filename}")
                    yield f"{path.name}/{info.filename}",archive.read(info)
        elif path.suffix.lower() in {".txt",".epub",".pdf"}:
            if path.stat().st_size>MAX_SOURCE_BYTES:
                raise ValueError(f"Source exceeds configured import limit: {path}")
            yield str(path),path.read_bytes()


def ingest(inputs, db_path, output, registry_path, edition_year=None, max_pdf_pages=0,
           reprocess=False, selected_years=None, reparse_text=False):
    names,_=registry(Path(registry_path))
    result=[]
    with db(Path(db_path)) as con:
        for name,raw in source_members(inputs):
            fmt=PurePosixPath(name).suffix.lower().lstrip(".")
            filename_year=inferred_year(name)
            title_year=embedded_title_year(raw,fmt)
            year=edition_year or title_year or filename_year
            if selected_years and year not in selected_years:continue
            if not year or not MIN_YEAR<=year<=MAX_YEAR:
                result.append({"source":name,"status":"skipped: edition year unresolved"});continue
            source=sha256(raw).hexdigest()
            existing=con.execute("SELECT * FROM sources WHERE id=?",(source,)).fetchone()
            if existing and existing["status"]=="processed" and not reprocess:
                result.append({"source":name,"year":year,"status":"already imported"});continue
            con.execute("DELETE FROM issues WHERE source_id=?",(source,))
            fast_epub=reparse_text and fmt=="epub" and existing is not None
            if not fast_epub:
                con.execute("DELETE FROM media WHERE source_id=?",(source,))
            con.execute("DELETE FROM fields WHERE source_id=?",(source,))
            con.execute("INSERT OR REPLACE INTO sources (id,edition_year,name,format,bytes,status,imported_at)"
                        " VALUES(?,?,?,?,?,?,?)",(source,year,name,fmt,len(raw),"running",
                        datetime.now(timezone.utc).isoformat()))
            parser=Parser(con,source,year,names,pdf=fmt=="pdf")
            if filename_year and title_year and filename_year!=title_year:
                parser.issue(name,"edition-year-mismatch",
                    f"Filename suggests {filename_year}; internal edition title says {title_year}")
            try:
                if fmt=="txt": stats=text_source(con,parser,raw)
                elif fmt=="epub": stats=epub_source(con,parser,raw,Path(output),fast_epub)
                else: stats=pdf_source(con,parser,raw,Path(output),max_pdf_pages)
                if fast_epub:
                    con.execute("DELETE FROM media WHERE source_id=? AND locator NOT LIKE '%#line:%'",(source,))
                status="processed" if stats["processed_pages"]==stats["page_count"] else "sampled"
            except Exception as exc:
                parser.issue(name,"source-error",f"{type(exc).__name__}: {exc}")
                stats=dict.fromkeys(("page_count","processed_pages","embedded_images",
                                    "processed_images","ocr_pages"),0)
                status="failed"
            count=con.execute("SELECT count(*) FROM fields WHERE source_id=?",(source,)).fetchone()[0]
            issues=con.execute("SELECT count(*) FROM issues WHERE source_id=?",(source,)).fetchone()[0]
            con.execute("UPDATE sources SET status=?,page_count=?,processed_pages=?,"
                        "embedded_images=?,processed_images=?,ocr_pages=?,issues=?,"
                        "country_count=?,field_count=? WHERE id=?",
                        (status,*stats.values(),issues,len(parser.seen),count,source))
            con.commit()
            row={"source":name,"year":year,"status":status,"countries":len(parser.seen),
                 "fields":count,"issues":issues,**stats}
            result.append(row)
            print(json.dumps(row,ensure_ascii=False),file=sys.stderr,flush=True)
    return result


def sql_string(value):
    if value is None:return "NULL"
    return "'"+str(value).replace("\\","\\\\").replace("'","''").replace("\x00","")+"'"


SQL_SCHEMA = """SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS factbook_fields (
 id CHAR(64) PRIMARY KEY, source_id CHAR(64) NOT NULL, edition_year SMALLINT UNSIGNED NOT NULL,
 country VARCHAR(40) NOT NULL, country_name VARCHAR(160) NOT NULL, category VARCHAR(80) NOT NULL,
 label VARCHAR(160) NOT NULL, content MEDIUMTEXT NOT NULL, locator VARCHAR(255) NOT NULL,
 extraction VARCHAR(50) NOT NULL, reported_year SMALLINT UNSIGNED NULL, ordinal INT NOT NULL,
 INDEX(country,edition_year), INDEX(category,label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS factbook_media (
 id CHAR(64) PRIMARY KEY, source_id CHAR(64) NOT NULL, edition_year SMALLINT UNSIGNED NOT NULL,
 country VARCHAR(40) NOT NULL, category VARCHAR(80) NOT NULL, kind VARCHAR(40) NOT NULL,
 label TEXT NOT NULL, locator VARCHAR(255) NOT NULL, alt TEXT NOT NULL, ocr MEDIUMTEXT NOT NULL,
 path TEXT NOT NULL, embedded_count INT NOT NULL, rights TEXT NOT NULL,
 INDEX(country,edition_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""


def bounded_parts(rows, max_bytes, encode):
    batch=[];size=0
    for row in rows:
        serialized=encode(row)
        if len(serialized)>max_bytes:
            raise ValueError("Single archive row exceeds shard limit; inspect source")
        if batch and size+len(serialized)>max_bytes:
            yield batch
            batch=[];size=0
        batch.append(row);size+=len(serialized)
    if batch:yield batch


def atomic_json(path,payload):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_name(path.name+".tmp")
    tmp.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    tmp.replace(path)


def geographic_point(value):
    match=re.search(r"(\d{1,3})(?:\s+(\d{1,2}))?\s*([NS])\s*[,; ]+\s*"
                    r"(\d{1,3})(?:\s+(\d{1,2}))?\s*([EW])",value,re.I)
    if not match:return None
    lat=(int(match[1])+int(match[2] or 0)/60)*(1 if match[3].upper()=="N" else -1)
    lon=(int(match[4])+int(match[5] or 0)/60)*(1 if match[6].upper()=="E" else -1)
    return [lat,lon] if abs(lat)<=90 and abs(lon)<=180 else None


def export(db_path, root, registry_path, max_json_bytes=512_000, max_sql_bytes=2_000_000,
           site_budget=850_000_000, review_dir=None, media_root=None):
    import gzip
    root=Path(root);names,entities=registry(Path(registry_path))
    api=root/"api"/"country-archive"
    dbroot=root/"db"/"countries"
    overview={"schema":"zzx-factbook-country-archive-v1","start_year":MIN_YEAR,
        "end_year":MAX_YEAR,"years":[],"countries":[],"generated_at":datetime.now(timezone.utc).isoformat()}
    with db(Path(db_path)) as con:
        sources=[dict(r) for r in con.execute("SELECT * FROM sources ORDER BY edition_year,id")]
        years=defaultdict(list)
        for row in sources:years[row["edition_year"]].append(row)
        selections={}
        for year,options in years.items():
            # One canonical edition; alternatives remain available for source review.
            options.sort(key=lambda r:(
                r["status"]=="processed" and r["field_count"]>0,
                230<=r["country_count"]<=350,
                -r["issues"],r["country_count"],r["field_count"],r["format"]=="txt"),reverse=True)
            selections[year]=options[0]
        keys=set()
        for year,source in selections.items():
            keys.update((r["country"],year) for r in con.execute(
                "SELECT DISTINCT country FROM fields WHERE source_id=?",(source["id"],)))
        catalogue=defaultdict(list)
        locations={}
        for country,year in sorted(keys):
            source=selections[year]
            fields=[dict(r) for r in con.execute(
                "SELECT * FROM fields WHERE country=? AND source_id=? ORDER BY category,ordinal,id",
                (country,source["id"]))]
            media=[dict(r) for r in con.execute(
                "SELECT * FROM media WHERE country=? AND source_id=? ORDER BY locator,id",
                (country,source["id"]))]
            for asset in media:
                rel=Path(asset["path"])
                if rel.is_absolute() or ".." in rel.parts:
                    raise ValueError(f"Unsafe media path: {rel}")
                target=root/rel
                if not target.is_file():
                    source_path=Path(media_root)/rel if media_root else target
                    if not source_path.is_file():
                        raise FileNotFoundError(f"Selected media asset missing: {source_path}")
                    target.parent.mkdir(parents=True,exist_ok=True)
                    if source_path!=target:shutil.copyfile(source_path,target)
            for item in fields:
                if "geographic coordinates" in item["label"].lower():
                    point=geographic_point(item["content"])
                    if point:
                        locations[country]=point
                        break
            cname=entities.get(country,fields[0]["country_name"])
            public=[]
            for item in fields:
                public.append({k:v for k,v in item.items() if k not in {"source_id","edition_year","country","country_name"}})
            site_parts=[];sql_parts=[]
            for part,items in enumerate(bounded_parts(public,max_json_bytes-300,
                lambda r: json.dumps(r,ensure_ascii=False).encode("utf8")),1):
                path=api/"countries"/country/str(year)/f"part-{part:04d}.json"
                obj={"schema":"zzx-factbook-country-part-v1","country":country,
                     "edition_year":year,"fields":items}
                atomic_json(path,obj)
                if path.stat().st_size>max_json_bytes:raise ValueError(f"Oversize JSON: {path}")
                site_parts.append({"path":path.relative_to(root).as_posix(),"bytes":path.stat().st_size,
                                   "sha256":sha256(path.read_bytes()).hexdigest(),"fields":len(items)})
            inserts=[]
            for item in fields:
                cols=("id","source_id","edition_year","country","country_name","category",
                      "label","content","locator","extraction","reported_year","ordinal")
                values=[str(item[k]) if k in {"edition_year","reported_year","ordinal"} and item[k] is not None
                        else sql_string(item[k]) for k in cols]
                inserts.append("REPLACE INTO factbook_fields VALUES("+",".join(values)+");\n")
            for item in media:
                cols=("id","source_id","edition_year","country","category","kind","label",
                      "locator","alt","ocr","path","embedded_count","rights")
                values=[str(item[k]) if k in {"edition_year","embedded_count"} else sql_string(item[k]) for k in cols]
                inserts.append("REPLACE INTO factbook_media VALUES("+",".join(values)+");\n")
            for part,lines in enumerate(bounded_parts(inserts,max_sql_bytes//2,
                lambda s:s.encode("utf8")),1):
                path=dbroot/country/str(year)/f"part-{part:04d}.sql.gz"
                path.parent.mkdir(parents=True,exist_ok=True)
                with path.open("wb") as fh:
                    with gzip.GzipFile(fileobj=fh,mode="wb",mtime=0,compresslevel=9) as gz:
                        gz.write((SQL_SCHEMA+"".join(lines)).encode("utf8"))
                if path.stat().st_size>max_sql_bytes:raise ValueError(f"Oversize SQL: {path}")
                sql_parts.append({"path":path.relative_to(root).as_posix(),"bytes":path.stat().st_size,
                                  "sha256":sha256(path.read_bytes()).hexdigest(),"rows":len(lines)})
            media_public=[{k:v for k,v in r.items() if k not in {"source_id","edition_year","country"}} for r in media]
            mpath=api/"countries"/country/str(year)/"index.json"
            atomic_json(mpath,{"schema":"zzx-factbook-country-year-v1","country":country,
                "name":cname,"year":year,"source":{k:source[k] for k in ("id","name","format")},
                "fields":len(fields),"parts":site_parts,"media":media_public,"sql_parts":sql_parts})
            catalogue[country].append({"year":year,"fields":len(fields),"media":len(media),
                                       "path":mpath.relative_to(root).as_posix()})
        for year in range(MIN_YEAR,MAX_YEAR+1):
            source=selections.get(year)
            year_sources=years.get(year,[])
            if source:
                issues=[dict(r) for r in con.execute("SELECT locator,kind,detail FROM issues WHERE source_id=?",(source["id"],))]
                unassigned=con.execute("SELECT count(*) FROM media WHERE source_id=? AND country='_unassigned'",(source["id"],)).fetchone()[0]
                expected=source["embedded_images"]
                # Multiple composited image masks count as one media object.
                actual=con.execute("SELECT coalesce(sum(embedded_count),0) FROM media WHERE source_id=?",(source["id"],)).fetchone()[0]
                digest=identifier(source["id"],str(source["field_count"]),str(source["country_count"]),
                    str(source["processed_pages"]),str(actual))
                errors=[]
                if source["status"]!="processed":errors.append("source processing unfinished")
                if source["processed_pages"]!=source["page_count"]:errors.append("unprocessed pages")
                if source["field_count"]<1:errors.append("no extracted fields")
                if issues:errors.append("unresolved parsing or OCR issues")
                if actual!=expected:errors.append("embedded image accounting differs from source")
                if unassigned:errors.append("media without a country assignment")
                signed=False
                if review_dir:
                    review=Path(review_dir)/f"{year}.json"
                    if review.is_file():
                        obj=json.loads(review.read_text(encoding="utf-8"))
                        signed=(obj.get("digest")==digest and obj.get("source_sha256")==source["id"]
                            and obj.get("verified_fields")==source["field_count"]
                            and obj.get("verified_countries")==source["country_count"]
                            and obj.get("reviewed_all_pages_and_media") is True
                            and (expected==0 or obj.get("media_rights_cleared") is True))
                if not signed:errors.append("edition requires source by source human verification")
                status="complete" if not errors else "partial"
                detail={"year":year,"status":status,"source":source,"alternatives":year_sources[1:],
                        "extraction_digest":digest,"issues":issues,"holds":errors,
                        "media_accounted":actual,"media_expected":expected}
            else:
                status="missing"
                detail={"year":year,"status":"missing","holds":["edition source not supplied"]}
            atomic_json(api/"editions"/f"{year}.json",detail)
            overview["years"].append({"year":year,"status":status,
                "countries":source["country_count"] if source else 0,
                "fields":source["field_count"] if source else 0,
                "path":f"api/country-archive/editions/{year}.json"})
        for code,entries in sorted(catalogue.items()):
            details={"code":code,"name":entities.get(code,code),"years":entries}
            if code in locations:
                details["lat"],details["lon"]=locations[code]
            overview["countries"].append(details)
        atomic_json(api/"index.json",overview)
        # Count the entire intended Pages worldfactbook subtree, not just one shard.
        total=sum(p.stat().st_size for p in root.rglob("*") if p.is_file())
        if total>site_budget:
            raise ValueError(f"Static site would exceed configured WorldFactbook budget: {total}>{site_budget}")
        overview["site_bytes"]=total
        return overview


def main(argv=None):
    ap=argparse.ArgumentParser(description="Factbook TXT/EPUB/PDF OCR importer, per-country SQL and site export")
    ap.add_argument("--db",type=Path,default=Path("data/factbook_archive.sqlite"))
    ap.add_argument("--output",type=Path,default=Path("worldfactbook"),help="Website worldfactbook directory")
    ap.add_argument("--registry",type=Path,default=Path(__file__).parent/"data"/"factbook-countries.json")
    sub=ap.add_subparsers(dest="command",required=True)
    get=sub.add_parser("import");get.add_argument("inputs",nargs="+")
    get.add_argument("--edition-year",type=int)
    get.add_argument("--max-pdf-pages",type=int,default=0,help="Sample only; never eligible for completion")
    get.add_argument("--reprocess",action="store_true",help="Reparse existing source bytes with current parser")
    get.add_argument("--reparse-text",action="store_true",help="Reparse an existing EPUB without repeating image OCR")
    get.add_argument("--years",help="Only these detected edition years, comma separated, during reprocessing")
    put=sub.add_parser("export");put.add_argument("--review-dir",type=Path)
    put.add_argument("--media-root",type=Path,help="Directory containing the imported media tree")
    put.add_argument("--site-budget",type=int,default=850_000_000)
    put.add_argument("--max-json-bytes",type=int,default=512_000)
    put.add_argument("--max-sql-bytes",type=int,default=2_000_000)
    ls=sub.add_parser("status")
    args=ap.parse_args(argv)
    try:
        if args.command=="import":
            selected={int(y) for y in args.years.split(",")} if args.years else None
            result=ingest(args.inputs,args.db,args.output,args.registry,args.edition_year,
                          args.max_pdf_pages,args.reprocess or args.reparse_text,selected,args.reparse_text)
        elif args.command=="export":
            result=export(args.db,args.output,args.registry,args.max_json_bytes,
                          args.max_sql_bytes,args.site_budget,args.review_dir,args.media_root)
            result={"years":len(result["years"]),"countries":len(result["countries"]),
                    "site_bytes":result["site_bytes"],"complete_years":[r["year"] for r in result["years"] if r["status"]=="complete"]}
        else:
            with db(args.db) as con:
                result=[dict(r) for r in con.execute("SELECT * FROM sources ORDER BY edition_year,field_count DESC")]
        print(json.dumps(result,ensure_ascii=False,indent=2));return 0
    except Exception as exc:
        print(f"Factbook import: {type(exc).__name__}: {exc}",file=sys.stderr);return 1


if __name__=="__main__":raise SystemExit(main())
