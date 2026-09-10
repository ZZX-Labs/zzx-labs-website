#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
import dataclasses
import datetime as dt
import hashlib
import html
from html.parser import HTMLParser
import io
import json
import math
from pathlib import Path
import re
import tarfile
import time
from typing import Any, Iterable
import urllib.parse
import urllib.request
import zipfile

UA = "ZZX-Labs-WorldFactbook-Archive/1.0 (+https://zzx-labs.io)"
IA_SEARCH = "https://archive.org/advancedsearch.php"
IA_METADATA = "https://archive.org/metadata/{identifier}"
IA_DOWNLOAD = "https://archive.org/download/{identifier}/{filename}"
IA_ITEM = "https://archive.org/details/{identifier}"
CDX = "https://web.archive.org/cdx/search/cdx"
WAYBACK = "https://web.archive.org/web/{timestamp}id_/{original}"

MIX_TERMS = {
    "coal": r"coal",
    "naturalGas": r"natural\s+gas",
    "oil": r"(?:petroleum(?:\s+and\s+other\s+liquids)?|oil)",
    "nuclear": r"nuclear",
    "hydro": r"hydro(?:electric(?:ity)?)?",
    "solar": r"solar",
    "wind": r"wind",
    "geothermal": r"geothermal",
    "biomass": r"biomass",
    "waste": r"waste",
    "tidal": r"tidal",
    "fossilFuels": r"fossil\s+fuels",
    "renewablesOther": r"other\s+renewable(?:s|\s+sources)?",
}

COUNTRY_ALIASES = {
    "US":["United States","United States of America"],
    "RU":["Russia","Russian Federation"],
    "KR":["South Korea","Korea South","Republic of Korea"],
    "KP":["North Korea","Korea North","Democratic People's Republic of Korea"],
    "CZ":["Czech Republic","Czechia"],
    "MM":["Burma","Myanmar"],
    "SZ":["Swaziland","Eswatini"],
    "MK":["Macedonia","North Macedonia"],
    "CV":["Cape Verde","Cabo Verde"],
    "TL":["East Timor","Timor-Leste"],
    "TR":["Turkey","Turkiye","Türkiye"],
    "CI":["Cote d'Ivoire","Côte d'Ivoire","Ivory Coast"],
    "LA":["Laos","Lao People's Democratic Republic"],
    "VN":["Vietnam","Viet Nam"],
    "BN":["Brunei","Brunei Darussalam"],
    "BO":["Bolivia","Bolivia Plurinational State"],
    "VE":["Venezuela","Venezuela Bolivarian Republic"],
    "TZ":["Tanzania","United Republic of Tanzania"],
    "MD":["Moldova","Republic of Moldova"],
    "SY":["Syria","Syrian Arab Republic"],
    "IR":["Iran","Islamic Republic of Iran"],
}

def utcnow():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00","Z")

def norm(value):
    import unicodedata
    text=unicodedata.normalize("NFKD",str(value or ""))
    text="".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+"," ",text.lower()).strip()

def finite(value):
    if value is None:return None
    try:n=float(str(value).replace(",","").strip())
    except (TypeError,ValueError):return None
    return n if math.isfinite(n) else None

def get_json(url,timeout=45):
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8","replace"))

def get_bytes(url,timeout=120):
    req=urllib.request.Request(url,headers={"User-Agent":UA})
    with urllib.request.urlopen(req,timeout=timeout) as response:
        return response.read()

def cache_get(url,cache_dir,max_bytes=512*1024*1024):
    cache_dir.mkdir(parents=True,exist_ok=True)
    key=hashlib.sha256(url.encode()).hexdigest()
    body=cache_dir/key
    meta=cache_dir/f"{key}.json"
    if body.exists():return body.read_bytes()
    data=get_bytes(url)
    if len(data)>max_bytes:raise ValueError(f"source exceeds max size: {len(data)} bytes: {url}")
    body.write_bytes(data)
    meta.write_text(json.dumps({"url":url,"bytes":len(data),"retrieved_at":utcnow()},indent=2)+"\n",encoding="utf-8")
    return data

class TextExtractor(HTMLParser):
    BLOCK={"p","div","section","article","li","tr","td","th","h1","h2","h3","h4","br","dt","dd"}
    def __init__(self):
        super().__init__(convert_charrefs=True);self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        t=tag.lower()
        if t in {"script","style","svg","noscript"}:self.skip+=1
        elif not self.skip and t in self.BLOCK:self.parts.append("\n")
    def handle_endtag(self,tag):
        t=tag.lower()
        if t in {"script","style","svg","noscript"} and self.skip:self.skip-=1
        elif not self.skip and t in self.BLOCK:self.parts.append("\n")
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)
    def text(self):
        raw=html.unescape("".join(self.parts)).replace("\r","")
        return "\n".join(re.sub(r"\s+"," ",line).strip() for line in raw.splitlines() if re.sub(r"\s+"," ",line).strip())

def html_to_text(data):
    text=data.decode("utf-8","replace")
    p=TextExtractor()
    try:p.feed(text);return p.text()
    except Exception:return re.sub(r"<[^>]+>"," ",text)

def scale(word):
    return {"trillion":1e12,"billion":1e9,"million":1e6,"thousand":1e3}.get((word or "").lower(),1)

def energy_kwh(number,magnitude,unit):
    n=finite(number)
    if n is None:return None
    n*=scale(magnitude);u=unit.lower()
    if u=="twh":n*=1e9
    elif u=="gwh":n*=1e6
    elif u=="mwh":n*=1e3
    elif u=="wh":n/=1e3
    return n

def power_kw(number,magnitude,unit):
    n=finite(number)
    if n is None:return None
    n*=scale(magnitude);u=unit.lower()
    if u=="tw":n*=1e9
    elif u=="gw":n*=1e6
    elif u=="mw":n*=1e3
    elif u=="w":n/=1e3
    return n

ENERGY_RE=r"([0-9][0-9,.]*)\s*(trillion|billion|million|thousand)?\s*(TWh|GWh|MWh|kWh|Wh)\b"
POWER_RE=r"([0-9][0-9,.]*)\s*(trillion|billion|million|thousand)?\s*(TW|GW|MW|kW|W)\b"

def observation_year(raw):
    years=[int(y) for y in re.findall(r"\b((?:19|20)\d{2})\b",raw)]
    return years[-1] if years else None

def find_energy(text,label):
    m=re.search(rf"(?:electricity\s*[-–—:]?\s*)?{label}\s*:?\s*{ENERGY_RE}[^\n]{{0,120}}",text,re.I)
    if not m:return None
    value=energy_kwh(m.group(1),m.group(2),m.group(3))
    if value is None:return None
    raw=m.group(0).strip()
    return {"value":value,"raw":raw,"observation_year":observation_year(raw)}

def find_capacity(text):
    m=re.search(rf"(?:electricity\s*[-–—:]?\s*)?(?:installed\s+(?:generating\s+)?capacity|installed\s+generating\s+capacity)\s*:?\s*{POWER_RE}[^\n]{{0,120}}",text,re.I)
    if not m:return None
    value=power_kw(m.group(1),m.group(2),m.group(3))
    if value is None:return None
    raw=m.group(0).strip()
    return {"value":value,"raw":raw,"observation_year":observation_year(raw)}

def find_mix(text):
    i=text.lower().find("electricity")
    scope=text[i:i+18000] if i>=0 else text[:18000]
    out={}
    for key,term in MIX_TERMS.items():
        m=re.search(rf"{term}\s*:?\s*([0-9]{{1,3}}(?:\.[0-9]+)?)\s*%",scope,re.I)
        if m:
            n=finite(m.group(1))
            if n is not None and 0<=n<=100:out[key]=n
    return out

@dataclasses.dataclass(frozen=True)
class Country:
    code:str
    name:str
    official:str
    aliases:tuple[str,...]

class Resolver:
    def __init__(self,registry):
        self.countries=[];self.alias_to_country={}
        for row in registry.get("countries",[]):
            code=str(row.get("country") or "").upper()
            if not re.fullmatch(r"[A-Z]{2}",code):continue
            name=str(row.get("countryName") or row.get("name") or code)
            official=str(row.get("officialName") or name)
            aliases={name,official,*(COUNTRY_ALIASES.get(code,[]))}
            c=Country(code,name,official,tuple(sorted(aliases)));self.countries.append(c)
            for alias in aliases:self.alias_to_country[norm(alias)]=c
    def resolve_name(self,value):
        n=norm(value)
        if not n:return None
        if n in self.alias_to_country:return self.alias_to_country[n]
        matches=[(len(alias),country) for alias,country in self.alias_to_country.items() if len(alias)>=5 and (n.startswith(alias+" ") or n.endswith(" "+alias))]
        return max(matches,default=(0,None),key=lambda x:x[0])[1]
    def from_document(self,filename,text):
        head="\n".join(text.splitlines()[:80])
        for pat in [
            r"(?:CIA\s*[-–—]\s*)?The World Factbook\s*[-–—:]\s*([^\n|]+)",
            r"([^\n|]+)\s*[-–—|]\s*The World Factbook",
            r"^\s*Country\s*[:\-]\s*([^\n]+)"
        ]:
            m=re.search(pat,head,re.I|re.M)
            if m:
                raw=m.group(1).strip();c=self.resolve_name(raw)
                if c:return c,raw
        for line in text.splitlines()[:120]:
            c=self.resolve_name(line.strip())
            if c:return c,line.strip()
        stem=norm(Path(filename).stem)
        for alias,c in self.alias_to_country.items():
            if len(alias)>=5 and alias in stem:return c,c.name
        return None,""

def parse_country_page(resolver,edition_year,text,source,filename):
    country,entity=resolver.from_document(filename,text)
    if not country:return None,None
    page={
        "edition_year":edition_year,"country":country.code,"country_name":country.name,
        "source_entity":entity or country.name,"provider":source.get("provider"),
        "item_identifier":source.get("identifier"),"item_url":source.get("item_url"),
        "container_url":source.get("container_url"),"inner_path":filename,
        "source_url":source.get("source_url") or source.get("container_url"),
        "capture_timestamp":source.get("capture_timestamp")
    }
    if "electricity" not in text.lower():return None,page
    generation=find_energy(text,r"(?:production|generation)(?!\s+sources)")
    consumption=find_energy(text,r"consumption")
    capacity=find_capacity(text)
    mix=find_mix(text)
    if not generation and not consumption and not capacity and not mix:return None,page
    record={
        "country":country.code,"country_name":country.name,"edition_year":edition_year,"year":edition_year,
        "observation_year":(generation or {}).get("observation_year") or (consumption or {}).get("observation_year") or (capacity or {}).get("observation_year") or edition_year,
        "electricity_generation_kwh":(generation or {}).get("value"),
        "electricity_consumption_kwh":(consumption or {}).get("value"),
        "installed_capacity_kw":(capacity or {}).get("value"),
        "generation_by_source_pct":mix,
        "source":"CIA World Factbook public archive","source_provider":source.get("provider"),
        "source_url":page["source_url"],"source_identifier":source.get("identifier"),
        "source_file":filename,
        "field_provenance":{
            "electricity_generation_kwh":(generation or {}).get("raw"),
            "electricity_consumption_kwh":(consumption or {}).get("raw"),
            "installed_capacity_kw":(capacity or {}).get("raw")
        }
    }
    return record,page

def score_record(row):
    score=sum(row.get(k) is not None for k in ("electricity_generation_kwh","electricity_consumption_kwh","installed_capacity_kw"))
    return score+min(1.0,len(row.get("generation_by_source_pct") or {})/6)

def merge_records(existing,new):
    by_key={}
    for row in [*existing,*new]:
        try:key=(str(row["country"]),int(row.get("edition_year") or row["year"]))
        except Exception:continue
        prev=by_key.get(key)
        if not prev or score_record(row)>score_record(prev):by_key[key]=row
    return sorted(by_key.values(),key=lambda r:(int(r.get("edition_year") or r["year"]),r["country"]))

def merge_pages(existing,new):
    by_key={}
    for row in [*existing,*new]:
        key=(row.get("edition_year"),row.get("country"),row.get("provider"),row.get("inner_path"),row.get("capture_timestamp"))
        by_key[key]=row
    return sorted(by_key.values(),key=lambda r:(r.get("edition_year") or 0,r.get("country") or "",r.get("inner_path") or ""))

def ia_search(year,rows=50):
    query=f'(title:"World Factbook" OR title:"The World Factbook" OR title:"CIA World Factbook") AND year:{year}'
    params=[("q",query),("fl[]","identifier"),("fl[]","title"),("fl[]","date"),("fl[]","year"),("fl[]","mediatype"),("fl[]","downloads"),("rows",str(rows)),("page","1"),("output","json")]
    payload=get_json(IA_SEARCH+"?"+urllib.parse.urlencode(params))
    docs=[d for d in payload.get("response",{}).get("docs",[]) if d.get("identifier")]
    return sorted(docs,key=lambda d:float(d.get("downloads") or 0),reverse=True)

def ia_file_score(file,year):
    name=str(file.get("name") or "");lower=name.lower();size=finite(file.get("size"))
    if size is not None and size>600*1024*1024:return -1e9
    if lower.endswith(".zip"):score=700
    elif lower.endswith(".tar.gz") or lower.endswith(".tgz"):score=620
    elif lower.endswith("_djvu.txt"):score=520
    elif lower.endswith(".txt"):score=340
    elif lower.endswith(".html") or lower.endswith(".htm"):score=220
    else:return -1e9
    if "factbook" in lower:score+=90
    if str(year) in lower:score+=35
    if any(bad in lower for bad in ("meta.xml","files.xml","torrent","sqlite")):score-=500
    if size is not None and size<1024:score-=150
    return score

def ia_candidates(year,max_items=6):
    out=[]
    for doc in ia_search(year)[:max_items]:
        identifier=str(doc["identifier"])
        metadata=get_json(IA_METADATA.format(identifier=urllib.parse.quote(identifier)))
        ranked=sorted(metadata.get("files",[]),key=lambda f:ia_file_score(f,year),reverse=True)
        ranked=[f for f in ranked if ia_file_score(f,year)>0][:5]
        if ranked:out.append({"doc":doc,"files":ranked})
    return out

def archive_members(data,filename):
    lower=filename.lower()
    if lower.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for info in zf.infolist():
                if info.is_dir() or info.file_size>3*1024*1024 or not info.filename.lower().endswith((".html",".htm",".txt")):continue
                try:yield info.filename,zf.read(info)
                except Exception:continue
        return
    if lower.endswith(".tar.gz") or lower.endswith(".tgz"):
        with tarfile.open(fileobj=io.BytesIO(data),mode="r:*") as tf:
            for member in tf.getmembers():
                if not member.isfile() or member.size>3*1024*1024 or not member.name.lower().endswith((".html",".htm",".txt")):continue
                f=tf.extractfile(member)
                if f:yield member.name,f.read()
        return
    yield filename,data

def extract_ia_item(year,identifier,file,resolver,cache_dir):
    filename=str(file["name"])
    encoded="/".join(urllib.parse.quote(part) for part in filename.split("/"))
    url=IA_DOWNLOAD.format(identifier=urllib.parse.quote(identifier),filename=encoded)
    data=cache_get(url,cache_dir)
    source={"provider":"internet-archive","identifier":identifier,"item_url":IA_ITEM.format(identifier=identifier),"container_url":url,"source_url":url}
    records=[];pages=[]
    for inner_name,inner_data in archive_members(data,filename):
        low=inner_name.lower()
        if any(part in low for part in ("/maps/","/flags/","/appendix/","/rankorder/","/fields/")):continue
        text=html_to_text(inner_data) if low.endswith((".html",".htm")) else inner_data.decode("utf-8","replace")
        record,page=parse_country_page(resolver,year,text,source,inner_name)
        if page:pages.append(page)
        if record:records.append(record)
    ref={
        "edition_year":year,"provider":"internet-archive","identifier":identifier,
        "item_url":source["item_url"],"artifact_url":url,"file":filename,
        "sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data),
        "extracted_country_pages":len(pages),"electricity_records":len(records),"retrieved_at":utcnow()
    }
    return records,pages,ref

def wayback_cdx(original,year,limit=8):
    params=[("url",original),("output","json"),("fl","timestamp,original,statuscode,mimetype,digest"),("filter","statuscode:200"),("from",str(year)),("to",str(year)),("limit",str(limit))]
    payload=get_json(CDX+"?"+urllib.parse.urlencode(params))
    if not isinstance(payload,list) or len(payload)<2:return []
    headers=payload[0]
    return [dict(zip(headers,row)) for row in payload[1:]]

def hrefs_from_html(data):
    text=data.decode("utf-8","replace")
    return html.unescape(re.findall(r'href\s*=\s*["\']([^"\']+)["\']',text,re.I))

def discover_wayback_root(year):
    roots=[
        "https://www.cia.gov/the-world-factbook/",
        "https://www.cia.gov/library/publications/the-world-factbook/",
        "https://www.cia.gov/cia/publications/factbook/",
        "http://www.odci.gov/cia/publications/factbook/"
    ]
    for root in roots:
        try:captures=wayback_cdx(root,year,8)
        except Exception:continue
        if captures:
            cap=captures[-1]
            return WAYBACK.format(timestamp=cap["timestamp"],original=cap["original"]),cap
    return None

def extract_wayback_year(year,resolver,cache_dir,workers=4,max_pages=300):
    found=discover_wayback_root(year)
    if not found:return [],[],None
    root_replay,capture=found
    root_data=cache_get(root_replay,cache_dir,max_bytes=16*1024*1024)
    targets=[]
    for href in hrefs_from_html(root_data):
        target=urllib.parse.urljoin(capture["original"],href);low=target.lower()
        if "/geos/" in low and low.endswith((".html",".htm")):targets.append(target)
    targets=list(dict.fromkeys(targets))[:max_pages]

    def fetch_target(original):
        captures=wayback_cdx(original,year,4)
        if not captures:return None
        cap=captures[-1]
        url=WAYBACK.format(timestamp=cap["timestamp"],original=cap["original"])
        data=cache_get(url,cache_dir,max_bytes=5*1024*1024)
        text=html_to_text(data)
        source={"provider":"wayback","identifier":None,"item_url":None,"container_url":url,"source_url":url,"capture_timestamp":cap["timestamp"]}
        return parse_country_page(resolver,year,text,source,urllib.parse.urlparse(original).path)

    records=[];pages=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,workers)) as pool:
        for future in concurrent.futures.as_completed([pool.submit(fetch_target,t) for t in targets]):
            try:result=future.result()
            except Exception:continue
            if not result:continue
            record,page=result
            if page:pages.append(page)
            if record:records.append(record)

    ref={
        "edition_year":year,"provider":"wayback","root_original":capture["original"],
        "root_capture_timestamp":capture["timestamp"],"root_replay_url":root_replay,
        "discovered_country_links":len(targets),"extracted_country_pages":len(pages),
        "electricity_records":len(records),"retrieved_at":utcnow()
    }
    return records,pages,ref

def load_json(path,default):
    try:return json.loads(path.read_text(encoding="utf-8"))
    except Exception:return default

def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")

def sync(args):
    registry=load_json(args.country_registry,{"countries":[]});resolver=Resolver(registry)
    existing_ledger=load_json(args.electricity_output,{"records":[]})
    records=list(existing_ledger.get("records") or [])
    existing_index=load_json(args.reference_output,{"editions":[],"pages":[]})
    editions=list(existing_index.get("editions") or []);pages=list(existing_index.get("pages") or [])
    complete_years={int(e["edition_year"]) for e in editions if e.get("electricity_records",0)>=args.min_records_per_edition}
    errors=[];scanned=[]

    for year in range(args.end_year,args.start_year-1,-1):
        if year in complete_years and not args.force:continue
        year_records=[];year_pages=[];year_refs=[]

        if args.internet_archive:
            try:
                for candidate in ia_candidates(year,args.max_ia_items):
                    identifier=str(candidate["doc"]["identifier"])
                    for file in candidate["files"]:
                        try:r,p,ref=extract_ia_item(year,identifier,file,resolver,args.cache_dir/"internet-archive")
                        except Exception as exc:
                            errors.append(f"{year} IA {identifier}/{file.get('name')}: {exc}");continue
                        if len(r)>len(year_records):year_records,year_pages=r,p
                        year_refs.append(ref)
                        if len(year_records)>=args.min_records_per_edition:break
                    if len(year_records)>=args.min_records_per_edition:break
            except Exception as exc:errors.append(f"{year} IA discovery: {exc}")

        if len(year_records)<args.min_records_per_edition and args.wayback:
            try:
                r,p,ref=extract_wayback_year(year,resolver,args.cache_dir/"wayback",args.workers,args.max_wayback_pages)
                if len(r)>len(year_records):year_records,year_pages=r,p
                if ref:year_refs.append(ref)
            except Exception as exc:errors.append(f"{year} Wayback: {exc}")

        if year_records:
            records=merge_records(records,year_records)
            pages=merge_pages(pages,year_pages)
            editions=[e for e in editions if int(e.get("edition_year") or -1)!=year]+year_refs

        scanned.append({"year":year,"electricity_records":len(year_records),"country_pages":len(year_pages),"references":len(year_refs)})

        ledger_doc={
            "schema":"zzx-global-power-grid-factbook-history-v1",
            "source":"CIA World Factbook public copies: Internet Archive + Wayback Machine",
            "generated_at":utcnow(),"scan_start_year":args.start_year,"scan_end_year":args.end_year,"records":records
        }
        index_doc={
            "schema":"zzx-worldfactbook-reference-index-v1","generated_at":utcnow(),
            "scan_start_year":args.start_year,"scan_end_year":args.end_year,
            "editions":sorted(editions,key=lambda e:(e.get("edition_year") or 0,e.get("provider") or "")),
            "pages":pages
        }

        write_json(args.electricity_output,ledger_doc);write_json(args.reference_output,index_doc)
        if args.power_grid_output:write_json(args.power_grid_output,ledger_doc)
        if args.widget_output:write_json(args.widget_output,ledger_doc)
        time.sleep(max(0.0,args.sleep))

    return {"records":len(records),"editions":len(editions),"pages":len(pages),"scanned":scanned,"errors":errors}

def build_parser():
    p=argparse.ArgumentParser()
    p.add_argument("--country-registry",type=Path,required=True)
    p.add_argument("--electricity-output",type=Path,required=True)
    p.add_argument("--reference-output",type=Path,required=True)
    p.add_argument("--power-grid-output",type=Path)
    p.add_argument("--widget-output",type=Path)
    p.add_argument("--cache-dir",type=Path,default=Path(".cache/worldfactbook"))
    p.add_argument("--start-year",type=int,default=1962)
    p.add_argument("--end-year",type=int,default=2025)
    p.add_argument("--max-ia-items",type=int,default=6)
    p.add_argument("--min-records-per-edition",type=int,default=25)
    p.add_argument("--workers",type=int,default=4)
    p.add_argument("--max-wayback-pages",type=int,default=300)
    p.add_argument("--sleep",type=float,default=.2)
    p.add_argument("--force",action="store_true")
    p.add_argument("--internet-archive",action="store_true",default=True)
    p.add_argument("--no-internet-archive",action="store_false",dest="internet_archive")
    p.add_argument("--wayback",action="store_true",default=True)
    p.add_argument("--no-wayback",action="store_false",dest="wayback")
    return p

def main():
    args=build_parser().parse_args()
    if args.start_year>args.end_year:raise SystemExit("start year must be <= end year")
    print(json.dumps(sync(args),indent=2))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
