#!/usr/bin/env python3
"""Extract CIA monthly Chiefs of State PDF snapshots from supplied RAR archives.

Requires PyMuPDF and libarchive (or 7z). Names are month snapshots; no office
start/end dates are inferred from changes between snapshots.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import ctypes
from ctypes.util import find_library
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

import fitz

PARSER_VERSION=2
MAX_PDF=12_000_000
MONTHS={name.lower():i for i,name in enumerate(("January","February","March","April","May","June","July",
    "August","September","October","November","December"),1)}


def sha(data: bytes) -> str:return hashlib.sha256(data).hexdigest()


def rar_members(path: Path):
    library=find_library("archive")
    if library:
        lib=ctypes.CDLL(library)
        signatures={
          "archive_read_new":(ctypes.c_void_p,[]),
          "archive_read_support_filter_all":(ctypes.c_int,[ctypes.c_void_p]),
          "archive_read_support_format_all":(ctypes.c_int,[ctypes.c_void_p]),
          "archive_read_open_filename":(ctypes.c_int,[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_size_t]),
          "archive_read_next_header":(ctypes.c_int,[ctypes.c_void_p,ctypes.POINTER(ctypes.c_void_p)]),
          "archive_entry_pathname":(ctypes.c_char_p,[ctypes.c_void_p]),
          "archive_entry_size":(ctypes.c_int64,[ctypes.c_void_p]),
          "archive_read_data":(ctypes.c_ssize_t,[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_size_t]),
          "archive_read_free":(ctypes.c_int,[ctypes.c_void_p])}
        for name,(restype,argtypes) in signatures.items():
            function=getattr(lib,name);function.restype=restype;function.argtypes=argtypes
        handle=lib.archive_read_new()
        try:
            lib.archive_read_support_filter_all(handle);lib.archive_read_support_format_all(handle)
            if lib.archive_read_open_filename(handle,str(path).encode(),10240)!=0:
                raise ValueError(f"RAR could not be opened: {path}")
            entry=ctypes.c_void_p()
            while (code:=lib.archive_read_next_header(handle,ctypes.byref(entry)))==0:
                name=lib.archive_entry_pathname(entry).decode("utf-8","replace")
                size=lib.archive_entry_size(entry)
                if not name.lower().endswith(".pdf") or not 0<size<=MAX_PDF:continue
                chunks=[];remaining=size
                while remaining:
                    buf=ctypes.create_string_buffer(min(remaining,1024*1024))
                    count=lib.archive_read_data(handle,buf,len(buf))
                    if count<=0:raise ValueError(f"Truncated archive member: {name}")
                    chunks.append(buf.raw[:count]);remaining-=count
                yield name,b"".join(chunks)
            if code!=1:raise ValueError(f"RAR read failed at archive status {code}: {path}")
        finally:lib.archive_read_free(handle)
        return
    seven=shutil.which("7z") or shutil.which("7za")
    if not seven:raise RuntimeError("Install libarchive or 7z to read RAR5 leader directories")
    listing=subprocess.run([seven,"l","-slt",str(path)],capture_output=True,text=True,check=True).stdout
    for match in re.finditer(r"(?m)^Path = (.+\.pdf)\s*$",listing,re.I):
        member=match.group(1).strip()
        run=subprocess.run([seven,"x","-so",str(path),member],capture_output=True,check=True)
        if len(run.stdout)<=MAX_PDF:yield member,run.stdout


def key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+"," ",text.casefold()).strip()


def names_from_site(world: Path) -> dict[str,tuple[str,str]]:
    entries={}
    points=json.loads((world/"country-points.json").read_text())["points"]
    for row in points:entries[key(row["name"])]=(row["code"],row["name"])
    index=world/"api/verified-html/index.json"
    if index.is_file():
        for code,rows in json.loads(index.read_text())["countries"].items():
            for row in rows:entries[key(row["name"])]=(code,row["name"])
    # Known historical/short forms in the monthly directory.
    aliases={"cape verde":"CV","burma":"MM","korea north":"KP","korea south":"KR",
             "russia":"RU","czech republic":"CZ","united kingdom":"GB","holy see":"VA",
             "democratic republic of the congo":"CD","ivory coast":"CI","syria":"SY","kosovo":"GEO-KOS"}
    names_by_code={p["code"]:p["name"] for p in points}
    for name,code in aliases.items():entries[name]=(code,names_by_code.get(code,name.title()))
    return entries


def parse_pdf(raw: bytes,source_name: str,year: int,month: int,
              names: dict[str,tuple[str,str]]) -> tuple[dict[str,list[dict]],dict]:
    doc=fitz.open(stream=raw,filetype="pdf");records=defaultdict(list);pages_with_text=0;unresolved=set()
    source_sha=sha(raw)
    patterns=(re.compile(r"^(.{2,180}?)\s*\.{3,}\s*(\S.{1,180})$"),
              re.compile(r"^(.{2,180}?)\s{3,}(\S.{1,180})$"))
    heading_words=set(names)
    printed_year=re.search(r"DI\s+CS\s+(\d{4})-(\d{1,2})",doc[0].get_text(),re.I)
    if printed_year and (int(printed_year[1]),int(printed_year[2]))!=(year,month):
        raise ValueError(f"PDF cover date disagrees with filename: {source_name}")
    as_of=""
    for page_no,page in enumerate(doc,1):
        text=page.get_text(sort=True)
        if not text.strip():continue
        pages_with_text+=1
        if not as_of:
            match_date=re.search(r"Information (?:received )?as of (\d{1,2}\s+[A-Za-z]+\s+\d{4})",text,re.I)
            if match_date:as_of=match_date.group(1)
        if page_no<4:continue
        headings=set()
        for block in page.get_text('dict').get('blocks',[]):
            for layout_line in block.get('lines',[]):
                spans=layout_line['spans'];label=''.join(span['text'] for span in spans).strip()
                if 3<=len(label)<=85 and any('bold' in span['font'].lower() for span in spans) and layout_line['bbox'][0]>page.rect.width*.2:
                    headings.add(key(re.sub(r"\s*[-—–]\s*NDE\s*$","",re.sub(r"\s*\(continued\)\s*$","",label,flags=re.I),flags=re.I)))
        current=None;updated="";pending_title=""
        for line in text.splitlines():
            line=line.strip()
            if not line or re.fullmatch(r"Page \d+ of \d+|PREFACE|KEY TO ABBREVIATIONS",line,re.I):continue
            heading=re.sub(r"\s*\(continued\)\s*$","",line,flags=re.I)
            heading=re.sub(r"\s*[-—–]\s*NDE\s*$","",heading,flags=re.I)
            alphabet=re.match(r"^[A-Z]\s{2,}(.{2,85})$",heading)
            if alphabet:
                heading=alphabet[1].strip()
                if key(heading) not in names:unresolved.add(heading);current=None;pending_title="";continue
            if key(heading) in heading_words and len(heading)<85:
                current=names[key(heading)];pending_title="";continue
            if key(heading) in headings:
                unresolved.add(heading);current=None;pending_title="";continue
            if not current:continue
            last=re.match(r"Last Updated:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})",line,re.I)
            if last:updated=last[1];continue
            match=next((result for pattern in patterns if (result:=pattern.match(line))),None)
            if not match:
                if line.startswith(("Min.","Dep.","State Min.","Minister","Permanent Representative")) and \
                   not re.search(r"Page \d+ of|\.{3,}",line):pending_title=line
                continue
            position=re.sub(r"\s+"," ",f"{pending_title} {match[1]}" if pending_title else match[1]).strip()
            pending_title=""
            person=re.sub(r"\s+"," ",match[2]).strip()
            if not position or not person or len(person)>180:continue
            code,name=current
            records[code].append({"position":position,"person":person,"country":code,"parser_version":PARSER_VERSION,
                "month":f"{year}-{month:02d}","coverage":f"Snapshot {year}-{month:02d} · PDF page {page_no}",
                "source_name":source_name,"source_sha256":source_sha,"source_page":page_no,
                "as_of":as_of,"country_last_updated":updated,"start":None,"end":None})
    return records,{"source":source_name,"year":year,"month":month,"sha256":source_sha,
                    "pages":len(doc),"text_pages":pages_with_text,"as_of":as_of,"parser_version":PARSER_VERSION,
                    "countries":len(records),"positions":sum(map(len,records.values())),"unresolved_headings":sorted(unresolved)}


def build(paths: list[Path],world: Path) -> dict:
    names=names_from_site(world);all_rows=defaultdict(list);reports=[];seen_sources={}
    for path in paths:
        archive_year=re.search(r"(20\d{2})",path.name)
        if not archive_year:raise ValueError(f"RAR filename has no year: {path.name}")
        year=int(archive_year.group(1));found=set()
        for member,raw in ([(path.name,path.read_bytes())] if path.suffix.lower()==".pdf" else rar_members(path)):
            match=re.search(r"(?i)(January|February|March|April|May|June|July|August|September|October|November|December)(20\d{2})ChiefsDirectory\.pdf$",member)
            if not match:continue
            month=MONTHS[match[1].lower()];printed=int(match[2]);
            if year!=printed:raise ValueError(f"Month filename differs from archive year: {member}")
            if month in found:raise ValueError(f"Duplicate month: {member}")
            found.add(month)
            identity=(year,month);source_sha=sha(raw)
            if identity in seen_sources:
                if seen_sources[identity]!=source_sha:raise ValueError(f'Conflicting monthly directory originals: {year}-{month:02d}')
                continue
            seen_sources[identity]=source_sha
            rows,report=parse_pdf(raw,member,year,month,names)
            if report["positions"]<500 or report["countries"]<80:
                raise ValueError(f"Unexpectedly low leader extraction coverage: {report}")
            reports.append(report)
            for code,terms in rows.items():all_rows[(code,year)].extend(terms)
        if not found:raise ValueError(f"No named monthly directory PDFs: {path.name}")
        if path.suffix.lower()!=".pdf" and found!=set(range(1,13)):raise ValueError(f"Incomplete monthly PDF set {path.name}: {sorted(found)}")
    root=world/"api/leaders"
    old=json.loads((root/"index.json").read_text()) if (root/"index.json").exists() else {}
    updated={(row['year'],row['month']) for row in reports}
    for profile in (root/'countries').glob('*/*/part-*.json'):
        previous=json.loads(profile.read_text())
        country,year=previous['country'],previous['year']
        if year not in {entry[0] for entry in updated}:continue
        all_rows[(country,year)].extend(row for row in previous.get('terms',[])
            if (year,int(row['month'][5:7])) not in updated)
    reports=[row for row in old.get('months',[]) if (row['year'],row['month']) not in updated]+reports
    reports.sort(key=lambda row:(row["year"],row["month"]))
    for terms in all_rows.values():terms.sort(key=lambda row:(row["month"],row["source_page"]))
    index={**old,"schema":"zzx-leaders-monthly-v1","parser_version":PARSER_VERSION,"months":reports,
           "record_count":sum(x["positions"] for x in reports)}
    for (code,year),terms in sorted(all_rows.items()):
        profile=root/f"countries/{code}/{year}/part-0001.json"
        profile.parent.mkdir(parents=True,exist_ok=True)
        payload=(json.dumps({"schema":"zzx-leaders-country-year-v1","country":code,
            "year":year,"parser_version":PARSER_VERSION,"terms":terms},ensure_ascii=False,separators=(",",":"))+"\n").encode()
        if len(payload)>480_000:raise ValueError(f"Leader shard exceeds budget: {profile}")
        profile.write_bytes(payload)
        manifest=root/f"countries/{code}/{year}/index.json"
        manifest.write_text(json.dumps({"schema":"zzx-leaders-year-index-v1","country":code,"year":year,
            "parts":["api/leaders/"+profile.relative_to(root).as_posix()],
            "months":sorted({x["month"] for x in terms}),"positions":len(terms)},separators=(",",":"))+"\n")
    root.mkdir(parents=True,exist_ok=True)
    (root/"index.json").write_text(json.dumps(index,ensure_ascii=False,separators=(",",":"))+"\n")
    return {"months":len(reports),"country_years":len(all_rows),"positions":index["record_count"],
            "per_month":[{k:r[k] for k in ("year","month","countries","positions","as_of")}
                         for r in reports]}


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("archives",nargs="+",type=Path);ap.add_argument("--output",required=True,type=Path,
                                                     help="Website worldfactbook directory")
    args=ap.parse_args();print(json.dumps(build(args.archives,args.output),indent=2))


if __name__=="__main__":main()
