#!/usr/bin/env python3
"""Check both GitHub Pages whole-site and individual-file byte limits."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from zipfile import ZipFile


def inspect_folder(root):
    for path in root.rglob("*"):
        if not path.is_file() or any(part in {".git",".cache","__pycache__"} for part in path.relative_to(root).parts):
            continue
        yield path.relative_to(root).as_posix(),path.stat().st_size


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("path",type=Path,help="Site checkout or repository ZIP")
    ap.add_argument("--site-limit",type=int,default=1_000_000_000)
    ap.add_argument("--file-limit",type=int,default=100_000_000)
    args=ap.parse_args()
    if args.path.suffix.lower()==".zip":
        with ZipFile(args.path) as archive:
            files=[(item.filename,item.file_size) for item in archive.infolist() if not item.is_dir()]
    else: files=list(inspect_folder(args.path))
    total=sum(size for _,size in files)
    oversized=[{"path":path,"bytes":size} for path,size in files if size>args.file_limit]
    report={"site_bytes":total,"site_limit":args.site_limit,
            "bytes_over_limit":max(0,total-args.site_limit),"files":len(files),
            "oversized_files":oversized,"deployable":total<=args.site_limit and not oversized}
    print(json.dumps(report,ensure_ascii=False,indent=2))
    raise SystemExit(0 if report["deployable"] else 2)


if __name__=="__main__":main()
