#!/usr/bin/env python3
"""Audit source edition identity and image-credit coverage without changing data."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re


def title_years(name: str) -> set[int]:
    text=name.replace("_"," ")
    for match in re.finditer(r"\bworld\s+fact\s*book\b",text,re.I):
        nearby=text[max(0,match.start()-28):match.end()+28]
        years={int(x) for x in re.findall(r"\b(?:19|20)\d{2}\b",nearby)}
        if years:return years
    return set()


def audit(api: Path) -> dict:
    source=json.loads((api/"source-index.json").read_text(encoding="utf-8"))
    rows=source.get("sources") or []
    mismatches=[];duplicates=[];by_sha={}
    for row in rows:
        year=int(row.get("edition_year") or 0)
        printed=title_years(str(row.get("name") or "")) or title_years(str(row.get("source_title") or ""))
        if printed and year not in printed:
            mismatches.append({"edition_slot":year,"printed_years":sorted(printed),
                               "identifier":row.get("identifier"),"filename":row.get("name"),
                               "source_url":row.get("url"),"sha256":row.get("sha256"),
                               "reason":"explicit book year conflicts with edition slot"})
        digest=row.get("sha256")
        if digest:
            key=(digest,year)
            if digest in by_sha and by_sha[digest]!=year and key not in duplicates:
                duplicates.append(key)
            by_sha.setdefault(digest,year)
    media_path=api/"media-index.json"
    media=json.loads(media_path.read_text(encoding="utf-8")) if media_path.exists() else {"years":[]}
    missing_credits=[];missing_files=[];unreviewed=[];examined=0
    for year in media.get("years") or []:
        path=api/year["path"]
        if not path.is_file():continue
        for image in json.loads(path.read_text(encoding="utf-8")).get("images") or []:
            examined+=1
            key=image.get("citation_key") or "unknown"
            if image.get("credit_status")!="explicit" or not image.get("credit"):
                missing_credits.append(key)
            if image.get("rights_status") not in {"public domain","redistribution cleared"}:
                unreviewed.append(key)
            if not image.get("source_url") or not image.get("source_sha256"):
                missing_files.append(key)
    return {"schema":"zzx-edition-provenance-audit-v1",
            "sources_examined":len(rows),"explicit_year_mismatches":mismatches,
            "same_source_multiple_years":sorted(set(duplicates),key=str),
            "images_examined":examined,"images_missing_explicit_credit":missing_credits,
            "images_pending_rights_review":unreviewed,
            "images_missing_source_provenance":missing_files,
            "complete":bool(rows and examined) and not any((mismatches,duplicates,missing_credits,
                                                               unreviewed,missing_files))}


def main() -> None:
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--api",type=Path,default=Path("worldfactbook/api"))
    ap.add_argument("--output",type=Path)
    ap.add_argument("--require-clean",action="store_true")
    args=ap.parse_args();report=audit(args.api)
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({"sources":report["sources_examined"],"wrong_edition":len(report["explicit_year_mismatches"]),
                      "duplicate_year_assignments":len(report["same_source_multiple_years"]),
                      "media":report["images_examined"],"missing_credits":len(report["images_missing_explicit_credit"]),
                      "complete":report["complete"]},indent=2))
    if args.require_clean and not report["complete"]:raise SystemExit(1)


if __name__=="__main__":main()
