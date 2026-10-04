#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
import psutil

def hash_file(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def inventory(root):
    root=Path(root).resolve();rows=[]
    targets=[root] if root.is_file() else [p for p in root.rglob("*") if p.is_file()]
    for p in targets:
        st=p.stat()
        rows.append({"path":str(p),"size":st.st_size,"mtime_ns":st.st_mtime_ns,"sha256":hash_file(p)})
    return rows

def processes():
    out=[]
    for p in psutil.process_iter(["pid","name","username","create_time"]):
        try: out.append(p.info)
        except Exception: pass
    return out

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--path")
    ap.add_argument("--processes",action="store_true")
    ap.add_argument("--out",default="zzxffk-report.json")
    a=ap.parse_args()
    report={"schema":"zzx.ffk.report.v1","read_only":True}
    if a.path: report["files"]=inventory(a.path)
    if a.processes: report["processes"]=processes()
    Path(a.out).write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(a.out)
if __name__=="__main__":main()
