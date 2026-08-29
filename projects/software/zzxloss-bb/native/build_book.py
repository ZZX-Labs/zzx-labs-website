#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, shutil, subprocess
from pathlib import Path

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("book_json")
    ap.add_argument("--format",choices=["md","html","latex","pdf"],default="html")
    ap.add_argument("--out",default=None)
    a=ap.parse_args()
    data=json.loads(Path(a.book_json).read_text(encoding="utf-8"))
    meta=data.get("metadata",{}); chapters=data.get("chapters",[])
    md=f"# {meta.get('title','Untitled')}\n\n"
    md+="\n\n---\n\n".join(f"# {i+1}. {c.get('title','Chapter')}\n\n{c.get('body','')}" for i,c in enumerate(chapters))
    out=Path(a.out or f"book.{a.format if a.format!='latex' else 'tex'}")
    if a.format=="md":
        out.write_text(md,encoding="utf-8");print(out);return
    try:
        import pypandoc
        target={"html":"html","latex":"latex","pdf":"pdf"}[a.format]
        pypandoc.convert_text(md,target,format="md",outputfile=str(out))
    except Exception as e:
        raise SystemExit(f"Pandoc/pypandoc conversion unavailable: {e}")
    print(out)
if __name__=="__main__":main()
