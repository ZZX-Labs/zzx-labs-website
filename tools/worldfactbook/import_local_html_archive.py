#!/usr/bin/env python3
"""Import dated CIA Factbook HTML ZIPs as country/year browser profiles.

This preserves the original archive separately. It does not rewrite an
existing country-archive/index.json or turn a general-edition page into a
country. Only geos/*.html members become profiles.
"""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import unicodedata
import zipfile

from PIL import Image, PngImagePlugin

CATEGORY={"Intro":"introduction","Geo":"geography","People":"people-and-society",
          "Govt":"government","Econ":"economy","Comm":"communications",
          "Trans":"transportation","Military":"military-and-security",
          "Issues":"transnational-issues"}
ALIASES={"bahamas the":"bahamas","burma":"myanmar","cape verde":"cabo verde",
         "korea north":"north korea","korea south":"south korea",
         "congo republic of the":"congo","congo democratic republic of the":"democratic republic of the congo",
         "cote d ivoire":"côte d'ivoire","gambia the":"gambia","micronesia federated states of":"micronesia",
         "russia":"russian federation","swaziland":"eswatini","east timor":"timor leste",
         "macedonia":"north macedonia","turkey":"türkiye","united states":"united states",
         "virgin islands":"virgin islands us"}
CIA_CODES={"bl":"BO","bx":"BN","cg":"CD","ez":"CZ","fk":"FK","ir":"IR",
           "kn":"KP","ks":"KR","la":"LA","mc":"MO","md":"MD","oo":"X-SOUTHERN-OCEAN",
           "pc":"PN","rn":"MF","sh":"SH","sv":"SJ","sy":"SY","tu":"TR",
           "tw":"TW","tz":"TZ","ve":"VE","vi":"VG","vm":"VN","vq":"VI","vt":"VA"}
MAX_MEMBER=1_000_000


def digest(data: bytes) -> str:return hashlib.sha256(data).hexdigest()


def norm(name: str) -> str:
    plain=unicodedata.normalize("NFKD",name.casefold()).encode("ascii","ignore").decode()
    text=re.sub(r"[^a-z0-9]+"," ",plain).strip()
    return ALIASES.get(text,text)


def clean(value: str) -> str:
    value=re.sub(r"[\t\r\f\v ]+"," ",value)
    return re.sub(r" *\n *","\n",value).strip()


class CountryHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.category="raw";self.fields=[];self.mode="";self.parts=[];self.pending="";self.hidden=0
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag in {"script","style"}:self.hidden+=1;return
        if self.hidden:return
        if tag=="a" and attrs.get("name") in CATEGORY:
            self.category=CATEGORY[attrs["name"]]
        if tag=="td":
            if "FieldLabel" in attrs.get("class","").split():
                self.mode="label";self.parts=[]
            elif self.pending and not self.mode:
                self.mode="value";self.parts=[]
        if tag=="br" and self.mode:self.parts.append("\n")
    def handle_endtag(self,tag):
        if tag in {"script","style"} and self.hidden:self.hidden-=1;return
        if self.hidden:return
        if tag=="td" and self.mode:
            content=clean("".join(self.parts))
            if self.mode=="label":self.pending=content.strip(" :")
            elif self.pending and content:
                self.fields.append({"category":self.category,"label":self.pending,
                                    "content":content,"ordinal":len(self.fields)+1})
                self.pending=""
            self.mode="";self.parts=[]
    def handle_data(self,value):
        if self.mode and not self.hidden:self.parts.append(value)


class LegacyCountryHTML(HTMLParser):
    """Parse the 2000 edition's <p><b>Label:</b> value field grammar."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.category="raw";self.fields=[];self.hidden=0
        self.paragraph=False;self.bold=False;self.bold_parts=[]
        self.label="";self.value=[]

    def finish(self):
        content=clean("".join(self.value))
        if self.label and content:
            self.fields.append({"category":self.category,"label":self.label,
                                "content":content,"ordinal":len(self.fields)+1})
        self.label="";self.value=[]

    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag in {"script","style"}:self.hidden+=1;return
        if self.hidden:return
        if tag=="p":self.finish();self.paragraph=True
        elif tag=="a" and attrs.get("name") in CATEGORY:
            self.finish();self.category=CATEGORY[attrs["name"]]
        elif tag=="b" and self.paragraph and not self.label:
            self.bold=True;self.bold_parts=[]
        elif tag=="br" and self.label:self.value.append("\n")

    def handle_endtag(self,tag):
        if tag in {"script","style"} and self.hidden:self.hidden-=1;return
        if self.hidden:return
        if tag=="b" and self.bold:
            candidate=clean("".join(self.bold_parts))
            if candidate.endswith(":") and len(candidate)<130:
                self.label=candidate.rstrip(" :")
            self.bold=False;self.bold_parts=[]

    def handle_data(self,value):
        if self.hidden:return
        if self.bold:self.bold_parts.append(value)
        elif self.label:self.value.append(value)


def country_name(raw: bytes, fallback: str) -> str:
    match=re.search(rb"<title[^>]*>(.*?)</title>",raw,re.I|re.S)
    if not match:return fallback
    text=clean(re.sub(r"<[^>]*>","",match.group(1).decode("latin-1")))
    return text.rsplit("--",1)[-1].strip() if "--" in text else fallback


def coordinates(fields: list[dict]) -> tuple[float,float] | None:
    row=next((x for x in fields if x["label"].lower()=="geographic coordinates"),None)
    if not row:return None
    match=re.search(r"(\d{1,2})\s+(\d{1,2})\s+([NS])[,;\s]+(\d{1,3})\s+(\d{1,2})\s+([EW])",row["content"],re.I)
    if not match:return None
    lat=(int(match[1])+int(match[2])/60)*(1 if match[3].upper()=="N" else -1)
    lon=(int(match[4])+int(match[5])/60)*(1 if match[6].upper()=="E" else -1)
    return lat,lon


def _image(z: zipfile.ZipFile, member: str, target: Path, year: int, name: str,
           kind: str, notice_sha: str) -> dict | None:
    try:info=z.getinfo(member)
    except KeyError:return None
    if info.file_size>MAX_MEMBER:return None
    raw=z.read(info)
    with Image.open(io.BytesIO(raw)) as img:
        img.load();bitmap=img.convert("RGBA")
    meta=PngImagePlugin.PngInfo()
    attrs={"Title":f"{name} · {kind} · {year}","Creator":"Central Intelligence Agency (archive publisher)",
           "CreditStatus":"publisher only; original artist not stated",
           "Rights":"public domain under the edition's Factbook notice; CIA seal excluded",
           "RightsHolder":"not individually stated","EditionYear":str(year),
           "OriginalFilename":Path(member).name,"ArchiveMember":member,
           "SourceSHA256":digest(raw),"EditionRightsNoticeSHA256":notice_sha}
    for key,value in attrs.items():meta.add_text(key,value)
    target.parent.mkdir(parents=True,exist_ok=True)
    bitmap.save(target,"PNG",pnginfo=meta,optimize=True)
    return {"kind":kind,"category":"national-symbols" if kind=="flag" else "geography",
            "label":f"{name} · {'flag' if kind=='flag' else 'edition map'}",
            "alt":f"{kind.capitalize()} of {name} in the {year} World Factbook",
            "path":target.as_posix(),"original_filename":Path(member).name,
            "locator":member,"citation_key":target.stem,"source_sha256":digest(raw),
            "credit":"CIA World Factbook (archive publisher); original graphic artist not stated",
            "rights":"public domain","rights_holder":"not individually stated",
            "rights_notice_sha256":notice_sha}


def import_zip(path: Path, root: Path, points: dict[str,dict]) -> dict:
    match=re.search(r"factbook[-_ ](19\d\d|20\d\d)\.zip$",path.name,re.I)
    if not match:raise ValueError(f"Archive filename must identify its edition year: {path.name}")
    year=int(match.group(1));api=root/"api/verified-html"
    countries=[];skipped=[];count=0;images=0;assigned=set()
    with zipfile.ZipFile(path) as z:
        roots={n.split("/")[0] for n in z.namelist() if re.fullmatch(r"[^/]+/geos/[a-z]{2}\.html",n,re.I)}
        if len(roots)!=1 or not any(str(year) in item for item in roots):
            raise ValueError(f"Unexpected edition directory in {path}: {roots}")
        prefix=roots.pop()+"/"
        notice=prefix+("docs/concopy.html" if year==2000 else "docs/contributor_copyright.html")
        notice_raw=z.read(notice)
        notice_text=re.sub(r"<[^>]*>"," ",notice_raw.decode("latin-1","replace"))
        if not re.search(r"Factbook\s+is\s+in\s+the\s+public\s+domain",notice_text,re.I):
            raise ValueError("Edition rights notice missing; do not release images")
        notice_sha=digest(notice_raw)
        for item in z.infolist():
            if not re.fullmatch(re.escape(prefix)+r"geos/[a-z]{2}\.html",item.filename,re.I):continue
            if item.file_size>MAX_MEMBER:skipped.append(item.filename);continue
            raw=z.read(item);stem=Path(item.filename).stem.lower()
            title=country_name(raw,stem.upper());key=norm(title)
            point=points.get(key)
            code=point["code"] if point else CIA_CODES.get(stem,"X-CIA-"+stem.upper())
            parser=LegacyCountryHTML() if year==2000 else CountryHTML()
            parser.feed(raw.decode("latin-1","replace"))
            if isinstance(parser,LegacyCountryHTML):parser.finish()
            fields=parser.fields
            if not fields:skipped.append(item.filename);continue
            if code in assigned:
                # Some source ZIPs contain two country pages under different
                # CIA file codes. Keep both instead of silently overwriting a
                # page at countries/ISO/year.json. The first source page owns
                # the ordinary location entry; the other is visibly labeled.
                code="X-CIA-"+stem.upper()
                title=f"{title} (alternate source page {stem})"
            if code in assigned:raise ValueError(f"Country code collision: {item.filename}")
            assigned.add(code)
            for row in fields:
                row["locator"]=f"{item.filename}#field:{row['ordinal']}"
                row["country"]=code;row["edition_year"]=year
            coord=coordinates(fields)
            lat,lon=(point.get("lat"),point.get("lon")) if point else (coord or (None,None))
            media=[]
            for kind,sub,suffix in (("flag","flags","-lgflag.gif"),("map","maps","-map.gif")):
                if year==2000:suffix=suffix.replace(".gif",".jpg")
                member=f"{prefix}{sub}/{stem}{suffix}"
                target=root/f"media/verified-html/{year}/{code}-{kind}.png"
                record=_image(z,member,target,year,title,kind,notice_sha)
                if record:
                    record["path"]=target.relative_to(root).as_posix()
                    media.append(record);images+=1
            country_path=api/f"countries/{code}/{year}.json"
            country_path.parent.mkdir(parents=True,exist_ok=True)
            profile={"schema":"zzx-html-edition-profile-v1","country":code,"name":title,
                     "year":year,"status":"source-extracted; field review pending",
                     "source":{"name":path.name,"member":item.filename,"sha256":digest(raw),"format":"html"},
                     "rights_notice_member":notice,"rights_notice_sha256":notice_sha,
                     "fields":fields,"media":media}
            encoded=(json.dumps(profile,ensure_ascii=False,separators=(",",":"))+"\n").encode()
            if len(encoded)>480_000:raise ValueError(f"Oversize country profile: {item.filename}")
            country_path.write_bytes(encoded)
            countries.append({"code":code,"name":title,"year":year,"fields":len(fields),
                              "path":country_path.relative_to(root).as_posix(),"lat":lat,"lon":lon})
            count+=len(fields)
    return {"edition_year":year,"source":path.name,"archive_sha256":digest(path.read_bytes()),
            "rights_notice_sha256":notice_sha,"countries":countries,"fields":count,"images":images,
            "skipped":skipped}


def build(paths: list[Path], root: Path, point_file: Path) -> dict:
    rows=json.loads(point_file.read_text(encoding="utf-8"))["points"]
    points={norm(p["name"]):p for p in rows}
    editions=[import_zip(path,root,points) for path in paths]
    index={"schema":"zzx-html-edition-index-v1","editions":[
        {key:value for key,value in row.items() if key!="countries"} for row in editions],
        "countries":{}}
    for row in editions:
        for country in row["countries"]:
            index["countries"].setdefault(country["code"],[]).append(country)
    output=root/"api/verified-html/index.json";output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(index,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    return {"editions":len(editions),"countries":len(index["countries"]),
            "fields":sum(e["fields"] for e in editions),"images":sum(e["images"] for e in editions),
            "unmapped_codes":sorted(k for k in index["countries"] if k.startswith("X-CIA-")),
            "skipped":{str(e["edition_year"]):e["skipped"] for e in editions}}


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("archives",type=Path,nargs="+")
    ap.add_argument("--output",type=Path,required=True,help="Website worldfactbook directory")
    ap.add_argument("--points",type=Path,help="country-points.json; defaults to OUTPUT/country-points.json")
    args=ap.parse_args()
    print(json.dumps(build(args.archives,args.output,args.points or args.output/"country-points.json"),indent=2))


if __name__=="__main__":main()
