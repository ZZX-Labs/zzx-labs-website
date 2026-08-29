#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, subprocess
from pathlib import Path

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
    return h.hexdigest()

def probe(path):
    q=subprocess.run(["ffprobe","-v","error","-show_format","-show_streams","-of","json",str(path)],capture_output=True,text=True,check=True)
    return json.loads(q.stdout)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("videos",nargs="+")
    ap.add_argument("--tag",action="append",default=[])
    ap.add_argument("--out",default="vidtag-catalog.json")
    a=ap.parse_args()
    rows=[]
    for name in a.videos:
        p=Path(name)
        rows.append({"name":p.name,"path":str(p.resolve()),"size":p.stat().st_size,"sha256":sha256(p),"ffprobe":probe(p),"tags":a.tag})
    Path(a.out).write_text(json.dumps({"schema":"zzx.vidtag.catalog.v1","records":rows},indent=2),encoding="utf-8")
    print(a.out)
if __name__=="__main__":main()
