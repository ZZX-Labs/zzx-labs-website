#!/usr/bin/env python3
"""Resumable, provenance-first Wayback flag recovery for 2023–2026.

Writes PNGs and JSON sidecars to a PRIVATE output directory. Records whose
image, caption, or rights evidence is missing remain incomplete; they are never
published as approved site assets by this command.
"""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

from PIL import Image, PngImagePlugin

CDX="https://web.archive.org/cdx/search/cdx"
UA="ZZX-WorldFactbook-Flag-Recovery/1.0 (+https://zzx-labs.io/)"
ARCHIVED=re.compile(r"/about/archives/(202[3-6])/countries/([^/]+)/flag/?(?:[?#].*)?$",re.I)


def fetch(url: str, max_bytes: int = 25_000_000) -> bytes:
    request=urllib.request.Request(url,headers={"User-Agent":UA})
    with urllib.request.urlopen(request,timeout=90) as response:
        body=response.read(max_bytes+1)
    if len(body)>max_bytes: raise ValueError(f"Captured object exceeds limit: {url}")
    return body


class FlagPage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.images=[];self.text=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag in {"script","style","svg"}: self.skip+=1;return
        if self.skip:return
        if tag=="img":
            src=attrs.get("data-src") or attrs.get("src") or ""
            if not src and attrs.get("srcset"):src=attrs["srcset"].split(",")[0].split()[0]
            self.images.append({"src":src,"alt":attrs.get("alt") or "",
                                "title":attrs.get("title") or ""})
        if tag in {"p","h1","h2","figcaption","br","div"}:self.text.append("\n")
    def handle_endtag(self,tag):
        if tag in {"script","style","svg"} and self.skip:self.skip-=1
        elif not self.skip and tag in {"p","h1","h2","figcaption","div"}:self.text.append("\n")
    def handle_data(self,data):
        if not self.skip:self.text.append(data)


def flag_image_and_credit(page: bytes) -> tuple[dict | None,str,str]:
    parsed=FlagPage();parsed.feed(page.decode("utf-8","replace"))
    text="\n".join(re.sub(r"\s+"," ",line).strip() for line in "".join(parsed.text).splitlines() if line.strip())
    def score(image):
        src=image["src"].lower();caption=" ".join((image["alt"],image["title"])).lower()
        return (6 if re.search(r"(?:/|[-_])flag(?:s|[-_/.]|$)",src) else 0)+(
                4 if "flag" in caption else 0)-(10 if any(x in src for x in ("logo","favicon","seal")) else 0)
    images=sorted((image for image in parsed.images if image["src"]),key=score,reverse=True)
    selected=images[0] if images and score(images[0])>0 else None
    credit_match=re.search(r"(?im)^(?:image\s+)?(?:credit|photo\s+credit|source|courtesy(?:\s+of)?)\s*[:：]\s*(.{2,200})$",text)
    credit=credit_match.group(1).strip() if credit_match else ""
    rights="public domain (CIA page notice)" if re.search(
        r"factbook images and photos.{0,100}public domain",text,re.I|re.S) else "source review required"
    return selected,credit,rights


def original_url(value: str, page_url: str) -> str:
    """Strip Wayback replay syntax while retaining the captured original URL."""
    value=urllib.parse.urljoin(page_url,value)
    match=re.match(r"^https?://web\.archive\.org/web/\d+(?:[a-z_]+)?/(https?://.+)$",value,re.I)
    if match:return match.group(1)
    return value


def cdx_page(year: int,resume: str="",limit: int=500) -> tuple[list[dict],str]:
    pattern=f"www.cia.gov/the-world-factbook/about/archives/{year}/countries/*/flag/"
    params=[("url",pattern),("output","json"),("filter","statuscode:200"),
            ("fl","urlkey,timestamp,original,digest"),("limit",str(limit)),
            ("showResumeKey","true")]
    if resume and not re.fullmatch(r"[A-Za-z0-9%+._~-]+",resume):
        raise ValueError("Invalid opaque CDX resume key")
    url=CDX+"?"+urllib.parse.urlencode(params)
    if resume:url+="&resumeKey="+resume  # CDX key is already URL encoded.
    response=fetch(url,max_bytes=5_000_000).decode("utf-8","replace")
    # CDX emits a JSON table, optionally followed by a blank line and a
    # resume key. Keep the raw key opaque and persist it for the next run.
    decoder=json.JSONDecoder();table,end=decoder.raw_decode(response.lstrip())
    if not isinstance(table,list) or not table:return [],""
    fields=table[0]
    key=""
    if len(table)>=3 and table[-2]==[] and isinstance(table[-1],list) and len(table[-1])==1:
        key=str(table[-1][0]);table=table[:-2]
    rows=[dict(zip(fields,row)) for row in table[1:] if isinstance(row,list)]
    tail=response.lstrip()[end:].strip()
    return rows,key or (tail.splitlines()[-1].strip() if tail else "")


def recover_capture(rec: dict,output: Path) -> dict:
    source=str(rec.get("original") or "")
    match=ARCHIVED.search(urllib.parse.urlparse(source).path)
    if not match:raise ValueError("Snapshot is not an archived edition flag detail page")
    year,country=int(match.group(1)),match.group(2).lower()
    stamp=str(rec.get("timestamp") or "")
    if not re.fullmatch(r"\d{14}",stamp):raise ValueError("Invalid capture timestamp")
    snapshot=f"https://web.archive.org/web/{stamp}id_/{source}"
    page=fetch(snapshot,max_bytes=5_000_000)
    image,credit,rights=flag_image_and_credit(page)
    if not image:raise ValueError("Flag image not identified in captured page")
    asset_original=original_url(image["src"],source)
    if not asset_original.startswith(("https://","http://")):
        raise ValueError("Invalid flag image URL")
    image_snapshot=f"https://web.archive.org/web/{stamp}id_/{asset_original}"
    raw=fetch(image_snapshot)
    with Image.open(io.BytesIO(raw)) as original:
        original.load()
        if original.width*original.height>100_000_000:raise ValueError("Image dimensions exceed limit")
        bitmap=original.convert("RGBA")
    source_sha=hashlib.sha256(raw).hexdigest()
    citation=f"wfb-{year}-{country}-flag-{stamp}-{source_sha[:12]}"
    directory=output/str(year)/country;directory.mkdir(parents=True,exist_ok=True)
    filename=citation+".png";target=directory/filename
    metadata=PngImagePlugin.PngInfo()
    for key,value in {
        "Title":f"Flag · {country} · World Factbook {year}",
        "Creator":credit,"CreditStatus":"explicit" if credit else "not-found",
        "RightsHolder":"","RightsStatus":rights,"FactbookEditionYear":str(year),
        "CountrySlug":country,"OriginalFilename":Path(urllib.parse.urlparse(asset_original).path).name,
        "SourceURL":source,"SnapshotURL":snapshot,"ImageURL":asset_original,
        "ImageSnapshotURL":image_snapshot,"CaptureTimestamp":stamp,
        "OriginalSHA256":source_sha,
    }.items():metadata.add_text(key,value)
    buffer=io.BytesIO();bitmap.save(buffer,"PNG",pnginfo=metadata,optimize=True)
    if len(buffer.getvalue())>23_000_000:raise ValueError("PNG exceeds per-file budget")
    target.write_bytes(buffer.getvalue())
    record={"schema":"zzx-wayback-flag-v1","citation_key":citation,
            "edition_year":year,"country_slug":country,"capture_timestamp":stamp,
            "source_url":source,"snapshot_url":snapshot,"image_original_url":asset_original,
            "image_snapshot_url":image_snapshot,"original_sha256":source_sha,
            "png_sha256":hashlib.sha256(buffer.getvalue()).hexdigest(),
            "filename":filename,"alt":image["alt"],"credit":credit,
            "credit_status":"explicit" if credit else "not-found",
            "rights_holder":"","rights_status":rights,"publication_status":"private-unreviewed"}
    (directory/(citation+".json")).write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return record


def run(output: Path,start: int,end: int,max_captures: int,sleep: float) -> dict:
    output.mkdir(parents=True,exist_ok=True)
    state_path=output/"crawl-state.json"
    state=json.loads(state_path.read_text()) if state_path.is_file() else {"resume":{},"observed":[],"failures":[],"completed_years":[]}
    state.setdefault("failed_records",{})
    # Upgrade older checkpoints: an unsuccessful capture must be retried,
    # including one logged by a previous version of this crawler.
    for failure in state.get("failures",[]):
        key=failure.get("capture","")
        stamp,sep,source=key.partition("|")
        if sep and key in state.get("observed",[]):
            state["failed_records"].setdefault(key,{"timestamp":stamp,"original":source})
    seen=set(state["observed"]);attempted=0
    for key,rec in list(state["failed_records"].items()):
        if attempted>=max_captures:break
        try:
            recover_capture(rec,output)
        except Exception as exc:
            state["failures"]=[f for f in state["failures"] if f.get("capture")!=key]
            state["failures"].append({"capture":key,"error":str(exc)[:300]})
        else:
            del state["failed_records"][key]
            state["failures"]=[f for f in state["failures"] if f.get("capture")!=key]
        attempted+=1
        time.sleep(max(0,sleep))
    state_path.write_text(json.dumps(state,ensure_ascii=False,indent=2)+"\n")
    for year in range(start,end+1):
        if year in state.get("completed_years",[]):continue
        resume=state["resume"].get(str(year),"")
        while attempted<max_captures:
            rows,continuation=cdx_page(year,resume,limit=min(500,max_captures-attempted))
            for rec in rows:
                stamp=str(rec.get("timestamp") or "");key=stamp+"|"+str(rec.get("original") or "")
                if key in seen:continue
                try:recover_capture(rec,output)
                except Exception as exc:
                    state["failed_records"][key]=rec
                    state["failures"].append({"capture":key,"error":str(exc)[:300]})
                seen.add(key);state["observed"].append(key);attempted+=1
                time.sleep(max(0,sleep))
            state["resume"][str(year)]=continuation
            if not continuation and year not in state.setdefault("completed_years",[]):state["completed_years"].append(year)
            state_path.write_text(json.dumps(state,ensure_ascii=False,indent=2)+"\n")
            if not continuation or not rows:break
            resume=continuation
        if attempted>=max_captures:break
    assets=list(output.glob("20??/*/*.json"))
    return {"attempted":attempted,"recovered":len(assets),"pending_failures":len(state["failed_records"]),
            "resume":state["resume"],"enumeration_complete":all(y in state["completed_years"] for y in range(start,end+1)),
            "complete":not state["failed_records"] and all(y in state["completed_years"] for y in range(start,end+1))}


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--output",required=True,type=Path,help="Private storage checkout, never a public Pages directory")
    ap.add_argument("--start-year",type=int,default=2023)
    ap.add_argument("--end-year",type=int,default=2026)
    ap.add_argument("--max-captures",type=int,default=120)
    ap.add_argument("--sleep",type=float,default=.2)
    args=ap.parse_args()
    if not (2023<=args.start_year<=args.end_year<=2026):ap.error("Archive detail range must be 2023–2026")
    print(json.dumps(run(args.output,args.start_year,args.end_year,args.max_captures,args.sleep),indent=2))


if __name__=="__main__":main()
