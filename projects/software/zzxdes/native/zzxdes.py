#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os
from pathlib import Path

def sha256(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
    return h.hexdigest()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("--hash",action="store_true")
    ap.add_argument("--out",default="zzxdes-index.json")
    a=ap.parse_args()
    root=Path(a.root).resolve()
    rows=[]
    for p in root.rglob("*"):
        if not p.is_file(): continue
        st=p.stat()
        row={"path":str(p.relative_to(root)),"size":st.st_size,"mtime_ns":st.st_mtime_ns,"suffix":p.suffix.lower()}
        if a.hash: row["sha256"]=sha256(p)
        rows.append(row)
    Path(a.out).write_text(json.dumps({"schema":"zzx.des.index.v1","root":str(root),"records":rows},indent=2),encoding="utf-8")
    print(f"{len(rows)} files indexed -> {a.out}")
if __name__=="__main__":main()
