#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,re
from pathlib import Path
from jinja2 import Template
HTML=Template("""<!doctype html><meta charset="utf-8"><title>{{ title }}</title><h1>{{ title }}</h1><p>{{ blurb }}</p>""")
def main():
    ap=argparse.ArgumentParser();ap.add_argument("slug");ap.add_argument("--title",required=True);ap.add_argument("--blurb",default="");ap.add_argument("--out",default=".");a=ap.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*",a.slug):raise SystemExit("invalid slug")
    root=Path(a.out)/a.slug;root.mkdir(parents=True,exist_ok=True)
    (root/"index.html").write_text(HTML.render(title=a.title,blurb=a.blurb),encoding="utf-8")
    (root/"manifest.json").write_text(json.dumps({"slug":a.slug,"title":a.title,"blurb":a.blurb,"href":f"/projects/software/{a.slug}/"},indent=2),encoding="utf-8")
    print(root)
if __name__=="__main__":main()
