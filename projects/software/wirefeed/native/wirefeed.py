#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path
import feedparser

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("feeds",nargs="+")
    ap.add_argument("--include",default="")
    ap.add_argument("--exclude",default="")
    ap.add_argument("--json",dest="json_path")
    args=ap.parse_args()
    inc=args.include.lower();exc=args.exclude.lower();seen=set();rows=[]
    for src in args.feeds:
        f=feedparser.parse(src)
        title=f.feed.get("title",src)
        for e in f.entries:
            link=e.get("link","");guid=e.get("id") or link or e.get("title","")
            if guid in seen:continue
            seen.add(guid)
            row={"feed":title,"title":e.get("title",""),"link":link,"published":e.get("published",""),"summary":re.sub(r"<[^>]+>"," ",e.get("summary",""))}
            hay=json.dumps(row,ensure_ascii=False).lower()
            if inc and inc not in hay:continue
            if exc and exc in hay:continue
            rows.append(row)
    rows.sort(key=lambda x:x.get("published",""),reverse=True)
    text=json.dumps({"schema":"zzx.wirefeed.export.v1","items":rows},ensure_ascii=False,indent=2)
    if args.json_path:Path(args.json_path).write_text(text,encoding="utf-8")
    else:print(text)
if __name__=="__main__":main()
