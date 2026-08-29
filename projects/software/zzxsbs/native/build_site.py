#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
from jinja2 import Template
HTML=Template("""<!doctype html><meta charset="utf-8"><title>{{ title }}</title><h1>{{ title }}</h1><p>{{ blurb }}</p>""")
def main():
    ap=argparse.ArgumentParser();ap.add_argument("manifest");ap.add_argument("--out",default="site-out");a=ap.parse_args()
    m=json.loads(Path(a.manifest).read_text(encoding="utf-8"));m=(m.get("projects") or [m])[0];out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    (out/"index.html").write_text(HTML.render(**m),encoding="utf-8")
    (out/"manifest.json").write_text(json.dumps(m,indent=2),encoding="utf-8")
    print(out)
if __name__=="__main__":main()
