#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("markdown")
    ap.add_argument("--meta",help="JSON metadata file")
    ap.add_argument("--out",default="release")
    a=ap.parse_args()
    md=Path(a.markdown).read_text(encoding="utf-8")
    meta=json.loads(Path(a.meta).read_text(encoding="utf-8")) if a.meta else {}
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    post={"schema":"zzx.blogpost.v1","metadata":meta,"bodyMarkdown":md}
    canonical=json.dumps(post,sort_keys=True,ensure_ascii=False,separators=(",",":")).encode()
    digest=hashlib.sha256(canonical).hexdigest()
    (out/"post.json").write_text(json.dumps(post,indent=2,ensure_ascii=False),encoding="utf-8")
    (out/"SHA256SUM").write_text(digest+"  post.json\n",encoding="utf-8")
    print(json.dumps({"out":str(out),"content_sha256":digest,"network_required":False},indent=2))
if __name__=="__main__":main()
