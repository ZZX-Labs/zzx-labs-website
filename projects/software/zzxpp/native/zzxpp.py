#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, hashlib, json
from pathlib import Path
def transform(text,op):
    if op=="upper":return text.upper()
    if op=="lower":return text.lower()
    if op=="base64":return base64.b64encode(text.encode()).decode()
    if op=="sha256":return hashlib.sha256(text.encode()).hexdigest()
    if op=="json":return json.dumps(json.loads(text),indent=2)
    raise ValueError(op)
def main():
    ap=argparse.ArgumentParser();ap.add_argument("file");ap.add_argument("--op",choices=["upper","lower","base64","sha256","json"]);a=ap.parse_args()
    text=Path(a.file).read_text(encoding="utf-8");print(transform(text,a.op) if a.op else text)
if __name__=="__main__":main()
