#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, requests
from pathlib import Path

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("owner")
    ap.add_argument("--out",default="github-repos.json")
    a=ap.parse_args()
    headers={"Accept":"application/vnd.github+json"}
    token=os.environ.get("GITHUB_TOKEN")
    if token: headers["Authorization"]=f"Bearer {token}"
    rows=[];page=1
    while True:
        r=requests.get(f"https://api.github.com/users/{a.owner}/repos",params={"per_page":100,"page":page,"sort":"updated"},headers=headers,timeout=15)
        r.raise_for_status();batch=r.json()
        if not batch:break
        rows.extend(batch);page+=1
    Path(a.out).write_text(json.dumps(rows,indent=2),encoding="utf-8")
    print(f"{len(rows)} repositories -> {a.out}")
if __name__=="__main__":main()
