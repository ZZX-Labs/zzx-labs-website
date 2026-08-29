#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,shutil,subprocess
from pathlib import Path
def main():
    ap=argparse.ArgumentParser();ap.add_argument("stack");a=ap.parse_args()
    d=json.loads(Path(a.stack).read_text(encoding="utf-8"))
    assert d.get("docker") is False and d.get("containers") is False
    ports=[int(s["port"]) for s in d.get("services",[])]
    if len(ports)!=len(set(ports)):raise SystemExit("duplicate service port")
    print(json.dumps({"ok":True,"services":len(ports),"docker":False,"containers":False,"nginx_available":bool(shutil.which("nginx"))},indent=2))
if __name__=="__main__":main()
